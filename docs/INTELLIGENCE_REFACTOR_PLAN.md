# INTELLIGENCE_REFACTOR_PLAN.md

SPARC Phases P (Pseudocode) and A (Architecture) for the Intelligence sync refactor.

Read in conjunction with `docs/INTELLIGENCE_AUDIT.md`.

Scope: introduce a new read-optimised projection layer (`kpis/*`, `events/*`, `computeState`)
that sits **on top of** the existing `metrics_weekly` collection. `metrics_weekly` remains
the canonical source for weekly numbers — nothing about its generation logic changes.

---

## Phase P — Pseudocode

### 1. `computeKPIs(db, clinicId, opts?)`

```
function computeKPIs(db, clinicId, opts?):
  runStartedAt = now()
  dataQualityIssues = []

  # Load latest "all" stat for the clinic — this is the source of all KPI numbers
  latestAllSnap = db.collection("clinics/{clinicId}/metrics_weekly")
                    .where("clinicianId", "==", "all")
                    .orderBy("weekStart", "desc")
                    .limit(8)                    # current + 7 prior weeks for trend
                    .get()

  if latestAllSnap.empty:
    dataQualityIssues.push({ code: "NO_METRICS", message: "metrics_weekly has no 'all' docs" })
    writeComputeState(db, clinicId, { status: "degraded", dataQualityIssues, ... })
    return { written: 0, events: 0 }

  current = latestAllSnap.docs[0].data()
  trend   = latestAllSnap.docs.slice(1, 8).map(d => d.data())   # for sparkline + delta

  # Load clinic doc for targets + session price
  clinicData    = db.doc("clinics/{clinicId}").get().data()
  targets       = clinicData.targets ?? {}
  sessionPricePence = clinicData.sessionPricePence ?? null

  # ── Load supplementary collections for non-metrics_weekly KPIs ──
  reviewsSnap   = db.collection("clinics/{clinicId}/reviews")
                    .orderBy("date", "desc")
                    .limit(200)
                    .get()
  # google-review-conversion comes from reviews + metrics_weekly.appointmentsTotal

  # ── Build KPI definitions ──
  kpiDefs = [
    { id: "follow-up-rate",         value: current.followUpRate,
      target: targets.followUpRate ?? 4.0,     higherIsBetter: true,
      ragThresholds: { ok: 4.0, warn: 3.0 } },
    { id: "hep-compliance",         value: current.hepComplianceRate ?? current.hepRate,
      target: targets.hepRate ?? 0.85,         higherIsBetter: true,
      ragThresholds: { ok: 0.85, warn: 0.65 } },
    { id: "utilisation",            value: current.utilisationRate,
      target: targets.utilisationRate ?? 0.75, higherIsBetter: true,
      ragThresholds: { ok: 0.75, warn: 0.65 } },
    { id: "dna-rate",               value: current.dnaRate,
      target: targets.dnaRate ?? 0.06,         higherIsBetter: false,
      ragThresholds: { ok: 0.06, warn: 0.10 } },
    { id: "revenue-per-session",    value: current.revenuePerSessionPence,
      target: targets.revenuePerSessionPence ?? 6800, higherIsBetter: true,
      ragThresholds: { ok: 6800, warn: 5500 } },
    { id: "nps",                    value: computeNpsFromRecentReviews(reviewsSnap.docs, 90),
      target: 50,                              higherIsBetter: true,
      ragThresholds: { ok: 70, warn: 40 } },
    { id: "google-review-conversion", value: computeReviewConversion(reviewsSnap.docs, trend, current),
      target: 0.05,                            higherIsBetter: true,
      ragThresholds: { ok: 0.05, warn: 0.02 } },
  ]

  # ── Project into /clinics/{clinicId}/kpis/{kpiId} ──
  writes = 0
  events = 0
  batch  = db.batch()

  for kpi in kpiDefs:
    if kpi.value == null or isNaN(kpi.value):
      dataQualityIssues.push({ code: "KPI_MISSING", kpiId: kpi.id })
      continue

    status = evaluateStatus(kpi)                # 'ok' | 'warn' | 'danger'
    trendSeries = trend.map(t => extractValue(t, kpi.id))

    doc = {
      kpiId:       kpi.id,
      value:       kpi.value,
      target:      kpi.target,
      status:      status,
      trend:       trendSeries,           # array of 7 prior values, newest-first
      window:      { type: "weekly", weekStart: current.weekStart },
      threshold:   kpi.ragThresholds,
      higherIsBetter: kpi.higherIsBetter,
      computedAt:  runStartedAt,
      sourceDocId: current.id             # metrics_weekly doc for traceability
    }
    batch.set(db.doc("clinics/{clinicId}/kpis/{kpi.id}"), doc, { merge: true })
    writes += 1

    # ── Threshold event emission ──
    if status == "danger":
      # Dedupe: don't re-emit if an identical open event already exists for the same
      # kpiId + weekStart. This prevents duplicate events on repeated pipeline runs
      # for the same week.
      existing = db.collection("clinics/{clinicId}/events")
                  .where("kpiId", "==", kpi.id)
                  .where("weekStart", "==", current.weekStart)
                  .where("consumedBy", "array-contains-any", [])  # any open event
                  .limit(1)
                  .get()
      if existing.empty:
        event = {
          type:        "KPI_THRESHOLD_CROSSED",
          kpiId:       kpi.id,
          severity:    "danger",
          value:       kpi.value,
          target:      kpi.target,
          weekStart:   current.weekStart,
          createdAt:   runStartedAt,
          consumedBy:  []       # downstream consumers (Pulse / digest) push into this
        }
        db.collection("clinics/{clinicId}/events").add(event)
        events += 1

  batch.commit()

  return { written: writes, events: events, dataQualityIssues }
```

### 2. Threshold evaluation

Per-KPI `evaluateStatus(kpi)`:

```
function evaluateStatus(kpi):
  v = kpi.value
  t = kpi.ragThresholds

  if kpi.higherIsBetter:
    if v >= t.ok   : return "ok"
    if v >= t.warn : return "warn"
    return "danger"
  else:
    if v <= t.ok   : return "ok"
    if v <= t.warn : return "warn"
    return "danger"
```

### 3. `writeComputeState(db, clinicId, update)`

```
function writeComputeState(db, clinicId, update):
  db.doc("clinics/{clinicId}/computeState").set({
    lastFullRecomputeAt: update.completedAt ?? existing,
    schedulerHealth:     update.status,        # 'ok' | 'degraded' | 'failed'
    lastError:           update.lastError ?? null,
    dataQualityIssues:   update.dataQualityIssues ?? [],
    lastComputedKpis:    update.lastComputedKpis ?? [],
    lastRunDurationMs:   update.durationMs,
    lastRunSource:       update.source         # 'pipeline' | 'manual' | 'cron'
  }, { merge: true })
```

Called:
- **Before** KPI compute inside `runPipeline` with `{ status: "degraded", ... }` as a placeholder in case we crash mid-run.
- **After** compute-KPIs completes with `{ status: "ok", completedAt: now() }`.
- **On caught exception** from any pipeline stage with `{ status: "failed", lastError: err.message }`.

### 4. Pipeline integration

```
# inside dashboard/src/lib/pipeline/run-pipeline.ts, AFTER Stage 7 (compute-metrics)

Stage 8: Compute KPI Projections
try:
  kpiResult = computeKPIs(db, clinicId)
  stages.push({ stage: "compute-kpis", ok: true, count: kpiResult.written, ... })

  # Data-quality flags from value/deep-metrics modules propagate here too
  writeComputeState(db, clinicId, {
    status:             allOk ? "ok" : "degraded",
    dataQualityIssues:  [...kpiResult.dataQualityIssues, ...sessionRateIssues, ...narrativeIssues],
    lastComputedKpis:   kpiResult.kpiIds,
    completedAt:        completedAt,
    durationMs:         Date.now() - metricsStart,
    source:             "pipeline"
  })
catch err:
  stages.push({ stage: "compute-kpis", ok: false, errors: [err.message] })
  writeComputeState(db, clinicId, {
    status:     "failed",
    lastError:  err.message,
    completedAt: new Date().toISOString()
  })
  # do NOT re-throw — we want the pipeline to finish and report partial success
```

---

## Phase A — Architecture

### Firestore schema

New collections under `clinics/{clinicId}/`:

#### `kpis/{kpiId}`

Document ID is the locked KPI slug: one of `follow-up-rate`, `hep-compliance`,
`utilisation`, `dna-rate`, `revenue-per-session`, `nps`, `google-review-conversion`.

```ts
{
  kpiId:          "follow-up-rate" | "hep-compliance" | ...,
  value:          number,                 // current observed value (unit depends on KPI)
  target:         number,                 // clinic's configured target
  status:         "ok" | "warn" | "danger",
  trend:          number[],               // last 7 weekly values, most recent first
  window:         { type: "weekly", weekStart: "YYYY-MM-DD" },
  threshold:      { ok: number, warn: number },  // numeric RAG boundaries
  higherIsBetter: boolean,
  computedAt:     string,                 // ISO — when projection was written
  sourceDocId:    string                  // metrics_weekly doc this was projected from
}
```

#### `events/{autoId}`

Event stream emitted on threshold crossings. Downstream consumers (Pulse, digest
email, in-app banner) read from this stream and push their identifier into
`consumedBy` to avoid double-processing.

```ts
{
  type:        "KPI_THRESHOLD_CROSSED",
  kpiId:       string,
  clinicianId?: string,                   // null for clinic-wide events
  severity:    "danger" | "warning" | "positive",
  value:       number,
  target:      number,
  weekStart:   string,
  createdAt:   string,                    // ISO
  consumedBy:  string[]                   // e.g. ["pulse-rebook-sequence", "email-digest-2026-W17"]
}
```

#### `computeState` (single document, no subcollection)

```ts
{
  lastFullRecomputeAt: string,            // ISO — last successful end-to-end pipeline
  schedulerHealth:     "ok" | "degraded" | "failed",
  lastError:           string | null,     // last crash message if any
  dataQualityIssues:   Array<{
    code:    "SESSION_RATE_MISSING" | "NO_METRICS" | "KPI_MISSING" | "NARRATIVE_SKIPPED",
    message: string,
    kpiId?:  string,
    context?: Record<string, unknown>
  }>,
  lastComputedKpis:    string[],          // kpiIds written on the most recent run
  lastRunDurationMs:   number,
  lastRunSource:       "pipeline" | "manual" | "cron"
}
```

### Security rule sketch (NOT modifying `firestore.rules` in this PR)

Same pattern as existing Intelligence collections — `clinicId` partitioning,
read access gated by the user's `users/{uid}.clinicId` matching, no client
writes to `kpis/*`, `events/*`, or `computeState`.

```
match /clinics/{clinicId}/kpis/{kpiId} {
  allow read:  if isSignedIn() && userBelongsToClinic(clinicId);
  allow write: if false;                   // server-only (admin SDK)
}

match /clinics/{clinicId}/events/{eventId} {
  allow read:   if isSignedIn() && userBelongsToClinic(clinicId);
  allow update: if isSignedIn() && userBelongsToClinic(clinicId)
                && request.resource.data.diff(resource.data).affectedKeys()
                   .hasOnly(["consumedBy"]);      # clients can only append to consumedBy
  allow create, delete: if false;          // server-only
}

match /clinics/{clinicId}/computeState {
  allow read:  if isSignedIn() && userBelongsToClinic(clinicId);
  allow write: if false;                   # server-only
}
```

Follow-up task: add these blocks to `firestore.rules` in a separate PR (out of scope here).

### Dashboard subscription

Client hook + subscription shape:

```ts
// dashboard/src/lib/queries.ts  (new export)
export function subscribeKPIs(
  clinicId: string | null,
  callback: (kpis: Record<string, KPIDoc>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db || !clinicId) { callback({}); return noop; }
  const q = collection(db, "clinics", clinicId, "kpis");
  return onSnapshot(q,
    (snap) => {
      const map: Record<string, KPIDoc> = {};
      for (const d of snap.docs) map[d.id] = { ...d.data() } as KPIDoc;
      callback(map);
    },
    onError
  );
}

// dashboard/src/hooks/useKpis.ts  (new file)
export function useKpis(): { kpis: Record<string, KPIDoc>; loading: boolean; error: string | null } { ... }
```

Consumption pattern on the Intelligence page:

```
<IntelligencePage>
  <PageHeader />
  <DataFreshnessBar />      # existing, driven by metrics_weekly.computedAt
  <KpiProjectionStrip />    # NEW — reads useKpis(), renders 7 tiles above tabs
  <ErrorBanner />
  <Tabs>…</Tabs>            # existing — NOT touched
```

Fallback behaviour: if `useKpis()` returns an empty map (first run, pipeline
hasn't run, or projection failed), the `KpiProjectionStrip` renders `null` and
the page behaves exactly as it does today. No existing chart/table data path is
rewired through `kpis/*` in this PR.

### Migration path

1. Deploy this PR → `kpis/*` is empty until the next pipeline run.
2. On first pipeline run after deploy, Stage 8 writes the seven KPI docs.
3. `KpiProjectionStrip` becomes visible at the top of the page.
4. All existing tabs continue reading from `metrics_weekly` via `useIntelligenceData`
   — unchanged.

### What this PR explicitly does NOT do

- Does not replace `metrics_weekly`.
- Does not rewire `useIntelligenceData`, `useWeeklyStats`, or any existing chart/table.
- Does not touch `firestore.rules`.
- Does not batch `useClinicianSummaryStats` (audit issue 3 — follow-up).
- Does not add a demo path to `useValueLedger` (audit issue 6 — follow-up).
- Does not consolidate benchmark values across `deriveBenchmarks` / `getDemoBenchmarks`
  / `clinical-benchmarks.ts` (audit issue 7 — follow-up).
- Does not convert `WhatsNew` to `onSnapshot` (audit issue 8 — follow-up).

---

*End of refactor plan.*
