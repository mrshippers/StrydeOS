# Dashboard Landing Page Redesign

## Context

The StrydeOS dashboard (`/dashboard`) is the first screen clinic owners and clinicians see after login. Currently it's visually cluttered on first load — onboarding banner, account setup widget, alert banner, appointment/churn pills, and two rows of metric cards all compete for attention simultaneously. The "HEP Rate" large card duplicates "HEP Compliance" in the secondary row. The header font (DM Serif Display) is too sharp. Notification elements stack without hierarchy.

This redesign reduces first-load noise, groups related metrics into compound cards, introduces a cross-module Live Activity Feed, and creates a cleaner visual hierarchy that sustains engagement across Intelligence, Pulse, and Ava.

---

## Layout: Top-to-Bottom

### 1. Onboarding Banner (KEEP — compressed)

**File:** `dashboard/src/app/dashboard/page.tsx` lines 162-176

- Reduce height: single-line flex row, 8px vertical padding (was 12-16px)
- Muted background: `bg-blue/3` instead of `bg-blue/5`, thinner border
- Same content: "Finish setting up your clinic" + "Continue →" CTA
- Only shows when `showOnboardingBanner === true`

### 2. Greeting Section (CHANGE — softer header)

**Files:** `dashboard/src/app/dashboard/page.tsx` lines 179-227, `lib/greeting.ts`

**Header font change:**
- Current: DM Serif Display, 32px, sharp serifs
- New: DM Serif Display stays (brand identity), but add `letter-spacing: -0.5px` and reduce weight visual by applying `text-navy/90` instead of full navy. The scroll animation (32px → 18px) remains.

**Subheader (greeting subtext):**
- Add `font-medium` (500 weight) to the italic subtext for subtle boldness
- Increase to `text-[13px]` from 12px
- This subtext now serves as the daily snapshot — no separate component needed
- Content driven by `getGreeting()` rules engine (KEEP all rules unchanged)

**Remove DailySnapshot component entirely:**
- Delete the `<DailySnapshot>` render at line 225
- The greeting subtext already outputs contextual data ("73 appointments — 62 follow-ups from 11 initial assessments") via the DEFAULT_CONTEXTUAL rule in greeting.ts
- DNA alert (>8%) is surfaced through Patient Flow card status dot, no pill needed

### 3. Week Navigation (KEEP — unchanged)

**File:** `dashboard/src/app/dashboard/page.tsx` lines 273-339

No changes. Week picker + clinician filter buttons stay exactly as-is.

### 4. Alert Banner (REMOVE)

**File:** `dashboard/src/app/dashboard/page.tsx` line 342, `components/ui/AlertFlag.tsx`

- Delete the `<AlertBanner>` render
- `computeAlerts()` logic in `lib/utils.ts` is KEPT (used elsewhere) — just not rendered as a banner
- Alert information is now embedded in each card's status dot (ok/warn/danger)

### 5. InsightBanner + InsightNudge (REMOVE — fold into feed)

**File:** `dashboard/src/app/dashboard/page.tsx` lines 229-235

- Delete `<InsightBanner>` and `<InsightNudge>` renders
- Intelligence insight events become items in the Live Activity Feed card (Row 1)
- The `useInsightEvents()` hook stays — its data feeds the activity feed

---

## Row 1: Three Hero Cards

**Layout:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

All three cards are equal width. Ambient glow effect stays (blue radial behind row).

### Card 1: Appointments (white, promoted from Row 2)

**Data sources:**
- Hero: `latest.appointmentsTotal` (large number)
- Trend: `computeTrend()` + `computeTrendPercent()` vs previous week
- Supporting: `latest.initialAssessments` (new patients) + `latest.followUps` (follow-ups) below a divider

**Structure:**
```
APPOINTMENTS                          [status dot]
73                              ↑ +4%
this week

─────────────────────────────────────
11 new          62 follow-ups
```

**Status:** "neutral" — appointments aren't evaluated against a threshold
**Action:** None (the numbers speak for themselves)

### Card 2: Performance Snapshot (white, merged follow-up + utilisation)

**Data sources:**
- Left metric: `formatRate(latest.followUpRate)` — follow-up rate (sessions per patient)
- Right metric: `formatPercent(latest.utilisationRate)` — utilisation percentage
- Trends: separate `computeTrend()` + `computeTrendPercent()` for each
- Insight: `getFollowUpInsight()` output

**Structure:**
```
PERFORMANCE                     [composite status dot]
3.3              74%
follow-up rate   utilisation
↑ +2%            ↑ +1%

On target — strong engagement
```

**Status dot logic:** Composite — worst of `getFollowUpStatus()` and `getGenericStatus(util, 0.85)`. If either is "danger", dot is red. If either is "warn", dot is amber. Otherwise green.
**Action:** "View performance details →" links to `/intelligence`

### Card 3: Live Activity Feed (dark navy, NEW)

**Background:** `linear-gradient(135deg, #0B2545 0%, #132D5E 100%)`

**Data sources:**
- Ava events: from Ava call log data (recent bookings, calls handled)
- Pulse events: from Pulse send log (rebooks, reminder responses)
- Intelligence events: from `useInsightEvents()` (insight detections, alerts)
- InsightBanner data folds here: highest-ranked unread insight appears as a feed item
- InsightNudge data folds here: rule-based nudges appear as feed items

**Structure:**
```
CLINIC PULSE                    [● ● ●] (module dots)

● Ava booked J. Thompson              14m
● DNA spike — Tue PM slots              1h
● 4 patients responded to HEP           3h
```

**Feed items:** Max 4 visible, most recent first. Each item has:
- Module colour dot (blue=Ava, teal=Pulse, purple=Intelligence)
- Short description (≤60 chars)
- Relative timestamp

**Empty state:** "All quiet — your clinic is running smoothly" with module dots still visible.

**Implementation notes:**
- Feed data aggregated from existing hooks: `useInsightEvents()`, plus new lightweight queries for recent Ava calls and Pulse events
- Events are merged and sorted by timestamp
- Card is clickable — links to the relevant module page for the top event
- If Ava/Pulse modules are not enabled, only Intelligence events show (graceful degradation)

---

## Row 2: Grouped Metrics + Trend Strip

**Layout:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` (3 metric cards + 1 trend strip, wider)

The trend strip column gets `lg:col-span-1` with slightly more width via `1fr 1fr 1fr 1.2fr`.

### Card 1: Patient Flow (DNA-focused)

**Data sources:**
- Hero: `formatPercent(latest.dnaRate)` — DNA rate
- Status: `getDnaStatus(latest.dnaRate)` — green ≤5%, amber ≤12%, red >12%
- Trend: `computeTrend()` on DNA (inverted — lower is better)
- Insight: existing DNA insight logic ("Low no-show rate — excellent" or "No-shows above target — review SMS reminders")
- Sparkline: 6-week `dnaRate` history

**Structure:**
```
PATIENT FLOW                    [status dot]
3%                         ↑ -25%
DNA rate · Low no-shows

[sparkline]
```

**Note:** Initial assessments + follow-ups are shown in the Appointments card (Row 1) — not duplicated here.
**Action:** "Review missed appointments →" links to `/continuity`

### Card 2: Revenue (compound)

**Data sources:**
- Hero: `formatPence(latest.revenuePerSessionPence)` + "avg/session"
- Status: "neutral"
- Trend: `computeTrend()` + `computeTrendPercent()`
- Supporting: total weekly revenue = `appointmentsTotal * revenuePerSessionPence` (formatted as £X,XXX)
- Sparkline: 6-week `revenuePerSessionPence` history

**Structure:**
```
REVENUE                         [status dot]
£79 avg/session            → 0%
Steady rate

─────────────────────────────────────
£5,767 total         [sparkline]
```

**Action:** "See revenue breakdown →" links to `/intelligence`

### Card 3: Compliance (HEP deprioritised)

**Data sources:**
- HEP bar: `latest.hepRate` (0-1) displayed as percentage with progress bar
- Course bar: `latest.courseCompletionRate` (0-1) displayed as percentage with progress bar
- Status colours on bars: teal-to-blue gradient when on target, amber when below threshold
- Trend: `+X% WoW` in italic footer

**Structure:**
```
COMPLIANCE                      [status dot]

HEP assigned                       87%
[████████████████████░░░]

Course completion                  72%
[██████████████░░░░░░░░░]

─────────────────────────────────────
On track · +1% WoW
```

**Status dot logic:** Composite of `getHepStatus(hepRate)` and `getGenericStatus(courseCompletion, 0.80)`.
**No action link** — compliance is informational, not drillable.

### Card 4: 6-Week Trend Strip (replaces full-width 90-day chart)

**Data source:** `trendWindow` (6 weeks ending at selected week, same computation as current)

**Lines:**
- Follow-up Rate: `#4B8BF5` (blue)
- Utilisation: `#8B5CF6` (purple)

**Chart:** Compact Recharts `LineChart` (no axes labels, minimal grid, end-dot markers). Height ~80px.

**Legend:** Inline below chart, two items with coloured dots.

**This replaces the full `<TrendChart>` section** (current lines 660-684) — saves an entire scroll section of vertical space.

---

## Clinician Summary Table (KEEP — unchanged)

**File:** `components/ui/CliniciansTable.tsx`, rendered at page.tsx lines 686-704

No changes. Same columns (Clinician, Follow-up, HEP, Utilisation, Sessions), same RAG badges, same click-to-navigate.

---

## Preview Modal (UPDATE)

**File:** `dashboard/src/app/dashboard/page.tsx` lines 375-512

Update the ghost preview to show the new layout:
- 3 hero cards (Appointments, Performance, Activity Feed placeholder)
- 4 grouped cards (Patient Flow, Revenue, Compliance, Trend)
- Same clinician table preview

---

## Data Staleness Warning (KEEP — unchanged)

**File:** `dashboard/src/app/dashboard/page.tsx` lines 237-267

Shows for CSV-bridge clinics when last sync >72h. No changes.

---

## Files to Modify

| File | Changes |
|------|---------|
| `dashboard/src/app/dashboard/page.tsx` | Main restructure — new card layout, remove AlertBanner/InsightBanner/InsightNudge/DailySnapshot renders, add Performance Snapshot + Live Activity Feed + compound cards, remove TrendChart section, update preview modal |
| `dashboard/src/components/ui/StatCard.tsx` | May need a `compound` variant or new `CompoundStatCard` for dual-metric display |
| `dashboard/src/components/ui/DailySnapshot.tsx` | DELETE or gut — no longer rendered |
| `dashboard/src/components/ui/AlertFlag.tsx` | AlertBanner no longer rendered from dashboard (keep component for potential reuse) |
| `dashboard/src/components/ui/TrendChart.tsx` | Keep component but it's no longer used on dashboard — inline strip replaces it |
| `dashboard/src/components/ui/LiveActivityFeed.tsx` | NEW — cross-module event feed component |
| `dashboard/src/hooks/useLiveActivity.ts` | NEW — aggregates events from Ava, Pulse, Intelligence into unified feed |
| `dashboard/src/lib/greeting.ts` | No changes to logic |
| `dashboard/src/lib/utils.ts` | No changes — all status/alert functions kept |

## Algorithmic Logic Disposition

| Function | Status | New Location |
|----------|--------|-------------|
| `getFollowUpStatus()` | KEPT | Performance Snapshot status dot |
| `getGenericStatus(util, 0.85)` | KEPT | Performance Snapshot status dot |
| `getDnaStatus()` | KEPT | Patient Flow status dot |
| `getHepStatus()` | KEPT | Compliance progress bar colour |
| `getGenericStatus(completion, 0.80)` | KEPT | Compliance progress bar colour |
| `computeTrend()` | KEPT | All cards |
| `computeTrendPercent()` | KEPT | All cards |
| `computeAlerts()` | KEPT (logic) | Not rendered — status dots replace banner |
| `getGreeting()` | KEPT | Greeting + subtext (absorbs DailySnapshot) |
| `getFollowUpInsight()` | KEPT | Performance Snapshot insight text |
| `trendWindow` | KEPT | Sparklines + inline trend strip |
| Week navigation | KEPT | Unchanged |
| Clinician filter | KEPT | Unchanged |

---

## Verification

1. **Type check:** `cd dashboard && npx tsc --noEmit` — zero errors
2. **Visual check:** Run `npm run dev`, navigate to `/dashboard` with real Spires data
   - Verify 3 hero cards render with correct values and trends
   - Verify compound cards show grouped metrics with correct status dots
   - Verify Live Activity Feed shows events (or graceful empty state)
   - Verify compliance progress bars reflect real HEP/completion rates
   - Verify inline trend strip renders 6-week data correctly
   - Verify clinician table unchanged
   - Verify week navigation still works (forward/back)
   - Verify clinician filter still works
   - Verify greeting text and subtext render correctly
   - Verify onboarding banner is compressed
3. **Responsive check:** Resize to mobile — cards should stack single-column
4. **Empty state:** Clear data, verify empty state shows with updated preview modal
5. **Edge cases:** Check with single clinician, check with no Ava/Pulse enabled (feed degrades gracefully)
