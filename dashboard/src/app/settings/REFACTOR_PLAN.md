# Settings Page Refactor Plan

> Last updated: 2026-05-12
> Started: 2025 (file was 2,368 LOC)
> Goal: Reduce `page.tsx` to <400 LOC of orchestration only.

## Current State

`page.tsx`: **668 LOC** (down from peak ~2,587 LOC). Still above the <400 target;
remaining bulk is `SettingsPage` orchestration of clinic profile state + team
management glue + Stripe seat-limit checkout flow.

Phase A → B → D landed in one session (2026-05-12). Net reduction this session:
~1,600 LOC moved out of `page.tsx` into 6 new sub-components + 1 shared helper.

## Already Extracted (in `_components/`)

Top-level cards:
- `ProfileCard.tsx`, `SecurityCard.tsx`, `ClinicDetailsCard.tsx`, `TargetsCard.tsx`
- `TeamManagementCard.tsx`, `GoogleReviewsCard.tsx`, `HepIntegrationCard.tsx`
- `OnboardingChecklist.tsx`, `HeidiConnectionCard.tsx`, `RetriggerTourButton.tsx`
- `ClinicianHeidiToggle.tsx`, `SeatLimitModal.tsx`
- `PmsIntegrationCard.tsx` (624 LOC parent, holds connection card + handlers + lifted state)
- `ProviderLogo.tsx` (20 LOC shared helper)

PMS sub-components (in `_components/pms/`):
- `CsvImportPanel.tsx` (189 LOC) — collapsible AnimatePresence wrapper
- `OnboardingWizard.tsx` (308 LOC) — 5-step setup modal with TM3-specific branch
- `ColumnMapping.tsx` (192 LOC) — manual CSV column mapping screen
- `EmailIngest.tsx` (79 LOC) — copy-to-clipboard import address (full + compact variants)
- `ImportHistory.tsx` (169 LOC) — history list + `ImportHistoryRow`, exports `ImportHistoryRecord`

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

### Phase B — Sub-divide PmsIntegrationCard ✅ DONE (2026-05-12)

PmsIntegrationCard reduced 1,331 → 624 LOC by lifting five children into
`_components/pms/`. Parent keeps the PMS Connection panel (provider grid, API
key input, connected state, CSV bridge card), all I/O handlers, and lifted
state that crosses child boundaries (`csvUploading`, `csvResult`, mapping
trigger state, import history, wizard open/step/pms). Children own pure UI
interaction state.

`ProviderLogo` extracted to `_components/ProviderLogo.tsx` (shared by parent +
OnboardingWizard). `ImportHistoryRecord` is exported from `ImportHistory.tsx`
and consumed by the parent — kept out of `@/lib/contracts` since it's a UI
projection of the `/api/pms/import-history` response, not a cross-module event
type.

Architectural review (system-architect) confirmed: no `PII_FIELD_MAP` changes,
no `ModuleHealth` registration, no `StrydeEvent` emission. CSV uploads are an
ingestion pipeline; PHI/PII classification happens server-side in the
`appointments`/`patients` collection writers, not at the UI boundary.

### Phase C — OnboardingChecklist ✅ DONE earlier this session

Extracted in commit `ae6ab5e` before Phase A. Self-contained, takes 3 boolean
props (`pmsConnected`, `cliniciansConfirmed`, `targetsSet`).

### Phase D — Inline duplicate cleanup ✅ DONE (2026-05-12)

- `RetriggerTourButton` inline definition was **byte-identical** to
  `_components/RetriggerTourButton.tsx`. Deleted inline, kept the extracted
  file, added import. No logic merge required.
- `HeidiConnectionCard` extracted from inline (~250 LOC in `page.tsx`) to
  `_components/HeidiConnectionCard.tsx` (254 LOC). Self-contained, pulls
  `useAuth()`/`useToast()` internally. Touches `clinical_notes` (PHI) only via
  authenticated `/api/heidi/*` routes — PHI never enters component state. No
  ModuleHealth or contract types needed (Heidi is enrichment, not a Stryde
  module per `MODULES = ['ava','intelligence','pulse']`).
- `ProviderLogo` was extracted as part of Phase B (see above).

## Remaining work

`page.tsx` is now 668 LOC. To reach the <400 target, the remaining bulk is the
SettingsPage orchestrator itself:
- Clinic profile state + `handleSaveProfile` + `handleSaveWithOnboarding` (~120 LOC)
- Team management state + handlers + the seat-limit/extra-seat flow (~140 LOC)
- The unsaved-changes dialog JSX (~50 LOC)

These were not in the original plan as discrete phases. They're orchestration
code by design — pulling them into hooks (e.g. `useClinicProfileForm`,
`useTeamManagement`) is a different style of refactor than the
component-extraction work above. Worth treating as a future phase if 668 LOC
proves hard to navigate.

## Out Of Scope (don't touch)

- Firebase logic, auth, routing (CLAUDE.md hard-stop)
- Existing PMS API call code (just move it, don't change it)
- Real-time listener architecture
- Firestore security rules
- The behaviour of any save / sync / connect flow — preserve verbatim
