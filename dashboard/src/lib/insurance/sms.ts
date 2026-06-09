/**
 * Patient-facing insurance intake SMS body.
 *
 * Spaced for readability with a clinic sign-off so the message reads as coming
 * from the clinic, not StrydeOS. No "Reply STOP" line: the sender is a UK
 * alphanumeric ID, which is one-way (recipients cannot reply), so a STOP
 * instruction would be misleading. These are transactional, appointment-linked
 * messages.
 */
export function buildInsuranceIntakeSms(opts: {
  patientName?: string;
  link: string;
  clinicName: string;
}): string {
  const first = opts.patientName?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hello,";
  return [
    greeting,
    "",
    "Please confirm your insurance details before your appointment using this secure link:",
    "",
    opts.link,
    "",
    "It only takes a minute.",
    "",
    "Thanks,",
    opts.clinicName,
  ].join("\n");
}
