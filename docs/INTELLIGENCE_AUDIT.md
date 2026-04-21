# INTELLIGENCE_AUDIT.md

Phase 1 read-only audit of the Intelligence module sync architecture.

Files examined:

- `dashboard/src/app/intelligence/page.tsx`
- `dashboard/src/app/intelligence/layout.tsx`
- `dashboard/src/app/intelligence/error.tsx`
- `dashboard/src/hooks/useIntelligenceData.ts`
- `dashboard/src/hooks/useDemoIntelligence.ts`
- `dashboard/src/hooks/useInsightEvents.ts`
- `dashboard/src/hooks/useTodaysFocus.ts`
- `dashboard/src/hooks/useClinicianSummaryStats.ts`
- `dashboard/src/hooks/useWeeklyStats.ts`
- `dashboard/src/hooks/useValueLedger.ts`
- `dashboard/src/lib/intelligence/detect-insight-events.ts`
- `dashboard/src/lib/intelligence/detect-value-events.ts`
- `dashboard/src/lib/intelligence/rank-events.ts`
- `dashboard/src/lib/intelligence/enrich-narratives.ts`
- `dashboard/src/lib/intelligence/notify-owner.ts`
- `dashboard/src/lib/intelligence/send-clinician-digests.ts`
- `dashboard/src/lib/intelligence/coaching-prompts.ts`
- `dashboard/src/lib/intelligence/compute-value-summary.ts`
- `dashboard/src/lib/intelligence/derive-revenue-by-condition.ts`
- `dashboard/src/lib/intelligence/emails/state-of-clinic.ts`
- `dashboard/src/lib/metrics/compute-weekly.ts`
- `dashboard/src/lib/metrics/compute-deep-metrics.ts`
- `dashboard/src/components/ui/TrendChart.tsx`
- `dashboard/src/components/ui/CliniciansTable.tsx`
- `dashboard/src/components/WhatsNew.tsx`
- `dashboard/src/lib/clinical-benchmarks.ts`
- `dashboard/src/lib/pulse/insight-event-consumer.ts`
- `dashboard/src/types/insight-events.ts`
- `dashboard/src/app/dashboard/page.tsx`
- `dashboard/src/lib/metrics/__tests__/compute-weekly.test.ts`

Files not found / missing:

- `dashboard/src/components/ui/PatientRow.tsx` - not found at specified path
- `dashboard/src/data/helpContent.ts` - not found at specified path
- `dashboard/src/lib/intelligence/emails/clinician-digest.ts` - not read (email template only, not data-layer)
- `dashboard/src/lib/intelligence/emails/urgent-alert.ts` - not read (email template only, not data-layer)
- `dashboard/src/lib/intelligence/emails/welcome.ts` - not read (email template only, not data-layer)
- `dashboard/src/lib/intelligence/emails/invite.ts` - not read (email template only, not data-layer)
- `dashboard/src/lib/intelligence/emails/layout.ts` - not read (email template only, not data-layer)

---

## 1. KPI Data Origins Per Dashboard Section

### Summary KPI Cards (top of page.tsx, lines 779-820)

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| Weekly Revenue | `metrics_weekly/{weekStart_all}.revenuePerSessionPence * appointmentsTotal` | Computed on render from `useWeeklyStats` result | N/A (derived) |
| Rev per Session | `metrics_weekly/{weekStart_clinicianId}.revenuePerSessionPence` | `onSnapshot` via `subscribeWeeklyStats` | Yes (`useWeeklyStats` line 44) |
| NPS Score | Derived from `reviews` collection via `deriveNps()` in `useIntelligenceData` | `onSnapshot` via `subscribeReviews` | Yes (`useIntelligenceData` line 576) |
| Google Reviews | Derived from `reviews` collection via `deriveReviewVelocity()` | `onSnapshot` via `subscribeReviews` | Yes (`useIntelligenceData` line 576) |
| Total Referrals | Computed on render from `patients` collection via `deriveReferrals()` | `onSnapshot` via `subscribePatients` | Yes (`useIntelligenceData` line 576) |

### Insights Tab (`InsightFeed` component)

Driven by `useInsightEvents.ts`.

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| Insight events list | `clinics/{clinicId}/insight_events` | `onSnapshot` via `subscribeInsightEvents` (line 126) | Yes (line 139: `return unsub`) |
| readAt, dismissedAt | `clinics/{clinicId}/insight_events/{eventId}` | `updateDoc` one-shot write | N/A (mutation) |

### Revenue Tab

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| Revenue by clinician | Derived from `metrics_weekly` per-clinician via `deriveRevenueByClinician()` | `onSnapshot` via `subscribeWeeklyStatsBatch` (line 605) | Yes (`useIntelligenceData` line 576) |
| Revenue by condition | Derived from `appointments` (last 90 days) via `deriveRevenueByCondition()` | `onSnapshot` via `subscribeAppointments` (line 570) | Yes (`useIntelligenceData` line 576) |

### DNA Analysis Tab

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| DNA by day of week | Derived from `metrics_weekly.dnaByDayOfWeek` via `deriveDnaByDay()` | `onSnapshot` via `subscribeWeeklyStats` / `subscribeWeeklyStatsBatch` | Yes |
| DNA by time slot | Derived from `metrics_weekly.dnaByTimeSlot` via `deriveDnaBySlot()` | `onSnapshot` via `subscribeWeeklyStats` / `subscribeWeeklyStatsBatch` | Yes |

### Referrals Tab

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| Referral sources | Derived on render from `patients.referralSource` via `deriveReferrals()` | `onSnapshot` via `subscribePatients` | Yes |
| Avg course length, revenue per source | Computed from `patients.sessionCount`, `avgRevPerSession` | Computed on render | N/A |

### Outcomes Tab

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| Outcome trend lines | Derived from `outcome_scores` via `deriveOutcomeTrends()` | `onSnapshot` via `subscribeOutcomeScoresAll` (line 558) | Yes |
| Outcome score entry form | Writes to `clinics/{clinicId}/outcome_scores` via `recordOutcomeScores()` | One-shot write | N/A |

### Reputation Tab

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| NPS score / trend | Derived from `reviews` via `deriveNps()` | `onSnapshot` via `subscribeReviews` | Yes |
| Review velocity | Derived from `reviews` via `deriveReviewVelocity()` | `onSnapshot` via `subscribeReviews` | Yes |

### Value Tab

Driven by `useValueLedger.ts`.

| Field | Firestore path | Fetch type | Has cleanup? |
|---|---|---|---|
| Value events / attribution feed | `clinics/{clinicId}/value_events` (last 100) | `onSnapshot` via `subscribeValueEvents` (line 77) | Yes (line 82) |
| Monthly value summary (ROI card) | `clinics/{clinicId}/value_summaries/{YYYY-MM}` | `onSnapshot` via `subscribeValueSummary` (line 87) | Yes (line 99) |
| Deep metrics (cost of empty chair, retention curve, etc.) | `clinics/{clinicId}/deep_metrics/{weekStart}_{clinicianId}` | `onSnapshot` via `subscribeDeepMetrics` (line 103) | Yes (line 111) |

---

## 2. Threshold Event Emission

### Detection mechanism

Threshold-crossing events are detected by the server-side function `detectInsightEvents()` in `dashboard/src/lib/intelligence/detect-insight-events.ts`. This function:

- Uses **one-shot `getDoc`/`get()` calls** (firebase-admin SDK) — not `onSnapshot`. This is correct for a server-side pipeline function.
- Reads from: `clinics/{clinicId}/settings/insight_config`, `clinics/{clinicId}/metrics_weekly`, `clinics/{clinicId}/clinicians`, `clinics/{clinicId}/patients`, `clinics/{clinicId}/appointments`, `clinics/{clinicId}/reviews`, `clinics/{clinicId}/insight_events`.

### What triggers detection

Detection is triggered **on-demand via an API route** (`/api/pipeline/run` — referenced at `page.tsx` line 668). There is no Cloud Function or scheduled server-side trigger visible in this codebase; the pipeline is invoked manually by the Refresh Data button or via external cron (the n8n automation layer per CLAUDE.md). This means detection is **periodic/on-demand, not real-time**.

### Where events are written

`detectInsightEvents()` writes to `clinics/{clinicId}/insight_events` (line 391 in detect-insight-events.ts). Each written document has the shape of `InsightEvent` (defined in `dashboard/src/types/insight-events.ts`) plus the fields `readAt: null`, `dismissedAt: null`, `pulseActionId: null`, `resolvedAt: null`, `resolution: null`, `lastNotifiedAt`.

`detectValueEvents()` writes to `clinics/{clinicId}/value_events` (line 110 in detect-value-events.ts), and `computeValueSummary()` writes to `clinics/{clinicId}/value_summaries/{YYYY-MM}` (line 101 in compute-value-summary.ts), and `computeDeepMetricsForClinic()` writes to `clinics/{clinicId}/deep_metrics/{weekStart}_{clinicianId}` (line 72 in compute-deep-metrics.ts).

### Deduplication

Events are deduplicated by `type + clinicianId + patientId` within a 7-day window (detect-insight-events.ts lines 394-408). A re-alert is allowed if `revenueImpact` worsened (line 401-403).

---

## 3. `onSnapshot` vs One-shot Fetches

| Hook / source | Fetch type | Has cleanup? | Stale risk? |
|---|---|---|---|
| `useWeeklyStats` | `onSnapshot` (via `subscribeWeeklyStats`) | Yes (line 44) | No |
| `useIntelligenceData` — `allStats` | `onSnapshot` (via `subscribeWeeklyStats`) | Yes (line 576) | No |
| `useIntelligenceData` — `patients` | `onSnapshot` (via `subscribePatients`) | Yes (line 576) | No |
| `useIntelligenceData` — `reviews` | `onSnapshot` (via `subscribeReviews`) | Yes (line 576) | No |
| `useIntelligenceData` — `outcomeScores` | `onSnapshot` (via `subscribeOutcomeScoresAll`) | Yes (line 576) | No |
| `useIntelligenceData` — `appointments` | `onSnapshot` (via `subscribeAppointments`) | Yes (line 576) | No |
| `useIntelligenceData` — `perClinicianStatsMap` | `onSnapshot` (via `subscribeWeeklyStatsBatch`) | Yes (line 612) | No |
| `useInsightEvents` | `onSnapshot` (via `subscribeInsightEvents`) | Yes (line 139) | No |
| `useValueLedger` — events | `onSnapshot` (via `subscribeValueEvents`) | Yes (line 82) | No |
| `useValueLedger` — summary | `onSnapshot` (via `subscribeValueSummary`) | Yes (line 99) | No |
| `useValueLedger` — deep metrics | `onSnapshot` (via `subscribeDeepMetrics`) | Yes (line 111) | No |
| `useClinicianSummaryStats` | `onSnapshot` (N `onSnapshot` calls, one per active clinician) | Yes (line 112) | No, but architecture issue (see Section 8, issue 3) |
| `WhatsNew` — `whatsNewSeenVersion` check | **`getDoc` one-shot** (`WhatsNew.tsx` line 47) | N/A (not a subscription) | Yes — if another device updates `whatsNewSeenVersion`, the current session will not see it until remount |
| `detect-insight-events.ts` (server) | All one-shot `get()` (firebase-admin) | N/A — server-side pipeline | By design |
| `detect-value-events.ts` (server) | All one-shot `get()` (firebase-admin) | N/A — server-side pipeline | By design |
| `compute-value-summary.ts` (server) | One-shot `get()` (firebase-admin) | N/A — server-side pipeline | By design |
| `compute-deep-metrics.ts` (server) | One-shot `get()` (firebase-admin) | N/A — server-side pipeline | By design |
| `send-clinician-digests.ts` (server) | One-shot `get()` queries (firebase-admin) | N/A — server-side | By design |

**Summary:** All client-facing Intelligence data paths use `onSnapshot` with proper cleanup. The WhatsNew `getDoc` is a minor peripheral case (not a KPI data path). The `useClinicianSummaryStats` hook spawns N separate `onSnapshot` listeners (one per active clinician) rather than a single batched listener, which is an architectural inefficiency not a stale-data risk.

---

## 4. Does Any Sync/Compute Write `syncState` Back to Firestore?

| Compute action | Writes to Firestore | What it writes |
|---|---|---|
| `computeWeeklyMetricsForClinic()` | Yes — `clinics/{clinicId}/metrics_weekly/{weekStart}_{clinicianId}` | Full `WeeklyStats` object including `computedAt` timestamp (line 238 in compute-weekly.ts) |
| `computeDeepMetricsForClinic()` | Yes — `clinics/{clinicId}/deep_metrics/{weekStart}_{clinicianId}` | Full `DeepMetrics` object including `computedAt` (line 208 in compute-deep-metrics.ts) |
| `computeValueSummary()` | Yes — `clinics/{clinicId}/value_summaries/{YYYY-MM}` | Full `ValueSummary` including `computedAt` (line 98 in compute-value-summary.ts) |
| `detectInsightEvents()` | Yes — `clinics/{clinicId}/insight_events/{auto-id}` | New `InsightEvent` documents (no `syncState` field) |
| `detectValueEvents()` | Yes — `clinics/{clinicId}/value_events/{auto-id}` | New `ValueEvent` documents (no `syncState` field) |
| `enrichEventsWithNarratives()` | Yes — updates `clinics/{clinicId}/insight_events/{id}` | Adds `ownerNarrative`, `clinicianNarrative`, `narrativeGeneratedAt` |
| `sendUrgentAlerts()` | Yes — updates `clinics/{clinicId}/insight_events/{id}` | Updates `lastNotifiedAt` |
| Pipeline execution itself | **No** | No `syncState` document is written to record pipeline start/end, success/failure, or last run time |

**Key finding:** The `computedAt` field on `WeeklyStats` and `DeepMetrics` documents acts as a partial timestamp for freshness, and the Intelligence page reads it to power the data freshness bar (page.tsx lines 729-758). However there is **no `syncState` document** recording the pipeline's overall run status (whether it succeeded, which steps ran, what errors occurred). The pipeline has no audit trail for operators — if the pipeline silently fails mid-run (e.g., insight detection errors), there is no record of this in Firestore. This is the primary gap relative to the target architecture.

---

## 5. Hardcoded Defaults and Shadow State

| Location | Hardcoded value | Can shadow live data? |
|---|---|---|
| `dashboard/src/lib/constants.ts` line 2 | `SESSION_RATE_PENCE = 6500` (£65) | Yes. Used as fallback in `loadSessionRate()` (`detect-value-events.ts` line 718, `compute-deep-metrics.ts` line 486) when `clinics/{clinicId}.sessionPricePence` is absent. Revenue attribution and empty-chair cost calculations silently use £65 if the clinic has not set a session price. |
| `useIntelligenceData.ts` line 682 | `avgRevPerSession = latestAll?.revenuePerSessionPence ?? 0` — falls back to `0` | Moderate risk. If the latest "all" stat has no `revenuePerSessionPence`, referral revenue attribution is silently zeroed. |
| `compute-value-summary.ts` line 48 | `subscriptionCostPence = clinicData?.billing?.monthlyPricePence \|\| 29900` (default £299) | Yes. The ROI multiple shown on the Value tab uses £299 as subscription cost for any clinic without `billing.monthlyPricePence` set. |
| `detect-insight-events.ts` defaults via `DEFAULT_INSIGHT_CONFIG` | Thresholds imported from `@/types/insight-events` | Partial. Config is loaded from Firestore first (`clinics/{clinicId}/settings/insight_config`); defaults only apply if that document doesn't exist. This is correct behaviour but no indicator is shown when defaults are in use. |
| `deriveBenchmarks()` in `useIntelligenceData.ts` lines 459-464 | `peerMedian` and `peerTop25` values hardcoded: `peerMedian: 2.2`, `peerTop25: 3.5` for rebook rate; `peerMedian: 0.08`, `peerTop25: 0.04` for DNA; `peerMedian: 0.74`, `peerTop25: 0.90` for utilisation; `peerMedian: 58`, `peerTop25: 78` for NPS; `peerMedian: 7500`, `peerTop25: 9000` for Rev/Session | No live data shadowed — these are benchmark reference values by design. However they are hardcoded in the hook rather than referenced from `clinical-benchmarks.ts`, creating a second copy of benchmark data. |
| `getDemoBenchmarks()` in `useDemoIntelligence.ts` lines 314-322 | Different hardcoded peer median values (e.g., `peerMedian: 4.0` for rebook rate vs `2.2` in `deriveBenchmarks`) | The demo benchmarks and live benchmarks use inconsistent peer medians. Demo shows rebook median as 4.0, live shows 2.2. This is a data inconsistency visible to anyone comparing demo vs live. |
| `enrich-narratives.ts` line 35 | `revenuePerSession = (clinicData.settings?.insightConfig?.revenuePerSession as number) ?? 65` | Yes. The LLM coaching narrative generation hardcodes £65 as fallback if the clinic hasn't configured this. The narratives will reference an incorrect revenue figure. Note this reads from a different path (`settings.insightConfig.revenuePerSession`) than the canonical `sessionPricePence` on the clinic root document. |
| `useClinicianSummaryStats.ts` line 87 | Query uses `limit(1)` for most recent week only | Not a default shadow, but the `tryFlush()` pattern (lines 68-82) resolves after the first snapshot from all listeners. If any clinician's listener fires before data arrives, the row is omitted from the table. There is no subsequent re-render unless the listener fires again. |
| Demo data in `useDemoIntelligence.ts` | All demo data is hardcoded static values | Risk described in Section 6. |

---

## 6. Demo Mode and Live Data Separation

### Toggle mechanism

Demo mode is determined by checking `user?.uid === "demo"` (e.g., `useIntelligenceData.ts` line 493, `useInsightEvents.ts` line 106). This is checked inline in each hook.

### Which hooks return demo data

| Hook | Demo path |
|---|---|
| `useIntelligenceData` | Line 646: if `isDemo`, returns `DEMO_RESULT` (memoised, all demo functions). No Firestore subscriptions opened. |
| `useInsightEvents` | Lines 113-117: returns hardcoded `DEMO_INSIGHT_EVENTS` array. No subscriptions opened. |
| `useWeeklyStats` | Lines 24-29: returns `demoStats` from `useDemoWeeklyStats()`. No subscriptions opened. |
| `useClinicianSummaryStats` | Lines 40-44: returns `getDemoLatestWeekStats()`. No subscriptions opened. |
| `useValueLedger` | **No demo path at all.** The hook always opens Firestore subscriptions regardless of `user.uid`. If `clinicId` is null (which it will be for the demo user), `subscribeValueEvents`, `subscribeValueSummary`, and `subscribeDeepMetrics` call `callback([])` or `callback(null)` via the `noopUnsubscribe()` path and return empty data. This is safe but inconsistent — demo users see an empty Value tab rather than demo data. |

### Demo bleed risk

There is one identified risk of demo data appearing for real users:

In `useIntelligenceData.ts` lines 701-712, the hook falls back to demo data for specific tabs even for real (non-demo) users:
```
outcomesDemoFallback = outcomeTrends.length === 0
...
outcomeTrends: outcomesDemoFallback ? getDemoOutcomeTrends() : outcomeTrends,
```

A real clinic with no outcome scores entered will have their Outcomes tab populated with the hardcoded demo data (`getDemoOutcomeTrends()` returns weeks from 2026-01-12 to 2026-02-17 with NPRS and PSFS trends). The UI renders a demo data banner (`outcomesDemoFallback` flag is passed to the page), but the underlying chart data is demo data from `useDemoIntelligence.ts`. The same pattern applies for reputation data when `reviews.length === 0` (line 703).

This is intentional UX design (show a populated chart rather than empty state) but constitutes demo data appearing in a live clinic context.

---

## 7. Module Boundary Check

### Does Intelligence write to Pulse-owned Firestore paths?

**No direct writes.** Intelligence (`detect-insight-events.ts`) writes only to `clinics/{clinicId}/insight_events`. The cross-module boundary is handled by `dashboard/src/lib/pulse/insight-event-consumer.ts`, which reads Intelligence's `insight_events` output and writes to Pulse-owned paths:

- `clinics/{clinicId}/comms_log` (line visible in consumer)
- Updates `clinics/{clinicId}/insight_events/{id}.pulseActionId` (writes back to Intelligence's own collection)
- Reads `clinics/{clinicId}/sequence_definitions` (Pulse-owned)

The consumer is the boundary adapter — Intelligence never directly touches `comms_log`, `sequence_definitions`, or `campaigns`.

### Does Intelligence read from Pulse-owned paths?

**Indirectly, yes.** `detect-value-events.ts` (`detectIntelligenceEvents()` and `detectPulseEvents()`) reads `clinics/{clinicId}/comms_log` (line 239) to avoid double-counting Pulse attribution. It also reads `clinics/{clinicId}/comms_log` in `detectIntelligenceEvents()` (line 500) to check if a reactivated patient was Pulse-driven. This means the Intelligence value attribution engine has a read dependency on Pulse's comms log, but no write dependency.

### Where Intelligence emits events

| Firestore path | Written by | Document shape |
|---|---|---|
| `clinics/{clinicId}/insight_events/{auto-id}` | `detectInsightEvents()` | `InsightEvent` type (see `dashboard/src/types/insight-events.ts`): `{ id, type, clinicId, clinicianId?, clinicianName?, patientId?, patientName?, severity, title, description, revenueImpact?, suggestedAction, actionTarget, createdAt, readAt: null, dismissedAt: null, pulseActionId: null, resolvedAt: null, resolution: null, lastNotifiedAt }` |
| `clinics/{clinicId}/value_events/{auto-id}` | `detectValueEvents()` | `ValueEvent` type (from `dashboard/src/types/value-ledger.ts`) |
| `clinics/{clinicId}/value_summaries/{YYYY-MM}` | `computeValueSummary()` | `ValueSummary` type |
| `clinics/{clinicId}/deep_metrics/{weekStart}_{clinicianId}` | `computeDeepMetricsForClinic()` | `DeepMetrics` type |
| `clinics/{clinicId}/metrics_weekly/{weekStart}_{clinicianId}` | `computeWeeklyMetricsForClinic()` | `WeeklyStats` type including `computedAt` |

---

## 8. Summary of Key Issues for Phase 2

Issues are listed in priority order (highest impact first).

---

### Issue 1: No pipeline `syncState` document — silent failure is invisible

**Description:** The Intelligence pipeline (metrics computation, insight detection, value attribution) has no canonical `syncState` document in Firestore. There is no record of pipeline start time, completion, success/failure, which steps ran, or what errors occurred. The `computedAt` field on `WeeklyStats` provides a timestamp for *when metrics were last written* but does not capture whether detection and attribution ran, or whether they errored.

**Why it violates the target architecture:** The target architecture requires every computed artefact to write `syncState { lastComputedAt, status, lastError }` back to Firestore. This is entirely absent for the pipeline-level state.

**Files affected:**
- `dashboard/src/lib/metrics/compute-weekly.ts` (returns `{ written: number }` only)
- `dashboard/src/lib/intelligence/detect-insight-events.ts` (returns local `DetectionResult` only)
- `dashboard/src/lib/intelligence/detect-value-events.ts` (returns local `DetectionResult` only)
- `dashboard/src/lib/metrics/compute-deep-metrics.ts` (returns `{ written: number }` only)
- Whatever API route calls these (not audited — outside scope)

---

### Issue 2: Hardcoded `SESSION_RATE_PENCE = 6500` fallback silently corrupts revenue attribution

**Description:** `dashboard/src/lib/constants.ts` line 2 defines `SESSION_RATE_PENCE = 6500` (£65). This is used as a fallback in `loadSessionRate()` in both `detect-value-events.ts` (line 718) and `compute-deep-metrics.ts` (line 486) when `clinics/{clinicId}.sessionPricePence` is absent. The empty-chair cost calculation, LTV calculations, and value attribution events all silently use this fallback without surfacing a data-quality warning.

**Why it violates the target architecture:** No hardcoded defaults that shadow live data. The fallback value should be absent-or-error, not silently substitute a different number.

**Files affected:**
- `dashboard/src/lib/constants.ts`
- `dashboard/src/lib/intelligence/detect-value-events.ts` (lines 715-719)
- `dashboard/src/lib/metrics/compute-deep-metrics.ts` (lines 480-487)

---

### Issue 3: `useClinicianSummaryStats` opens N separate `onSnapshot` listeners (one per clinician)

**Description:** `useClinicianSummaryStats.ts` lines 85-111 iterates over every active clinician and opens an individual `onSnapshot` listener per clinician against `metrics_weekly`. For a clinic with 5 clinicians this creates 5 simultaneous listeners. `useIntelligenceData.ts` correctly avoids this pattern by using `subscribeWeeklyStatsBatch` (line 605). The `useClinicianSummaryStats` hook is used on `dashboard/page.tsx` (line 132), which means the main dashboard opens N listeners where N = active clinician count.

**Why it violates the target architecture:** N listeners should be one batched listener. The hook also has a race condition: `tryFlush()` (line 68) counts listener firings and resolves once all have fired at least once, but if a clinician has no data the row is silently omitted (line 73-76). Subsequent listener updates will re-render the rows correctly but the initial load can produce an incomplete table.

**Files affected:**
- `dashboard/src/hooks/useClinicianSummaryStats.ts` (lines 64-111)

---

### Issue 4: `revenuePerSession` in `enrich-narratives.ts` reads from a different Firestore path than the canonical session price

**Description:** `enrich-narratives.ts` line 35 reads `clinicData.settings?.insightConfig?.revenuePerSession` and falls back to the hardcoded `65` (not `SESSION_RATE_PENCE` from constants, and not the canonical `sessionPricePence` on the clinic root doc). The canonical session price used by the metrics pipeline is `clinics/{clinicId}.sessionPricePence`. The coaching narrative generator therefore may use a different revenue figure than the detection engine, producing LLM narratives that reference a different £ amount than what insight detection calculated.

**Why it violates the target architecture:** Two components reading the same logical value from different Firestore paths produces divergence. Firestore must be the single source of truth with one canonical field.

**Files affected:**
- `dashboard/src/lib/intelligence/enrich-narratives.ts` (line 35)

---

### Issue 5: Demo data bleeds into live clinic Outcomes and Reputation tabs

**Description:** `useIntelligenceData.ts` lines 701-712 explicitly returns `getDemoOutcomeTrends()` for real (non-demo) clinic users when no outcome scores have been recorded, and the reputation tab falls back to demo NPS/review data when `reviews.length === 0`. The demo data contains hardcoded dates (2026-01-12 through 2026-02-17) that will appear in a live clinic's Outcomes chart as if they were real data unless the user reads the small "demo data" banner closely.

**Why it violates the target architecture:** A real clinic should see empty state (with a prompt to record data) not demo data. Demo data in a live context risks being mistaken for real clinical data.

**Files affected:**
- `dashboard/src/hooks/useIntelligenceData.ts` (lines 701-712)
- `dashboard/src/hooks/useDemoIntelligence.ts` (`getDemoOutcomeTrends`)

---

### Issue 6: `useValueLedger` has no demo path — demo users see empty Value tab

**Description:** Unlike every other Intelligence hook, `useValueLedger.ts` contains no `isDemo` check. When the demo user (`uid === "demo"`) loads the Intelligence page, `clinicId` is null, so all three `useEffect` blocks call the `noopUnsubscribe()` path (via the `if (!db || !clinicId)` guard in each `subscribeX` function), resulting in empty arrays/null for events, summary, and deep metrics. The Value tab renders its empty-state message for the demo user rather than the illustrative demo data shown in all other tabs.

**Why it violates the target architecture:** Inconsistent demo experience. The demo user should see realistic data in every tab.

**Files affected:**
- `dashboard/src/hooks/useValueLedger.ts` (no `isDemo` guard anywhere in the file)

---

### Issue 7: Benchmark peer medians are duplicated with inconsistent values

**Description:** `deriveBenchmarks()` in `useIntelligenceData.ts` (lines 458-464) hardcodes peer medians (rebook `2.2`, DNA `0.08`, utilisation `0.74`, NPS `58`, Rev/Session `7500`) directly in the hook. These differ from the values in `getDemoBenchmarks()` in `useDemoIntelligence.ts` (rebook `4.0`, DNA `0.11`, NPS `37`), and differ again from the threshold documentation in `clinical-benchmarks.ts`. The canonical benchmark source `clinical-benchmarks.ts` exports `BENCHMARKS` with `ukBenchmarkRange` strings but no numeric peer-comparison values, so neither the hook nor the demo reference it.

**Why it violates the target architecture:** Benchmark values are a form of configuration data. They should live in one place (`clinical-benchmarks.ts` or a Firestore config document), not scattered across three files with inconsistent values.

**Files affected:**
- `dashboard/src/hooks/useIntelligenceData.ts` (lines 458-464)
- `dashboard/src/hooks/useDemoIntelligence.ts` (lines 314-322)
- `dashboard/src/lib/clinical-benchmarks.ts`

---

### Issue 8: `WhatsNew` uses one-shot `getDoc` for cross-device dismissal check

**Description:** `WhatsNew.tsx` line 47 uses `getDoc` (one-shot) to check if the current version has been seen. This is a peripheral case (not a KPI data path) but means that if the user dismisses the modal on device A while device B is open, device B's current session will still show the modal until it remounts. The fix is also partially present — localStorage is used as a fast-path cache (lines 35-39) and is written on dismiss (line 70). The Firestore path `users/{uid}.whatsNewSeenVersion` uses the admin-SDK `updateDoc` pattern correctly for the write.

**Why it violates the target architecture:** Minor — Firestore changes to the `whatsNewSeenVersion` field are invisible to the current session without a listener.

**Files affected:**
- `dashboard/src/components/WhatsNew.tsx` (lines 47-58)

---

### Issue 9: `enrich-narratives.ts` uses `console.warn` for production telemetry

**Description:** `enrich-narratives.ts` lines 77-80 and line 86 use `console.warn` to log enrichment failures and success counts. These are production pipeline execution paths, not development debugging. Errors surfaced only to server console are invisible to operators.

**Why it violates the target architecture:** Pipeline errors should be written to `syncState.lastError` in Firestore (per target architecture), not emitted to console.

**Files affected:**
- `dashboard/src/lib/intelligence/enrich-narratives.ts` (lines 77-80, 86-90)

---

*End of Phase 1 Intelligence Audit.*
