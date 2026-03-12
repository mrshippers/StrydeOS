export type HelpCategory = "metrics" | "modules" | "general";

export interface HelpEntry {
  id: string;
  question: string;
  answer: string;
  /** Additional context for clinics that may not use this metric */
  clinicNote?: string;
  formula?: string;
  category: HelpCategory;
  tags: string[];
}

export const HELP_ENTRIES: HelpEntry[] = [
  // ─── Core Metrics ────────────────────────────────────────────────────────────
  {
    id: "follow-up-rate",
    category: "metrics",
    question: "What is Follow-up Rate?",
    answer:
      "Follow-up rate measures how many patients who come in for an initial assessment go on to book a follow-up appointment. A low rate is typically the single biggest revenue leak in a private practice — it means patients are discharging themselves after one session rather than completing a course of treatment.",
    formula: "Follow-ups booked ÷ Initial assessments (weekly or rolling 90-day window)",
    clinicNote:
      "Relevant to all practice types. The KPI target at Spires is to improve the current average of ~2.4 sessions per patient.",
    tags: ["follow-up", "retention", "revenue", "initial assessment"],
  },
  {
    id: "hep-compliance",
    category: "metrics",
    question: "What is HEP Compliance?",
    answer:
      "Home Exercise Programme (HEP) compliance tracks what proportion of patients seen in a given period were issued a structured exercise programme. Research consistently shows that patients with a programme have better outcomes and return for more sessions. A low rate often means clinicians are forgetting to assign programmes, or doing it inconsistently.",
    formula: "Patients given a programme ÷ Patients seen (expressed as %)",
    clinicNote:
      "Measured via Physitrack data at Spires. If your clinic uses a different HEP tool (e.g. Rehab My Patient, PhysioAdvisor), the data source may differ but the metric logic is identical.",
    tags: ["hep", "exercise", "programme", "physitrack", "compliance"],
  },
  {
    id: "programme-assignment-rate",
    category: "metrics",
    question: "What is Programme Assignment Rate?",
    answer:
      "This measures how often a clinician assigns a home exercise programme at the patient's first contact — i.e. the initial assessment itself. Assigning at first contact sets expectations early and improves adherence throughout the course. It's a leading indicator: if it's low, HEP compliance and follow-up rate tend to follow.",
    formula: "Patients assigned a programme at first contact ÷ Total initial assessments (expressed as %)",
    clinicNote:
      "Only meaningful if your practice actively uses HEP software. If programmes are routinely given verbally or on paper without software tracking, this metric will under-report.",
    tags: ["programme", "assignment", "first contact", "hep", "initial"],
  },
  {
    id: "course-completion-rate",
    category: "metrics",
    question: "What is HEP Compliance?",
    answer:
      "HEP compliance tracks how consistently clinicians assign home exercise programmes to patients who should receive one. A low rate means patients are leaving without structured self-management — which impacts recovery speed, rebooking patterns, and long-term outcomes.",
    formula: "Patients given a HEP ÷ Patients seen (expressed as %)",
    clinicNote:
      "Only meaningful if your practice actively uses HEP software like Physitrack. If programmes are routinely given verbally or on paper without software tracking, this metric will under-report.",
    tags: ["hep", "compliance", "programme", "exercise", "physitrack"],
  },
  {
    id: "utilisation",
    category: "metrics",
    question: "What is Utilisation?",
    answer:
      "Utilisation measures how efficiently a clinician's available appointment slots are being filled. A fully booked diary is 100% — but sustainable high performance typically sits between 80–90%. Below 70% signals a booking or referral problem; above 95% consistently suggests the clinician is overloaded with no buffer for emergencies or admin.",
    formula: "Booked slots ÷ Available slots (expressed as %)",
    clinicNote:
      "Available slots should be defined as the slots a clinician has opened for booking, not their total contracted hours. Most PMS systems (WriteUpp, Cliniko, TM3) can provide this directly.",
    tags: ["utilisation", "capacity", "diary", "slots", "booked"],
  },
  {
    id: "dna-rate",
    category: "metrics",
    question: "What is DNA Rate?",
    answer:
      "Did-Not-Attend (DNA) rate measures the proportion of booked appointments where the patient simply didn't show up with no prior notice. DNAs are a direct revenue loss — the slot is gone, it can't be filled at the last moment, and the clinician's time is wasted. High DNA rates (above 8–10%) often point to poor reminder workflows, incorrect contact details, or long booking lead times.",
    formula: "Did-not-attend appointments ÷ Total booked appointments (expressed as %)",
    clinicNote:
      "Ava (the AI receptionist module) directly targets DNA reduction through automated reminders and confirmations. If you're using Ava, expect this metric to trend down as the reminder cadence takes effect.",
    tags: ["dna", "did not attend", "no show", "cancellation", "reminder"],
  },
  {
    id: "revenue-per-session",
    category: "metrics",
    question: "What is Revenue Per Session?",
    answer:
      "Revenue per session is the average income generated per appointment delivered. It accounts for your fee mix — some patients may be on packages (lower per-session effective rate), some on insurance (fixed tariff), some paying full rate. Tracking this over time reveals whether discounting or package structures are eroding your average, and flags the revenue impact of DNAs.",
    formula: "Total revenue ÷ Sessions delivered",
    clinicNote:
      "This metric is most reliable when your PMS records payment against each appointment. If revenue is tracked separately (e.g. in Xero or a spreadsheet), there may be a sync lag. StrydeOS pulls this from your PMS where available.",
    tags: ["revenue", "session", "fee", "income", "pricing"],
  },
  {
    id: "nps",
    category: "metrics",
    question: "What is NPS (Net Promoter Score)?",
    answer:
      "Net Promoter Score measures patient loyalty. Patients are asked: 'How likely are you to recommend this practice to a friend or colleague?' on a 0–10 scale. Scores of 9–10 are Promoters; 7–8 are Passives; 0–6 are Detractors. Your NPS is calculated as % Promoters minus % Detractors. A positive score (>0) is good; above 50 is excellent for healthcare. StrydeOS treats NPS as an EBITDA lever — Promoters drive Google Reviews, word-of-mouth referrals, and long-term retention.",
    formula: "% Promoters (9–10) − % Detractors (0–6)",
    clinicNote:
      "NPS data needs to be actively collected — typically via a post-appointment survey sent by your PMS or through a tool like Typeform. If you're not currently surveying patients, this metric will be empty until a collection workflow is in place.",
    tags: ["nps", "net promoter", "satisfaction", "reviews", "google", "loyalty"],
  },

  // ─── Module Guides ────────────────────────────────────────────────────────────
  {
    id: "intelligence-module",
    category: "modules",
    question: "What does the Intelligence module do?",
    answer:
      "Intelligence is the clinical performance dashboard. It surfaces your clinic's KPI metrics across all eight tracked measures — for each individual clinician and rolled up for the whole practice. The goal is to give owners and clinical leads a Bloomberg-terminal-style view of what's actually happening across the team, without requiring manual data pulling from the PMS. Think of it as your weekly performance review in under two minutes.",
    clinicNote:
      "Intelligence is designed for clinic owners and clinical leads — not patients. It requires at least one full week of PMS data to begin populating meaningfully.",
    tags: ["intelligence", "dashboard", "kpi", "performance", "analytics"],
  },
  {
    id: "pulse-module",
    category: "modules",
    question: "What does the Pulse module do?",
    answer:
      "Pulse is the patient continuity engine. It monitors patient engagement signals — appointment gaps, missed follow-ups, programme inactivity — and flags patients who are at risk of dropping off before they've completed their treatment. The idea is to catch the silent self-discharge before it happens, rather than discovering the patient is gone when you look at your diary two weeks later.",
    clinicNote:
      "Pulse requires WriteUpp or Cliniko data to function. Churn-risk calculations use a rolling window — newly onboarded clinics may take 4–6 weeks before the risk scores stabilise.",
    tags: ["pulse", "continuity", "retention", "churn", "patient risk"],
  },
  {
    id: "ava-module",
    category: "modules",
    question: "What does the Ava module do?",
    answer:
      "Ava is the AI voice receptionist. She handles inbound calls, qualifies new patient enquiries, checks appointment availability, and books directly into your PMS diary — using a natural, human-sounding voice. Ava runs 24/7, meaning no more missed calls out of hours. She's built on Retell AI and ElevenLabs for the voice layer, with n8n handling the automation logic and WriteUpp/Cliniko receiving confirmed bookings via webhook.",
    clinicNote:
      "Ava is voice-first — there is no chatbot or text-based interface. She integrates with WriteUpp and Cliniko. If your clinic uses TM3 (Blue Zinc), full Ava integration is on the roadmap but not yet available.",
    tags: ["ava", "receptionist", "voice", "ai", "booking", "calls", "phone"],
  },

  // ─── General ─────────────────────────────────────────────────────────────────
  {
    id: "data-sync-frequency",
    category: "general",
    question: "How often does StrydeOS sync data?",
    answer:
      "Appointment and clinical data is pulled via webhook from WriteUpp and Cliniko — meaning updates are near real-time as events happen in your PMS. Metrics are computed and cached in weekly buckets, typically refreshing overnight. If you've just onboarded and your dashboard is showing limited data, allow 24–48 hours for the initial backfill to complete.",
    tags: ["sync", "data", "refresh", "frequency", "writeupp", "cliniko"],
  },
  {
    id: "adding-clinicians",
    category: "general",
    question: "How do I add or remove a clinician?",
    answer:
      "Clinician profiles are managed in Settings → Team. Adding a clinician creates a record in your StrydeOS workspace and links them to incoming PMS data by name matching. For accurate tracking, the clinician's name in StrydeOS must match exactly how it appears in your PMS (WriteUpp or Cliniko). Removing a clinician archives their data — it is never deleted.",
    tags: ["clinician", "team", "add", "remove", "settings"],
  },
  {
    id: "data-sources",
    category: "general",
    question: "Where does StrydeOS get its data from?",
    answer:
      "StrydeOS pulls from three primary sources: your PMS (WriteUpp or Cliniko) for appointments and patient records; Physitrack for home exercise programme data; and directly from StrydeOS features like Ava call logs and Pulse engagement scores. Data is stored securely in a London-region data centre with EU data residency, partitioned by clinic — meaning your data is never mixed with another practice's.",
    tags: ["data", "source", "writeupp", "cliniko", "physitrack", "firestore", "gdpr"],
  },
  {
    id: "metric-targets",
    category: "general",
    question: "How are metric targets and thresholds set?",
    answer:
      "StrydeOS ships with evidence-based default thresholds derived from validated clinical benchmarks and real data from Spires Physiotherapy (the pilot clinic). For example, a follow-up rate below 60% triggers a warning flag. Clinic-specific targets will be configurable in a future Settings update. For now, the defaults represent strong performance benchmarks for UK private practice.",
    tags: ["targets", "thresholds", "benchmarks", "kpi", "alerts"],
  },
  {
    id: "pms-not-listed",
    category: "general",
    question: "My practice uses TM3 — is it supported?",
    answer:
      "TM3 (Blue Zinc) is the most widely used legacy PMS in UK physiotherapy and is on the StrydeOS integration roadmap. Full TM3 support is not yet available, but it is the next integration priority after WriteUpp and Cliniko. If you're currently using TM3, contact us and you'll be prioritised for early access when the integration launches.",
    tags: ["tm3", "blue zinc", "pms", "integration", "support"],
  },
];

export const CATEGORY_LABELS: Record<HelpCategory, string> = {
  metrics: "Core Metrics",
  modules: "Module Guides",
  general: "General",
};

export const CATEGORIES: HelpCategory[] = ["metrics", "modules", "general"];
