import ModulePage from "./module-page.jsx";

const C_TEAL = "#0891B2";

export default function PulsePage() {
  return (
    <ModulePage
      id="pulse"
      name="Pulse"
      color={C_TEAL}
      headline="Keep patients in care, longer."
      body={`The drop-off between session two and session three is where most clinics leak the most revenue. Patients disengage — not because the treatment isn't working, but because nobody stayed in touch.

Pulse automates every touchpoint between sessions. The clinics getting this right aren't doing it by hand. They've systematised it — and it shows in their completion rates and referral volume.`}
      howItWorks={[
        "Monitors treatment journey milestones",
        "Detects gaps and triggers targeted follow-up",
        "Re-engages drop-offs with timed nudges",
      ]}
      benefits={[
        "Better treatment completion",
        "Higher follow-up conversion",
        "More referral-ready patient outcomes",
      ]}
      features={[
        "Automated post-session reminders",
        "Rebooking prompts at the right moment",
        "Post-discharge check-ins",
        "Outcome tracking per patient",
        "Referral prompt sequences",
        "Programme assignment monitoring",
      ]}
      setup={null}
    />
  );
}
