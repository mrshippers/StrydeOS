# Progress Log — Module Data Integrity

## Session 1 — 2026-06-25

### Setup
- Located repo: `/Users/joa/Documents/AI/strydeos`, app in `dashboard/`.
- On branch `fix/module-data-integrity` — even with `main` (0 ahead/0 behind), clean tree (only untracked build artifact `dashboard/.next-pulse/`). Using this branch; nothing to lose.
- Mapped module layout: `src/app/{intelligence,dashboard,clinicians}`, `src/components/{intelligence,pulse}`, `src/lib/{metrics,intelligence,pulse}`, `src/app/api/{metrics,intelligence,clinicians,clinic}`.
- Created task_plan.md, findings.md, progress.md.

### P1 — Logic Harness COMPLETE
- Dispatched 5 parallel read-only tracers (Dashboard, Intelligence, Pulse+Insights, Clinicians+sync, literal-hunt). Verified the two smoking-gun formulas directly in `compute-weekly.ts`.
- **Key reframe:** numbers are NOT hardcoded. Three root causes: (1) broken formulas vs canonical CLAUDE.md KPI defs (follow-up rate = total/uniquePatients should be followUps/initialAssessments; utilisation uses flat 40-slot capacity not real diary availability), (2) stale old-Spires patient cohort never recomputed out of AT_RISK with no live-source gate, (3) metrics cached + only recomputed by 06:00 cron so cross-module changes don't propagate live.
- CLAUDE.md "KPI Metrics — Confirmed from Spires" is AUTHORITATIVE and resolves follow-up + utilisation definitions. Patients-at-risk NOT defined there → flagged for user.
- findings.md fully written with per-module tables + 4 open questions.

### Next (P2 gated on user answers to findings.md open questions)
- Awaiting user decisions: patients-at-risk definition, live/connected gating + dataMode status, utilisation diary-availability source, OK to add UI-triggered recompute.
- Then P2: fix follow-up formula, fix utilisation, gate to live source, wire recompute. Commit per bug.

### P2 in progress — Bug 1 (data/logic): formula fixes DONE
- `compute-weekly.ts`:
  - **Follow-up rate** fixed to canonical `followUps ÷ initialAssessments` (was `total ÷ uniquePatients`, the "100%/full for everyone" bug). Vars already existed.
  - **Utilisation** fixed to canonical `booked ÷ available diary slots`. Available = working-hours window (`clinic.ava.hours`, shared with Ava booking) ÷ slot length (`targets.slotMinutes`, default 45), counted per (clinician, day) actually worked. Replaces flat `clinicians × 40`. One-day 10-slot diary with 9 booked now reads 90%.
  - Added `slotsPerWorkingDay()` helper; threaded `slotsPerDay` through orchestrator from clinic hours.
- Tests updated to canonical defs (incl. new 90% one-day case).

### Test results
| When | Command | Result |
|------|---------|--------|
| 2026-06-25 | `vitest run compute-weekly.test.ts` | 28 passed |
| 2026-06-25 | `vitest run lib/metrics lib/intelligence lib/pipeline` | 304 passed (24 files) |
| 2026-06-25 | `eslint compute-weekly.ts` | clean |

### Bug 1 formulas committed (6eee166).

### At-risk model v2 (cadence-relative) — engine DONE
- Jamal pushed back: flat 14d is clinically wrong (cadence is condition-dependent); must distinguish planned discharge vs open-cadence vs drop-off. Used /feature-planning + harness.
- Harness findings: appointmentType `"discharge"` is real+mapped but never consumed; per-patient cadence is derivable from completed-session gaps; no condition field (Heidi optional).
- `compute-risk-score.ts`: added cadence inputs (expectedIntervalDays, lastAppointmentType, effectiveCourseLength, overdue/churn factors, atRiskMaxDays). New episode-aware lifecycle: sessionCount0→NEW (kills zero-appt imports), future booking→ACTIVE/RE_ENGAGED, planned discharge→DISCHARGED, within cadence→ACTIVE, overdue vs own rhythm→AT_RISK, past window→LAPSED/CHURNED. riskScore kept as severity.
- `compute-patients.ts`: derive expectedInterval (median gap, ≥3 completed), capture appointmentType, redefine `discharged` = planned (discharge appt OR course-length+no-followup) NOT 30-day silence, load clinic.targets cadence knobs.
- Tests rewritten + added (ACTIVE within cadence, AT_RISK overdue, LAPSED past window, DISCHARGED by plan). 78 pipeline tests pass. tsc clean.

### Test results
| When | Command | Result |
|------|---------|--------|
| 2026-06-25 | vitest compute-weekly | 28 passed |
| 2026-06-25 | vitest metrics/intelligence/pipeline | 304 passed |
| 2026-06-25 | vitest pipeline (after at-risk v2) | 78 passed |
| 2026-06-25 | tsc --noEmit (changed files) | clean |

### Next
- Surfaces: useOwnerSummary + continuity to count AT_RISK (actionable) only, gated to live source (dataMode=live + integration_health). Disconnected → no cards.
- Wire UI-triggered recompute to prove cross-module sync. Then Bugs 2-8.
