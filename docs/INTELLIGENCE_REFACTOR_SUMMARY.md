# INTELLIGENCE_REFACTOR_SUMMARY.md

## Shipped

1. **KPI projection layer** — `computeKPIs()` reads from `metrics_weekly` + `reviews` and writes seven locked KPIs to `/clinics/{id}/kpis/{kpiId}` with `{ value, target, status, trend, window, threshold, higherIsBetter, computedAt, sourceDocId }`. `metrics_weekly` untouched.
2. **Threshold events** — `status === "danger"` emits to `/clinics/{id}/events/{autoId}` with `consumedBy: []`. Dedupe by `kpiId + weekStart`.
3. **`computeState` audit trail** — `/clinics/{id}/computeState/current` written on every pipeline run. Shape: `{ lastFullRecomputeAt, schedulerHealth, lastError, dataQualityIssues[], lastComputedKpis[], lastRunDurationMs, lastRunSource }`.
4. **Pipeline integration** — new Stage 8 in `run-pipeline.ts` after `compute-metrics`; catches throws and writes `status: "failed" + lastError` rather than silently failing.
5. **Dashboard subscription** — `subscribeKPIs`, `subscribeComputeState` in `queries.ts`; `useKpis` hook; `KpiProjectionStrip` renders 7 read-only tiles above existing tabs. Empty state = renders nothing (existing dashboard unchanged).
6. **Audit fix Issue 2** — `loadSessionRate()` returns `{ rate, source }`; `detect-value-events` + `compute-deep-metrics` skip computation + record `SESSION_RATE_MISSING` data-quality flag instead of silently substituting £65.
7. **Audit fix Issue 4** — `enrich-narratives` reads canonical `clinicData.sessionPricePence`, skips enrichment with `NARRATIVE_SKIPPED` flag when missing. Removed `?? 65`.
8. **Audit fix Issue 5** — `useIntelligenceData` no longer substitutes `getDemoOutcomeTrends()` for real clinics with empty outcome_scores. Returns empty array; flags `*DemoFallback` booleans preserved for empty-state rendering.
9. **Audit fix Issue 9** — `enrich-narratives` writes last error to `computeState.lastError` instead of `console.warn`.

## Deferred (follow-up PRs)

- Audit Issue 3: N-listener batching in `useClinicianSummaryStats` (architectural refactor).
- Audit Issue 6: `useValueLedger` demo-mode path (inconsistent demo experience).
- Audit Issue 7: benchmark dedup across `deriveBenchmarks` / `getDemoBenchmarks` / `clinical-benchmarks.ts`.
- Audit Issue 8: `WhatsNew` `getDoc` → `onSnapshot`.
- `firestore.rules` updates for `kpis/*`, `events/*`, `computeState` (rule sketches in `INTELLIGENCE_REFACTOR_PLAN.md`).

## Files changed

- NEW: `dashboard/src/types/kpi.ts`
- NEW: `dashboard/src/lib/intelligence/compute-kpis.ts`
- NEW: `dashboard/src/lib/intelligence/compute-state.ts`
- NEW: `dashboard/src/lib/intelligence/load-session-rate.ts`
- NEW: `dashboard/src/hooks/useKpis.ts`
- NEW: `dashboard/src/components/intelligence/KpiProjectionStrip.tsx`
- NEW: `docs/INTELLIGENCE_AUDIT.md`, `docs/INTELLIGENCE_REFACTOR_PLAN.md`, `docs/INTELLIGENCE_REFACTOR_SUMMARY.md`
- MOD: `dashboard/src/lib/pipeline/run-pipeline.ts` (Stage 8 + final computeState write)
- MOD: `dashboard/src/lib/queries.ts` (subscribeKPIs, subscribeComputeState)
- MOD: `dashboard/src/lib/intelligence/detect-value-events.ts` (loadSessionRate → skip path)
- MOD: `dashboard/src/lib/intelligence/enrich-narratives.ts` (canonical session price + computeState writes)
- MOD: `dashboard/src/lib/metrics/compute-deep-metrics.ts` (loadSessionRate → skip path)
- MOD: `dashboard/src/hooks/useIntelligenceData.ts` (remove demo fallback for real users)
- MOD: `dashboard/src/app/intelligence/page.tsx` (mount KpiProjectionStrip)
- MOD: `dashboard/src/lib/constants.ts` (docblock clarifying SESSION_RATE_PENCE is client-only)

## Test evidence

- `npm run lint` on modified tree: **0 errors**, 109 pre-existing warnings. None of the new files (`compute-kpis`, `compute-state`, `load-session-rate`, `KpiProjectionStrip`, `useKpis`, `kpi.ts`) triggered any warnings.
- `npm run build` **failed** on `src/app/api/admin/provision-clinic/route.ts:151` — `treatmentCompletionTarget` does not exist in `ClinicTargets`. This file was NOT modified in this session and the error is pre-existing. Lint was clean so per coordinator instruction we skip further build action.
