import { getTwilio } from "@/lib/twilio";
import { getAdminDb } from "@/lib/firebase-admin";
import { DEFAULT_AVA_ATTRIBUTION_CONFIG } from "@/types/value-ledger";

/**
 * Warm-transfer a live Twilio call to the clinic's reception/Moneypenny number.
 *
 * Flow:
 * 1. ElevenLabs agent triggers `transfer_to_reception` tool during a complaint
 * 2. This function looks up the clinic's reception phone
 * 3. Uses Twilio's Call API to redirect the caller to a TwiML <Dial> that
 *    connects them to reception
 * 4. ElevenLabs session ends naturally once Twilio redirects the call leg
 *
 * We use call.update() with a TwiML URL rather than Conference because the
 * SIP trunk → ElevenLabs architecture gives us a single Twilio call SID
 * that we can redirect mid-call.
 */

interface TransferRequest {
  clinicId: string;
  callerPhone: string;
  conversationId: string;
  reason: string;
  /**
   * Explicit Twilio Call SID for the live call to redirect. When present, we
   * redirect THIS exact SID — no heuristic. ElevenLabs forwards the call sid on
   * the transfer tool invocation; threading it through is the only safe way to
   * pick the right call under concurrency. The heuristic below is a fallback
   * for legacy callers that don't carry a sid, and only fires when exactly one
   * in-progress call exists.
   */
  callSid?: string;
}

/**
 * Look up the active Twilio call SID for a caller phone number on a clinic's
 * Ava number, then redirect that call to the clinic's reception line.
 */
export async function transferCallToReception(
  req: TransferRequest
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminDb();
  const tw = getTwilio();

  try {
    // 1. Get clinic data — need reception phone and Ava phone
    const clinicDoc = await db.collection("clinics").doc(req.clinicId).get();
    if (!clinicDoc.exists) {
      return { success: false, error: "Clinic not found" };
    }

    const clinicData = clinicDoc.data()!;
    const receptionPhone =
      clinicData.receptionPhone ||
      clinicData.notificationPhone ||
      null;

    if (!receptionPhone) {
      return { success: false, error: "No reception phone configured for transfer" };
    }

    // 2. Out-of-hours check — don't attempt live transfer outside reception hours
    const timezone = clinicData.timezone || "Europe/London";
    const avaAttrib = clinicData.ava?.attributionConfig ?? DEFAULT_AVA_ATTRIBUTION_CONFIG;
    const startHour: number = avaAttrib.receptionStartHour ?? DEFAULT_AVA_ATTRIBUTION_CONFIG.receptionStartHour;
    const endHour: number = avaAttrib.receptionEndHour ?? DEFAULT_AVA_ATTRIBUTION_CONFIG.receptionEndHour;

    // Derive the clinic-local hour via Intl parts. The previous approach
    // (new Date(toLocaleString("en-GB"))) produced an Invalid Date — en-GB
    // formats DD/MM/YYYY which V8 can't parse back, so getHours() was NaN and
    // every transfer fell through to out_of_hours and never connected.
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hourPart = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
    const minutePart = Number(parts.find((p) => p.type === "minute")?.value ?? "NaN");
    // Intl can emit "24" for midnight under hour12:false — normalise to 0.
    const currentHour = (hourPart % 24) + minutePart / 60;
    const isWithinHours = currentHour >= startHour && currentHour < endHour;

    if (!isWithinHours) {
      return {
        success: false,
        error: `out_of_hours:${startHour}:${endHour}`,
      };
    }

    const avaPhone = clinicData.ava?.config?.phone;
    if (!avaPhone) {
      return { success: false, error: "No Ava phone number found" };
    }

    // 2. Determine which exact call to redirect.
    //
    // Preferred: an explicit Call SID threaded from the ElevenLabs transfer tool
    // invocation. Under concurrency (two callers on the Ava number at once) this
    // is the ONLY safe selector — a heuristic can grab the wrong patient's call
    // and transfer them to reception mid-sentence.
    let callSid: string;

    if (req.callSid) {
      callSid = req.callSid;
    } else {
      // Legacy fallback (no sid threaded). Prefer an exact from+to match.
      let activeCalls = await tw.calls.list({
        to: avaPhone,
        from: req.callerPhone,
        status: "in-progress",
        limit: 2,
      });

      // Withheld CLI (UK SIP trunks don't forward caller number): we can't match
      // by `from`, so look at all in-progress calls to the Ava number. Only
      // transfer when there is EXACTLY ONE — with zero we have nothing to
      // transfer, and with two or more we cannot tell which caller asked, so we
      // must NOT guess and risk transferring the wrong patient.
      if (!activeCalls.length) {
        activeCalls = await tw.calls.list({
          to: avaPhone,
          status: "in-progress",
          limit: 2,
        });
      }

      if (!activeCalls.length) {
        return { success: false, error: "No active call found for transfer" };
      }
      if (activeCalls.length > 1) {
        // Ambiguous — refuse rather than transfer a random caller.
        return { success: false, error: "ambiguous_call:no_call_sid" };
      }

      callSid = activeCalls[0].sid;
    }

    // 3. Build the TwiML URL that will handle the transfer
    //    We use our own endpoint so we control the experience
    //    NOTE: Only clinicId is passed — the TwiML route looks up the phone
    //    from Firestore to prevent toll fraud via query-param injection.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return { success: false, error: "NEXT_PUBLIC_APP_URL is not configured" };
    }
    const twimlUrl = new URL("/api/ava/transfer-twiml", appUrl);
    twimlUrl.searchParams.set("clinicId", req.clinicId);

    // 4. Redirect the live call to our TwiML endpoint
    //    This cleanly disconnects ElevenLabs and connects the caller to reception
    await tw.calls(callSid).update({
      url: twimlUrl.toString(),
      method: "POST",
    });

    // 5. Log the transfer in Firestore
    if (req.conversationId) {
      await db
        .collection("clinics")
        .doc(req.clinicId)
        .collection("call_log")
        .doc(req.conversationId)
        .set(
          {
            transferredAt: new Date().toISOString(),
            transferredTo: receptionPhone,
            transferReason: req.reason,
            outcome: "transferred",
          },
          { merge: true }
        );
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transfer error";
    return { success: false, error: message };
  }
}
