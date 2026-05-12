# Settings Page Refactor Plan

> Last updated: 2026-05-12
> Started: 2025 (file was 2,368 LOC)
> Goal: Reduce `page.tsx` to <400 LOC of orchestration only.

## Current State

`page.tsx`: **977 LOC** (down from peak ~2,587 LOC, was 2,269 before Phase A).
Phase A landed: 1,277 LOC moved out into `PmsIntegrationCard.tsx` (self-contained,
~1,160 LOC including `ImportHistoryRow`).

## Already Extracted (in `_components/`)

- `ProfileCard.tsx`
- `SecurityCard.tsx`
- `ClinicDetailsCard.tsx`
- `TargetsCard.tsx`
- `TeamManagementCard.tsx`
- `GoogleReviewsCard.tsx`
- `HepIntegrationCard.tsx`
- `OnboardingChecklist.tsx`
- `PmsIntegrationCard.tsx` (Phase A just landed — self-contained, takes only `cp` prop)
- `ClinicianHeidiToggle.tsx`
- `SeatLimitModal.tsx`
- `RetriggerTourButton.tsx` (file exists but `page.tsx` still has the inline duplicate — see Phase D)

## Pattern

Three patterns in use, pick the simplest that fits:

- **Self-contained** (zero props): uses `useAuth()` + `useToast()` directly. Examples: `ProfileCard`, `SecurityCard`. Use when the card owns its full lifecycle.
- **State-lifted** (props): parent owns state, passes setters. Example: `HepIntegrationCard`. Use when state is shared with other parts of the page (onboarding tracking, save buttons elsewhere).
- **Configured** (config props): parent passes data, child renders. Example: `SeatLimitModal`.

## Plan Was Out Of Date

Previous plan listed `NotificationPreferencesCard` and `BillingCard` as targets. Both are wrong:

- **NotificationPreferences**: never built, no references in current `page.tsx`.
- **Billing**: lives at `/billing` as its own route, not in settings.

These are dropped from the plan.

## Remaining Phases (smallest risk first)

### Phase A — PmsIntegrationCard ✅ DONE (2026-05-12)

**Decision taken: self-contained pattern, not state-lifted.** Card receives only
`cp: ClinicProfile | null` and pulls `useAuth` / `useToast` internally. All 28
PMS state items, all 9 handlers, the `PMS_PROVIDERS` / `ONBOARDING_PMS_OPTIONS`
/ `CANONICAL_FIELD_OPTIONS` / `REQUIRED_APPT_FIELDS` constants, the
`PmsProviderOption` / `ImportHistoryRecord` / `OnboardingGuide` interfaces,
the `ProviderLogo` helper, and the `ImportHistoryRow` sub-component all moved
into `PmsIntegrationCard.tsx`. Result: `page.tsx` 2,269 → 977 LOC.

Trade-off: card is ~1,160 LOC (bigger than the plan's 700-LOC estimate) because
nothing was kept lifted in the parent. Parent shrinks more than the plan
anticipated. Net total LOC similar; parent is now simpler.

Architectural alignment (per cross-module contracts landed in 89fd95e / 600a4f7 /
8f7dc64):
- PMS is **not** a Stryde module (`MODULES = ['ava','intelligence','pulse']`)
  so the card does **not** register `ModuleHealth` and does **not** emit
  `StrydeEvent`s. PMS keeps its existing `integration_health` collection.
- Card touches no `/api/pms/*` server code — pure visual/state move.
- Card imports types from `@/types` and `@/lib/csv-import/*` as before; no
  switch to `@/lib/contracts` because PMS adapter types aren't surfaced there
  yet (deferred — would be Phase E).

**Verification done**: `npx tsc --noEmit` exit 0, `npm run lint` 0 errors,
dashboard dev server hot-reloads cleanly.

### Phase B — Sub-divide PmsIntegrationCard

After Phase A produces a 700+ LOC card, split it internally:

- `CsvImportPanel.tsx`
- `OnboardingWizard.tsx`
- `ColumnMapping.tsx`
- `EmailIngest.tsx`
- `ImportHistory.tsx`

Needs a fresh look once Phase A lands. State boundaries become clearer once the card is its own module.

### Phase C — Onboarding Checklist

`page.tsx` lines ~1378–1446. Self-contained UI (renders 3 checklist items based on `onboarding.pmsConnected/cliniciansConfirmed/targetsSet`). Easy ~70-LOC extraction.

### Phase D — Cleanup of Inline Duplicates

These components have already been extracted to `_components/` but `page.tsx` still defines inline duplicates:

- `RetriggerTourButton` (inline at ~line 169)
- `HeidiConnectionCard` (inline at ~line 236, currently used in "Compatible Data Sources" section)
- `ProviderLogo` helper (inline ~line 157, used by both PMS and HEP — can move to a shared util)

Either remove the inline versions and import from `_components/`, or delete the unused `_components/` files if the inline is canonical. Pick one and reconcile.

## Out Of Scope (don't touch)

- Firebase logic, auth, routing (CLAUDE.md hard-stop)
- Existing PMS API call code (just move it, don't change it)
- Real-time listener architecture
- Firestore security rules
- The behaviour of any save / sync / connect flow — preserve verbatim
