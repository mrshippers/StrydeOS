# Migration: Dashboard Data Sync Fix

**Branch:** `claude/fix-dashboard-data-sync-ERfHw`
**Commit:** `a7a9a88`
**Date:** 2026-04-01

---

## What Was Broken

### 1. Staleness banner only fired for TM3 clinics
`dashboard/page.tsx:241` had `["tm3"].includes(pmsType)` — WriteUpp (Spires) never saw the "data overdue" warning. Data could go stale for weeks with zero UI indication.

### 2. Revenue showed wrong numbers (£15,000 / £79)
When WriteUpp doesn't provide `price_pence` on appointments (optional field), the system defaulted to `£0`. Revenue per session computed as `0`, so weekly revenue was either zero or stale cached data. The `sessionPricePence` you set in Settings was never used as a fallback anywhere in the pipeline.

### 3. No manual sync trigger on dashboard
WriteUpp uses webhooks + 4-hour cron. If the webhook didn't fire or cron hadn't run, there was zero way to refresh data from the dashboard UI.

### 4. Ava page hardcoded session value at £85
`receptionist/page.tsx:42` — `const AVG_APPOINTMENT_VALUE = 85` — completely disconnected from Settings.

---

## Files Changed (6 files)

### `dashboard/src/app/dashboard/page.tsx`
- **Staleness banner** now triggers for ALL PMS types, not just TM3
- **"Sync now" button** added to header (clickable sync pill replaces static "Synced X ago")
- **"Sync data" button** shown when no sync has ever happened but PMS is connected
- **Manual sync handler** (`handleManualSync`) calls `/api/pms/sync` then `/api/metrics/compute`, reloads page
- **Gentle 24-72h nudge** added — reminds owners to sync before weekly review (softer than the >72h warning)
- **Very-stale (>72h) banner** now shows sync button for non-TM3, CSV upload for TM3

### `dashboard/src/lib/metrics/compute-weekly.ts`
- `aggregateWeek()` now accepts `sessionPricePence` parameter
- Revenue aggregation uses `a.revenueAmountPence || sessionPricePence` (falls back to clinic setting when appointment has no revenue)
- Same fallback applied to: revenue by appointment type, insurance vs self-pay split
- `computeWeeklyMetricsForClinic()` reads `sessionPricePence` from clinic doc and passes it through

### `dashboard/src/lib/pipeline/sync-appointments.ts`
- `syncAppointments()` options now accepts `sessionPricePence`
- Appointment upsert uses `pms.revenueAmountPence ?? options.sessionPricePence ?? 0`

### `dashboard/src/lib/pipeline/run-pipeline.ts`
- Loads clinic doc at pipeline start to get `sessionPricePence`
- Passes `sessionPricePence` to `syncAppointments()` via options

### `dashboard/src/app/api/pms/sync/route.ts`
- Reads `sessionPricePence` from clinic doc data
- Uses as fallback: `pms.revenueAmountPence ?? sessionPricePence ?? 0`

### `dashboard/src/app/receptionist/page.tsx`
- Replaced `const AVG_APPOINTMENT_VALUE = 85` with `DEFAULT_APPOINTMENT_VALUE` (fallback only)
- Ava page now reads `user.clinicProfile.sessionPricePence` and converts to pounds
- Revenue captured and insight text use the clinic-specific value

---

## Post-Merge Actions

1. **Set session price in Settings** — Go to Settings > Clinic Details > Session Price and confirm the £ value is correct for Spires
2. **Hit "Sync now"** on the dashboard — this triggers a full PMS pull + metrics recompute using the correct session price
3. **Verify revenue figures** — Revenue per session and weekly total should now reflect your actual session price, not £0 or stale demo data
4. **Check Ava page** — Revenue captured per call should now use your real session price

---

## Data Flow (After Fix)

```
Settings (sessionPricePence) ──┐
                                ├──> sync-appointments (fallback when PMS has no price)
WriteUpp webhook / cron ────────┤
                                ├──> compute-weekly (fallback in aggregation)
                                │
                                └──> metrics_weekly (correct revenuePerSessionPence)
                                        │
                    ┌───────────────────┤
                    ▼                   ▼
              Dashboard            Intelligence
         (revenue card)          (revenue tab)

Settings (sessionPricePence) ──> Ava page (revenue captured per call)
```

---

## Risk Assessment

- **No Firebase logic changed** — only how revenue values are computed/displayed
- **No auth changes** — sync endpoints already required owner/admin role
- **No routing changes**
- **Backwards compatible** — if `sessionPricePence` is not set, falls back to 0 (same as before)
- **No new collections or documents** — reads existing `sessionPricePence` field from clinic doc
