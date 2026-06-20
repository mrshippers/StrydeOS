# Intelligence Module — P0 Hardening Plan

Source: the 9-dimension deep architect audit of the Intelligence module (Analyze → Verify → Synthesize, every critical/high finding adversarially re-verified against the code). This plan closes the 19 P0 blockers plus one confirmed founder hard-rule violation (em-dash subject lines), grouped into 18 tasks. Two tight same-file pairs are merged: Task 8 (P0-7+P0-8) and Task 4 (P0-10+P0-11).

All paths are relative to `dashboard/` unless stated. Line numbers are from the audit snapshot and are hints — implementers MUST read the current file and locate the real code, not trust the line numbers blindly.

## Global Constraints

- **Repo:** `/Users/joa/Documents/AI/strydeos`. The app lives in `dashboard/`. Branch: `feat/intelligence-p0-hardening`.
- **Test command:** `cd dashboard && npm test` (vitest). Run the targeted test file(s) for your task, e.g. `npm test -- src/lib/intelligence/__tests__/notify-owner.test.ts`. Build (only where the task requires it): `npm run build`.
- **TDD:** write or extend a failing test first where the change is testable (all compute/detect/value/digest logic is testable). UI-only and config-only tasks may verify by build/type-check instead.
- **Module boundaries:** run `npm run check:boundaries` if you add cross-module imports. NEVER bypass hooks with `--no-verify`.
- **No em dashes (—) or double hyphens (--) anywhere** in code, comments, copy, or commit messages. Single hyphens only. This is a hard rule.
- **StrydeOS dark palette for app UI** (navy #06182e/#0b2545, blue #1c54f2). Do NOT touch the email light-surface palette (cloud/cream tokens in `src/lib/.../colors.ts` are canonical brand tokens, confirmed correct by the audit). Green only as a status tick.
- **The data-integrity rule (the spine of this whole plan):** every figure shown to a clinic (UI or email) must trace to that clinic's real data. No hardcoded sample figures, no fabricated statistics, no guessed defaults presented as fact. When a real value is unavailable, SKIP or clearly label as estimate/reference, mirroring the existing `SESSION_RATE_MISSING` skip-not-substitute pattern in `src/lib/intelligence/load-session-rate.ts`.
- **Fairness rule:** never name a real clinician next to a figure derived from an unsafe sample size or un-normalised raw count.
- **Tenancy:** all Firestore reads/writes stay partitioned under `clinics/{clinicId}/`. Never widen a query across tenants.
- Keep diffs minimal and on-scope. Do not add unrequested flags, endpoints, or refactors. Do not rewrite the email palette. Do not implement orphaned/P1/P2 items.
- Commit at the end of each task with a clear message referencing the P0 id(s).

---

## Task 1 — Remove the hardcoded "2.4x / 1.8x" clinical correlation claim (P0-1)

**Problem:** A hardcoded clinical correlation ("patients with X are 2.4x more likely to complete treatment, 1.8x more likely to leave a review", or similar) is rendered to clinics as fact in the Intelligence page and is also baked into an LLM prompt.

**Files:** `src/app/intelligence/page.tsx` (around the audit-cited 1402-1405), `src/lib/intelligence/coaching-prompts.ts` (around 162).

**Changes:**
- Find the literal multiplier claim in `page.tsx`. Either (a) derive it from the clinic's own data (`outcome_scores` + completion/review counts) if a defensible derivation exists, or (b) remove the claim entirely. Default to removal unless a clean per-clinic derivation is obviously available from data already loaded on the page.
- Remove the same asserted statistic from the `coaching-prompts.ts` prompt text so the LLM is not told to repeat it.
- If any surrounding UI structure would break with the claim removed, replace it with a data-true element or remove the container cleanly.

**Acceptance:** No hardcoded "Nx more likely" style statistic remains in `page.tsx` or `coaching-prompts.ts`. Grep for the multiplier text returns nothing. `npm run build` passes. If a derivation path was chosen, a unit test covers it.

---

## Task 2 — Real recovered-revenue, not a flat £65 per action (P0-3)

**Problem:** `EventsActionedByPulseTile` multiplies actioned-event count by a flat 65 (£65) and frames the result as realised "recovered revenue".

**Files:** `src/components/intelligence/EventsActionedByPulseTile.tsx` (around 25 and 127).

**Changes:**
- Sum the per-event `revenueImpact` (already present on actioned events) instead of `count * 65`.
- When an event lacks `revenueImpact`, fall back to a clinic-specific average session value (the same source other modules use), and label the tile value as "estimated" rather than "recovered" when any fallback was used; label as measured when all values are real.
- If no real per-event value and no clinic session value is available, show the count only, not a fabricated currency figure.

**Acceptance:** No literal `65` magic number remains as a revenue basis. Tile value is the sum of real `revenueImpact` with a clear measured-vs-estimated label. Build passes; add/extend a component or unit test if the tile has testable logic extracted.

---

## Task 3 — ROI multiple must use the real subscription price, or be suppressed (P0-5)

**Problem:** `compute-value-summary.ts` divides clinic value by a guessed 29900p (£299) subscription when billing is unset, producing a fabricated headline ROI multiple.

**Files:** `src/lib/intelligence/compute-value-summary.ts` (around 48, 90-91).

**Changes:**
- Resolve the real subscription price from the clinic's billing record / the locked StrydeOS pricing matrix for its tier.
- If the real price cannot be resolved, SUPPRESS the ROI multiple entirely (return null / omit), mirroring the `SESSION_RATE_MISSING` skip pattern. Never default to £299.
- Ensure callers/UI handle a suppressed multiple gracefully (no "NaNx" or "Infinityx").

**Acceptance:** No hardcoded 29900/299 default remains. A new/extended unit test asserts: (a) correct `roiMultiple` for a known price, (b) suppression (null) when price is absent. `npm test` for this file passes.

---

## Task 4 — Single KPI read model + correct NPS scale (P0-10, P0-11)

**Problem:** The same headline KPIs are computed twice and both render on one screen: the canonical projection (`compute-kpis.ts` / `kpis/*` via `KpiProjectionStrip`) and a client-side recompute in `useIntelligenceData.ts` (`deriveNps` ~273-337, `deriveBenchmarks` ~465-472). They use different windows/formulas. Separately, NPS pools incompatible 0-10 SMS scores and 1-5 star ratings into one ratio, and the two implementations disagree on category boundaries (`useIntelligenceData.ts:285-299` vs `compute-kpis.ts:311-330`).

**Files:** `src/hooks/useIntelligenceData.ts`, `src/lib/intelligence/compute-kpis.ts`, `src/app/intelligence/page.tsx`, `src/hooks/useWeeklyTrend.ts` (if it re-aggregates client-side per the audit).

**Changes:**
- Make `kpis/*` (read via the existing KPI hook, e.g. `useKpis`) the single source for every headline KPI on the page. Delete `deriveNps` and `deriveBenchmarks` from `useIntelligenceData.ts`. Keep `useIntelligenceData` only for breakdowns with no projected equivalent (revenue-by-condition, DNA-by-day/slot).
- Repoint `useWeeklyTrend` at the precomputed `clinicianId == 'all'` `metrics_weekly` docs instead of re-aggregating per-clinician rows client-side, if it currently re-aggregates.
- Fix NPS in the canonical `compute-kpis.ts`: compute NPS ONLY from true 0-10 `nps_sms`; report 1-5 star sentiment as a SEPARATE average-rating metric, not folded into NPS. Reconcile category boundaries to one shared function.
- Update `page.tsx` to read NPS and star-sentiment as the two distinct metrics.

**Acceptance:** Each headline KPI is computed in exactly one place. Grep confirms `deriveNps`/`deriveBenchmarks` are gone. NPS no longer mixes scales. Unit tests on `computeRollingNps` (or equivalent) cover: 0-10-only input, empty window → null, single review, all-detractors, and the star-rating separation. `npm test` for compute-kpis passes; `npm run build` passes.

---

## Task 5 — KPI targets from clinic data, not a hardcoded £68 median (P0-4)

**Problem:** A hardcoded 68 / 6800p "UK median" target silently sets the red/amber/green pass line for rev/session and feeds Pulse threshold events. Other targets (NPS, review-conversion) are similarly hardcoded.

**Files:** `src/lib/intelligence/compute-kpis.ts` (around 74-92; and the `normaliseTargets`/`evaluateStatus` helpers).

**Changes:**
- Source rev/session, NPS and review-conversion targets from `clinicData.targets` (per-clinic config).
- When a target is unset, use a clearly-labelled external-reference fallback (a named constant whose label, when surfaced, reads as "reference target", not "peer/median data"). Do not silently present a reference value as the clinic's own benchmark.
- Ensure the RAG status and any Pulse threshold events use the resolved target consistently.

**Acceptance:** No bare 68/6800 literal as a silent pass line. Targets resolve from clinic config with a labelled fallback. Unit tests cover: target from clinic config, fallback path, and `evaluateStatus` boundaries both directions. `npm test` passes. (Note: this task runs AFTER Task 4 which also edits compute-kpis.ts — read the current file state.)

---

## Task 6 — Gate or relabel the peer-benchmark card (P0-2)

**Problem:** `useIntelligenceData.ts` (~465-472) supplies static benchmarks shown under an "anonymised aggregate data" subtitle for all real clinics (even on the firestoreError path, `page.tsx:1024`), with a "beating/lagging vs peers" chevron. There is no real multi-clinic aggregation, so this is fabricated peer data.

**Files:** `src/app/intelligence/page.tsx` (the Benchmark Comparison card, ~1024), `src/hooks/useIntelligenceData.ts` (any remaining benchmark source after Task 4).

**Changes:**
- Since no real peer aggregation exists, either (a) gate the entire Benchmark Comparison card behind a feature flag that is OFF by default, or (b) relabel it unambiguously as "Reference targets (not peer data)" AND remove the "beating/lagging vs peers" chevron and any "anonymised aggregate" subtitle.
- Choose (a) gating by flag as the default approach (cleaner: no misleading copy ships) unless the card becomes a meaningful labelled reference view with (b).
- Remove the fabricated subtitle wording in all cases.

**Acceptance:** No "anonymised aggregate data" subtitle or peer-comparison chevron renders for real clinics. Build passes. (Runs after Task 4 which removes `deriveBenchmarks`; account for that.)

---

## Task 7 — LLM never invents figures: deterministic token injection + numeric guard (P0-6)

**Problem:** `coaching-prompts.ts` instructs the model to estimate revenue-at-risk and assert unsourced statistics (~64, 149, 162). `parseNarratives` (~220-231) and `state-of-clinic.ts` (~58) ship the LLM output into emails with no validation that the numbers in the prose match the computed event.

**Files:** `src/lib/intelligence/coaching-prompts.ts`, `src/lib/intelligence/enrich-narratives.ts` (the `parseNarratives` path), `src/lib/intelligence/emails/state-of-clinic.ts`.

**Changes:**
- Remove every instruction that tells the model to estimate/compute money or assert a statistic ("estimate revenue at risk", "be specific about the £", the embedded benchmark stats). Compute all figures in code (they already exist on the event, e.g. `revenueImpact`, `leakedRounded`).
- Inject computed figures as fixed tokens the model must echo verbatim; instruct the model that it may add framing sentences but must not introduce any number not given to it.
- Add a post-generation guard (between `parseNarratives` and the email send): extract every £/%/x-multiple from the narrative; if any number is not present in the event metadata it was given, reject the narrative and fall back to the deterministic event description. Add the guard as a small pure, tested function.
- Validate `interpolate()` inputs: if any required `{placeholder}` for the event type is missing or non-finite, skip enrichment rather than feed the model a prompt with holes.

**Acceptance:** Prompt no longer asks the LLM to invent numbers. A unit test proves the guard rejects a narrative containing a fabricated figure and accepts one whose figures all match the event metadata. Test for the missing-placeholder skip. `npm test` for coaching-prompts + enrich-narratives passes. (Runs after Task 1 which also edits coaching-prompts.ts.)

---

## Task 8 — Clinician fairness: sample-size gate + caseload-normalised naming (P0-7, P0-8)

**Problem:** No minimum sample-size/significance guard exists on any per-clinician detector, so a clinician with 1-2 cases can be named to the owner with invented underperformance (`detect-insight-events.ts:122-208`; the `sampleSize`/`statisticallyRepresentative` fields exist but are unused). `REVENUE_LEAK_DETECTED` (~258-289) names the highest-VOLUME clinician by raw dropout count next to a modelled £ figure, not a caseload-normalised outlier.

**Files:** `src/lib/intelligence/detect-insight-events.ts`. Cross-check `WeeklyStats.statisticallyRepresentative` producer in `src/lib/metrics/compute-weekly.ts`.

**Changes:**
- Gate every per-clinician event behind a minimum denominator (e.g. >= 8 completed appointments OR >= 5 unique patients in the window). Below threshold: suppress the named event (or downgrade to a non-named, cohort-level note). Make the threshold a named constant.
- Set `sampleSize` and `timeframe` on each emitted event, and honour `WeeklyStats.statisticallyRepresentative` where present.
- For `REVENUE_LEAK_DETECTED`: normalise dropout by each clinician's mid-programme caseload; only NAME a clinician when their dropout RATE is a genuine outlier vs the clinic. Otherwise report cohort-level and do not name. Label the £ figure as an estimate with the assumption stated.

**Acceptance:** Unit tests (this file currently has ZERO) prove: a sub-threshold clinician is never named; the leak event names the rate-outlier, not the highest-volume clinician; severity boundaries (0.20 drop / £500 leak / 14 days) hold; the `prevRate > 0` divide-by-zero guard holds; dedup/re-alert-on-worsening works; discharged/never-started exclusion holds. `npm test` passes.

---

## Task 9 — Fix the followUpRate unit confusion that mints fabricated ROI (P0-9)

**Problem:** A sessions-per-patient ratio delta is multiplied as if it were a return probability, fabricating weekly/annual ROI (`detect-value-events.ts:613-640`; `compute-weekly.ts:154`).

**Files:** `src/lib/intelligence/detect-value-events.ts`, `src/lib/metrics/compute-weekly.ts`.

**Changes:**
- Fix the unit contract end to end. Model returning-patient count explicitly: returning patients = (delta in follow-ups booked) and value = returning-patients * session rate. Never multiply a ratio delta by a volume.
- Add a small typed wrapper or clearly-named helper so a sessions-per-patient ratio cannot be passed where a probability/count is expected.

**Acceptance:** Unit test asserts the corrected ROI for a known follow-up booking set, and that a ratio value can no longer flow into the volume multiplication (type or guard). `npm test` for detect-value-events + compute-weekly passes.

---

## Task 10 — Owner digest must not claim "all within target" when there is no data (P0-12)

**Problem:** `notify-owner.ts` (~148-157 → `state-of-clinic.ts:48`) sends "No alerts this week. Your metrics are within target across the board" even when there is no computed data.

**Files:** `src/lib/intelligence/notify-owner.ts`, `src/lib/intelligence/emails/state-of-clinic.ts`.

**Changes:**
- Require `currentStats != null` AND (`events > 0` OR a real stats row exists) before sending. Otherwise return a `no_data` result and SKIP the send.
- Distinguish "zero alerts on real data" (send the reassuring message) from "no data" (skip silently).

**Acceptance:** Unit test: no-data clinic → no email sent (`no_data`); real-data clinic with zero alerts → reassuring email sent. `npm test` for notify-owner passes.

---

## Task 11 — Recipient validation, clinic binding, and audit on every send (P0-13)

**Problem:** Digest/urgent emails containing revenue figures are sent to `ownerEmail` / `clinician.email` read verbatim from a mutable Firestore doc, with no format validation and no recipient-to-clinic binding (`notify-owner.ts:59,125`; `send-clinician-digests.ts:88`).

**Files:** `src/lib/intelligence/notify-owner.ts`, `src/lib/intelligence/send-clinician-digests.ts`. Add one shared helper (e.g. `src/lib/intelligence/resolve-recipient.ts`).

**Changes:**
- Validate RFC email format and reject role/test domains.
- Assert the recipient resolves to a `users/{uid}` belonging to THIS `clinicId` before sending; if it does not, do not send and record the drift.
- Write an audit entry per recipient (collection used elsewhere for audit, e.g. `audit_log`), including clinicId, recipient, event types, timestamp.
- Treat `ownerEmail` that does not match a clinic user as a security event (log + skip), not a silent send.

**Acceptance:** Unit tests: invalid format rejected; recipient not belonging to clinic rejected + drift recorded; valid recipient sends + audit entry written. Tenancy preserved. `npm test` passes.

---

## Task 12 — One tested cron-vs-user authz helper (P0-14)

**Problem:** cron-vs-user authz is duplicated as ad-hoc heuristics across routes ("any Bearer = cron" in `value/route.ts:33`; "GET = cron" in `detect/route.ts:37-39`; similar in the pipeline routes), whose tenant-isolation safety rests on try/catch ordering.

**Files:** new `src/lib/auth/with-cron-or-user.ts` (or alongside the existing auth guard); `src/app/api/intelligence/{detect,digest,clinician-digest,value}/route.ts`; `src/app/api/pipeline/{run,backfill}/route.ts`.

**Changes:**
- Extract one helper `withCronOrUser()` that: verifies the cron secret FIRST (constant-time, fails closed); on cron success, runs the handler in cron mode (may skip clinic scoping); otherwise ALWAYS runs `verifyApiRequest` + `requireRole` + `requireClinic` before the handler. Reuse the existing cron-auth and api-request primitives.
- Replace the four-plus hand-rolled copies with this helper. Do not change route behaviour for legitimate cron or legitimate users; only consolidate and harden.

**Acceptance:** Unit test for the helper: no/invalid cron secret + no user → 401; valid cron → cron mode; valid user → scoped mode; user cannot reach cron-mode bypass. Routes compile and existing route tests pass. `npm test` + `npm run build` pass.

---

## Task 13 — Rate limits and cost ceilings on all intelligence + pipeline routes (P0-15)

**Problem:** Only `/value` is rate-limited. `detect`, `digest`, `clinician-digest`, `pipeline/run`, `pipeline/backfill` have no rate limit or cost ceiling, enabling paid LLM/email cost-amplification and recipient flooding.

**Files:** `src/app/api/intelligence/{detect,digest,clinician-digest}/route.ts`, `src/app/api/pipeline/{run,backfill}/route.ts`. Reuse the existing `checkRateLimitAsync` already used by `value/route.ts:24-30`.

**Changes:**
- Apply `checkRateLimitAsync` to all five routes with tight per-user/per-clinic budgets. Exempt verified cron (via the Task 12 helper).
- Cap `backfill` concurrency and hard-ceiling the number of LLM/email calls per invocation (`backfill/route.ts:54-59`).

**Acceptance:** Unit/integration test that a user over budget is rejected and cron is exempt; backfill respects the concurrency cap. `npm test` + `npm run build` pass. (Runs after Task 12; use its helper for the cron exemption.)

---

## Task 14 — maxDuration + time-boxed, retried LLM calls on cron routes (P0-16)

**Problem:** Cron routes run sequential per-clinic loops with un-timed per-event LLM calls and no `maxDuration`; a single hung call silently truncates the rest of the clinic base (`detect/route.ts`; `coaching-prompts.ts:249-255`).

**Files:** `src/app/api/intelligence/detect/route.ts` (and digest/clinician-digest if they loop with LLM calls), `src/lib/intelligence/coaching-prompts.ts` (the LLM call site ~249-255).

**Changes:**
- Add `export const maxDuration = 300` to the affected cron route(s).
- Time-box each LLM call (AbortController/timeout) and retry once on timeout; on final failure, fall back to the deterministic narrative and CONTINUE the loop (never abort the whole clinic base).
- Record processed-vs-skipped counts in `computeState` (or the existing state doc) so truncation is observable.

**Acceptance:** Unit test: a timing-out LLM call falls back and does not throw out of the loop; processed/skipped counts recorded. `npm run build` passes; `npm test` for affected logic passes.

---

## Task 15 — Gate detect on pipeline completion + pass created events in-memory (P0-17)

**Problem:** No pipeline→detect completion gate (06:00/06:30 with a batched backfill that can exceed the gap) and a fragile 60s/limit-50 event reload that drops events from narrative/Pulse/urgent-email (`vercel.json:8-15`; `detect/route.ts:76-81`).

**Files:** `dashboard/vercel.json`, `src/app/api/intelligence/detect/route.ts`, `src/lib/intelligence/detect-insight-events.ts` (return created docs).

**Changes:**
- Gate `detect` on `computeState.lastFullRecomputeAt` being from today's pipeline run; if not present/stale, skip detection and record a skip (do not run on stale metrics).
- Have `detectInsightEvents` RETURN the created event docs; pass them directly to the narrative/Pulse/urgent-email consumers instead of the 60s `limit(50)` re-query.
- Ensure the pipeline run writes `lastFullRecomputeAt` on success (coordinate with Task 14's state writes).

**Acceptance:** Unit test: detect skips when `lastFullRecomputeAt` is stale; consumers receive the in-memory created events (no re-query drop). `vercel.json` remains valid JSON. `npm test` + `npm run build` pass. (Coordinates with Tasks 8 and 14 which also touch detect.)

---

## Task 16 — Firestore rules for the new collections + green build (P0-18)

**Problem:** `firestore.rules` was deferred for the new `kpis/*`, `insight_events`, and `computeState` collections, and a failing build is referenced (`INTELLIGENCE_REFACTOR_SUMMARY.md:21,44`; `provision-clinic/route.ts:151`).

**Files:** `firestore.rules` (repo root or `dashboard/`), and whatever the failing build referenced.

**Changes:**
- Write least-privilege rules for `kpis/*`, `insight_events`, and `computeState`: reads scoped to authenticated users of the owning clinic; writes restricted to admin/server (cron/service) context, matching the existing rules style for sibling collections.
- Resolve any referenced failing build so `npm run build` is green on this branch.

**Acceptance:** Rules cover the three collections with tenant-scoped reads and server-only writes, consistent with existing rule patterns. `npm run build` is green. If a rules test harness exists, it passes.

---

## Task 17 — Accessibility: real tabpanels + keyboard drill-down (P0-19)

**Problem:** The tablist `aria-controls` points at non-existent tabpanels and clinician drill-down rows are keyboard-inaccessible (`page.tsx:1082-1085, 892-895`).

**Files:** `src/app/intelligence/page.tsx`. Reference the correct pattern in `src/components/intelligence/InsightEventCard.tsx:78-85`.

**Changes:**
- Wrap each active tab's content in an element with `role="tabpanel"` and an `id` matching the tab's `aria-controls`.
- Make the clinician drill-down expand control a real `button` (or add `role="button"` + `tabIndex=0` + `onKeyDown` for Enter/Space), mirroring `InsightEventCard.tsx:78-85`.

**Acceptance:** `aria-controls` ids resolve to real `tabpanel` elements; drill-down is operable by keyboard. `npm run build` passes. (Runs last among page.tsx tasks to avoid churn with Tasks 1, 4, 6.)

---

## Task 18 — Strip em dashes from shipped email subject lines (hard-rule, confirmed)

**Problem:** Real U+2014 em dashes appear in shipped subject lines (`emails/ava-digest.ts:130,157`; `notify-owner.ts:83,199`; `send-clinician-digests.ts:179`), violating the founder hard-rule of no em dashes.

**Files:** `src/lib/intelligence/emails/ava-digest.ts`, `src/lib/intelligence/notify-owner.ts`, `src/lib/intelligence/send-clinician-digests.ts`. Add a tiny shared subject sanitiser (fold into the recipient/subject helper from Task 11 if natural).

**Changes:**
- Replace em dashes (—, U+2014) and en dashes (–, U+2013) in subject construction with a single hyphen or comma as reads best.
- Add a small shared `sanitiseSubject()` that strips CR/LF and control chars and normalises em/en dashes to a hyphen, and route subject construction through it (this also covers the security sub-note about subject-line injection).

**Acceptance:** Grep for U+2014/U+2013 in the three files returns nothing in subject lines. A unit test asserts `sanitiseSubject` normalises a dash and strips a newline. `npm test` passes.

---

## Out of scope (do NOT do here)
- Email palette rework (REFUTED finding; the cream/cloud tokens are canonical brand).
- Any P1 or P2 roadmap item (retry/delivery records, page.tsx decomposition, peer aggregation, outcome intelligence, etc.).
- Anything not listed above.
