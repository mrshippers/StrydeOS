# StrydeOS Product Roadmap

## Current State — v0.3.0 (25 Feb 2026)

| Module | Status | Notes |
|--------|--------|-------|
| Dashboard (KPIs) | Live | Demo data, Firestore-ready |
| Intelligence (Analytics) | Live | Revenue, DNA, referrals, outcomes, reputation |
| Continuity (Comms Engine) | Live | Sequences, send log, patient board |
| Receptionist (Voice AI) | Live (Demo) | Call dashboard, config panel, mock data |
| PMS Layer (WriteUpp) | Built | Adapter, client, mappers, API routes |
| HEP Layer (Physitrack) | Built | Adapter, client, factory |
| Patient Profiles | Live | Timeline, stats, course progress |
| Settings / Onboarding | Live | PMS connection, targets, clinician mgmt |
| Auth (Firebase) | Live | Email/password, role-based, demo mode |
| Stryde Super User | Live | Multi-clinic monitoring |

---

## Next: v0.4.0 — "Real Data at Spires"

Priority: Connect Spires Physiotherapy to live PMS data. Kill the demo banner.

| Task | Priority | Estimate |
|------|----------|----------|
| Deploy to Vercel with production Firebase | P0 | 1 session |
| Configure WriteUpp API key for Spires in production | P0 | 30 min |
| Set up Vercel Cron for 15-min PMS sync | P0 | 1 session |
| Validate real appointment data flowing through metrics engine | P0 | 1 session |
| Connect Physitrack API key for HEP compliance tracking | P1 | 1 session |
| Seed Spires clinicians (Andrew, Max, Jamal) in Firestore | P0 | 30 min |
| Wire n8n webhooks for comms sequences (HEP reminder first) | P1 | 1 session |
| Resend or Twilio for email/SMS delivery | P1 | 1 session |

---

## v0.5.0 — "Comms Go Live"

Priority: First automated patient messages sent from Spires.

| Task | Priority |
|------|----------|
| n8n workflow: post-session HEP reminder (email via Resend) | P0 |
| n8n workflow: rebooking prompt (SMS via Twilio, 72h after session 2+) | P0 |
| n8n workflow: insurance pre-auth collection (email at booking) | P1 |
| n8n workflow: discharge → Google Review prompt (SMS, 48-72h) | P1 |
| Comms pause logic: auto-pause if patient rebooks | P0 |
| Log all sends to Firestore `comms_log` subcollection | P0 |
| Continuity page: switch from demo to real comms data | P0 |

---

## v0.6.0 — "Second PMS + Clinical Governance"

| Task | Priority |
|------|----------|
| Cliniko adapter (REST API integration) | P0 |
| TM3 adapter (developer portal access required) | P1 |
| Outcome measure recording UI (in-session NPRS/PSFS input) | P1 |
| Clinical governance export (PDF report per clinician, per quarter) | P2 |
| NPS survey delivery (post-discharge, via email) | P1 |
| Google Review integration (pull review count + velocity) | P2 |

---

## v0.7.0 — "Receptionist Goes Live"

| Task | Priority |
|------|----------|
| Retell AI integration (voice agent provisioning) | P0 |
| Call routing: forward clinic landline to Retell agent | P0 |
| Booking intent → PMS write-back (new patient flow) | P0 |
| Cancellation recovery flow (rebook attempt before confirm) | P1 |
| No-show outbound call (automated 2h after DNA) | P1 |
| Emergency keyword detection → transfer to on-call | P1 |
| Call recording storage + transcription | P2 |
| Call log → Firestore `call_log` subcollection | P0 |

---

## v1.0.0 — "Launch-Ready for Second Clinic"

| Task | Priority |
|------|----------|
| Multi-tenant onboarding flow (self-serve signup) | P0 |
| Stripe billing integration | P0 |
| White-label branding (logo, colours per clinic) | P1 |
| Mobile-optimised dashboard (owner checks on phone) | P0 |
| RBAC enforcement: clinician sees own data only | P0 |
| Data retention and GDPR compliance audit | P0 |
| Performance testing at 10 concurrent clinics | P1 |
| Landing page + marketing site | P2 |

---

## Beyond v1.0 — Feature Backlog

- **WhatsApp comms channel** (Business API, phase 2 of Continuity)
- **Jane App adapter** (growing UK footprint)
- **Power Diary adapter** (solo/small practice volume)
- **Pabau adapter** (medspa/aesthetics crossover for future vertical)
- **Halaxy adapter** (free tier drives adoption)
- **PhysiApp adapter** (UK-native HEP alternative)
- **Rehab My Patient adapter** (cheaper Physitrack alternative)
- **AI-generated clinician coaching notes** (weekly performance summaries)
- **Predictive churn model** (ML on session gaps + outcome trajectories)
- **Insurance pre-auth automation** (Bupa/AXA/Vitality portal integration)
- **Patient self-booking widget** (embeddable, writes to PMS via StrydeOS)
