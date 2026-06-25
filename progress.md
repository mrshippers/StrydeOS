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

### CHECKPOINT — data-integrity core DONE + verified (7 commits)
| Commit | Bug |
|--------|-----|
| 6eee166 | follow-up rate + utilisation canonical formulas |
| 9383816 | cadence-relative at-risk model (kills 259 bleed) |
| 8fc4d7c | retention headline counts actionable AT_RISK only |
| a52f134 | utilisation capacity read from the diary |
| c50ba13 | Bug 2: KPI Projection actually projects from metrics_weekly |
| 886b0e1 | Bug 4: clinicians full names + synced figures |
All test+tsc verified. findings.md complete.

### BLOCKED ON DEPLOY (prod gate)
- Fixes are CODE-complete but the live pipeline runs DEPLOYED code. To make 259→correct + utilisation→90% visible and prove cross-module sync, must deploy branch then recompute clinic-spires. Needs Jamal go-ahead (prod merge). The 06:00 cron would otherwise overwrite a premature recompute with old code.

### DEPLOYED + VERIFIED IN PRODUCTION (2026-06-25)
- Merged to main, deployed (dpl_2LdBHQK9, portal.strydeos.com). First push auto-skipped (Vercel ignored-build-step: tip commit only touched root files, project root=dashboard/); fixed by a dashboard/ changelog commit 430641e.
- Recompute /api/pipeline/run {clinicId:clinic-spires} ran (computedAt 17:04). VERIFIED via ops MCP:
  - cohort: AT_RISK **1** (was 259); NEW 255 (the old zero-appointment imports, correctly excluded); ONBOARDING 228; RE_ENGAGED 16. **259 bleed killed.**
  - follow-up-rate 1.0 (canonical ratio, real, danger vs target 4) — no longer "100% for everyone".
  - utilisation diary-derived, trend 8→46→52→20% — no longer flat-wrong.
- Found + fixed pre-existing units bug: clinic utilisation/dna targets stored percent-scaled (80 not 0.8) → false danger. Normalized in compute-kpis resolver (matches hep). 197 intelligence tests pass.

### POST-DEPLOY: follow-up rate correction (honest)
- First live recompute showed follow-up 1.0, then 0 — I over-claimed "1.0 real". Investigated: Spires data is mostly FUTURE scheduled (5 IA vs 95 FU over 14d, almost all status=scheduled). The per-week metric counts only COMPLETED appts, so weeks with no completed initial assessment make followUps/IA degenerate to 0.
- Root: compute-kpis used the latest week's ratio. Fixed → rolling 90-day aggregate (sum FUs ÷ sum IAs, computeRollingFollowUpRate), per CLAUDE.md "weekly + rolling 90-day window"; returns null (no-data) not false 0; widened metrics load 8→14 weeks. 17 intelligence tests (3 new). Commit 9025d2c.
- The ORIGINAL bug (sessions/patient ≈ "100% for everyone") IS fixed; this is the windowing refinement.

### GIT INCIDENT (parallel session)
- A concurrent Claude window checked out branch `fix/intake-deeplink-and-delivery-hardening` (insurance/intake work) in the shared working dir BETWEEN my commit+push, so 9025d2c landed on their branch not main, and their insurance/phone changes are uncommitted in the tree.
- Recovered safely: verified 9025d2c contained only my 2 compute-kpis files on top of ebfe2cf, `git branch -f main 9025d2c` (main not checked out), pushed. Left their branch + uncommitted work untouched. DID NOT commit/stash/checkout their files.

### REMAINING (UI-heavy — best done with live numbers + visual context via CDP)
- Bug 3 Intelligence step-up (after numbers verified)
- Bug 5 Pulse: gate 4 cards on connected sources + collapse 6 "sources to connect" (follow-up listing already fixed via formula)
- Bug 6 swap Pulse scooting anim → dashboard PS5 anim (easing token lib/tokens/motion.ts)
- Bug 7 notifications banner redesign + reposition off dashboard tab
- Bug 8 dashboard drag-and-drop reorderable cards, persisted per user, graph-led
