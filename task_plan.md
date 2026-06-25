# Task Plan — StrydeOS Module Data Integrity

## Goal
Data integrity FIRST, UX second across three modules (Intelligence, Pulse Impact, Clinicians) + the dashboard. Most on-screen numbers are wrong; cross-module sync is dead or never existed. Trace every number to its source, kill hardcoded values, fix broken logic, wire cross-module sync, then raise UX.

## Hard Constraints
- Stack LOCKED: Firebase / Vercel / Next.js. NO DB migrations.
- Do NOT delete/overwrite existing prompt/config files (a prior session nuked work).
- Branch: `fix/module-data-integrity` (already even with main — using it).
- Commit at EACH fixed bug. Update progress.md as I go.
- NEVER fabricate clinical/scent/patient data. Only pull from live/connected sources.
- No em dashes. No cream/brown/beige/green colourway.

## Metric Definitions (authoritative, from user)
- **Utilisation** = booked slots ÷ available slots in clinician PMS diary. User diary: 9 booked / 10 slots = **90%**. Compute against diary, not a guess.
- **DNA rate** = currently 0 everywhere — CORRECT for user data, leave it.
- **Follow-up rate** = definition UNCLEAR in code — DO NOT invent. Write found formula to findings.md, flag for user.
- **Patients at risk** = definition UNCLEAR — DO NOT invent. Write found formula to findings.md, flag for user. Must only pull from live/connected source (no old Spires bleed).

## Phases
- [x] **P0 — Setup**: branch `fix/module-data-integrity` verified (even with main), planning files created, baseline clean.
- [x] **P1 — Logic Harness (TRACE FIRST, no fixes)**: DONE. 5 parallel tracers + direct verification. findings.md written. Headline: numbers are broken-formula/stale/cached, NOT hardcoded. Awaiting user answers on 4 open questions before P2.
- [x] **P2 — Bug 1 Data/logic**: DONE in code+tests (commits 6eee166, 9383816, 8fc4d7c, a52f134). Follow-up rate, utilisation (diary-derived), at-risk cadence model + headline. Cross-module sync confirmed shared via metrics_weekly; live recompute pending deploy.
- [x] **P3 — Bug 2 Intelligence KPI Projection tab**: DONE (c50ba13) — projects from metrics_weekly trend, resilient when kpis/* empty.
- [ ] **P4 — Bug 3 Intelligence step-up**: raise the bar (after numbers verified live).
- [x] **P5 — Bug 4 Clinicians tab**: DONE (886b0e1) — every active clinician, full canonical name, synced figures, "—" for no-data.
- [ ] **P6 — Bug 5 Pulse Impact + Insights**: follow-up listing FIXED via formula. REMAINING (needs live UI context): gate the four cards on connected sources, collapse six "sources to connect" into compact attached boxes.
- [ ] **P7 — Bug 6 Animation**: swap Pulse old scooting animation for the PS5-style dashboard animation. One system.
- [ ] **P8 — Bug 7 Notifications**: compact/clean "insights to action" banner (not full-width, not all-red on click); remove from dashboard tab; restore clinician cards position.
- [ ] **P9 — Bug 8 Dashboard UX**: Slack-on-4K-TV / PS5-home feel; drag-and-drop reorderable cards, order persisted per user; graph-led; reference marketing hero visual language.
- [ ] **P10 — Bug-hunter pass**: auth races, stale state, dead listeners, env mismatches.
- [ ] **P11 — Verify**: all VERIFY checklist items green.

## VERIFY checklist (definition of done)
- findings.md shows every dashboard/module number with source + hardcoded-vs-computed status.
- Utilisation reads 90% against one-day diary.
- No "259 patients at risk", no old-Spires data anywhere — only live/connected sources.
- Clinicians tab lists full names with correct, synced figures.
- A change in one module reflects correctly in the other two.
- Disconnected sources render no cards.
- Bug-hunter pass complete.
- Commit at each fixed bug; progress.md current.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | | |
