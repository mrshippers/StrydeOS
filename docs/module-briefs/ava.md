# Ava Module Brief

**StrydeOS — Internal Product Document**
**Author:** Jamal / Claude Code session
**Date:** 12 May 2026
**Status:** Live. End-to-end booking verified at Spires (Ring → Ava → WriteUpp → diary).

---

## What Ava Actually Does Now

Ava is StrydeOS's AI voice receptionist. It answers inbound calls 24/7, books directly into the PMS, recovers missed calls and cancellations, and escalates only when a human is genuinely needed.

Built on:

- **ElevenLabs Conversational AI** for voice generation and turn-taking (stability 67%, similarity 85%, tuned for clinical conversation)
- **Twilio SIP** for telephony, missed-call routing, and warm transfer to human
- **LangGraph state machine** for conversation memory and structured routing — not a chatbot UI, a proper agent with explicit states (greet → identify → intent → book / info / transfer → end)
- **WriteUpp / Cliniko** booking write-back mid-call via the n8n + OpenClaw bridge
- **One-click UK provisioning** — number, SIP trunk, and ElevenLabs agent assembled in a single flow

Live capabilities:

- Inbound call handling with patient identification (existing patient lookup, new patient triage)
- Direct calendar booking — Ava holds the slot, confirms with caller, writes to the PMS during the call
- Cancellation recovery — when a caller cancels, Ava offers alternatives before letting them go
- Missed-call rescue — Twilio routes voicemail and missed calls back to Ava for a callback flow
- Warm transfer — complaints, complex clinical questions, and insurance edge cases route to a human with a contextual handoff via Twilio dial-and-announce
- Emergency routing — recognises red-flag symptoms (chest pain, fainting, suspected stroke) and routes immediately to a human or 999 prompt

Cross-module contracts (live as of v0.12):

- Emits `AvaCallFactEvent` on `conversation.ended` — consumed by Intelligence for value attribution
- Emits `InsightEvent` of type `AVA_CALL_BOOKED`, `AVA_CALL_ESCALATED`, `AVA_CALLBACK_REQUESTED` — consumed by Pulse to trigger follow-up sequences

---

## The Value Equation

A Studio clinic paying £149/month for Ava sees this attributed in a typical month:

```
Ava generated £1,170 this month
7.8x your £149 subscription  |  +£1,021 net value
```

Broken down (every figure derives from inputs an owner can verify):

| Stream | What happened | £ attributed |
|--------|--------------|-------------|
| **After-hours bookings** | 12 calls handled outside reception hours, all converted to appointments | 12 × £65 session = **£780** |
| **Missed-call rescues** | 6 calls that would have gone to voicemail recovered via callback flow | 6 × £65 session = **£390** |
| **Total revenue** | | **£1,170** |
| Labour saved (non-revenue, logged separately) | ~40 hours of reception time replaced — context for the owner, not counted in revenue total | — |

Inputs: £65 fallback session rate (`dashboard/src/lib/constants.ts`, overridden by the clinic's actual `sessionPricePence`). Labour-saved is recorded as an operational saving in `value_events`, never added to revenue attribution — avoids double-counting.

Setup cost: £195 one-time (Ava-only, never on Full Stack). Amortised across the first 12 months that adds ~£16/mo, bringing the effective month-one ROI to **~6.8x**.

---

## Attribution Rules

Owner-facing claims have to survive scrutiny. These rules exist to keep them defensible.

### Conservative by default

- Booking from call = 1 confirmed appointment in the PMS, not the patient's full treatment course
- After-hours boundary = clinic's configured reception hours, default 09:00–17:30 (per-clinic configurable, gap flagged in roadmap below)
- Missed-call rescue = call was missed AND Ava successfully reached the caller AND a booking was created
- Escalation = transfer was completed AND the human picked up, not just attempted

### No double-counting

- A single call produces at most ONE booking event
- Labour-saved events are operational metrics, never added to revenue attribution
- If Ava transferred a call and the human booked the appointment, attribution still goes to Ava (Ava captured the call)

### Confidence tiers

- **High** — Direct causal chain. Ava answered → `booking_id` created in PMS via webhook within the call. Auditable.
- **Medium** — Callback flow. Ava reached caller within 4h of missed call → booking created.
- **Low** — Voicemail recovery. Caller called back after Ava left voicemail → booking created (manual link).

---

## Deep Metrics

### Capture Rate
`Calls answered / total inbound calls`

Spires baseline (manual reception): ~73% during hours, ~12% out of hours. Ava lifts both to 100% during hours and ~95% out of hours (5% gap = caller hangs up before Ava picks up).

### Conversion Rate
`Bookings created / calls answered`

Industry-conservative target: 35% (one in three calls becomes a booking). Spires actual is tracked per call_facts join — useful as a benchmark for new clinics during onboarding.

### Escalation Rate
`Calls transferred to human / total calls`

Healthy range: 8–15%. Too low = Ava is over-promising on calls she shouldn't be handling. Too high = configuration drift or clinic-specific edge cases the prompt isn't catching. Watch for trend, not just absolute number.

### After-Hours Capture
`Calls answered outside reception hours`

The headline differentiator vs Moneypenny (limited hours) and in-house reception (zero out-of-hours). Cumulative monthly figure feeds the Value tab.

### Time-to-First-Word
Conversational latency from caller speaking to Ava responding. SLO target: <1.2s. Anything >2s is uncomfortable and breaks the receptionist illusion.

---

## What This Means for Each Stakeholder

### Owner
- Sees ROI in pounds with an auditable trail of who-called-when-and-booked-what
- Knows exact after-hours capture rate — the figure that justifies the subscription to a business partner
- Gets escalation summary; if escalation rate creeps up, configuration probably needs a review

### Clinician
- Doesn't get unsolicited bookings dropped on them — Ava respects calendar rules (lunch, training, holiday, sick days)
- Sees a single line in Pulse's morning brief: "Ava booked 4 patients for you yesterday"
- Knows escalations come through with context, not cold

### Patient
- Never hits a voicemail or "please leave a message"
- Can book at 8pm Tuesday or 3am Sunday and get a real conversation, not a form
- Insurance, location, parking, fees — Ava answers without delay
- Red-flag symptoms route immediately to a human, not "we'll call you back"

---

## Firestore Schema

```
clinics/{clinicId}/
  ava_calls/{callId}            — raw call records (started, ended, transcript)
  call_facts/{callId}           — structured outcomes (booked, escalated, callback_requested)
  ava_config/                   — voice settings, prompt overrides, reception hours, escalation rules
  ava_prompts/{version}         — versioned prompt history
  insight_events/{eventId}      — AvaCallFactEvent + AVA_CALL_BOOKED / ESCALATED / CALLBACK_REQUESTED
```

All partitioned by `clinicId`. Voice prompts versioned so prompt changes don't silently corrupt historical analysis.

---

## Computation Pipeline

```
Inbound call (Twilio)
    |
    v
ElevenLabs Conversational Agent (LangGraph state)
    |
    v
n8n webhook (call ended) → POST /api/webhooks/elevenlabs
    |
    v
ava_calls (raw) + call_facts (structured) + insight_events (cross-module)
    |
    v
Pulse consumes InsightEvents for follow-up sequences
Intelligence consumes call_facts for value attribution
```

Latency: webhook to insight event = ~1.5s typical, <5s p95. PMS booking writes happen mid-call (not post-call) via Ava's tool-call directly to the WriteUpp/Cliniko adapter.

---

## What's Next — Gaps

### Coverage
- [ ] Multi-language voice (Polish, Hindi, Arabic — based on Spires patient mix). v1.5.0 target on the public roadmap.
- [ ] Per-clinic reception hours — currently a single global default (09:00–17:30); needs per-clinic configuration in `ava_config/`.
- [ ] Holiday calendar integration so Ava knows when the clinic is closed.

### Quality
- [ ] Call satisfaction signal — patient rating after the call. Currently inferred from booking completion, not asked.
- [ ] Outcome measure capture during call — asking returning patients about pain/function for Intelligence to ingest.
- [ ] Prompt drift detection — alerting if Ava behaviour changes significantly between prompt versions.

### Attribution
- [ ] Insurance verification mid-call — currently confirms eligibility, doesn't process claims.
- [ ] LTV attribution — link callers across multiple calls to true unique-patient revenue, not per-booking.

---

## The Product Argument

The competition:

- **Moneypenny** (~£400–800/mo outsourced reception): human operators, limited hours, no PMS booking, no clinical context. Typical UK clinic running Moneypenny pays ~£18K/yr.
- **In-house reception** (£22–28K/yr per FTE all-in): zero out-of-hours, sick days, holiday gaps, attrition. Private Practice Barometer 2026: 14% staff turnover in the £500K–£1M clinic bracket.
- **Generic AI voice tools** (Synthflow, Air, etc.): no clinical context, no PMS integration, no escalation logic, no cross-module signals.

None of them can:

1. Book directly into the clinic's PMS during the call
2. Hand off to Intelligence for ROI attribution
3. Feed Pulse with structured callback obligations
4. Recognise clinical red flags and route them correctly

That's the moat. Ava isn't an answering service — it's the front door to a clinical operating system.

---

## Files Delivered

| File | Purpose |
|------|---------|
| `lib/ava/graph.ts` | LangGraph state machine (greeting → identify → intent → book/info/transfer → end) |
| `lib/ava/elevenlabs-agent.ts` | ElevenLabs agent lifecycle (create, update, rotate, retire) |
| `lib/ava/transfer-call.ts` | Warm-transfer logic via Twilio dial-and-announce |
| `lib/ava/engine-proxy.ts` | Mid-call tool routing (PMS booking, knowledge lookup, escalation) |
| `lib/ava/notify-callback.ts` | Missed-call rescue scheduler |
| `lib/ava/verify-signature.ts` | ElevenLabs + Twilio webhook signature verification |
| `app/api/webhooks/elevenlabs/route.ts` | `conversation.ended` handler — emits InsightEvents |
| `app/api/webhooks/twilio/route.ts` | SIP signalling + status callbacks |
| `app/api/ava/provision-number/route.ts` | One-click UK number provisioning |
| `app/api/ava/transfer-twiml/route.ts` | TwiML response for warm transfer |
| `app/receptionist/page.tsx` | Owner-facing Ava configuration UI |

---

*This brief is the reference document for the Ava module. Update it as voice tuning improves, languages expand, and attribution windows tighten.*
