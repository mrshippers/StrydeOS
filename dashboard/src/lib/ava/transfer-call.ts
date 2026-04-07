import { getTwilio, getTwilioPhone } from "@/lib/twilio";
import { getAdminDb } from "@/lib/firebase-admin";

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

    const avaPhone = clinicData.ava?.config?.phone;
    if (!avaPhone) {
      return { success: false, error: "No Ava phone number found" };
    }

    // 2. Find the active call on Ava's number from this caller.
    // Primary: match by from+to. Fallback: match any in-progress call to avaPhone
    // — needed when CLI is withheld on UK SIP trunks (caller number not forwarded).
    let activeCalls = await tw.calls.list({
      to: avaPhone,
      from: req.callerPhone,
      status: "in-progress",
      limit: 1,
    });

    if (!activeCalls.length) {
      // Withheld CLI fallback — find any in-progress call to the Ava number
      activeCalls = await tw.calls.list({
        to: avaPhone,
        status: "in-progress",
        limit: 1,
      });
    }

    if (!activeCalls.length) {
      return { success: false, error: "No active call found for transfer" };
    }

    const callSid = activeCalls[0].sid;

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
