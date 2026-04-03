# Settings Page Refactor Plan

Current: 2,368 LOC in `page.tsx`
Target: <400 LOC in `page.tsx` (orchestration only)

## Already Extracted (in `_components/`)
- ClinicDetailsCard.tsx
- HeidiConnectionCard.tsx
- HepIntegrationCard.tsx
- RetriggerTourButton.tsx
- SecurityCard.tsx
- TargetsCard.tsx
- TeamManagementCard.tsx

## To Extract

### 1. ProfileCard (~170 LOC, lines 1223-1390)
- User profile editing (name, avatar, initials)
- Self-contained state: firstName, lastName, saving
- Props: user, onSave callback

### 2. PmsIntegrationCard (~500 LOC, lines ~1395-1900)
- PMS provider selection, API key input, test connection, sync trigger
- State: pmsProvider, pmsApiKey, pmsBaseUrl, connectionStatus
- Props: clinicId, currentConfig

### 3. CsvImportCard (~300 LOC, lines ~1677-2000)
- CSV file upload, schema detection, field mapping, import trigger
- State: file, schema, fieldMap, importing
- Props: clinicId

### 4. NotificationPreferencesCard (~200 LOC, lines ~2000-2200)
- Digest opt-in/out, alert thresholds
- State: digestEnabled, alertThresholds
- Props: clinicId, currentPrefs

### 5. BillingCard (~150 LOC, lines ~2200-2365)
- Current plan display, manage subscription link
- Props: subscription data

## Extraction Order
1. ProfileCard (simplest, self-contained)
2. PmsIntegrationCard (largest, most state)
3. CsvImportCard (complex but isolated)
4. NotificationPreferencesCard
5. BillingCard

## Rules
- Each card receives only the props it needs
- State that crosses cards stays in page.tsx
- Toast notifications passed as prop or via context
- Auth/role checks stay in page.tsx gate
