'use client';

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

Pulse automates every touchpoint between sessions — and adapts based on clinical context. When a patient has psychosocial flags or complex multi-region presentations, Pulse adjusts its tone and timing automatically. No manual triage. No one-size-fits-all sequences.`}
      howItWorks={[
        "Monitors treatment journey milestones",
        "Reads clinical complexity signals from session notes",
        "Adapts follow-up timing and tone to each patient",
        "Suppresses prompts when patients are nearing discharge",
      ]}
      benefits={[
        "Better treatment completion",
        "Higher follow-up conversion",
        "Fewer wasted messages on discharge-ready patients",
      ]}
      features={[
        "Complexity-aware rebooking prompts",
        "Psychosocial flag detection — gentler outreach for anxious patients",
        "Discharge-aware sequences that know when to stop",
        "Clinical enrichment from Heidi session notes",
        "Post-discharge check-ins",
        "Referral prompt sequences",
      ]}
      setup={null}
    />
  );
}
