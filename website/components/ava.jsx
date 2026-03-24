'use client';

import ModulePage from "./module-page.jsx";

const C_BLUE = "#1C54F2";

export default function AvaPage() {
  return (
    <ModulePage
      id="ava"
      name="Ava"
      color={C_BLUE}
      headline="Never miss a patient again."
      body={`Every missed call is a new patient lost to the next clinic on Google. Every cancellation that is not recovered becomes avoidable leakage.

Ava handles inbound calls, books into your diary, recovers cancellations before the slot goes empty, and triages new enquiries automatically.

Clinics using Ava have stopped paying £400–800/month to call-handling services. They've also stopped losing patients at the first point of contact.`}
      howItWorks={[
        "Captures inbound calls and triages intent",
        "Books directly into your existing PMS diary",
        "Triggers confirmations and recovery flows automatically",
      ]}
      benefits={[
        "Fewer missed first contacts",
        "Higher slot fill from recovered cancellations",
        "Lower admin overhead on front desk",
      ]}
      features={[
        "Inbound calls handled 24/7",
        "Books directly into your calendar",
        "Cancellation recovery & no-show chasing",
        "SMS confirmations sent automatically",
        "Emergency routing to on-call clinician",
        "PMS write-back integration",
      ]}
      setup="£250 one-time setup"
    />
  );
}
