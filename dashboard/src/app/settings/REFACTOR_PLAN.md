# Settings Page Refactor Plan

> Last updated: 2026-05-01
> Started: 2025 (file was 2,368 LOC)
> Goal: Reduce `page.tsx` to <400 LOC of orchestration only.

## Current State

`page.tsx`: **2,307 LOC** (down from peak ~2,587 LOC).
Reduction this round: 280 LOC out, plus a 718-LOC `types/index.ts` split into 13 domain files.

## Already Extracted (in `_components/`)

- `ProfileCard.tsx` (just landed)
- `SecurityCard.tsx`
- `ClinicDetailsCard.tsx`
- `TargetsCard.tsx`
- `TeamManagementCard.tsx`
- `GoogleReviewsCard.tsx`
- `HepIntegrationCard.tsx` (just wired up — was extracted but unused)
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

### Phase A — PmsIntegrationCard (BIGGEST WIN)

The PMS Connection wrapper currently contains six interleaved subsystems inside one `<div>`:

1. PMS provider selection grid (`PMS_PROVIDERS` const + visual selector)
2. API key input + Test Connection + Save flow
3. Connected status display (sync, disconnect)
4. CSV Bridge fallback (for non-API providers like WriteUpp)
5. CSV Import Panel (collapsible, inside the wrapper)
6. Onboarding Wizard (step 0–4 modal)
7. Column Mapping screen (Phase 2 of CSV import)
8. Email Ingest Address card (Phase 3)
9. Import History card (Phase 4 — actually a sibling to the wrapper)

**Decision: extract as one file** (`PmsIntegrationCard.tsx`, ~700–730 LOC). It's a single bounded context (PMS data ingestion) with deep state entanglement. Splitting further is Phase B.

**Lifted state** (parent retains, passes via props):
- `pmsProvider`, `pmsApiKey`, `pmsConnected`, `pmsTesting`, `syncRunning`, `syncResult`, `pmsTestFailed`, `requestingAssist`, `assistRequested`, `importPanelOpen`
- `mappingHeaders`, `mappingSampleRows`, `mappingFile`, `mappingFileType`, `mappingValues`, `mappingSaving`, `mappingSchemaName`
- `importHistory`, `expandedHistoryId`, `historyLoading`, `historyLoaded`
- `ingestCopied`
- `wizardOpen`, `wizardStep`, `wizardPms`, `wizardGuide`, `wizardGuideLoading`, `tm3Platform`

**Lifted handlers**: `handleTestPmsConnection`, `handleDisconnectPms`, `handleSyncNow`, `handleImportCSV`, `handleSchemaMapping`, `handleApplyMapping`, `loadImportHistory`, `loadOnboardingGuide`.

**PMS-specific consts to move into the file**: `PMS_PROVIDERS`, `PmsProviderOption`, `ImportHistoryRecord`, `ONBOARDING_PMS_OPTIONS`.

**Out of scope** for this extraction: don't touch any API endpoint code (`/api/pms/*`, `/api/hep/*`), don't change Firestore queries, don't refactor the actual data flow — pure visual/state move.

**Verification**: `npx tsc --noEmit` must exit 0. Manual smoke test: visit `/settings`, attempt PMS connect with a test key, confirm form still renders and `pmsConnected` toggles correctly.

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
