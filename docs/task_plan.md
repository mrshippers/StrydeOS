# Task Plan — Owner Summary Dashboard

**Goal:** Replace `/dashboard` landing with four-tile owner summary.
**Started:** 2026-05-13
**Status:** in_progress

---

## Phases

### Phase 1 — Data hook [in_progress]
Create `dashboard/src/hooks/useOwnerSummary.ts`
- MTD revenue from `appointments` (revenueAmountPence, month filter, completed/scheduled status)
- Today's appts + DNAs (today date filter)
- Retention alerts (patients AT_RISK/LAPSED, no nextSessionDate)
- Utilisation (reuse useClinicianSummaryStats, already exists)
- Demo fallback for uid === "demo"

### Phase 2 — Tile components [pending]
Create `dashboard/src/components/owner-summary/`:
- `RevenueTile.tsx` — Purple #8B5CF6, MTD £ figure + comparison
- `TodayTile.tsx` — Teal #0891B2, count + DNA badge
- `RetentionTile.tsx` — Amber, alert count + top 3 names
- `UtilisationTile.tsx` — Blue #1C54F2, per-clinician row list

### Phase 3 — Page wiring [pending]
Modify `dashboard/src/app/dashboard/page.tsx`:
- Replace body with 2×2 tile grid
- Keep existing PageHeader + auth/role guard
- Owners/admins see all four; clinicians see own utilisation + today only

### Phase 4 — Tests + build verify [pending]

---

## Decisions Locked
- Surface: `/dashboard` landing
- Real-time: onSnapshot (existing pattern — no SWR)
- Data sources: appointments, patients, metrics_weekly (all existing collections)
- No new Firestore indexes needed (date filtering on dateTime is already indexed)

## Constraints
- HARD STOPS: auth, routing, existing listener architecture setup — do not touch
- Brand tokens only — no hex values outside brand.ts
- Skeleton loading on every tile
- Demo-safe: plausible fictional data, no Spires names

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| — | — | — |
