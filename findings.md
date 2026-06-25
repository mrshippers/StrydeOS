# Findings — Data Lineage Trace (Logic Harness)

> Read this BEFORE any code change. Every dashboard/module number traced to source.
> Status: `HARDCODED` literal | `COMPUTED` derived | `BROKEN` computed-but-wrong | `STALE` reads dead/old data | `CACHED` precomputed, only refreshes on cron | `DEMO` gated to `uid==="demo"`.

---

## HEADLINE (read this first)

**The numbers are NOT hardcoded.** Almost every wrong number on screen is *computed* — the problem is in the **formulas**, the **staleness of the underlying data**, and the **caching model**, not literal fake values. Three root causes explain everything you flagged:

1. **Broken formulas** that don't match your own canonical KPI definitions in CLAUDE.md.
   - **Follow-up rate** is coded as `total sessions ÷ unique patients` (sessions-per-patient). CLAUDE.md says it must be **follow-ups ÷ initial assessments**. The code already computes `followUps` and `initialAssessments` then *ignores them*. This is why it reads "full/1.0/100%" for everyone (every patient seen has ≥1 session → ratio ≥1).
   - **Utilisation** is coded as `booked ÷ (clinicians × 40 slots/week)` — a flat hardcoded weekly capacity of **40**. CLAUDE.md says **booked ÷ available slots** (from the actual diary). Your one-day diary (9 booked / 10 available = 90%) computes as 9/40 ≈ 22% under the current code. That is why utilisation is wrong and disagrees across surfaces.

2. **Stale data with no live-source gate.** "259 patients at risk", "22 active insights", "£880k at risk" are all *computed from live Firestore*, but the patient cohort includes **old Spires-import patients who have no recent appointments**, so they never recompute out of `AT_RISK`. There is an `integration_health` collection that knows what is actually connected, but **nothing consults it before rendering** — so disconnected/stale sources still produce cards and numbers.

3. **Cached + cron-driven (this is the "sync is dead" feeling).** All four modules DO share one source (`metrics_weekly`) and DO use live Firestore listeners, so cross-module sync *exists*. But `metrics_weekly` is only (re)computed by the **daily 06:00 cron** (`/api/pipeline/run`). A change you make today does not reflect anywhere until the pipeline reruns. There is no on-demand recompute wired to the UI.

**Demo values** (£14,685 revenue, util 0.88/0.76, 14 appts, 3 alerts, 5 insights) are real hardcoded literals but are gated to `user.uid === "demo"` only — they are not what your live clinic shows.

---

## Canonical KPI definitions (AUTHORITATIVE — from CLAUDE.md "KPI Metrics — Confirmed from Spires")
1. **Follow-up rate** = follow-ups booked ÷ initial assessments (weekly + rolling 90-day). _(Andrew ~2.4)_
2. **HEP compliance** = patients given a programme ÷ patients seen.
3. **Utilisation** = booked slots ÷ available slots.
4. **DNA rate** = did-not-attend ÷ total booked. _(Currently 0 for your data — correct, leave it.)_
5. **Revenue per session** = total revenue ÷ sessions delivered.
6. **NPS** = net promoter score.

These resolve the "unclear in code" question for follow-up rate and utilisation. **Patients-at-risk is NOT defined in CLAUDE.md — flagged for you below.**

---

## Worked examples (your flagged wrong numbers) — RESOLVED

| Shown | Real source | Status | Verdict |
|-------|-------------|--------|---------|
| **£7,050 revenue** | `useOwnerSummary.ts:115-120` — `sum(appointments where completed/scheduled → revenueAmountPence ?? sessionPricePence)` | COMPUTED (live) | Real live figure for the selected period. Demo would show £14,685. Not fake — but period-scoped; confirm the period selector matches what you expect. |
| **259 patients at risk** | `useOwnerSummary.ts:126-156` count + `compute-risk-score.ts:175` (`riskScore≥60 && !discharged`). Patient set: `clinics/clinic-spires/patients` | STALE | Old-import patients with no recent appointments never recompute out of AT_RISK. No live-source filter exists. **This is the Spires bleed.** |
| **22 active insights** | `InsightFeed.tsx:104` = `activeEvents.length` (insight_events not dismissed, filtered to active seats) | COMPUTED (downstream of stale data) | Inflated by the same stale patient cohort feeding the detector. Fix the cohort → this drops. |
| **£880k at risk** | `InsightFeed.tsx:54-62` = `Σ revenueImpact where severity∈{critical,warning}`; per-event £ from `detect-insight-events.ts:328-335` (`Σ max(0, maxProgrammeLength−sessionCount) × revenuePerSession`) | COMPUTED (downstream of stale data) | Same root cause. Stale mid-programme "dropouts" inflate the leak. |
| **Follow-up 100% for everyone** | `compute-weekly.ts:154` `followUpRate = total / uniquePatients` | **BROKEN** | Wrong formula. Should be `followUps / initialAssessments` per CLAUDE.md. Ignores the `followUps`/`initialAssessments` it already computes (lines 142-147). |
| **Utilisation ≠ clinical-performance** | `compute-weekly.ts:261-270` flat 40-slot capacity; dashboard & clinicians both read `metrics_weekly.utilisationRate` (same source) | **BROKEN** | Both surfaces read the SAME value, so any mismatch = different week/aggregation (`clinicianId="all"` rollup vs per-clinician latest week) on top of the wrong capacity. Real fix: available slots from the diary, not 40. |

---

## Module: Dashboard (Owner Summary — `src/app/dashboard/page.tsx` + `useOwnerSummary.ts`)
| Metric | Source (file:line) | Status |
|--------|--------------------|--------|
| Revenue (period) | `useOwnerSummary.ts:115-120` sum of appointments | COMPUTED; DEMO literal `1468500` at :34 |
| Today total / DNAs | `useOwnerSummary.ts:122-124` filtered appointments | COMPUTED (minor period inconsistency: DNA count can span period while total is today-only) |
| Retention alert count | `useOwnerSummary.ts:126-156` AT_RISK/LAPSED & no nextSession | COMPUTED but STALE cohort |
| Utilisation tiles | `useClinicianSummaryStats.ts` → `metrics_weekly.utilisationRate` | BROKEN (flat-40 capacity); DEMO `0.88/0.76` at :44-45 |
| Pulse impact (7d £) | `useEventsActionedByPulse.ts` → `events` where consumedBy='pulse' | COMPUTED |
| Insight feed / active count / £ at risk | `useInsightEvents.ts` + `InsightFeed.tsx:54-104` | COMPUTED, downstream of stale cohort |
| 12-week trend (follow-up/HEP/DNA) | `useWeeklyTrend.ts` → `metrics_weekly` where clinicianId='all' | CACHED; follow-up value BROKEN per formula |

## Module: Intelligence (`src/app/intelligence/page.tsx`, `src/components/intelligence/*`)
| Metric | Source (file:line) | Status |
|--------|--------------------|--------|
| **KPI Projection tab** | `KpiProjectionStrip.tsx:95-96` returns `null` when no `kpis/*` docs exist | **EMPTY BY DESIGN** — depends on the `clinics/{id}/kpis/*` projection written by `compute-kpis.ts` via the daily cron. If the projection was never populated, the tab renders nothing. The "Clinician Performance" table works because it reads `metrics_weekly` directly, not `kpis/*`. |
| Clinician Performance table | `page.tsx:912-1071` ← `useIntelligenceData()` → per-clinician `metrics_weekly` | COMPUTED; follow-up & util BROKEN per formula |
| Active insights / £ at risk | `InsightFeed.tsx` (same as dashboard) | COMPUTED, stale-cohort downstream |
| 8 KPIs (when populated) | `compute-kpis.ts` ← `metrics_weekly` (clinicianId='all') + `reviews` | CACHED |

## Module: Pulse Impact + Insights (`src/components/pulse/*`, `src/app/continuity/*`)
| Metric | Source (file:line) | Status |
|--------|--------------------|--------|
| Pulse impact hero (£ recovered) | `EventsActionedByPulseTile.tsx` ← `sum-pulse-revenue.ts:32-67` | COMPUTED |
| 4 comms cards (Sent/Open/Click/Rebook) | `continuity/page.tsx:183-206` ← `useCommsLog()` | COMPUTED; **gated on `commsStats.totalSent>0`** already (so they hide before first send — but NOT gated on source-connection state) |
| Follow-up rate listing | `compute-weekly.ts:154` | **BROKEN** (same root formula) |
| Patients at risk board | `continuity/page.tsx` ← lifecycleState filter | STALE cohort |
| 6 "sources to connect" | `EnrichmentDrawer.tsx` ← `useConnections.ts` (shows missing integrations) | Renders as a bottom drawer / horizontal scroll; candidate for compact attached boxes |
| Animation ("scooting") | `motion/react` + single easing token `lib/tokens/motion.ts:7` = `cubic-bezier(0.16,1,0.3,1)` + `useMorphValue` | One easing constant drives all of it — swap point is centralised |

## Module: Clinicians (`src/app/clinicians/page.tsx`, `CliniciansTable.tsx`)
| Metric | Source (file:line) | Status |
|--------|--------------------|--------|
| Clinician names | Real: `sync-clinicians.ts:42-66` (`pms.name` → `clinicians/{id}.name`); display `page.tsx:89`, `CliniciansTable.tsx:276` | Live names from PMS. "Joe/Max" literals only exist in `ava/spires-seed-data.ts` and `useDemoData.ts` (demo). **Seeing "Joe/Max" with no full names ⇒ either demo mode is on, or the clinic's `clinicians` docs have partial/seed `name` fields. Needs live-data check (P5).** |
| Utilisation / follow-up / HEP / DNA / rev-per-session | All ← `metrics_weekly` via `useClinicianSummaryStats.ts:86-91` | Same source as dashboard; follow-up & util BROKEN per formula |

---

## Cross-module sync — VERDICT: it exists, but it's cached
- **Shared source:** all modules read `clinics/{id}/metrics_weekly` via Firestore `onSnapshot` listeners. (Clinicians: `useClinicianSummaryStats.ts:86-107`; Intelligence: `compute-kpis`/`useWeeklyStats`; Dashboard: `queries.ts:38-68`.)
- **Only the pipeline writes `metrics_weekly`** (`compute-weekly.ts:449`, via `/api/pipeline/run`). No module writes its own metrics → no write conflicts, but also no instant propagation.
- **Why it feels dead:** a change only appears after the **daily 06:00 cron** recomputes `metrics_weekly`. There is no UI-triggered recompute. To "prove interdependency" we likely need an on-demand recompute path (or to trigger `/api/pipeline/run` / `/api/metrics/compute`) so a change visibly flows to all three modules.

## Source-connection gating — VERDICT: exists but unused
- Truth source: `clinics/{id}/integration_health` (`api/admin/integration-health/route.ts:47-56` computes healthy/degraded/down). Written per pipeline stage by `health-logger.ts`.
- **NOT consulted before rendering.** No surface gates cards on connection state → disconnected sources still render. This is the lever for "disconnected sources render no cards".
- `dataMode: "sample" | "live"` flag exists on the clinic doc (`types/clinic.ts:167-174`) + `SampleDataBanner.tsx`. A `scripts/purge-spires-seed-data.ts` exists to flip to live and delete seed.

---

## Formulas found in code (vs canonical) — FLAG TABLE
| Metric | Code (file:line) | Canonical (CLAUDE.md) | Action |
|--------|------------------|------------------------|--------|
| Follow-up rate | `compute-weekly.ts:154` `total/uniquePatients` | follow-ups ÷ initial assessments | **FIX to `followUps/initialAssessments`** (vars already computed at :142-147). Confirm 90-day window handling. |
| Utilisation | `compute-weekly.ts:261-270` `booked/(clinicians×40)` | booked ÷ available slots (diary) | **FIX to use real available slots.** Need: where do diary availability/slot counts live? (capacity per clinician per day from PMS). If not synced, this is a data-availability gap to flag. |
| Patients at risk | `compute-risk-score.ts:63-176` (composite riskScore≥60) | **NOT in CLAUDE.md** | **FLAGGED FOR USER** — confirm definition. Plus gate to live/connected source so stale import patients drop out. |
| DNA rate | `compute-weekly.ts:141` `dna/(completed+dna)` | did-not-attend ÷ total booked | Matches; 0 is correct for your data. Leave. |
| HEP compliance | `compute-weekly.ts:156` `withHep/total` | programme ÷ patients seen | Matches intent. |
| Revenue/session | `compute-weekly.ts:163` `revenueTotal/total` | total revenue ÷ sessions | Matches. |

---

## "Patients at risk" — INVESTIGATION (the 259) + proposed definitions

**Mechanism of the bleed (confirmed in code):**
- `compute-patients.ts:80` skips patients with no `pmsExternalId`; for imported patients that DO have one but have **no appointments in the live `appointments` collection**, `appointments = []` →
  - `lastSessionDate = undefined`, `sessionCount = 0`, no `nextSessionDate`.
  - Discharge logic (`compute-patients.ts:104`) is gated on `lastSessionDate`, so a never-seen patient is **never discharged**.
- `compute-risk-score.ts` then scores a zero-appointment patient ≈ `riskScore 55` (attendance defaults to 100, sentiment 50, static 70). 55 < 60 so NOT `AT_RISK`, but it falls through to **`LAPSED`** (`:177` — `daysSinceLast = Infinity > 14 && no future booking && !discharged`).
- The dashboard retention count (`useOwnerSummary.ts:126`) and the continuity board count **both `AT_RISK` and `LAPSED`** with `!nextSessionDate && !discharged`. So every stale never-seen import lands in the 259.
- **No gate exists** on (a) whether the patient was ever actually seen, (b) recency, or (c) whether the data came from a currently live/connected source.

**Common core all candidate definitions share (kills the bleed):** must have been SEEN (`sessionCount ≥ 1` / `lastSessionDate` present), within a recency window, no future booking, not discharged, AND from a live source (`clinic.dataMode === 'live'` + patient has live PMS appointment activity).

### REVISED MODEL (v2) — cadence-relative + episode-aware (after Jamal's clinical pushback)
Flat 14d is wrong: rebooking cadence is condition-dependent. Harness confirmed what data exists:
- **Planned-discharge signal EXISTS, unused:** appointmentType `"discharge"` is mapped from PMS (cliniko `classify-appointment-type.ts`, writeupp) but never consumed. Today `discharged` = only 30-day silence (can't tell finished-by-plan from ghosted).
- **Per-patient cadence is DERIVABLE now:** `compute-patients.ts` already builds each patient's sorted completed appts → median gap = their personal rebooking interval. Not yet computed.
- **No condition/diagnosis field** (except optional Heidi). Historical cadence is the honest proxy for "their ACTUAL condition".
- Per-patient course length: clinic default `treatmentLength` (6) OR per-patient insurance `pre_auths.sessionsAuthorised` (stronger).

**Expected interval (per patient):** median gap of completed sessions if ≥3 completed; else clinic median; else configurable default `targets.defaultRebookingDays` (21). Clamp [5,56] days.

**State machine for a SEEN patient (sessionCount≥1) with NO future booking, live source:**
1. `treatmentComplete` → DISCHARGED, NOT at risk. True if last appt type=`discharge`, OR (sessionCount ≥ effectiveCourseLength AND no followUp booked at last session). effectiveCourseLength = `pre_auths.sessionsAuthorised ?? treatmentLength`.
2. `daysSinceLast ≤ expectedInterval × overdueFactor(1.5)` → within their own cadence, NOT at risk (the "between normal 3-week FUs" case Jamal raised).
3. `expectedInterval×1.5 < daysSinceLast ≤ min(expectedInterval×churnFactor(3), 90d)` → **AT_RISK** (genuinely overdue vs their own rhythm, still actionable). riskScore kept as severity/sort within this bucket.
4. beyond that → LAPSED/CHURNED (past actionable window, separate bucket, not the headline "at risk").
- sessionCount===0 → NEW (never at risk) — this alone excludes the 259 zero-appointment imports.

**Live-source gate (kills the bleed):** count only when `clinic.dataMode==='live'` AND patient has `lastSessionDate` (real PMS activity) AND within outer window. Module cards also gated on `integration_health` (disconnected → no cards).

**Config knobs (clinic.targets, all optional w/ defaults):** `defaultRebookingDays=21`, `overdueFactor=1.5`, `churnFactor=3`, outer window `atRiskMaxDays=90`. Tunable without code.

### Candidate definitions (SUPERSEDED by v2 above — kept for history)
- **Option A — "Active treatment, drifting" (recommended):** seen ≥1 time, last seen ≤ 90 days ago, no future booking, not discharged, AND (`daysSinceLast > 14` OR `riskScore ≥ 60`), live source only. Excludes never-seen imports and truly-churned (>90d). Keeps the composite score as an escalation signal.
- **Option B — "Risk score, gated":** keep `riskScore ≥ 60` exactly as-is, just add hard gates (`sessionCount ≥ 1`, `lastSessionDate ≤ 90d`, live source). Smallest change; LAPSED no longer counted as "at risk".
- **Option C — "Simple operational rule":** ignore the composite score entirely. At-risk = seen ≥1, last seen 15–90 days ago, no future booking, not discharged, live source. Most transparent / easiest to explain to a clinic owner.

## OPEN QUESTIONS FOR USER (gating the fixes)
1. **Patients at risk** — what is YOUR definition? (Current code: composite risk score ≥60, not discharged, no future booking.) And confirm: gate strictly to live/connected source so old-import patients with no recent activity are excluded.
2. **"Live/connected" gate** — should I gate ALL module cards/numbers on `integration_health` status (render nothing when a source is down/never-connected), and treat the current Spires data as live or as sample (`dataMode`)? i.e. do you want me to run the seed purge / flip dataMode to live?
3. **Utilisation available-slots** — is per-clinician diary availability (slots/day) actually synced from the PMS anywhere, or is 40/week the only capacity signal we have? (If not synced, true utilisation needs a diary feed; interim = clinic-configurable capacity, not a flat 40.)
4. **Cross-module proof** — OK to add a UI-triggered recompute (call `/api/pipeline/run` or `/api/metrics/compute`) so a change visibly propagates to all three modules without waiting for the 06:00 cron?
