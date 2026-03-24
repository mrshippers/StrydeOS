# StrydeOS Changelog

## v0.9.0 — Website Overhaul & i18n Foundation (24 Mar 2026)

### Marketing Website — Next.js Migration & Full Rebuild
- **Vite → Next.js App Router migration** — SEO, SSR, file-system routing, metadata API
- **Hero carousel** — `HeroCarousel.jsx` with animated slide transitions across module showcases
- **Modular pricing banner** — `ModulePricingBanner.jsx` extracted as shared component, used on Ava + module pages
- **Pulse showcase** — Interactive patient board and comms sequence demos on Pulse module page
- **FAQ overhaul** — Categorised accordion with search, nav bar, annual pricing toggle wired up
- **Integrations, OneOS, Pricing sections** — Upgraded layouts with checkout button wiring (trial + buy now → portal.strydeos.com)
- **Architecture diagram** — Editorial split layout replacing pyramid, then cinematic pyramid variant
- **Scroll animations** — Scroll-triggered reveals and typography standardisation across all sections
- **Dashboard showcase** — Compact sparkline version with scroll animations
- **Cookie consent fix** — Decline button now correctly stores "declined" instead of "accepted"

### Dashboard — i18n Foundation
- **next-intl** added — `NextIntlClientProvider` wrapping root layout, locale-aware `<html lang>` tag
- **Messages directory** — `messages/en.json` with type-safe message declarations (`global.d.ts`)
- **i18n config** — `src/i18n/request.ts` for server-side locale resolution
- **TypeScript** — `allowArbitraryExtensions` enabled in tsconfig for `.json` module imports

### Infrastructure
- **Vercel redeploy** — Next.js framework settings configured for website project
- **CI fixes** — Firebase Admin credentials handled during CI build

---

## v0.3.1 — HEP Provider Expansion (Mar 2026)

### New HEP Integrations
- **Wibbi adapter** (formerly Physiotec) — Full implementation with client, adapter, and mappers following existing HEP patterns
- **Rehab My Patient adapter** — Complete integration with API key auth and programme tracking
- Both providers now available in Settings with connection testing and secure API key storage

### Provider UI Improvements
- Added "Recently Added" badges to newly launched integrations: Halaxy, Zanda (Power Diary), Rehab My Patient, and Wibbi
- Updated Settings page HEP provider grid to reflect current integration status
- Removed PhysiApp (patient-facing app, not appropriate for clinic integrations)

### Marketing & Documentation Updates
- Updated website copy to reference Wibbi and Rehab My Patient alongside Physitrack
- Made HEP messaging platform-agnostic ("HEP: guesswork" vs "Physitrack: guesswork")
- Updated security documentation to list all active integration providers
- ROADMAP.md reflects current state: Rehab My Patient and Wibbi marked as "Built"

---

## v0.3.0 — Intelligence, Pulse & Ava (25 Feb 2026)

Three domains: **Intelligence** (analytics), **Pulse** (continuity & comms), **Ava** (voice AI receptionist).

### Intelligence (New)
Revenue analytics, DNA pattern analysis, referral attribution, clinical outcome tracking, and reputation monitoring — delivered as a tabbed analytics workspace replacing the previous module catalogue.

- **Revenue tab** — per-clinician revenue bar chart, revenue by condition with horizontal progress bars, insurance mix percentages
- **DNA Analysis tab** — no-show rate by day of week and by time slot, colour-coded risk thresholds, actionable insight cards
- **Referral Attribution tab** — sortable table: source, type, referred count, conversion rate, total revenue, average course length
- **Outcomes tab** — NPRS and PSFS 90-day trend lines, per-measure improvement cards with directional indicators
- **Reputation tab** — NPS score with promoter/passive/detractor segmentation and monthly trend, Google Review count with velocity chart

### Pulse — Continuity & Comms (New)
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

### Ava — Receptionist (Upgraded)
Transformed from a static empty state into a live call intelligence dashboard with configuration panel. *Ava has been asked to stop ending internal standups with "Is there anything else I can help with?" — she has declined.*

- **Call Dashboard** — today's call count, booking rate, missed calls, average duration
- **7-day volume chart** — bar chart of AI-handled calls per day
- **Live call log** — table: time, patient, phone (masked), duration, clinician, outcome (booked/cancelled/info/missed/transferred)
- **Configuration panel** — voice provider status (ElevenLabs), clinic phone number, operating hours, call handling rules with enabled indicators

### Physitrack / HEP Integration Layer (New)
Abstracted HEP adapter following the same plugin pattern as PMS integrations.

- `HEPAdapter` interface: `testConnection`, `getProgrammes`, `getProgramme`
- Physitrack adapter with REST client, programme mapping, completion percentage tracking
- Factory pattern supporting Physitrack, Rehab My Patient, Wibbi
- `HEPProgramme` type: exercise count, completion %, last access date, deep link support

### Clinician Performance (Enhanced)
- Course completion rate added as a third trend line
- Quick-link buttons to patient view and intelligence deep-dive for selected clinician

### Patient Navigation (Enhanced)
- Patient cards across Pulse and Clinician pages now link to individual patient profiles
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

- Dashboard UI with demo data, stat cards, 90-day rolling trend charts
- Firebase Auth flow with email/password sign-in
- Settings page with onboarding widget
- Sidebar navigation with notification bell
- Clinician view with per-clinician stat cards and trend charts
- Continuity page with active/churn-risk/post-discharge patient columns
- Design system: brand colours, fonts, animations, card styles
- Command palette (Cmd+K)
- Stryde Super User panel with multi-clinic overview
