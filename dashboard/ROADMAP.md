# StrydeOS Product Roadmap

Three product domains: **Ava** (voice AI receptionist), **Intelligence** (analytics), **Pulse** (continuity & comms).

## Current State — v0.10.0 (26 Mar 2026)


| Module                          | Status      | Notes                                                        |
| ------------------------------- | ----------- | ------------------------------------------------------------ |
| Dashboard (KPIs)                | Live        | 7 core KPIs, context-aware greeting, daily snapshot          |
| **Intelligence** (Analytics)    | Live        | Insight engine, event detection, email digest, InsightBanner  |
| **Pulse** (Continuity / Comms)  | Live        | Risk scoring, lifecycle states, sequences, Heidi complexity   |
| **Ava** (Voice AI Receptionist) | Live        | ElevenLabs + Twilio, knowledge base editor, core prompt      |
| PMS Layer (WriteUpp)            | Live        | Real Spires data flowing                                     |
| PMS Layer (Cliniko)             | Built       | Adapter, client, mappers                                     |
| PMS Layer (Halaxy)              | Built       | Adapter, client, mappers                                     |
| PMS Layer (Zanda/Power Diary)   | Built       | Adapter, client, mappers                                     |
| HEP Layer (Physitrack)          | Live        | Real data at Spires                                          |
| HEP Layer (Rehab My Patient)    | Built       | Adapter, client, mappers                                     |
| HEP Layer (Wibbi)               | Pending     | Auth model needs rework                                      |
| Heidi Health                    | Built       | REST client, JWT auth, complexity signals, clinical notes     |
| Patient Profiles                | Live        | Timeline, risk factors, complexity panel, clinical notes      |
| Billing (Stripe)                | Live        | Seat limits, tier gates, checkout flow                        |
| Auth (Firebase)                 | Live        | 4-tier RBAC, MFA, demo mode, enterprise role enforcement      |
| RBAC                            | **Live**    | **Enterprise RBAC: superadmin > owner > admin > clinician**   |
| Account Setup Widget            | **Live**    | **5-step onboarding checklist, floating top-right UI**        |
| Invite Guard                    | **Live**    | **Prevents duplicate clinic creation for invited clinicians** |
| Status Page                     | Live        | 17 services, live health checks, 30-day uptime bars           |
| API Docs                        | Live        | 37+ endpoints, dual-view (business + developer)              |
| GDPR / Compliance               | Live        | Cookie consent, SAR templates, security audit checklist       |
| Marketing Website               | Live        | Next.js App Router, all module pages, pricing, checkout wiring |
| i18n (Dashboard)                | Foundation  | next-intl wired, en.json messages, locale-aware layout        |
| Stryde Super User               | Live        | Multi-clinic monitoring                                      |


---

## Shipped This Session (26 Mar 2026)

| Feature                                        | What it does                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| **Account Setup Widget (1/5)**                 | Floating top-right checklist: profile, clinic details, PMS, clinicians, KPIs |
| **Enterprise RBAC enforcement**                | 4-tier role hierarchy enforced across all pages, sidebar, API routes          |
| **Clinician-scoped Settings**                  | Clinicians see only password + MFA; all admin sections hidden                |
| **Billing access removed for clinicians**      | Page redirect + all CTAs/links/commands stripped from clinician view          |
| **Invited user signup guard**                  | Prevents duplicate clinic creation when invited clinician tries to sign up   |
| **AuthGuard pathname fix**                     | Exact path matching prevents `/loginx` bypass                                |
| **`/api/comms/send` role guard**               | Added missing requireRole — clinicians can't trigger comms sequences         |
| **Onboarding/Checkout/API Docs guards**        | All redirect clinicians to /dashboard                                        |
| **Clinic-wide data propagation verified**      | featureFlags, modules, targets sync to all users via onSnapshot              |


---

## Shipped Previously (22–24 Mar 2026)

| Feature                                  | What it does                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| **Website → Next.js App Router**         | Full Vite→Next.js migration with SSR, SEO metadata, file-system routing   |
| **Hero Carousel**                        | Animated slide transitions across module showcases (Ava page)             |
| **Modular Pricing Banner**               | Shared `ModulePricingBanner` component used across all module pages        |
| **Pulse Showcase**                       | Interactive patient board + comms sequence demos on Pulse page             |
| **FAQ Overhaul**                         | Categorised accordion, search, nav, annual pricing toggle                  |
| **Checkout Wiring**                      | Pricing cards + Full Stack CTA → portal.strydeos.com checkout flow         |
| **Scroll Animations**                    | Scroll-triggered reveals + typography standardisation sitewide             |
| **Dashboard i18n Foundation**            | next-intl, en.json messages, locale-aware layout, type-safe declarations   |
| Ava → ElevenLabs + Twilio migration      | Ripped out Retell AI, voice stack now ElevenLabs Conversational AI + SIP  |
| Ava Knowledge Base System                | CRUD editor, Firestore persistence, category suggestions, premium UI     |
| Context-aware Dashboard Greeting         | Subtext driven by real KPIs (DNA spikes, churn clusters, revenue drops)   |
| Greeting Personality Pools               | 4 randomised variants per time-of-day slot, not robotic                   |
| Intelligence Insight Engine              | Event detection, ranking, email notifications, InsightBanner on dashboard |
| Notification Bell Filtering              | Bell only shows critical/warning — no positive noise                      |
| Heidi Clinical Complexity Layer          | ComplexityIndicators, ComplexityPanel, ClinicalNotesPanel in Pulse        |
| High-fidelity Sidebar Motion             | Sequenced Framer Motion: fade→width, scale+blur crossfade, glow strip    |
| Demo Mode Overhaul                       | 5 rotational scenarios, realistic numbers, no welcome flash               |
| Password Visibility Toggle              | Show/hide on sign-in and sign-up                                         |
| Live Status Page                         | 17 services pinged in parallel, latency, auto-refresh                    |
| API Docs Page                            | 37 endpoints, searchable, responsive, sidebar link                       |
| Dark Mode Contrast Pass                  | WCAG AA fixes across tooltips, badges, overlays, charts                  |
| Error Boundary                           | Global error.tsx recovery UI                                             |
| CI/CD Fixes                              | TS errors, ESLint downgrade, Firebase Admin env handling in CI            |
| Owner Billing Bypass                     | Owners skip all module billing gates                                     |
| Pre-commit Hook                          | Secret detection before commit                                           |
| Firestore Rules + Indexes                | user_preferences, sequence_definitions, comms_log attribution            |
| Cookie Consent Fix                       | Decline button now stores "declined" correctly                            |


---

## Next: Dynamic Stryde Updates

A living intelligence layer that proactively surfaces what matters — the dashboard greeting was step one.

| Feature                                      | Priority | Description                                                                                   |
| -------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| **Dynamic greeting engine** (shipped)        | Done     | Waterfall rules: DNA spikes, churn clusters, revenue drops, utilisation, unread insights       |
| **Stryde Daily Briefing**                    | P0       | Morning push notification / email — top 3 things the owner needs to know today                |
| **Stryde Weekly Digest**                     | P0       | Automated Sunday email — week-over-week KPI deltas, clinician highlights, churn-risk list     |
| **Contextual stat card insights**            | P1       | Each KPI card shows a one-liner explaining *why* the number moved (not just *what* it is)     |
| **Clinician-specific nudges**                | P1       | Per-clinician subtext: "Andrew's follow-up rate dropped 20% — 3 patients didn't rebook"       |
| **Owner action queue**                       | P2       | A prioritised list of 3-5 things the owner should do this week, generated from KPI data       |
| **Stryde Copilot (future)**                  | P3       | Natural language: "Why is my DNA rate up?" → data-backed answer with linked patients           |


---

## Next: v0.9.0 — "Second Clinic Onboarding"

Priority: Prove StrydeOS works at a clinic that isn't Spires.

| Task                                                       | Priority |
| ---------------------------------------------------------- | -------- |
| Multi-tenant self-serve onboarding (signup → connect PMS)  | P0       |
| TM3 (Blue Zinc) adapter — dominant legacy UK physio PMS    | P0       |
| Onboarding wizard: PMS selection, API key entry, first sync | P0       |
| Clinician auto-detection from PMS data                     | P1       |
| Welcome email sequence for new clinics                     | P1       |
| Pabau adapter (medspa/aesthetics crossover)                | P2       |


---

## v1.0.0 — "Launch-Ready"

| Task                                               | Priority |
| -------------------------------------------------- | -------- |
| White-label branding (logo, colours per clinic)    | P1       |
| Mobile-optimised dashboard (owner checks on phone) | P0       |
| Performance testing at 10 concurrent clinics       | P1       |
| GDPR data retention audit + auto-purge             | P0       |
| Pitch deck + sales motion (stakeholder triangle)   | P0       |
| Outcome measures (NPRS, PSFS, QuickDASH, ODI, NDI) | P1       |


---

## Beyond v1.0 — Feature Backlog

- **WhatsApp comms channel** (Business API, phase 2 of Pulse)
- **Jane App adapter** (growing UK footprint)
- **Vapify white-label layer** (wraps ElevenLabs at reseller phase)
- **AI-generated clinician coaching notes** (weekly performance summaries)
- **Predictive churn model** (ML on session gaps + outcome trajectories)
- **Insurance pre-auth automation** (Bupa/AXA/Vitality portal integration)
- **Patient self-booking widget** (embeddable, writes to PMS via StrydeOS)
- **Stryde Copilot** (natural language clinic intelligence)
