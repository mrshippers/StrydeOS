import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import type { InsightEvent, InsightEventType } from "@/types/insight-events";

// ── Context passed to the LLM alongside the raw event ────────────────────────

export interface CoachingContext {
  clinicName: string;
  clinicianName?: string;
  patientName?: string;
  revenuePerSession: number;
  /** Additional metadata the rules engine attached */
  metadata: Record<string, unknown>;
}

// ── Output shape ─────────────────────────────────────────────────────────────

export interface CoachingNarrative {
  ownerNarrative: string;
  clinicianNarrative: string;
}

// ── System prompt: the clinical-to-commercial translator ─────────────────────
//
// IMPORTANT: The system prompt must NEVER instruct the model to estimate,
// compute, or invent any financial or statistical figure. All numbers are
// injected as fixed tokens in the user prompt; the model may only echo
// the figures it was given.

const SYSTEM_PROMPT = `You are the coaching voice inside StrydeOS, a clinical performance platform for private physiotherapy practices.

You translate raw performance data into two narratives:

1. OWNER NARRATIVE - for the clinic owner/manager.
   - Business-framed. Reference revenue impact using ONLY the figures provided to you.
   - Be specific: name the clinician, name the patients, reference the time period.
   - End with one concrete action the owner can take TODAY.
   - Keep under 120 words.

2. CLINICIAN NARRATIVE - for the clinician whose data this concerns.
   - Clinically framed. Never use "conversion rate", "revenue", "KPI", or business jargon.
   - Frame as supportive, never punitive. You're a colleague, not a manager.
   - Reference patients by context, not metrics. "A few of your patients from last week haven't rebooked" not "your follow-up rate dropped 15%."
   - When something is going well, name what's working in clinical terms: "your Tuesday morning patients tend to complete their full treatment - something about that slot works well."
   - End with a gentle, optional next step. "Might be worth a quick check-in" not "you must review."
   - Keep under 100 words.

RULES:
- Never blame or use surveillance language.
- Never say "you need to improve" or "your performance is below target."
- Always be specific (names, days, numbers) rather than generic.
- For positive events, celebrate without being patronising.
- UK English spelling (specialise, behaviour, programme).
- No markdown formatting. Plain text only.
- CRITICAL: You must NOT introduce any number (currency, percentage, or multiple) that was not explicitly given to you in the data below. Echo the provided figures verbatim; you may add framing sentences around them but must not invent, estimate, or compute any figure.`;

// ── Per-event-type user prompts ──────────────────────────────────────────────
//
// NOTE on numeric tokens:
//   Placeholders like {revenueImpact}, {dropPct}, {patientCount} are replaced
//   with computed values BEFORE the prompt reaches the model. The model MUST
//   use those exact figures and must NOT derive, estimate, or alter them.

const EVENT_PROMPTS: Record<InsightEventType, string> = {
  CLINICIAN_FOLLOWUP_DROP: `A clinician's follow-up rate dropped significantly this week.

Data:
- Clinician: {clinicianName}
- This week's follow-up rate: {currentRate}
- Last week's rate: {previousRate}
- Drop: {dropPct}%
- Clinic: {clinicName}

Use the figures above verbatim. Do not estimate or introduce any other numbers.
Generate the owner and clinician narratives. For the owner, reference the drop figure provided. For the clinician, frame around patients not returning rather than rates.`,

  HIGH_DNA_STREAK: `A clinician has had multiple did-not-attend patients in a short period.

Data:
- Clinician: {clinicianName}
- DNAs in last 14 days: {dnaCount}
- Clinic: {clinicName}

Use the figures above verbatim. Do not introduce any other numbers.
Generate narratives. For the owner, mention slot waste. For the clinician, frame as concern for patient welfare ("a few patients have missed their appointments - worth checking they're OK").`,

  HEP_COMPLIANCE_LOW: `Clinic-wide home exercise programme compliance is below target.

Data:
- Current HEP rate: {hepRate}%
- Clinic: {clinicName}

Use the figures above verbatim. Do not introduce any other numbers.
Generate narratives. For the owner, connect to treatment outcomes and rebook rates. For the clinician, frame around patient outcomes ("patients who leave without a programme are less likely to improve between sessions").`,

  UTILISATION_BELOW_TARGET: `A clinician's utilisation has been below target for multiple weeks.

Data:
- Clinician: {clinicianName}
- Current utilisation: {utilisation}%
- Consecutive weeks below target: {weeksBelow}
- Clinic: {clinicName}

Use the figures above verbatim. Do not introduce any other numbers.
Generate narratives. For the owner, frame as available capacity. For the clinician, frame as availability ("you've got some open slots this week - let reception know if you want them filled or kept for admin time").`,

  REVENUE_LEAK_DETECTED: `Patients are dropping out mid-programme, representing lost follow-up revenue.

Data:
- Estimated revenue at risk: £{revenueImpact}
- Patients affected: {patientCount}
- Clinic: {clinicName}
- Clinician (if specific): {clinicianName}

The figure £{revenueImpact} is the computed revenue impact - echo it exactly. Do not alter, round, or introduce any other monetary figure.
Generate narratives. For the owner, reference the provided £{revenueImpact} figure and suggest reviewing the patients. For the clinician, frame around patient continuity ("a few patients haven't returned to finish their treatment - they might benefit from a follow-up call").`,

  TREATMENT_COMPLETION_WIN: `Positive event: a clinician achieved excellent treatment completion rates.

Data:
- Clinician: {clinicianName}
- Completion rate: {completionRate}%
- Clinic: {clinicName}

Use the figures above verbatim. Do not introduce any other numbers.
Generate narratives. For the owner, frame as retention success. For the clinician, celebrate what's working clinically. Keep it warm, not corporate.`,

  PATIENT_DROPOUT_RISK: `A specific patient is at risk of dropping out mid-programme.

Data:
- Patient: {patientName}
- Days since last visit: {daysSinceVisit}
- Sessions completed: {sessionsCompleted}/{treatmentLength}
- Clinician: {clinicianName}
- Clinic: {clinicName}

Use the figures above verbatim. Do not introduce any other numbers.
Generate narratives. For the owner, mention this as one of several at-risk patients. For the clinician, focus on this patient specifically ("might be worth a quick check-in to see how they're getting on").`,

  NPS_DETRACTOR_ALERT: `A patient gave a low NPS score (detractor).

Data:
- Patient: {patientName}
- NPS score: {npsScore}/10
- Clinician: {clinicianName}
- Clinic: {clinicName}

Use the figures above verbatim. Do not introduce any other numbers.
Generate narratives. For the owner, flag as reputation risk and suggest direct outreach. For the clinician, frame gently ("one of your patients gave lower feedback than usual - sometimes a follow-up call makes all the difference").`,

  DATA_STALENESS_ALERT: `The clinic's data hasn't been updated recently (CSV-bridge clinics).

Data:
- Days since last import: {daysSinceImport}
- Clinic: {clinicName}

Use the figures above verbatim. Do not introduce any other numbers.
Generate a short owner-only narrative. Set the clinician narrative to an empty string - this is an admin issue, not clinical.`,

  FOLLOWUP_REVENUE_DROP: `Follow-up appointment revenue dropped significantly week-on-week, indicating fewer patients returning for session 2+.

Data:
- This week's follow-up revenue: £{thisWeekFollowUpRevenue}
- Last week's follow-up revenue: £{lastWeekFollowUpRevenue}
- Drop: {dropPct}%
- Clinic: {clinicName}

The monetary and percentage figures above are computed values - echo them exactly. Do not introduce any benchmark statistics or other numbers not listed here.
Generate narratives. For the owner, frame the revenue drop using only the provided figures. For the clinician, frame around patient continuity ("fewer patients came back for their next session this week - worth checking if any need a follow-up call").`,

  OUTCOME_IMPROVEMENT: `Positive event: a patient showed clinically meaningful improvement on a validated outcome measure.

Data:
- Patient: {patientName}
- Measure: {measureName}
- Previous score: {previousScore}
- Current score: {currentScore}
- Change: {scoreChange} (MCID threshold: {mcid})
- Clinician: {clinicianName}
- Clinic: {clinicName}

Use the figures above verbatim. Do not introduce any other numbers.
Generate narratives. For the owner, connect clinical improvement to retention - highlight that consistent outcome tracking makes quality visible and supports patient follow-through. For the clinician, celebrate the clinical win - name the patient, name what improved.`,

  AVA_CALL_BOOKED: `Ava (the AI voice receptionist) successfully booked an appointment from an inbound call.

Data:
- Patient: {patientName}
- Appointment time: {appointmentTime}
- Clinician: {clinicianName}
- Clinic: {clinicName}

Do not introduce any revenue estimates or other numbers not listed above.
Generate narratives. For the owner, frame as a captured booking that would otherwise have been a missed call. For the clinician, keep it light - a heads-up that a new booking is on their diary.`,

  AVA_CALL_ESCALATED: `Ava handed an inbound call to a human because it could not handle the request safely (clinical complexity, complaint, urgent symptom, or unclear intent).

Data:
- Caller: {callerName}
- Reason for escalation: {escalationReason}
- Clinic: {clinicName}

Do not introduce any numbers not listed above.
Generate narratives. For the owner, frame as a guardrail working as intended - flag whether this category of call is becoming frequent enough to warrant a template response. For the clinician, surface only if they need to follow up.`,

  AVA_CALLBACK_REQUESTED: `Ava captured a callback request from a caller who couldn't book directly (out-of-hours, missing info, or caller preference).

Data:
- Caller: {callerName}
- Reason: {callbackReason}
- Requested window: {requestedWindow}
- Clinic: {clinicName}

Do not introduce any numbers not listed above.
Generate narratives. For the owner, frame as a tracked lead that needs human follow-up before it goes cold. For the clinician, note the callback obligation if it's been routed to them.`,
};

// ── Per-event required placeholders (for missing/non-finite validation) ───────
//
// Only list placeholders whose values are numeric and meaningful for the event
// type. The interpolate() skip fires when ANY of these is absent or non-finite.

const REQUIRED_NUMERIC_PLACEHOLDERS: Partial<Record<InsightEventType, string[]>> = {
  REVENUE_LEAK_DETECTED: ["revenueImpact"],
  CLINICIAN_FOLLOWUP_DROP: ["currentRate", "previousRate", "dropPct"],
  HIGH_DNA_STREAK: ["dnaCount"],
  HEP_COMPLIANCE_LOW: ["hepRate"],
  UTILISATION_BELOW_TARGET: ["utilisation", "weeksBelow"],
  TREATMENT_COMPLETION_WIN: ["completionRate"],
  FOLLOWUP_REVENUE_DROP: ["thisWeekFollowUpRevenue", "lastWeekFollowUpRevenue", "dropPct"],
  OUTCOME_IMPROVEMENT: ["previousScore", "currentScore", "scoreChange", "mcid"],
  PATIENT_DROPOUT_RISK: ["daysSinceVisit", "sessionsCompleted", "treatmentLength"],
  NPS_DETRACTOR_ALERT: ["npsScore"],
};

// ── Detect missing / non-finite placeholders ──────────────────────────────────
//
// Exported for testing. Checks which placeholders referenced in `template` are
// absent from `vars` or carry a non-finite numeric value.

export function detectMissingPlaceholders(
  template: string,
  vars: Record<string, unknown>
): string[] {
  const referenced = Array.from(template.matchAll(/\{(\w+)\}/g), (m) => m[1]);
  const missing: string[] = [];

  for (const key of referenced) {
    const value = vars[key];
    if (value === undefined || value === null || value === "") {
      missing.push(key);
      continue;
    }
    // If the value looks like a number, verify it is finite
    const n = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(n) && !Number.isFinite(n)) {
      // Infinite value - treat as missing
      missing.push(key);
    }
    if (typeof value === "number" && isNaN(value)) {
      missing.push(key);
    }
  }

  // Deduplicate (a placeholder may appear more than once in the template)
  return [...new Set(missing)];
}

// ── Interpolate template variables ───────────────────────────────────────────

function interpolate(
  template: string,
  event: InsightEvent,
  ctx: CoachingContext
): string {
  const vars: Record<string, string> = {
    clinicName: ctx.clinicName,
    clinicianName: ctx.clinicianName ?? event.clinicianName ?? "a clinician",
    patientName: ctx.patientName ?? event.patientName ?? "a patient",
    revenuePerSession: String(ctx.revenuePerSession),
    ...(event.revenueImpact != null ? { revenueImpact: String(event.revenueImpact) } : {}),
    ...Object.fromEntries(
      Object.entries({ ...event.metadata, ...ctx.metadata }).map(([k, v]) => [
        k,
        String(v ?? ""),
      ])
    ),
  };

  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ── Parse the LLM response into two narratives ──────────────────────────────

function parseNarratives(text: string): CoachingNarrative {
  // Expected format from the LLM:
  // OWNER: ...
  // CLINICIAN: ...
  const ownerMatch = text.match(/OWNER:\s*([\s\S]*?)(?=CLINICIAN:|$)/i);
  const clinicianMatch = text.match(/CLINICIAN:\s*([\s\S]*?)$/i);

  return {
    ownerNarrative: ownerMatch?.[1]?.trim() ?? text.trim(),
    clinicianNarrative: clinicianMatch?.[1]?.trim() ?? "",
  };
}

// ── Main generation function ─────────────────────────────────────────────────

export async function generateCoachingNarrative(
  event: InsightEvent,
  ctx: CoachingContext
): Promise<CoachingNarrative> {
  const promptTemplate = EVENT_PROMPTS[event.type];
  if (!promptTemplate) {
    return {
      ownerNarrative: "",
      clinicianNarrative: "",
    };
  }

  // Build the interpolation variable map to validate required placeholders
  const vars: Record<string, unknown> = {
    clinicName: ctx.clinicName,
    clinicianName: ctx.clinicianName ?? event.clinicianName ?? "a clinician",
    patientName: ctx.patientName ?? event.patientName ?? "a patient",
    revenuePerSession: ctx.revenuePerSession,
    ...(event.revenueImpact != null ? { revenueImpact: event.revenueImpact } : {}),
    ...event.metadata,
    ...ctx.metadata,
  };

  // Validate required numeric placeholders. If any are missing or non-finite,
  // skip LLM enrichment to avoid feeding the model a prompt with holes that
  // it would fill by fabricating figures.
  const requiredKeys = REQUIRED_NUMERIC_PLACEHOLDERS[event.type] ?? [];
  const missing = detectMissingPlaceholders(
    requiredKeys.map((k) => `{${k}}`).join(" "),
    vars
  );
  if (missing.length > 0) {
    return {
      ownerNarrative: "",
      clinicianNarrative: "",
    };
  }

  const userPrompt = interpolate(promptTemplate, event, ctx);

  const { text } = await generateText({
    model: gateway("anthropic/claude-haiku-4.5"),
    system: SYSTEM_PROMPT,
    prompt: `${userPrompt}\n\nRespond in exactly this format:\nOWNER: <owner narrative>\nCLINICIAN: <clinician narrative>`,
    maxOutputTokens: 400,
    temperature: 0.3,
  });

  return parseNarratives(text);
}
