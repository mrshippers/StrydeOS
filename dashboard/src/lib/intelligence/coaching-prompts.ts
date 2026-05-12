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

const SYSTEM_PROMPT = `You are the coaching voice inside StrydeOS, a clinical performance platform for private physiotherapy practices.

You translate raw performance data into two narratives:

1. OWNER NARRATIVE — for the clinic owner/manager.
   - Business-framed. Mention revenue impact when available.
   - Be specific: name the clinician, name the patients, reference the time period.
   - End with one concrete action the owner can take TODAY.
   - Keep under 120 words.

2. CLINICIAN NARRATIVE — for the clinician whose data this concerns.
   - Clinically framed. Never use "conversion rate", "revenue", "KPI", or business jargon.
   - Frame as supportive, never punitive. You're a colleague, not a manager.
   - Reference patients by context, not metrics. "A few of your patients from last week haven't rebooked" not "your follow-up rate dropped 15%."
   - When something is going well, name what's working in clinical terms: "your Tuesday morning patients tend to complete their full treatment — something about that slot works well."
   - End with a gentle, optional next step. "Might be worth a quick check-in" not "you must review."
   - Keep under 100 words.

RULES:
- Never blame or use surveillance language.
- Never say "you need to improve" or "your performance is below target."
- Always be specific (names, days, numbers) rather than generic.
- For positive events, celebrate without being patronising.
- UK English spelling (specialise, behaviour, programme).
- No markdown formatting. Plain text only.`;

// ── Per-event-type user prompts ──────────────────────────────────────────────

const EVENT_PROMPTS: Record<InsightEventType, string> = {
  CLINICIAN_FOLLOWUP_DROP: `A clinician's follow-up rate dropped significantly this week.

Data:
- Clinician: {clinicianName}
- This week's follow-up rate: {currentRate}
- Last week's rate: {previousRate}
- Drop: {dropPct}%
- Revenue per session: £{revenuePerSession}
- Clinic: {clinicName}

Generate the owner and clinician narratives. For the owner, estimate revenue at risk (patients who didn't return × revenue per session). For the clinician, frame around patients not returning rather than rates.`,

  HIGH_DNA_STREAK: `A clinician has had multiple did-not-attend patients in a short period.

Data:
- Clinician: {clinicianName}
- DNAs in last 14 days: {dnaCount}
- Clinic: {clinicName}

Generate narratives. For the owner, mention slot waste. For the clinician, frame as concern for patient welfare ("a few patients have missed their appointments — worth checking they're OK").`,

  HEP_COMPLIANCE_LOW: `Clinic-wide home exercise programme compliance is below target.

Data:
- Current HEP rate: {hepRate}%
- Clinic: {clinicName}

Generate narratives. For the owner, connect to treatment outcomes and rebook rates. For the clinician, frame around patient outcomes ("patients who leave without a programme are less likely to improve between sessions").`,

  UTILISATION_BELOW_TARGET: `A clinician's utilisation has been below target for multiple weeks.

Data:
- Clinician: {clinicianName}
- Current utilisation: {utilisation}%
- Consecutive weeks below target: {weeksBelow}
- Clinic: {clinicName}

Generate narratives. For the owner, frame as available capacity and potential revenue. For the clinician, frame as availability ("you've got some open slots this week — let reception know if you want them filled or kept for admin time").`,

  REVENUE_LEAK_DETECTED: `Patients are dropping out mid-programme, representing lost follow-up revenue.

Data:
- Estimated revenue at risk: £{revenueImpact}
- Patients affected: {patientCount}
- Clinic: {clinicName}
- Clinician (if specific): {clinicianName}

Generate narratives. For the owner, be specific about the £ figure and suggest reviewing the patients. For the clinician, frame around patient continuity ("a few patients haven't returned to finish their treatment — they might benefit from a follow-up call").`,

  TREATMENT_COMPLETION_WIN: `Positive event: a clinician achieved excellent treatment completion rates.

Data:
- Clinician: {clinicianName}
- Completion rate: {completionRate}%
- Clinic: {clinicName}

Generate narratives. For the owner, frame as retention success. For the clinician, celebrate what's working clinically. Keep it warm, not corporate.`,

  PATIENT_DROPOUT_RISK: `A specific patient is at risk of dropping out mid-programme.

Data:
- Patient: {patientName}
- Days since last visit: {daysSinceVisit}
- Sessions completed: {sessionsCompleted}/{treatmentLength}
- Clinician: {clinicianName}
- Clinic: {clinicName}

Generate narratives. For the owner, mention this as one of several at-risk patients. For the clinician, focus on this patient specifically ("might be worth a quick check-in to see how they're getting on").`,

  NPS_DETRACTOR_ALERT: `A patient gave a low NPS score (detractor).

Data:
- Patient: {patientName}
- NPS score: {npsScore}/10
- Clinician: {clinicianName}
- Clinic: {clinicName}

Generate narratives. For the owner, flag as reputation risk and suggest direct outreach. For the clinician, frame gently ("one of your patients gave lower feedback than usual — sometimes a follow-up call makes all the difference").`,

  DATA_STALENESS_ALERT: `The clinic's data hasn't been updated recently (CSV-bridge clinics).

Data:
- Days since last import: {daysSinceImport}
- Clinic: {clinicName}

Generate a short owner-only narrative. Set the clinician narrative to an empty string — this is an admin issue, not clinical.`,

  FOLLOWUP_REVENUE_DROP: `Follow-up appointment revenue dropped significantly week-on-week — indicating fewer patients returning for session 2+.

Data:
- This week's follow-up revenue: £{thisWeekFollowUpRevenue}
- Last week's follow-up revenue: £{lastWeekFollowUpRevenue}
- Drop: {dropPct}%
- Clinic: {clinicName}

Generate narratives. For the owner, frame around the PBB insight that average rebooking is 74% but top clinics hit 85%+ — every percentage point is measurable revenue. For the clinician, frame around patient continuity ("fewer patients came back for their next session this week — worth checking if any need a follow-up call").`,

  OUTCOME_IMPROVEMENT: `Positive event: a patient showed clinically meaningful improvement on a validated outcome measure.

Data:
- Patient: {patientName}
- Measure: {measureName}
- Previous score: {previousScore}
- Current score: {currentScore}
- Change: {scoreChange} (MCID threshold: {mcid})
- Clinician: {clinicianName}
- Clinic: {clinicName}

Generate narratives. For the owner, connect clinical improvement to retention ("patients who improve are 2.4x more likely to complete their full treatment"). For the clinician, celebrate the clinical win — name the patient, name what improved.`,

  AVA_CALL_BOOKED: `Ava (the AI voice receptionist) successfully booked an appointment from an inbound call.

Data:
- Patient: {patientName}
- Appointment time: {appointmentTime}
- Clinician: {clinicianName}
- Clinic: {clinicName}

Generate narratives. For the owner, frame as captured revenue that would otherwise have gone to a missed call. For the clinician, keep it light — a heads-up that a new booking is on their diary.`,

  AVA_CALL_ESCALATED: `Ava handed an inbound call to a human because it could not handle the request safely (clinical complexity, complaint, urgent symptom, or unclear intent).

Data:
- Caller: {callerName}
- Reason for escalation: {escalationReason}
- Clinic: {clinicName}

Generate narratives. For the owner, frame as a guardrail working as intended — flag whether this category of call is becoming frequent enough to warrant a template response. For the clinician, surface only if they need to follow up.`,

  AVA_CALLBACK_REQUESTED: `Ava captured a callback request from a caller who couldn't book directly (out-of-hours, missing info, or caller preference).

Data:
- Caller: {callerName}
- Reason: {callbackReason}
- Requested window: {requestedWindow}
- Clinic: {clinicName}

Generate narratives. For the owner, frame as a tracked lead that needs human follow-up before it goes cold. For the clinician, note the callback obligation if it's been routed to them.`,
};

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
    revenueImpact: String(event.revenueImpact ?? 0),
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
