# Intelligence Module Brief

**StrydeOS — Internal Product Document**
**Author:** Jamal / Claude Code session
**Date:** 26 March 2026
**Status:** Built. Needs platform-wide integration pass.

---

## What Intelligence Actually Does Now

Intelligence is no longer a KPI dashboard. It's a **value attribution engine** that connects every module in StrydeOS to the clinic owner's bank account.

Three layers:

1. **Surface** — The 6 canonical KPIs (follow-up rate, HEP compliance, utilisation, DNA rate, NPS, course completion). Traffic lights. Weekly snapshots. This is what existed before.

2. **Deep** — Derived metrics that answer *why* the numbers are what they are and *what they cost*. Cost of Empty Chair, Patient Retention Curve, Net Growth, Rebooking Lag, Discharge Quality, Patient LTV, Revenue Per Delivered Hour. All computed from data already in Firestore. No new integrations.

3. **Attribution** — The ROI ledger. Every time Ava, Pulse, or Intelligence itself generates a measurable outcome, it's logged with a conservative pound value and an auditable chain. Monthly summary shows total value generated vs subscription cost. This is the moat.

---

## The Value Equation

An owner on Clinic Full Stack (£399/month) sees this on the Value tab:

```
StrydeOS generated £2,160 this month
5.4x your £399 subscription  |  +£1,761 net value
```

Broken down by module (illustrative scenario — every figure derives from inputs the owner can verify):

| Module | What it did | £ attributed |
|--------|------------|-------------|
| **Ava** | 340 calls handled · 12 after-hours bookings + 6 missed-call rescues | 18 × £65 session = **£1,170** booking revenue |
| **Pulse** | 4 dropout patients re-engaged · 4 reviews posted | (4 × £75 re-engagement) + (4 × £75 review value) = **£600** |
| **Intelligence** | Follow-up rate uplift +0.4 vs baseline | 6 extra rebookings × £65 session = **£390** |
| **Total** | | **£2,160** |

Inputs (any owner can sub their own): £65 = fallback session rate (Tier 1 — `lib/constants.ts`, overridden by clinic's actual `sessionPricePence`). £75 review value = industry-conservative Google review acquisition cost. Labour-saved from Ava reception is logged separately as an operational saving, not revenue, and not counted in this total. Every attribution has a confidence level (high/medium/low) and a source record. Nothing inflated.

---

## Attribution Rules — The Non-Negotiables

These rules exist to make the ROI number **defensible in a sales conversation**. An owner can't argue with them.

### Conservative by default
- Re-engagement = 1 confirmed session attributed, not remaining course
- Metric improvement = fires once per quarter, not every cycle
- Reviews = £75 fixed value (industry conservative for Google review acquisition)

### No double-counting
- Ava booking calls don't also generate labour-saved events
- Same comms entry produces ONE event type (dropout OR DNA recovery, never both)
- If Pulse nudged a patient back, Intelligence doesn't claim the reactivation

### Attribution windows
- Pulse: rebooking must happen within 3 days of nudge (configurable)
- Intelligence metric improvement: 4-week rolling vs 90-day baseline, quarterly cap
- Ghost reactivation: only attributed if no Pulse comms exists for that patient

### Confidence tiers
- **High** — Direct causal chain. Ava answered → booking created. Pulse nudged → patient rebooked within window. Auditable.
- **Medium** — Strong correlation. Review posted after prompt. Ghost reactivated after Intelligence flagged. Insight acted on.
- **Low** — Correlation. Metric improved since using Intelligence. Shown but flagged.

---

## Deep Metrics — What They Reveal

These are the metrics that make Intelligence *intelligent*. All derived from existing data.

### Cost of Empty Chair
`(DNAs + unfilled slots) x session rate, annualised`

Not "your DNA rate is 8%." Instead: "8% DNA rate = £340/week. £17,680/year walking out the door." Makes the number visceral.

### Patient Retention Curve
Session-by-session funnel: what % of patients make it to session 2, 3, 4, 5, 6?

Andrew's 2.4 follow-up rate is one number. The retention curve shows WHERE patients drop off. Session 1→2 losing 40%? That's an onboarding problem. Session 4→5 losing 30%? That's a discharge-planning problem. Different interventions for different drop-off points.

Each step has a £ value: patients dropped x remaining sessions x session rate = revenue left on the table.

### Net Growth
`New IAs - Discharges - Ghost patients`

If this goes negative, the clinic is shrinking. No one tracks this. It's the clinic's pulse.

### Rebooking Lag
Average days between consecutive sessions per patient. Patients with 14+ day gaps are dropout risks — before they've actually dropped off. Leading indicator.

### Discharge Quality
`Proper discharges / (proper + ghost patients)`

A proper discharge = completed course + documented. A ghost = 30+ days no activity, not discharged, mid-course. Ghost patients are the biggest revenue leak AND clinical risk in private practice.

### Patient Lifetime Value
Total revenue per patient journey, segmented by referral source and insurance vs self-pay.

The barometer says PMI clinics do 2x revenue. LTV by payer type proves or disproves this at the clinic level. Also answers: which referral sources produce the highest-value patients?

### Revenue Per Delivered Hour
`Total revenue / total booked hours`

Spires does 45-min follow-ups. Most clinics do 30-min. Revenue per session looks the same. Revenue per hour is 50% different. This is the honest efficiency metric.

---

## What This Means for Each Stakeholder

### Owner
- Sees ROI in pounds, not percentages
- Knows exactly what StrydeOS saved/made them this month
- Can justify the subscription cost to a business partner in 10 seconds
- Gets early warnings about shrinking (net growth), revenue leaks (ghost patients), and capacity waste (empty chair cost)

### Clinician
- Retention curve shows them where in the patient journey they're losing people — coaching target, not blame
- Rebooking lag is a leading indicator they can act on before patients ghost
- Discharge quality separates proper clinical discharge from patients fading away
- All framed as professional development, not surveillance

### Patient
- Pulse re-engages them when they're about to drop off (better outcomes)
- NPS detractor alerts mean problems get caught within 24 hours
- HEP compliance tracking means they're more likely to get a programme
- The system works for them without them knowing it exists

---

## Firestore Schema (New Collections)

```
clinics/{clinicId}/
  value_events/{auto-id}              — individual attribution events
  value_summaries/{YYYY-MM}           — monthly rollups with ROI
  deep_metrics/{weekStart}_{clinicianId}  — weekly deep metrics
  settings/ava_attribution            — configurable: reception hours, hourly rate
  settings/pulse_attribution          — configurable: attribution window, review value
```

All partitioned by clinicId. No new security rules needed — same pattern as existing subcollections.

---

## Computation Pipeline

```
Existing data (appointments, patients, comms_log, calls, reviews, insight_events)
    |
    v
POST /api/intelligence/value     — runs detect-value-events + compute-value-summary
POST /api/metrics/deep           — runs compute-deep-metrics
    |
    v
value_events + value_summaries + deep_metrics (Firestore)
    |
    v
useValueLedger hook (React) → Value tab in Intelligence dashboard
```

Same cadence as existing metric computation. Can run on the weekly cron or on-demand.

---

## What's Next — Platform-Wide Attribution Tightening

The value attribution engine is built. Now every module needs to actually feed it with real events. Current gaps:

### Ava
- [ ] Call log entries need `source: "ava"` tag to distinguish from manual entries
- [ ] After-hours detection needs clinic-specific reception hours (currently defaults to 9-17:30)
- [ ] Booking conversion tracking: call → appointment link needs to be reliable

### Pulse
- [ ] `attributedRevenuePence` on comms_log entries needs to be populated when rebooking is detected
- [ ] `attributedAppointmentId` needs to be set by the reengagement tracker
- [ ] Course completion nudge sequences need the `early_intervention` type tag
- [ ] Multi-step cadence attribution: if step 3 of 6 converts, attribute to the sequence not just step 3

### Intelligence
- [ ] Insight events need `resolvedAt` and `resolution` to be set when owner takes action
- [ ] Ghost patient detection in `detect-insight-events` needs to write the flag that `detect-value-events` reads
- [ ] Outcome velocity metric (avg improvement per session) — blocked on outcome measures going live

### Dashboard
- [ ] Value tab needs sparkline trends for deep metrics (data is there via `deepMetricsTrend`, UI not wired)
- [ ] Quarterly summary view (computation exists, no UI)
- [ ] Export / PDF for owner to share with business partner

### Data Quality
- [ ] `courseLength` on Patient records — currently set by PMS sync but often defaulting to 6. Needs validation.
- [ ] `revenueAmountPence` on Appointment — some PMS integrations don't populate this. Revenue per session falls back to £65 blended rate.
- [ ] Ghost patient threshold (30 days) may need to be condition-specific. Chronic pain patients have longer gaps.

---

## The Product Argument

Every SaaS tool shows you your data. StrydeOS shows you what it *saved you*.

The competition:
- **Generic dashboards** (spreadsheets, Power BI): show metrics, no attribution, no clinical context
- **PMS built-in reporting** (WriteUpp, Cliniko): basic stats, no cross-module intelligence
- **AI scribe tools** (Heidi): different category entirely — documentation, not performance

None of them can say: "This product generated 5x your subscription cost this month. Here's the audit trail."

That's the pitch. That's the moat. That's why an owner keeps paying £399/month when someone asks "what does this thing actually do for me?"

---

## Files Delivered (Branch: `claude/intelligent-kpi-metrics-Gsumk`)

| File | Purpose |
|------|---------|
| `types/value-ledger.ts` | Types for attribution events, summaries, deep metrics, configs |
| `lib/intelligence/detect-value-events.ts` | Attribution detection engine (Ava, Pulse, Intelligence) |
| `lib/intelligence/compute-value-summary.ts` | Monthly/quarterly summary computation |
| `lib/metrics/compute-deep-metrics.ts` | Deep metrics computation (retention curve, LTV, etc.) |
| `hooks/useValueLedger.ts` | React hook for Value tab data |
| `lib/queries.ts` | Firestore subscriptions for new collections |
| `app/api/intelligence/value/route.ts` | API endpoint for value detection |
| `app/api/metrics/deep/route.ts` | API endpoint for deep metrics |
| `app/intelligence/page.tsx` | Value tab UI (ROI card, module breakdown, attribution feed, deep metrics) |

---

*This brief is the reference document for the Intelligence module. Update it as attribution rules tighten and new modules come online.*
