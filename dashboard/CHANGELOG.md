# StrydeOS Changelog

## v0.3.0 — Intelligence, Continuity Engine & Receptionist (25 Feb 2026)

### Intelligence Deep-Dive (New)
Revenue analytics, DNA pattern analysis, referral attribution, clinical outcome tracking, and reputation monitoring — delivered as a tabbed analytics workspace replacing the previous module catalogue.

- **Revenue tab** — per-clinician revenue bar chart, revenue by condition with horizontal progress bars, insurance mix percentages
- **DNA Analysis tab** — no-show rate by day of week and by time slot, colour-coded risk thresholds, actionable insight cards
- **Referral Attribution tab** — sortable table: source, type, referred count, conversion rate, total revenue, average course length
- **Outcomes tab** — NPRS and PSFS 6-week trend lines, per-measure improvement cards with directional indicators
- **Reputation tab** — NPS score with promoter/passive/detractor segmentation and monthly trend, Google Review count with velocity chart

### Continuity Comms Engine (New)
Patient communication orchestration layer with sequence management and send logging.

- **Comms Sequences view** — all 6 trigger-based sequences (HEP reminder, rebooking prompt, pre-auth collection, discharge review, 90-day and 180-day reactivation) with per-sequence stats: sent, opened, clicked, rebooked
- **Toggle controls** — enable/disable each sequence independently with channel and delay configuration displayed inline
- **Send Log view** — chronological table of all comms sent: patient name, sequence type, channel badge, send time, open status, outcome (rebooked / no action)
- **Summary stats** — total sent, open rate, click rate, rebook conversion rate as stat cards

### Patient Profiles (New)
Individual patient detail pages accessible from any patient list.

- **Route**: `/patients/[id]` — deep-linkable patient profiles
- **Patient header** — avatar, name, treating clinician, insurance/churn/discharge status badges
- **Key stats** — course progress, days since last session, next session, pre-auth status, HEP programme status
- **Visual course progress** — percentage bar with numbered session indicator dots
- **Activity timeline** — chronological feed of sessions, HEP updates, outcome measure recordings, and comms sent

### Receptionist Dashboard (Upgraded)
Transformed from a static empty state into a live call intelligence dashboard with configuration panel.

- **Call Dashboard** — today's call count, booking rate, missed calls, average duration
- **7-day volume chart** — bar chart of AI-handled calls per day
- **Live call log** — table: time, patient, phone (masked), duration, clinician, outcome (booked/cancelled/info/missed/transferred)
- **Configuration panel** — voice provider status (Retell AI), clinic phone number, operating hours, call handling rules with enabled indicators

### Physitrack / HEP Integration Layer (New)
Abstracted HEP adapter following the same plugin pattern as PMS integrations.

- `HEPAdapter` interface: `testConnection`, `getProgrammes`, `getProgramme`
- Physitrack adapter with REST client, programme mapping, completion percentage tracking
- Factory pattern supporting Physitrack, PhysiApp, Rehab My Patient, Physiotec
- `HEPProgramme` type: exercise count, completion %, last access date, deep link support

### Clinician Performance (Enhanced)
- Course completion rate added as a third trend line
- Quick-link buttons to patient view and intelligence deep-dive for selected clinician

### Patient Navigation (Enhanced)
- Patient cards across Continuity and Clinician pages now link to individual patient profiles
- Send Reminder button preserved with click propagation handling

---

## v0.2.0 — Sprint 1 Foundation (25 Feb 2026)

### Data Architecture
- Expanded type system: `Appointment`, `OutcomeScore`, `CommsLogEntry`, `Review`, `CallLog` with full field definitions
- `ClinicProfile` type extended: `pmsLastSyncAt`, `FeatureFlags`, `ClinicTargets`, `BrandConfig`, `OnboardingState`
- PMS types: `PMSAppointment`, `PMSPatient`, `PMSClinician`, `PMSAdapter` interface, status mapping

### PMS Integration Layer
- Abstraction layer at `lib/integrations/pms/` with provider-agnostic interface
- WriteUpp adapter: REST client, appointment/clinician mappers, status mapping (Confirmed/Attended/DNA/Cancelled/Late Cancel)
- Factory pattern for multi-PMS support (WriteUpp active, Cliniko/TM3 stubs)

### API Routes
- `POST /api/pms/test-connection` — validates PMS API key server-side
- `POST /api/pms/save-config` — stores encrypted config in Firestore `integrations_config` subcollection
- `POST /api/pms/sync` — pulls appointments/clinicians from PMS, writes to Firestore
- `POST /api/pms/disconnect` — removes PMS config and resets onboarding state
- `POST /api/metrics/compute` — computes weekly stats from appointment data

### Firebase Admin & Auth
- `firebase-admin.ts` — server-side SDK with service account initialisation
- `auth-guard.ts` — JWT verification middleware for API routes
- Firestore security rules for multi-tenant clinic isolation

### Metrics Engine
- `compute-weekly.ts` — calculates follow-up rate, HEP compliance, utilisation, DNA rate, course completion, revenue per session from raw appointment data

### Dashboard & Settings
- Demo data: Andrew (1.9 → 2.5), Max (2.9 → 3.4), Jamal (3.2 → 3.4) trajectories
- Settings page: clinic config, KPI targets, PMS connection UI, clinician management, onboarding checklist
- Alert system: automatic flags when metrics drift below configurable thresholds

---

## v0.1.0 — Sprint 0 (Initial Build)

- Dashboard UI with demo data, stat cards, 6-week trend charts
- Firebase Auth flow with email/password sign-in
- Settings page with onboarding widget
- Sidebar navigation with notification bell
- Clinician view with per-clinician stat cards and trend charts
- Continuity page with active/churn-risk/post-discharge patient columns
- Design system: brand colours, fonts, animations, card styles
- Command palette (Cmd+K)
- Stryde Super User panel with multi-clinic overview
