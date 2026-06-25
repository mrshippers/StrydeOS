/**
 * UK phone -> E.164 normalisation.
 *
 * Cliniko stores patient phone numbers as free text, so receptionists enter them
 * every which way: 07..., +44..., and the international 00/0044 prefix. The old
 * inline normaliser only handled '+' and a leading '0', so a 00-prefixed number
 * became '+440044...' which Twilio rejects — and the rejection was swallowed, so
 * the SMS silently never went. This handles the real shapes and returns null
 * (rather than a malformed number) when there's nothing usable.
 */
export function toE164UK(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Keep digits and a leading plus only.
  let s = raw.replace(/[^\d+]/g, "");
  if (!s) return null;

  if (s.startsWith("+")) {
    return s.length > 1 ? s : null;
  }
  // 00 / 0044 international prefix -> +
  if (s.startsWith("00")) {
    s = s.slice(2);
    return s ? `+${s}` : null;
  }
  // National 0-prefixed UK number -> +44
  if (s.startsWith("0")) {
    return `+44${s.slice(1)}`;
  }
  // Bare 44-prefixed number with no plus -> +44...
  if (s.startsWith("44")) {
    return `+${s}`;
  }
  // Anything else: assume already international, prefix a plus.
  return `+${s}`;
}
