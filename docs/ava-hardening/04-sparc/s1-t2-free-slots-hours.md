# S1-T2 — computeFreeSlots Clinic Hours SPARC

## Pre-implementation verification

| Check | Result |
|-------|--------|
| Writes to collections Intelligence reads? | No — pure computation, no Firestore writes |
| Fires `onClinicWrite`? | No |
| Adds new Firestore collection? | No |
| `InsightEvent` schema touched? | No |
| Backward compat? | Yes — `hoursConfig` is optional; absent = current 09:00–18:00 Mon–Fri behaviour |

## Specification
Extract `computeFreeSlots` into `src/lib/ava/compute-free-slots.ts` (for testability). Add optional `hoursConfig?: { start?, end?, days? }` param. Parse "HH:MM" strings. Filter by day-name array. Pass `ava.hours` from the clinic doc in the main handler.

## Pseudocode
```
computeFreeSlots(appointments, dateFrom, dateTo, hoursConfig?):
  clinicStartMins = parse(hoursConfig.start ?? "09:00") in minutes from midnight
  clinicEndMins   = parse(hoursConfig.end   ?? "18:00") in minutes from midnight
  allowedDays     = Set of day indices from hoursConfig.days ?? [1,2,3,4,5]

  snap cursor to next 45-min boundary at or after dateFrom

  while cursor < dateTo AND freeSlots.length < 6:
    cursorMins = cursor.hours * 60 + cursor.minutes
    if cursor.day not in allowedDays OR cursorMins >= clinicEndMins:
      advance cursor to next day at clinicStart; continue
    if cursorMins < clinicStartMins:
      snap cursor to clinicStart; continue
    if not overlapping any busy interval:
      push cursor to freeSlots
    cursor += 45 min

  return freeSlots
```

## Architecture
- `computeFreeSlots` moved to `src/lib/ava/compute-free-slots.ts` (exported)
- `tools/route.ts` imports from new module
- Main handler extracts `clinicData.ava.hours` from clinic snap and passes as `hoursConfig`
- `handleCheckAvailability` gains a 4th optional param `hoursConfig?`

## Refinement — edge cases
- Clinics with non-zero start minutes (e.g. 10:30) work correctly: snap sets cursor to start, then advances in 45-min increments from there
- Saturday/Sunday clinic: passing `days: ["sat", "sun"]` works
- Midnight crossing: not needed for physio but the algorithm handles it (end < start wraps to next day)

## Completion criteria
Unit tests pass for: default hours, Tue–Thu only, afternoon-only, weekend, busy slot exclusion, defaults match explicit config.
