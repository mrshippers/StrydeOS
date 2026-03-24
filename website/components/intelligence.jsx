'use client';

import ModulePage from "./module-page.jsx";

const C_PURPLE = "#8B5CF6";

export default function IntelligencePage() {
  return (
    <ModulePage
      id="intelligence"
      name="Intelligence"
      color={C_PURPLE}
      headline="Know how your clinic actually performs."
      body={`Revenue tells you what happened, not why. Intelligence surfaces the drivers behind it in real time.

Track follow-up conversion, revenue per clinician hour, DNA recovery rate, and utilisation against rebooking patterns — automatically and per clinician.

Not to manage people. To understand where your clinic is thriving and where it isn't. The best-run clinics already know these numbers.`}
      howItWorks={[
        "Pulls data from your clinical and ops systems",
        "Standardises KPIs by clinician and clinic",
        "Flags drift so issues are acted on early",
      ]}
      benefits={[
        "Clear visibility on profit drivers",
        "Faster decisions from live metrics",
        "Coaching-led performance improvement",
      ]}
      features={[
        "Per-clinician KPI dashboard",
        "90-day rolling trend charts",
        "HEP compliance & utilisation tracking",
        "NPS & Google Review pipeline",
        "Alert flags on metric drift",
        "Weekly email digest",
      ]}
      setup={null}
    />
  );
}
