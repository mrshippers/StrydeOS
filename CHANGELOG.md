# StrydeOS Changelog

All notable changes to StrydeOS integrations and features are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project uses semantic versioning.

---

## [1.3.0] - 2026-03-12

### Added
- **Halaxy PMS Integration** (UK/EU/AU)
  - Self-serve API key access via Halaxy Settings → API Key Manager
  - FHIR-standard REST API (`application/fhir+json`)
  - Full CRUD: appointments, practitioners, patients
  - Auto-region detection (EU/UK vs AU endpoints)
  - Status mapping: `booked`, `fulfilled`, `noshow`, `cancelled`
  - Syncs every 4 hours via cron

- **Zanda (Power Diary) PMS Integration** (UK/AU)
  - Formerly Power Diary, rebranded November 2024
  - Self-serve API key access via Tools → Zanda API Key
  - Read-only beta API (write endpoints in development)
  - Endpoints: clients, appointments, practitioners, locations
  - Explicit n8n support for Pulse sequences
  - Syncs every 4 hours via cron

### Changed
- **Sync frequency increased:** Cron job now runs every 4 hours (previously daily)
  - Reduces data lag from 24h to 4h for Cliniko, Halaxy, Zanda
  - WriteUpp remains real-time via webhook

### PMS Coverage Summary (v1.3.0)
| PMS | Auth | Sync Method | Write Support | UK Market |
|---|---|---|---|---|
| WriteUpp | Bearer token | Real-time webhook + 4h cron | Full CRUD | High |
| Cliniko | HTTP Basic | 4h cron | Full CRUD | Medium |
| Halaxy | Bearer token | 4h cron | Full CRUD | Growing |
| Zanda | API key header | 4h cron | Read-only (beta) | Medium |
| TM3 (Blue Zinc) | — | CSV only | — | High (planned) |
| Jane App | — | CSV only | — | Low (CA/AU) |

---

## [1.2.0] - 2026-03-11

### Added
- **Cliniko PMS Integration** (Global, strong UK via CSP partnership)
  - Self-serve API key access via Cliniko Settings → API Keys
  - HTTP Basic auth (API key as username, `x` as password)
  - Multi-shard support: `au1`, `uk1`, `us1` region detection
  - Full CRUD: individual appointments, practitioners, patients
  - Status derivation from boolean flags (`cancelled_at`, `patient_arrived`, `did_not_arrive`)
  - Daily cron sync (24h lag)

- **CSV Import Enhancement**
  - Cliniko CSV schema with full field mapping
  - Auto-detection from CSV headers
  - Email-to-import ingest address: `import-{clinicId}@ingest.strydeos.com`

### Integrations Available (v1.2.0)
- **PMS:** WriteUpp (real-time), Cliniko (daily), TM3 (CSV), Jane (CSV)
- **HEP:** Physitrack V2 (programme existence only)
- **Voice:** ElevenLabs + Twilio (Ava module)

---

## [1.1.0] - 2026-03-10

### Added
- **WriteUpp Webhook Support** (Real-time sync)
  - `/api/webhooks/writeupp` endpoint for real-time appointment events
  - Mini-pipeline: appointment sync → patient resolve → field computation → comms trigger
  - Targeted 4-week incremental window
  - Shared secret auth via `WRITEUPP_WEBHOOK_SECRET` env var

- **n8n Automation Layer**
  - Pulse SMS sequences: rebooking prompts, HEP reminders, review requests
  - Drop-off risk detection workflow
  - Patient record sync workflow
  - Comms log tracking (`sent`, `failed`, `bounced`)

- **Daily Cron Pipeline** (Vercel)
  - Full 7-stage pipeline runs at 00:00 UTC daily
  - Stages: clinicians → appointments → patients → HEP → patient fields → comms sequences → weekly metrics → reviews
  - Runs for all connected clinics in parallel
  - 4-week incremental window (13-week backfill on manual trigger)

### Integrations Available (v1.1.0)
- **PMS:** WriteUpp (real-time webhook + daily cron), TM3 (CSV), Jane (CSV)
- **HEP:** Physitrack V2 (programme existence only)
- **Voice:** ElevenLabs + Twilio (Ava module)

---

## [1.0.0] - 2026-03-01

### Initial Release

StrydeOS launched with three core modules targeting private physiotherapy practices in the UK.

#### Core Modules
- **Intelligence** (Royal Blue `#1C54F2`) — Clinical performance dashboard
  - 7 validated KPIs: follow-up rate, HEP compliance, programme assignment rate, utilisation, DNA rate, revenue per session, NPS
  - Clinician performance table with coloured badge system
  - Weekly + rolling 90-day windows
  - Real-time metric computation

- **Pulse** (Teal `#0891B2`) — Patient continuity & retention engine
  - Drop-off risk detection
  - Automated SMS sequences via n8n
  - Follow-up tracking (initial assessment → follow-up booking)

- **Ava** (Royal Blue `#1C54F2`) — AI voice receptionist
  - ElevenLabs Conversational AI + Twilio telephony
  - Appointment booking via PMS integration
  - n8n webhook orchestration

#### Initial Integrations (v1.0.0)
- **PMS:** WriteUpp (CSV import only, API adapter scaffolded)
- **HEP:** Physitrack V2 (`/programmes` endpoint — programme existence, no adherence)
- **Auth:** Firebase Auth (owner/clinician roles)
- **Database:** Firestore `europe-west2` (London)
- **Hosting:** Vercel + Firebase Hosting

#### Data Sources
- **Appointments:** WriteUpp CSV exports (manual upload)
- **Clinicians:** WriteUpp CSV exports
- **HEP data:** Physitrack V2 API (`/programmes`)
- **Reviews:** Manual NPS entry (Google Reviews API planned)

#### Dogfood Clinic
- Spires Physiotherapy (West Hampstead, London)
- Live data: 290 appointments, 153 patients, 2 clinicians (Andrew, Max)
- Validated KPIs against real clinic operations

---

## Roadmap

### v1.4.0 (Planned)
- **RehabMyPatient HEP Integration**
  - Self-serve API key access
  - Programme assignment tracking (no adherence data)
  - Webhook support for real-time plan updates
- **Physitrack V2 Adherence Extension**
  - `/clients/{id}/programs/{code}/adherence` — adherence % + session timestamps
  - `/clients/{id}/programs/{code}/proms/{id}/results` — PROM scores (NPRS, PSFS, QuickDASH)
  - Patient-level adherence field in Firestore
- **WriteUpp API Validation**
  - Debug probe endpoint for field name validation
  - Replace triple-alias fallbacks with confirmed field names
  - Remove silent error swallowing in status updates

### v2.0.0 (Future)
- **TM3 (Blue Zinc) API Integration** (UK's dominant legacy PMS)
  - Pending API access / partnership
  - Critical for UK private practice market penetration
- **Pabau PMS Integration** (UK aesthetics/physio)
  - Full CRUD + webhooks
  - 40+ endpoint types (deepest UK PMS API)
- **Outcome Measures Layer**
  - NPRS, PSFS, QuickDASH, ODI, NDI tracking
  - Clinical-to-commercial outcome correlation
- **Multi-tenant Self-serve Onboarding**
  - Public signup flow (currently founder-led pilots only)
  - Automated clinic provisioning
  - Per-seat or per-clinic SaaS pricing

---

## Integration Status Legend

- **Real-time** — Webhook-driven, sub-minute sync
- **4h cron** — Syncs every 4 hours via Vercel cron
- **Daily cron** — Syncs once daily at 00:00 UTC
- **CSV only** — Manual upload or email ingest
- **Full CRUD** — Create, Read, Update, Delete support
- **Read-only** — GET endpoints only, no write operations

---

## Notes

- All PMS API keys stored server-side in Firestore `clinics/{id}/integrations_config/pms` subcollection (never exposed to client)
- All data hosted in `europe-west2` (London) — UK GDPR compliant
- CSV import remains available as fallback for all PMS types
- Webhook endpoints require shared secret validation
- Multi-clinic sync runs in parallel via `Promise.allSettled`
