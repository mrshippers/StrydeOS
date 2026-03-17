export type HelpCategory = "metrics" | "modules" | "general" | "setup" | "troubleshooting";

export interface HelpEntry {
  id: string;
  question: string;
  answer: string;
  /** Additional context for clinics that may not use this metric */
  clinicNote?: string;
  formula?: string;
  category: HelpCategory;
  tags: string[];
  /** YouTube video ID for embedded walkthrough */
  videoId?: string;
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
      "Relevant to all practice types. The UK median is 5.0 sessions per episode of care. A follow-up rate below 3.0 is in the bottom quartile nationally.",
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
      "Utilisation measures how efficiently a clinician's available appointment slots are being filled. A fully booked diary is 100% — but sustainable high performance sits between 70–80%. The UK average is 72%. Above 80%, begin monitoring clinician wellbeing — burnout risk increases. Below 65% signals a booking or referral problem.",
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
      "Did-Not-Attend (DNA) rate measures the proportion of booked appointments where the patient simply didn't show up with no prior notice. DNAs are a direct revenue loss — the slot is gone, it can't be filled at the last moment, and the clinician's time is wasted. The UK average DNA rate without automated reminders is 11%, dropping to around 6% with automation. Above 10% requires intervention — check reminder workflows, contact details, and booking lead times.",
    formula: "Did-not-attend appointments ÷ Total booked appointments (expressed as %)",
    clinicNote:
      "Ava (the AI receptionist module) directly targets DNA reduction through automated reminders and confirmations. Clinics with automated reminders typically see DNA rates drop from around 11% to 6%. If you're using Ava, expect this metric to trend down as the reminder cadence takes effect.",
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
      "Ava is the AI voice receptionist. She handles inbound calls, qualifies new patient enquiries, checks appointment availability, and books directly into your PMS diary — using a natural, human-sounding voice. Ava runs 24/7, meaning no more missed calls out of hours. She's built on Retell AI and ElevenLabs for the voice layer, with n8n handling the automation logic. Ava works with your PMS at the deepest level it supports — from real-time booking to intelligent call handling — so your front desk is covered regardless of your software.",
    clinicNote:
      "Ava is voice-first — there is no chatbot or text-based interface. See 'How does Ava work with different PMS systems?' for tier-by-tier capabilities.",
    tags: ["ava", "receptionist", "voice", "ai", "booking", "calls", "phone"],
  },
  {
    id: "ava-pms-tiers",
    category: "modules",
    question: "How does Ava work with different PMS systems?",
    answer:
      "The bottleneck is never Ava's AI engine — it can fire tool calls to any API endpoint. The bottleneck is what each PMS exposes. Ava adapts to your clinic's existing system.\n\nTier 1 — Live booking (real-time in-call): Cliniko. Open API, well-documented, supports availability lookups and appointment creation via REST. Ava can query slots and book while the patient is still on the phone. This is the flagship integration and the one we demo.\n\nTier 2 — Smart capture + async booking: WriteUpp, Jane. They have APIs but with tighter rate limits or less granular availability endpoints. Ava captures the patient's details, preferred times, and insurance info live on the call, then n8n fires the actual booking asynchronously within minutes. Patient gets a confirmation SMS/email shortly after hanging up.\n\nTier 3 — Intelligent triage + handoff: TM3, Physitrack, Heidi. Limited or no public booking API. Ava handles the full front-desk conversation — triage, insurance verification, red-flag screening — packages it into a structured summary, and delivers it to the clinic's inbox or dashboard for a human to action. Still saves 5–10 minutes per call, still filters out the noise.",
    clinicNote:
      "Ava works with your PMS at the deepest level it supports — from real-time booking to intelligent call handling — so your front desk is covered regardless of your software.",
    tags: ["ava", "pms", "cliniko", "writeupp", "jane", "tm3", "physitrack", "heidi", "integration", "tiers", "booking"],
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
      "StrydeOS pulls from three primary sources: your PMS (WriteUpp, Cliniko, Halaxy, or Zanda) for appointments and patient records; Physitrack for home exercise programme data; and directly from StrydeOS features like Ava call logs and Pulse engagement scores. Data is stored securely in a London-region data centre with EU data residency, partitioned by clinic — meaning your data is never mixed with another practice's.",
    tags: ["data", "source", "writeupp", "cliniko", "halaxy", "zanda", "powerdiary", "physitrack", "firestore", "gdpr"],
  },
  {
    id: "metric-targets",
    category: "general",
    question: "How are metric targets and thresholds set?",
    answer:
      "StrydeOS ships with evidence-based default thresholds derived from UK private practice benchmarks. For example, the follow-up rate target of 4.0 FU per IA reflects the UK median of 5.0 sessions per episode. Clinic-specific targets are configurable in Settings → KPI Targets.",
    tags: ["targets", "thresholds", "benchmarks", "kpi", "alerts"],
  },
  {
    id: "pms-not-listed",
    category: "general",
    question: "My practice uses TM3 or another PMS — is it supported?",
    answer:
      "StrydeOS currently supports WriteUpp, Cliniko, Halaxy, and Zanda (Power Diary) with full API integration. TM3 (Blue Zinc) and Pabau are on the integration roadmap. If you're using a different PMS, contact us — we prioritise integrations based on user demand and can often build custom adapters for practices with specific needs.",
    tags: ["tm3", "pabau", "jane", "blue zinc", "pms", "integration", "support"],
  },

  // ─── Setup Guides ─────────────────────────────────────────────────────────────
  {
    id: "getting-started",
    category: "setup",
    question: "How do I get started with StrydeOS?",
    answer:
      "StrydeOS onboarding has three steps: connect your PMS, confirm your clinicians, and set your KPI targets. Once all three are complete, data starts flowing and your dashboard populates automatically.\n\nStep 1 — Connect your PMS: Go to Settings → Integrations. Enter your WriteUpp or Cliniko API credentials. StrydeOS will verify the connection and begin backfilling historical appointments.\n\nStep 2 — Confirm your clinicians: Go to Settings → Team. Review the clinician names synced from your PMS. Make sure names match exactly — this is how appointments get attributed to the right clinician.\n\nStep 3 — Set your targets: Go to Settings → KPI Targets. Enter the performance benchmarks you want to track against. StrydeOS ships with evidence-based UK defaults — adjust them to match your clinic's ambitions.",
    clinicNote:
      "Most clinics see their first meaningful data within 24–48 hours of connecting their PMS. The dashboard will show a data-populating state during the initial backfill.",
    tags: ["getting started", "setup", "onboarding", "pms", "connect"],
  },
  {
    id: "connect-pms",
    category: "setup",
    question: "How do I connect my practice management system?",
    answer:
      "Go to Settings → Integrations. Select your PMS from the list (WriteUpp, Cliniko, Halaxy, or Zanda). You'll need your API key — here's where to find it:\n\nWriteUpp: Admin → API → Generate API Key\nCliniko: Settings → Integrations → API Keys → Generate\nHalaxy: Admin → Developer → API Key\nZanda: Settings → API Access\n\nPaste the key into StrydeOS and click Connect. StrydeOS will test the connection immediately. If it fails, double-check the key has full read permissions — some PMS systems let you restrict API key access by module.",
    clinicNote:
      "StrydeOS stores API keys server-side only. They are never exposed in the browser or included in any client-side code. If you rotate your PMS API key, update it in Settings → Integrations to restore the data feed.",
    tags: ["pms", "api key", "writeupp", "cliniko", "connect", "integration"],
  },
  {
    id: "add-clinicians",
    category: "setup",
    question: "How do I add clinicians to my StrydeOS workspace?",
    answer:
      "Clinician profiles in StrydeOS are created in two ways:\n\n1. Automatic sync — when you connect your PMS, StrydeOS imports the clinician list from your appointment data. Review these in Settings → Team.\n\n2. Manual add — go to Settings → Team → Add Clinician. Enter the clinician's name exactly as it appears in your PMS. This name matching is how appointments get attributed correctly.\n\nEach clinician can optionally be given a StrydeOS login (owner-level accounts can invite team members). Clinicians with a login see their own KPI dashboard only — not the full clinic view.",
    clinicNote:
      "Name matching is case-sensitive. If your PMS lists a clinician as 'Andrew Smith' and you enter 'andrew smith' in StrydeOS, appointments will not attribute correctly. When in doubt, copy the name directly from your PMS.",
    tags: ["clinician", "add", "team", "invite", "name matching", "settings"],
  },
  {
    id: "set-kpi-targets",
    category: "setup",
    question: "How do I configure my KPI targets?",
    answer:
      "Go to Settings → KPI Targets. StrydeOS ships with evidence-based defaults aligned to UK private practice benchmarks:\n\n• Follow-up Rate: 4.0+ FU per IA (UK median: 5.0 sessions per episode)\n• HEP Compliance: 80%+\n• Utilisation: 75%+ (UK average: 72%)\n• DNA Rate: <6% (UK average with automation: 6.3%)\n• Course Completion: 70%+\n\nAdjust these to match your clinic's current baseline and growth ambitions. Targets drive the performance indicators on the Intelligence dashboard — red/amber/green thresholds are calculated relative to what you set here.\n\nRecommendation: Start with the defaults for your first 4 weeks. Once you have a baseline reading of your actual performance, adjust targets to be challenging but achievable.",
    clinicNote:
      "If you're onboarding from a position of strong existing performance, set targets higher from the start. The defaults are designed for clinics that are establishing a measurement baseline for the first time.",
    tags: ["targets", "kpi", "settings", "thresholds", "follow-up", "hep", "utilisation"],
  },
  {
    id: "invite-team",
    category: "setup",
    question: "How do I give my clinicians access to StrydeOS?",
    answer:
      "Go to Settings → Team. Click the envelope icon next to a clinician to send them an invite. They'll receive an email with a login link and will be asked to set a password on first login.\n\nRole permissions:\n• Owner — full access to all metrics, all clinicians, billing, and settings\n• Clinician — can only see their own KPI data, not the full clinic view\n\nClinicians do not need a StrydeOS account for their data to appear — the dashboard populates from PMS data regardless. A login is only needed if you want the clinician to view their own numbers.",
    clinicNote:
      "Clinician accounts are read-only by design. They cannot modify targets, add team members, or access billing. Owners and admins have full write access.",
    tags: ["invite", "team", "access", "clinician login", "role", "permissions"],
  },
  {
    id: "ava-setup",
    category: "setup",
    question: "How do I set up Ava, the AI receptionist?",
    answer:
      "Ava setup is handled by the StrydeOS team during onboarding. The setup process covers:\n\n1. Phone number provisioning — a UK number is assigned to your clinic (or your existing number is forwarded).\n2. Voice and persona configuration — Ava is trained on your clinic's specific details: team, pricing, location, services.\n3. PMS integration — Ava is connected to your booking diary at the appropriate tier (live booking, async capture, or triage — depending on your PMS).\n4. Test calls — your team runs test calls to verify booking flows, edge cases, and handoffs.\n\nOnce live, Ava handles inbound calls 24/7. All call logs appear in the Ava module dashboard.",
    clinicNote:
      "Ava is not a self-serve setup. The configuration requires clinical knowledge of your team, schedule, and practice policies. The StrydeOS team handles this in a 45-minute onboarding session.",
    tags: ["ava", "setup", "receptionist", "phone", "booking", "voice"],
  },
  {
    id: "first-week",
    category: "setup",
    question: "What should I expect in my first week?",
    answer:
      "Day 1–2: PMS connection + initial data backfill. Your dashboard will show a populating state as historical appointment data is imported. Depending on your appointment volume, this can take a few hours to 48 hours.\n\nDay 2–3: First KPI readings appear. Follow-up rate, HEP compliance, DNA rate, and utilisation will begin showing weekly figures. The first week's data is often incomplete (due to backfill timing) — don't read too much into it.\n\nDay 4–7: Baseline established. By end of week 1, you should have a representative snapshot of where your clinic currently sits against each KPI. This is your starting point — not a final verdict.\n\nEnd of week 1 check-in: Review the Intelligence dashboard with your team. Identify the 1–2 metrics furthest from target. These are your first priorities.",
    clinicNote:
      "Expect some noise in week 1. Metrics only become statistically meaningful after 3–4 weeks of data. The dashboard shows a 'low data volume' indicator when sample sizes are small.",
    tags: ["first week", "onboarding", "backfill", "data", "setup", "expectations"],
  },
  {
    id: "notion-setup-guide",
    category: "setup",
    question: "Is there a detailed setup guide I can follow?",
    answer:
      "Yes — the StrydeOS Client Setup Guide is a step-by-step Notion document that walks through every configuration step in detail, including screenshots, common pitfalls, and recommended sequence.\n\nIt covers:\n• PMS connection (WriteUpp, Cliniko, Halaxy, Zanda)\n• Clinician mapping and name matching\n• KPI target calibration\n• Team access and permissions\n• Ava onboarding steps\n• First 30-day review checklist\n\nAccess it via the link below. Bookmark it — it's a living document updated as StrydeOS evolves.",
    clinicNote:
      "The Notion setup guide is the canonical onboarding reference. If anything in the in-app tooltips contradicts the guide, the guide takes precedence — flag it to support@strydeos.com.",
    tags: ["setup guide", "notion", "documentation", "onboarding", "walkthrough"],
  },

  // ─── Troubleshooting ──────────────────────────────────────────────────────────
  {
    id: "no-data-showing",
    category: "troubleshooting",
    question: "My dashboard is empty — why isn't any data showing?",
    answer:
      "There are three common causes:\n\n1. PMS not connected — go to Settings → Integrations. If the connection shows as 'Not connected' or 'Error', re-enter your API key. The key may have expired or been rotated.\n\n2. Data still backfilling — after a fresh connection, it can take up to 48 hours for historical data to fully import. The dashboard shows a backfill indicator during this period.\n\n3. No appointments in the selected time window — check the date range filter on the Intelligence dashboard. If you've just launched or had a quiet period, there may be no appointments to display.\n\nIf none of these apply, contact support@strydeos.com with your clinic name and PMS type.",
    tags: ["no data", "empty", "dashboard", "troubleshoot", "sync"],
  },
  {
    id: "metrics-wrong",
    category: "troubleshooting",
    question: "A metric looks wrong or doesn't match my PMS records.",
    answer:
      "KPI calculations in StrydeOS pull directly from your PMS appointment data. Discrepancies usually come from:\n\n1. Appointment type mismatch — StrydeOS classifies appointments as 'Initial Assessment' or 'Follow-up' based on the appointment type label in your PMS. If your PMS uses non-standard type names (e.g. 'First Contact' instead of 'Initial Assessment'), the classification may be off. Fix this in Settings → Integrations → Appointment Types.\n\n2. Clinician name mismatch — if a clinician's name in your PMS doesn't exactly match their StrydeOS profile, some appointments won't attribute to them. Check Settings → Team.\n\n3. Sync delay — if you've just made changes in your PMS, allow up to 30 minutes for the webhook to trigger and update StrydeOS.\n\n4. Cancelled appointments counted — StrydeOS excludes cancelled and DNA appointments from denominator calculations by default. If your PMS marks late cancellations differently, they may be included. Contact support to adjust the classification logic.",
    tags: ["metrics", "wrong", "inaccurate", "calculation", "mismatch", "appointment type"],
  },
  {
    id: "pms-connection-failing",
    category: "troubleshooting",
    question: "My PMS connection keeps failing or shows as disconnected.",
    answer:
      "Step 1 — Check your API key is valid. Log into your PMS and verify the key hasn't been revoked or expired. Generate a new one if needed.\n\nStep 2 — Verify key permissions. Some PMS systems let you restrict API key access by module (read-only, appointments only, etc.). StrydeOS needs read access to: appointments, practitioners, and patients.\n\nStep 3 — Check for PMS outages. WriteUpp and Cliniko occasionally have API outages. Check their status pages: status.writeupp.com / status.cliniko.com.\n\nStep 4 — Re-enter the key in StrydeOS. Go to Settings → Integrations, remove the existing key, and paste the new one. Click Connect — you'll see a success or error message immediately.\n\nIf the connection still fails after these steps, email support@strydeos.com with your PMS type and the error message shown.",
    tags: ["pms", "connection", "failing", "disconnected", "api key", "writeupp", "cliniko"],
  },
  {
    id: "clinician-missing",
    category: "troubleshooting",
    question: "A clinician isn't showing up in the dashboard.",
    answer:
      "There are two common causes:\n\n1. Name mismatch — the clinician's name in StrydeOS must match exactly how it appears in your PMS. Go to Settings → Team and check the name spelling. Then verify it against your PMS practitioner list.\n\n2. No appointments in the selected period — if the clinician had no completed appointments in the current time window, they won't appear in the performance table. Switch to a broader date range to confirm their historic data is present.\n\nIf the clinician was recently added to your PMS, allow 24 hours for the sync to pick them up. You can also manually trigger a sync in Settings → Integrations → Sync Now.",
    tags: ["clinician", "missing", "not showing", "name match", "sync"],
  },
  {
    id: "dna-count-off",
    category: "troubleshooting",
    question: "My DNA rate or appointment counts seem off.",
    answer:
      "DNA (Did Not Attend) rate is calculated from appointments your PMS has marked with a DNA status. If the number looks wrong:\n\n1. Check how your PMS records DNAs — some systems use 'No Show', 'Patient Did Not Attend', or 'DNA' as the status label. StrydeOS maps these automatically, but unusual labels can be missed. Check Settings → Integrations → Appointment Status Mapping.\n\n2. Late cancellations may be mixed in — if your clinic marks late cancellations as DNAs in the PMS, they'll appear in the StrydeOS DNA count too. This is typically correct behaviour, but worth being aware of.\n\n3. Confirm the date range — DNA rate uses completed appointment slots, not booked ones. Future appointments don't count.",
    tags: ["dna", "did not attend", "count", "wrong", "troubleshoot"],
  },
  {
    id: "ava-not-booking",
    category: "troubleshooting",
    question: "Ava completed a call but no appointment was created in the PMS.",
    answer:
      "This depends on which Ava tier your PMS uses:\n\nTier 1 (Cliniko — live booking): The booking fires in real-time during the call. If no appointment appeared, check the Ava call log in the Ava module — there will be an error state with a reason code. Common causes: the patient's email was already in use in the PMS, or a slot was taken between Ava checking availability and confirming.\n\nTier 2 (WriteUpp, Jane — async booking): Booking fires via n8n within minutes of the call ending. Check the Ava call log to confirm the booking task was triggered. If it shows 'Pending' for more than 15 minutes, the n8n workflow may have failed — contact support.\n\nTier 3 (TM3, Physitrack — triage handoff): Ava doesn't book directly. A structured summary is delivered to your inbox for manual action. Check your clinic email for the Ava handoff summary.",
    clinicNote:
      "All Ava call outcomes are logged in real-time in the Ava module. If a booking failed, the call log entry will show the failure reason and allow you to retry.",
    tags: ["ava", "booking", "failed", "pms", "cliniko", "writeupp", "n8n", "troubleshoot"],
  },
  {
    id: "stripe-billing-issue",
    category: "troubleshooting",
    question: "I'm having a billing or subscription issue.",
    answer:
      "For subscription queries — payment failures, plan changes, invoice requests, or cancellations — go to Settings → Billing. You can view your current plan, update your payment method, and download invoices directly from there.\n\nIf your subscription shows as 'Past due', update your payment method in Settings → Billing → Update Card. StrydeOS automatically retries failed payments for up to 7 days before access is restricted.\n\nFor any billing issue that can't be resolved in-app, contact support@strydeos.com with your clinic name and a description of the issue. Include your invoice number if you have it.",
    tags: ["billing", "subscription", "payment", "invoice", "stripe", "past due"],
  },
];

export const CATEGORY_LABELS: Record<HelpCategory, string> = {
  metrics: "Core Metrics",
  modules: "Module Guides",
  general: "General",
  setup: "Setup Guides",
  troubleshooting: "Troubleshooting",
};

export const CATEGORIES: HelpCategory[] = ["setup", "metrics", "modules", "general", "troubleshooting"];
