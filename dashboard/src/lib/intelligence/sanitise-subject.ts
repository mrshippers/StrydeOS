/**
 * Email subject-line sanitiser.
 *
 * Two concerns addressed:
 *  1. Hard-rule: no em dashes (U+2014) or en dashes (U+2013) in shipped subject lines.
 *  2. Header-injection defence: CR (U+000D), LF (U+000A), and other ASCII control
 *     characters (U+0000-U+001F, U+007F) are stripped to prevent an attacker from
 *     folding additional headers into the Subject field.
 *
 * Usage: wrap every subject string at construction time.
 *   subject: sanitiseSubject(`Your clinic this week - ${clinicName}`)
 */

/** U+2014 em dash and U+2013 en dash, normalised to a plain hyphen. */
const DASH_RE = /[–—]/g;

/**
 * ASCII control characters: U+0000-U+001F (includes CR U+000D, LF U+000A, TAB U+0009)
 * and DEL U+007F. These must never appear in an RFC 5322 unstructured header value.
 */
const CONTROL_RE = /[\x00-\x1f\x7f]/g;

/**
 * Sanitise an email subject line.
 *
 * - Normalises em dash (U+2014) and en dash (U+2013) to a single hyphen (-).
 * - Strips CR, LF, and all other ASCII control characters.
 * - Leaves all other characters unchanged.
 */
export function sanitiseSubject(subject: string): string {
  return subject.replace(DASH_RE, "-").replace(CONTROL_RE, "");
}
