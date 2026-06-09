/**
 * Clinic-specific outbound comms branding (white-label).
 *
 * Patient-facing texts and emails should appear to come from the patient's own
 * clinic ("Spires"), not "StrydeOS". This resolves a clinic's outbound sender
 * identity from its Firestore doc with a clear precedence:
 *
 *   explicit override (clinic doc field) > derived from clinic name > global default
 *
 * Only PATIENT-facing comms use this. Staff digests, owner alerts and platform
 * invites intentionally stay StrydeOS-branded (the product talking to its
 * customers) and do NOT call this helper.
 *
 * Note: this changes the sender *label* only. The email return-path domain stays
 * strydeos.com (no per-clinic verified sending domain) and the email body still
 * carries the StrydeOS mark — those are the remaining steps for full white-label.
 */

import { getSmsSender } from "@/lib/twilio";

export interface ClinicBranding {
  /** Full clinic name, for email bodies and as the email From display name. */
  clinicName: string;
  /** SMS sender label: a UK alphanumeric sender ID (<=11 chars) or a fallback number. */
  smsSender: string;
  /** Email From display name (clinic name, header-sanitised). */
  emailFromName: string;
  /** Ready-to-use email From header, e.g. `Spires Physiotherapy <noreply@strydeos.com>`. */
  emailFrom: string;
}

const DEFAULT_CLINIC_NAME = "Your clinic";
const FALLBACK_FROM_NAME = "StrydeOS";
const MAX_ALPHANUMERIC_SENDER = 11;

function defaultFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? "noreply@strydeos.com";
}

/**
 * Derive a UK alphanumeric SMS sender ID from a clinic name.
 *
 * UK alphanumeric sender IDs are max 11 chars, must contain at least one letter,
 * and allow only letters, digits and spaces. We greedily keep whole words (so
 * "Spires Physiotherapy" -> "Spires", never the broken-looking "Spires Phys")
 * and only hard-truncate when the first word alone exceeds the limit.
 *
 * Returns null when no valid ID can be derived (caller falls back to the global
 * sender). NOTE: unregistered alphanumeric senders deliver in the UK but may be
 * carrier-filtered, and recipients cannot reply (no inbound STOP).
 */
export function deriveSmsSenderId(rawName: string): string | null {
  const cleaned = (rawName ?? "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const words = cleaned.split(" ");
  let acc = "";
  for (const word of words) {
    const next = acc ? `${acc} ${word}` : word;
    if (next.length > MAX_ALPHANUMERIC_SENDER) break;
    acc = next;
  }
  // First word alone too long -> hard-truncate it to the limit.
  if (!acc) acc = words[0].slice(0, MAX_ALPHANUMERIC_SENDER);

  // Carriers reject all-numeric alphanumeric IDs; require at least one letter.
  if (!/[A-Za-z]/.test(acc)) return null;
  return acc;
}

/**
 * Sanitise a display name for an email From header: strip characters that would
 * break the header, and quote the name when it contains RFC 5322 specials.
 * Returns "" when nothing usable remains.
 */
export function emailDisplayName(rawName: string): string {
  const stripped = (rawName ?? "").replace(/["<>\r\n]/g, "").trim();
  if (!stripped) return "";
  if (/[(),:;@\\[\]]/.test(stripped)) return `"${stripped}"`;
  return stripped;
}

/**
 * Resolve a clinic's outbound branding from its Firestore doc data. Pure /
 * synchronous — pass the clinic doc data you already have. Use
 * {@link getClinicBranding} when you only have the clinicId.
 */
export function brandingFromClinicData(
  data: FirebaseFirestore.DocumentData | null | undefined,
): ClinicBranding {
  const realName = ((data?.name as string) ?? "").trim();
  const clinicName = realName || DEFAULT_CLINIC_NAME;

  // SMS sender: explicit override > derived from real name > global default.
  const explicitSmsSender = ((data?.smsSenderId as string) ?? "").trim();
  const smsSender =
    explicitSmsSender ||
    (realName ? deriveSmsSenderId(realName) : null) ||
    getSmsSender();

  // Email From name: explicit override > real clinic name > "StrydeOS".
  const explicitFromName = ((data?.emailFromName as string) ?? "").trim();
  const emailFromName =
    emailDisplayName(explicitFromName || realName) || FALLBACK_FROM_NAME;

  const emailFrom = `${emailFromName} <${defaultFromEmail()}>`;

  return { clinicName, smsSender, emailFromName, emailFrom };
}

/**
 * Resolve a clinic's outbound branding when you only have the clinicId. Reads
 * the clinic doc (best-effort: falls back to defaults on read failure).
 */
export async function getClinicBranding(
  db: FirebaseFirestore.Firestore,
  clinicId: string,
): Promise<ClinicBranding> {
  let data: FirebaseFirestore.DocumentData | null = null;
  try {
    const snap = await db.collection("clinics").doc(clinicId).get();
    data = snap.exists ? (snap.data() ?? null) : null;
  } catch {
    data = null;
  }
  return brandingFromClinicData(data);
}
