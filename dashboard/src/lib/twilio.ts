import twilio from "twilio";

let client: ReturnType<typeof twilio> | null = null;

export function getTwilio() {
  if (!client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
    client = twilio(sid, token);
  }
  return client;
}

export function getTwilioPhone(): string {
  const phone = process.env.TWILIO_PHONE_NUMBER;
  if (!phone) throw new Error("TWILIO_PHONE_NUMBER not set");
  return phone;
}

// ─── Per-clinic number provisioning ─────────────────────────────────────────

/**
 * Purchase a UK phone number from Twilio near the clinic's area code.
 * Falls back to any available UK number if locality search fails.
 */
export async function purchaseUkNumber(opts?: {
  locality?: string;
  areaCode?: string;
}): Promise<string> {
  const tw = getTwilio();

  // Try locality-based search first (e.g. "London", "Manchester")
  const searchParams: Record<string, unknown> = {
    voiceEnabled: true,
    smsEnabled: false,
  };

  if (opts?.locality) {
    searchParams.inLocality = opts.locality;
  }

  let available: Awaited<ReturnType<ReturnType<typeof tw.availablePhoneNumbers>["local"]["list"]>> = [];
  try {
    available = await tw.availablePhoneNumbers("GB").local.list({
      ...searchParams,
      limit: 1,
    });
  } catch {
    // Locality search failed — try without locality constraint
    available = [];
  }

  // Fallback: any UK number
  if (!available.length) {
    available = await tw.availablePhoneNumbers("GB").local.list({
      voiceEnabled: true,
      smsEnabled: false,
      limit: 1,
    });
  }

  if (!available.length) {
    throw new Error("No UK phone numbers available from Twilio");
  }

  // Purchase the number
  const purchased = await tw.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName: "StrydeOS Ava",
    voiceUrl: "", // Will be set by SIP trunk
  });

  return purchased.phoneNumber;
}

/**
 * Configure a Twilio SIP trunk to route inbound calls to ElevenLabs.
 * Returns the trunk SID for reference.
 *
 * Flow: Inbound call → Twilio number → SIP trunk → ElevenLabs ConvAI SIP URI
 */
export async function configureSipTrunk(opts: {
  phoneNumber: string;
  phoneSid: string;
  agentId: string;
  clinicName: string;
}): Promise<string> {
  const tw = getTwilio();

  // ElevenLabs ConvAI SIP endpoint
  const elevenLabsSipUri = `sip:${opts.agentId}@sip.rtc.elevenlabs.io`;

  // 1. Create SIP trunk
  const trunk = await tw.trunking.v1.trunks.create({
    friendlyName: `StrydeOS Ava - ${opts.clinicName}`,
  });

  // 2. Add ElevenLabs as the origination URI (where calls get forwarded)
  await tw.trunking.v1
    .trunks(trunk.sid)
    .originationUrls.create({
      friendlyName: "ElevenLabs ConvAI",
      sipUrl: elevenLabsSipUri,
      weight: 1,
      priority: 1,
      enabled: true,
    });

  // 3. Associate the phone number with this trunk
  await tw.trunking.v1
    .trunks(trunk.sid)
    .phoneNumbers.create({
      phoneNumberSid: opts.phoneSid,
    });

  return trunk.sid;
}

/**
 * Look up the SID for a Twilio phone number.
 */
export async function getPhoneNumberSid(phoneNumber: string): Promise<string> {
  const tw = getTwilio();
  const numbers = await tw.incomingPhoneNumbers.list({
    phoneNumber,
    limit: 1,
  });

  if (!numbers.length) {
    throw new Error(`Phone number ${phoneNumber} not found in Twilio account`);
  }

  return numbers[0].sid;
}
