# Pulse Module Brief

**StrydeOS — Internal Product Document**
**Author:** Jamal / Claude Code session
**Date:** 12 May 2026
**Status:** Live. Spires running real sequences with opt-out enforcement and Heidi complexity layer.

---

## What Pulse Actually Does Now

Pulse is StrydeOS's patient continuity engine. It detects who's about to drop off, re-engages them automatically, captures reviews from satisfied patients, and tracks every comms event for attribution.

Built on:

- **Risk scoring engine** — weighted composite of attendance (30%), treatment progress (25%), HEP engagement (20%), sentiment (15%), and static risk factors (10%). Returns a 0–100 score per patient on every PMS sync.
- **Lifecycle state machine** — `active → at-risk → dropping-off → dropped-off → reactivated`, transitions driven by risk score + activity recency
- **Sequence library** — rebooking nudges, dropout prevention, post-discharge check-ins, review prompts, win-back campaigns
- **Twilio SMS** for messaging (email path also supported via Resend)
- **n8n** orchestration for delivery, with an explicit `pulseState` singleton document for pipeline observability (`status`, `lastRunAt`, `runId`, `queuedCount`, `failedCount`, `lastError`)

Live capabilities:

- Automatic patient risk scoring on every PMS sync
- Lifecycle state badges visible on the Patient Board (clinician view) and the Dashboard (owner view)
- Pre-configured sequence definitions per event type, with per-clinic override via the `triggerEventType` field on `sequence_definitions`
- Opt-out enforcement — patient comms preferences honoured across every sequence, propagated immediately when set
- Heidi complexity layer integration — escalates psychosocially complex patients out of generic sequences
- Review prompts timed to peak satisfaction (post-discharge + outcome improvement signals) — Spires hit 4.8★ on Google without asking manually
- NPS captured automatically post-discharge, fed to Intelligence as an EBITDA-correlated signal
- Idempotent event consumption — `consumedBy` array on `insight_events` prevents double-triggering on re-runs
- Honest empty states — no fake "0 dropouts! 🎉"; surfaces actual data quality if signals are missing

Cross-module contracts (live as of v0.12):

- Consumes `InsightEvent` from Intelligence (clinical metric drift, dropout risk surfaced) and Ava (`AVA_CALL_ESCALATED`, `AVA_CALLBACK_REQUESTED`)
- Writes `comms_log` entries with explicit outcomes: `pending` (queued for delivery), `delivered`, `responded`, `no_action`, `recovered`
- Emits attribution events back to Intelligence when rebooking is detected within the attribution window

---

## The Value Equation

A Studio clinic paying £99/month for Pulse sees this attributed in a typical month:

```
Pulse generated £730 this month
7.3x your £99 subscription  |  +£631 net value
```

Broken down (every figure derives from inputs an owner can verify):

| Stream | What happened | £ attributed |
|--------|--------------|-------------|
| **Dropout re-engagement** | 5 patients at risk of dropping out re-engaged within attribution window | 5 × £75 = **£375** |
| **Review acquisition** | 3 Google reviews posted following Pulse prompt | 3 × £75 = **£225** |
| **DNA recovery** | 2 did-not-attend slots refilled via auto-rebook flow | 2 × £65 session = **£130** |
| **Total** | | **£730** |

Inputs: £75 = industry-conservative re-engagement value (1 confirmed return session, never the patient's remaining course); £75 = industry-conservative Google review acquisition cost; £65 = fallback session rate (`dashboard/src/lib/constants.ts`, overridden by `sessionPricePence`).

Conservative by design: re-engagement attribution counts only the *first* returned session, not the full remaining course. If the rebooked patient completes 5 more sessions, only the first accrues to Pulse — the rest fall under Intelligence's retention metric instead. No double-counting between modules.

---

## Attribution Rules

### Conservative by default

- Re-engagement = 1 confirmed session attributed, not remaining course
- Review = posted (verified via Google Places API), not just prompted
- DNA recovery = slot rebooked within 24h of the original miss
- Rebooking attribution window = patient appointment created within 3 days of nudge (configurable per clinic)

### No double-counting

- Same comms entry produces ONE event type (dropout OR DNA recovery, never both)
- If Ava brought the patient back, Pulse doesn't claim the reactivation
- Sequence-level attribution: if step 3 of 6 converts, the *sequence* is credited (not just step 3) — but only once

### Cadence enforcement

- Opt-out honoured immediately and propagated across all sequences
- Max 1 SMS + 1 email per patient per 48h
- Sequence definitions are versioned — A/B comparison requires explicit version pinning

### Confidence tiers

- **High** — Direct causal chain. SMS sent → patient replied → booking created within 3 days. Auditable.
- **Medium** — Strong correlation. Review posted within 14 days of post-discharge prompt. Ghost patient reactivated after Pulse nudge.
- **Low** — Correlation. Rebooking happened in the attribution window but no comms reply (could be unrelated). Shown but flagged.

---

## Deep Metrics

### Sequence Conversion Rate
`Confirmed bookings within window / sequences triggered`

Per-sequence breakdown so owners can see *which* nudge actually works. Target: >30% on dropout prevention, >15% on win-back.

### Dropout Interception Rate
`At-risk patients re-engaged / at-risk patients identified`

The headline KPI for Pulse. Spires baseline (no Pulse): ~12% recovered manually. With Pulse running: target 35%+.

### Review Velocity
`Reviews posted per month / patients eligible to be prompted`

Post-discharge satisfaction signal × prompt opt-in × actual completion. Spires real-world: 4.8★ Google rating, ~8 reviews/month from automated prompts.

### Time-to-Re-engagement
Days between dropout detection and patient's next booked session. <14 days = fast recovery; >30 days = patient probably gone for good.

### Comms Load per Patient
Total sequences triggered per patient over their journey. Sanity-check that Pulse isn't over-nudging — patient fatigue is a real risk and the cadence cap exists to prevent it.

---

## What This Means for Each Stakeholder

### Owner
- Sees retention as a £-figure, not a percentage. "Pulse recovered £730 this month, £8,760 annualised" is a different conversation than "Our DNA rate improved 1.2%"
- Knows when patients are leaking without having to look — risk-score escalations trigger an Insight Event in the Intelligence feed
- Reviews are an EBITDA lever — clinics with higher Google ratings command higher fees and convert more first-call enquiries

### Clinician
- Sees their patient board sorted by lifecycle state — at-risk patients surface to the top
- Risk factors are a coaching prompt, not a metric — "this patient hasn't engaged with their HEP in 8 days" is actionable
- Doesn't have to remember to follow up — Pulse handles the cadence, the clinician handles the relationship

### Patient
- Gets nudged when they're about to drift, not 6 months too late
- Communication frequency stays sane — opt-outs respected, cadence capped
- Post-discharge check-in actually happens (most clinics drop the relationship at discharge)

---

## Firestore Schema

```
clinics/{clinicId}/
  patients/{patientId}/risk_score/{snapshotId}    — historical risk scores
  patients/{patientId}/lifecycle_state            — current state + transition log
  sequence_definitions/{sequenceId}                — sequence configs, per-clinic overridable
  comms_log/{commsId}                              — every SMS/email + outcome + templateKey/version
  insight_events/{eventId}                         — events with consumedBy: ['pulse', ...] for idempotency
  pulseState/pulseState                            — pipeline observability singleton
```

All partitioned by `clinicId`. `comms_log` is the single source of truth for what Pulse has sent — Intelligence reads it for attribution, Owner Settings reads it for opt-out audit.

---

## Computation Pipeline

```
PMS sync (WriteUpp / Cliniko)
    |
    v
Risk scoring (5-factor composite) → patients/{id}/risk_score
    |
    v
Lifecycle state transition → patients/{id}/lifecycle_state
    |
    v
Insight Event emission (if drift detected)
    |
    v
Pulse insight-event-consumer (idempotent: arrayUnion 'pulse' in consumedBy)
    |
    v
trigger-sequences → comms_log (outcome: pending) → n8n delivery → outcome: delivered/responded/no_action
    |
    v
Intelligence reads comms_log for attribution
```

Runs on each PMS webhook plus a 4-hour cron for fallback. The `pulseState` singleton is written at every run start and end so the owner can see pipeline health without grepping logs.

---

## What's Next — Gaps

### Attribution
- [ ] Review attribution — track which Pulse sequence converted to a Google review. Currently we know reviews happen post-prompt; not which prompt drove which review. v1.5.0 target on the public roadmap.
- [ ] Multi-step sequence credit — when step 4 of 6 converts, the *sequence* gets credit but step-level attribution is lossy.

### Configuration
- [ ] Template editor UX — sequence definitions are JSON-only today. Owner-facing template editor blocked on UX decision.
- [ ] Per-condition cadence — chronic pain patients need different reminder cadence than acute injury. Currently a single global cadence.

### Quality
- [ ] `PatientEditModal` shadow-state fix — manual overrides can race with auto-state-transition. Needs UX decision on merge conflicts.
- [ ] `comms_log` → `messages` collection rename — `comms_log` is legacy naming, blocked on template migration.

### Coverage
- [ ] Multi-language SMS templates — depends on Ava's language expansion.
- [ ] Outcome measure capture pre- and post-discharge — depends on Intelligence's outcome measure layer going live (v1.5.0).

---

## The Product Argument

The competition:

- **Reactivate** (£200–400/mo): SMS sequences, no clinical context, no PMS integration, no risk scoring.
- **PMS built-in reminders (WriteUpp / Cliniko)**: appointment-confirmation only, no dropout detection, no review prompting.
- **Generic CRM (Mailchimp / HubSpot)**: no clinical context, no opt-out cadence rules, manual segmentation.

None of them can:

1. Score risk from clinical signals (HEP engagement, treatment progress, Heidi complexity)
2. Attribute £ to specific sequences with confidence tiers
3. Coordinate with a voice agent (Ava) and an analytics layer (Intelligence) on the same patient
4. Surface "this patient is dropping off" in real time, before the clinician notices

Pulse isn't a comms tool — it's a continuity engine. The difference matters because *retention* is the highest-leverage KPI in private practice (Private Practice Barometer 2026: a 5pp rebooking-rate improvement ≈ ~£18K/yr revenue for a typical £300K clinic).

---

## Files Delivered

| File | Purpose |
|------|---------|
| `lib/pulse/insight-event-consumer.ts` | Idempotent event consumer + sequence dispatch |
| `lib/pulse/track-reengagement.ts` | Re-engagement detection within attribution window |
| `lib/comms/trigger-sequences.ts` | n8n delivery + `pulseState` singleton write at run start/end |
| `lib/comms/validate-n8n-webhook.ts` | Webhook signature verification |
| `app/api/n8n/callback/route.ts` | Comms outcome callbacks (delivered, responded, no_action) |
| `app/api/comms/send/route.ts` | Manual send path with role enforcement (owner/admin/superadmin only) |
| `app/clinicians/page.tsx` | Patient board with lifecycle states |
| `app/patients/[id]/page.tsx` | Patient detail with risk factors + comms history |
| `components/pulse/PatientBoard.tsx` | Lifecycle-sorted patient view |
| `components/pulse/SequenceCard.tsx` | Sequence definition + edit UI |
| `components/pulse/RiskScoreBadge.tsx` | Risk score display + breakdown panel |
| `components/pulse/LifecycleStateBadge.tsx` | State badge with transition history |
| `hooks/usePatients.ts` | Live patient state with risk score |
| `hooks/useSequences.ts` | Sequence definition subscription |
| `hooks/useCommsLog.ts` | Comms log subscription (demo-bleed bug fixed in v0.10) |

---

*This brief is the reference document for the Pulse module. Update it as attribution rules tighten, sequence taxonomy evolves, and review attribution closes the loop.*
