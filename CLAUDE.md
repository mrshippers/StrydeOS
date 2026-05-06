# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Claude Code operating instructions for the StrydeOS codebase.
> Read this before touching anything.

---

## Repository Layout

This is a **multi-workspace monorepo** with no root package manager workspace config — each app installs its own deps.

| Path | What it is | Stack |
|---|---|---|
| `dashboard/` | **Primary app.** The clinical dashboard (Intelligence/Pulse/Ava modules). All product code lives here. | Next.js 15 (App Router) + React 19 + Tailwind 4 + Firebase + Stripe + Sentry + next-intl |
| `dashboard/functions/` | Firebase Cloud Functions (separate `package.json`, deploys via `firebase deploy --only functions`) | TypeScript + firebase-functions v6 |
| `website/` | Marketing site (`strydeos.com`) — separate Next.js app, no Firebase coupling | Next.js 15 + React 19 |
| `ava_graph/` | Python FastAPI service for the Ava voice booking agent | FastAPI + LangGraph + LangChain |
| `scripts/` | Repo-root demo recording (Playwright), MCP shim. Not the same as `dashboard/scripts/`. | TypeScript / Python |
| `Marketing Material/` | Brand assets, logo SVGs, identity sheet | — |
| `docs/` | Audits, refactor plans, technical whitepaper, DPA register | Markdown / HTML |

**`dashboard/` is where ~95% of work happens.** Always `cd dashboard` before running app commands. The root `package.json` is a thin shell (only contains the demo seed script + Playwright for the production demo recorder).

---

## Commands

All commands run from `dashboard/` unless noted.

### Dev

```bash
cd dashboard
npm install
npm run dev            # next dev — http://localhost:3000
npm run dev:mobile     # binds 0.0.0.0 for LAN testing on a phone
```

### Lint, type-check, tests

```bash
npm run lint                 # eslint src
npx tsc --noEmit             # type-check (CI runs this)
npm test                     # vitest run — unit tests in src/**/__tests__/**/*.test.ts
npx vitest <file>            # run a single test file
npx vitest -t "test name"    # run a single test by name

npm run check:boundaries     # SPARC module boundary check (Intelligence ↔ Pulse) — see "Module Boundaries"

npm run test:e2e             # Playwright (requires built app: npm run build first, OR pre-running server with E2E_NO_SERVER=1)
npm run test:e2e:ui          # Playwright UI mode
npm run test:e2e:full        # build + test (full CI-style run)
npx playwright test e2e/signup-flow.spec.ts   # single E2E spec
```

### Build / production

```bash
npm run build                # next build
npm run analyze              # ANALYZE=true next build (bundle analyzer)
npm run start                # next start (uses prebuilt output)
```

### Firebase / Stripe / data scripts

Many one-shot scripts under `dashboard/scripts/` are runnable via `npx tsx`. Notable npm aliases:

```bash
npm run seed:production       # seed Spires clinic + users into prod Firestore (needs FIREBASE_* admin creds)
npm run seed:clinic           # seed a generic clinic
npm run setup:superadmin      # create superadmin user
npm run promote:superadmin    # elevate existing user
npm run send:test-sms         # smoke-test Twilio path
```

### Python (`ava_graph/`)

```bash
# from repo root
pytest                                                # all Python tests (config in pytest.ini, asyncio_mode=auto)
pytest ava_graph/tests/test_graph_builder.py          # single file
python -m ava_graph.main                              # run the FastAPI app on $HOST:$PORT (default 0.0.0.0:8000)
```

### Firebase Functions

```bash
cd dashboard/functions
npm run build                # tsc
npm run serve                # build + emulators
npm run deploy               # firebase deploy --only functions
```

### Firestore rules

Rules live in `dashboard/firestore.rules`. Deploy with:

```bash
cd dashboard
firebase deploy --only firestore:rules
```

Update `firestore.indexes.json` whenever a new query pattern needs a composite index, then `firebase deploy --only firestore:indexes`.

---

## CI Pipeline

`.github/workflows/ci.yml` runs on every PR to `main`. The dashboard job runs, in order:

1. `npm ci`
2. `npm run lint`
3. `npm run check:boundaries`  ← module-boundary script
4. `npx tsc --noEmit`
5. `npm test`  (vitest)
6. `npm run build` (with placeholder Firebase env vars)
7. Bundle size report into the workflow summary

The `website` job builds the marketing site separately. **A failing `check:boundaries` blocks merge** — never bypass it; restructure the offending code to use the events bus.

---

## Pre-commit secret scanner

A custom hook in `.githooks/pre-commit` blocks commits containing API key patterns (`sk_live_*`, `whsec_*`, `re_*`, Firebase private keys, Twilio/Retell/ElevenLabs/Stripe/Resend/n8n secrets). Activate once per clone:

```bash
git config core.hooksPath .githooks
```

If you genuinely hit a false positive, `git commit --no-verify`. Don't disable the hook.

---

## High-Level Architecture

### Authentication — four layers, not one

Auth is **defense-in-depth across four layers**. Every protected route must pass through all four. Don't try to centralise into one — that's intentional.

1. **Middleware (`src/middleware.ts`)** — gates page routes. Reads the `__session` cookie (HMAC-signed via `verifySession`), redirects unauthenticated users to `/login?next=...`, and sets security headers (CSP, HSTS, X-Frame-Options, etc.). API routes are **excluded** from the middleware matcher — they auth via Bearer token instead.
2. **`AuthGuard` component** — client-side redirect for role/clinic mismatches.
3. **API routes (`src/lib/auth-guard.ts`)** — `verifyApiRequest()` validates the Firebase ID token, loads `users/{uid}` from Firestore, checks `sessionVersion` (token revocation on password change), and returns `VerifiedUser { uid, email, clinicId, clinicianId, role }`. Pair with `requireRole(user, [...])` and `requireClinic(user, clinicId)` in every route handler. Wrap success responses with `withClinicId(res, user.clinicId)` so the request logger captures it. Use `verifyCronRequest()` for Vercel Cron endpoints (timing-safe HMAC compare against `CRON_SECRET`).
4. **Firestore security rules (`firestore.rules`)** — final backstop. Role and clinic isolation enforced server-side at the DB.

**Role hierarchy:** `superadmin > owner > admin > clinician`. Role is **always read from Firestore** (`users/{uid}.role`) — never trust JWT custom claims or client-side state. Session cookies are HMAC-signed, HttpOnly, 8h TTL, contain only `{ uid, exp }` (no role).

### Multi-tenancy — `clinicId` partitioning

Every collection that holds clinic data nests under `/clinics/{clinicId}/...` or carries an indexed `clinicId` field. Superadmin is the only role that can cross clinics. Never write a query without a `clinicId` filter unless you're superadmin tooling. The test `src/__tests__/multi-tenant-isolation.test.ts` exists to catch leaks.

### Module boundaries — Intelligence ↔ Pulse (SPARC)

Intelligence and Pulse are **separate bounded contexts**. They communicate only through the shared `/clinics/{clinicId}/events` collection: Intelligence writes events, Pulse reads them and stamps `consumedBy: ['pulse']`. The script `dashboard/scripts/check-module-boundaries.sh` enforces this:

- Intelligence code (`src/lib/intelligence`, `src/lib/metrics`, `src/app/intelligence`, hooks `useIntelligenceData/useKpis/useValueLedger`) **must not** reference `/messages` or the `comms_log` collection.
- Pulse code (`src/lib/pulse`, `src/lib/comms`, `src/components/pulse`, `src/app/api/n8n`, `src/app/api/comms`, hooks `usePatients/useSequences/useCommsLog`) **must not** reference `/kpis` or `computeState`.

If you need cross-module data, emit/consume an event — don't import.

### The 7-stage pipeline

`src/lib/pipeline/run-pipeline.ts` runs per-clinic, idempotent, on a 4-hour cron (`vercel.json` → `0 */4 * * *` → `POST /api/pipeline/run`):

1. **Fetch** appointments from PMS adapter (WriteUpp, Cliniko, CSV)
2. **Normalise** to canonical `PMSAppointment`
3. **Upsert** into Firestore `appointments` (key: `{clinicId}_{appointmentId}`)
4. **Compute** weekly KPIs
5. **Cache** to `metrics_weekly`
6. **HEP sync** from Physitrack / Rehab My Patient
7. **n8n callback** to fire downstream automations

Every sync writes an `IntegrationHealthEntry` to `clinics/{clinicId}/integration_health/{entryId}` (server-side write only). Surface lives at `/admin/integration-health`. Manual triggers: Settings → "Sync now" or `POST /api/pipeline/run` with `{ clinicId }`. Backfill via `POST /api/pipeline/backfill`.

### PMS sync availability

| PMS | Method |
|---|---|
| WriteUpp | Webhook (real-time) → `POST /api/webhooks/writeupp` |
| Cliniko | Cron only (no outbound webhooks) |
| TM3 (Blue Zinc) | Email-ingest CSV → `import-{clinicId}@ingest.strydeos.com` → `POST /api/pms/import-csv/inbound` (validates `X-Inbound-Secret`) |
| Jane App | CSV / email-ingest |

### Billing (Stripe)

Pricing matrix: `{module} × {tier: solo|studio|clinic} × {interval: month|year}` plus a one-time `STRIPE_PRICE_AVA_SETUP` (£195) for Ava standalone or Full Stack. Modules can be added to an existing subscription (don't create a new one — see commit `59ba18e`). £0 checkouts skip card capture (`b113e6e`). Promotion codes are enabled at Checkout. `STRIPE_SECRET_KEY` is trimmed at runtime (`2b70ef8`) — copy-paste whitespace was burning us.

Webhook handler: `POST /api/billing/webhooks` (verify signature first). Customer Portal: `POST /api/billing/portal`. Checkout: `POST /api/billing/checkout` returns `{ url }`.

### i18n

`next-intl`, English only today. Messages in `dashboard/messages/en.json`, server config in `src/i18n/request.ts`, typed keys in `dashboard/global.d.ts`. New user-facing strings must use `useTranslations()` rather than hardcoded text.

### Sentry

Wired across API routes, the pipeline cron, the billing webhook, and the client (5% session replay). API errors flow through `handleApiError()`, which captures unhandled exceptions and never leaks internals (no stack traces, no Firestore paths). Pipeline failures are tagged `source: pipeline_cron` with the `clinicId`.

### Rate limiting

`src/lib/rate-limit.ts` uses Upstash Redis. **In-memory fallback exists for dev only** — Vercel cold starts reset per-instance counters, so multi-clinic prod requires `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set. The fallback fails *open*; missing Redis silently bypasses limits.

### Credential encryption

PMS/HEP API keys are stored in Firestore but encrypted at rest with AES-256-GCM. Per-clinic encryption keys are HMAC-derived from `CREDENTIAL_MASTER_SECRET`: `HMAC-SHA256(secret, "strydeos:credentials:{clinicId}")`. Never store raw API keys in Firestore.

### Voice (Ava)

ElevenLabs Conversational AI + Twilio for telephony. Per-clinic Twilio numbers provisioned via `POST /api/ava/provision-number`. The Python `ava_graph/` service is the LangGraph orchestration brain (FastAPI exposes `/api/...` routes). n8n handles webhook routing between Twilio → ElevenLabs → WriteUpp/Cliniko.

---

## Who You're Working With

**Jamal** — physiotherapist, clinic owner (Spires Physiotherapy, West Hampstead), founder of StrydeOS.
Intermediate-advanced developer. Self-taught. Moves fast. Doesn't need hand-holding on basics.

**Communication rules:**
- Recommendation first (1–2 sentences), reasoning second. Always.
- No filler. No "Great question!" No corporate tone. No hedging.
- Return full files/functions unless explicitly asked for a snippet.
- Flag security and auth issues first when reviewing code.
- Explain the *why*, not the *what*. Jamal knows his stack.

---

## What StrydeOS Is

A **clinical performance tracking SaaS** built for private physiotherapy practices — with a clear path to white-labelling across allied health (therapy, medspa, dental).

### The Core Philosophy — Stakeholder Triangle

```
Happy physio → Happy clients → Happy owner
```

You can't manage what you can't measure. Clinic owners have no visibility into what physios are doing well, where they're missing, or where patients drop off. StrydeOS closes that blind spot — without blaming clinicians. It surfaces gaps so they can be coached and improved.

**Three stakeholders, all win:**
- **Physio** → clarity on their own performance
- **Patient** → better outcomes, better follow-through  
- **Owner** → EBITDA, reputation, retention

### Target Market
- Private physiotherapy practices (UK) — **NOT NHS**
- NHS = too much red tape. Private practice owners think like business owners and respond to ROI.
- Post-physio lock-in: therapy → medspa → dental

---

## Product Modules

Three modules. Names are **locked** — do not rename, do not alias.

| Module | Colour | Hex | Function |
|--------|--------|-----|----------|
| **Ava** | Royal Blue | `#1C54F2` | AI voice receptionist (ElevenLabs + Twilio + n8n) |
| **Pulse** | Teal | `#0891B2` | Patient continuity / retention engine |
| **Intelligence** | Purple | `#8B5CF6` | Clinical performance dashboard |

---

## Dogfood Clinic — Spires Physiotherapy

StrydeOS is built and validated at Spires first.

- **Location:** West Hampstead, London
- **Team:** Jamal (MD, 1 day/week clinical), Andrew (clinician — primary case study), Max (clinician), Joe (business partner / MD — deep combined business + clinical knowledge)
- **Current data:** Tracking Andrew + Max via Physitrack + WriteUpp
- **Andrew's current follow-up rate:** ~2.4 (KPI target: improve this)
- **Current programme assignment rate at Spires:** ~35%
- Real gaps at Spires = real product requirements

---

## Tech Stack

### Frontend
- **Framework:** React / Next.js
- **Styling:** Tailwind CSS
- **Component approach:** Functional components, hooks only

### Backend & Infrastructure
- **Primary:** Firebase
- **Auth:** Firebase Auth
- **Database:** Firestore (`europe-west2` region — London)
- **Collections:** `appointments`, `clinicians`, `physitrack_programs`, `metrics_weekly`
- **Hosting:** Vercel / Firebase Hosting

### Automation & Integrations
- **Automation:** n8n
- **Voice AI:** ElevenLabs (Conversational AI) + Twilio (telephony/SIP)
- **White-label voice layer (future):** Vapify (wraps ElevenLabs at reseller phase)
- **PMS integrations:** WriteUpp (primary), Cliniko, Halaxy, Zanda (Power Diary) — all live
- **Roadmap:** TM3 (Blue Zinc), PPS (Rushcliff — API docs gated, requires PPS Express login), Pabau (requires API key), Jane App
- **HEP integrations:** Physitrack (live), Rehab My Patient (live), Wibbi (pending — auth model needs rework)
- **Clinical tools:** Heidi Health (clinical docs — data enrichment, not a competitor)
- **PMS API bridge:** OpenClaw (handles PMS API access without official integration)

### Dev Environment
- **Primary IDE:** Cursor (Sonnet 4 as default model)
- **Prototyping:** Claude Code
- **Version control:** GitHub (private repos — commercial product)
- **Deployment:** Vercel

---

## Brand Tokens — Source of Truth

`brand.ts` is the **single source of truth** for all colour and typography values.  
**Never introduce values not in `brand.ts`.**

### Colours

| Token | Hex |
|-------|-----|
| Blue | `#1C54F2` |
| BlueBright | `#2E6BFF` |
| BlueGlow | `#4B8BF5` |
| Navy | `#0B2545` |
| Teal | `#0891B2` |
| Purple | `#8B5CF6` |
| Cream | (see brand.ts) |

**Dark surfaces use Navy `#0B2545` — no pure black anywhere in the brand.**

### Typography
- **UI / Body:** Outfit
- **Headings:** DM Serif Display (weight 400 only)

### Spatial System
- **Base unit:** 4px
- **Border-radius scale (strict):** 4 / 8 / 12 / 16 / 20 / 24 / 50px only

---

## Canonical Files — Do Not Reinterpret

| File | Purpose |
|------|---------|
| `brand.ts` | Single source of truth for all colour + typography tokens |
| `Marketing Material/Brand Assets/monolith.svg` | Canonical logo mark — do not reinterpret |
| `Marketing Material/Brand Assets/MonolithLogo.tsx` | Logo React component |
| `Marketing Material/Brand Assets/brand-identity-sheet.html` | Brand identity reference |
| `strydeOS-website.jsx` | Marketing website |
| `Marketing Material/Brand Assets/email-footer.html` | Email footer template |

### Logo Rules
- The Monolith mark: gradient glass container (not solid), ghost pillar, three ascending chevrons clipped inside
- **Never reinterpret the mark**
- In multi-logo sheets: each instance must use unique gradient and clipPath ID prefixes to prevent DOM conflicts

---

## KPI Metrics — Confirmed from Spires

These six metrics are validated from live Spires data. They are the canonical set for the dashboard.

1. **Follow-up rate** — follow-ups booked ÷ initial assessments (weekly + rolling 90-day window)
2. **HEP compliance** — patients given a programme ÷ patients seen
3. **Utilisation** — booked slots ÷ available slots
4. **DNA rate** — did-not-attend ÷ total booked
5. **Revenue per session** — total revenue ÷ sessions delivered
6. **NPS** — net promoter score (treated as EBITDA lever, not vanity)

**Metric rule:** Every metric must connect to outcomes or revenue. No vanity stats.

---

## Dashboard Quality Bar

**Aesthetic target:** Bloomberg terminal / Xero dashboard — clinical precision, zero noise, every number earns its place.

- Clinician performance table uses a **coloured badge system** (defined in brand.ts palette)
- Empty states are module-specific — not generic
- Skeleton loading patterns for all async data
- Dark mode surface stack: Navy `#0B2545` base, no pure black

---

## Hard Stops — Never Touch Without Explicit Instruction

```
Firebase logic
Auth (Firebase Auth)
Routing
Existing PMS integrations (WriteUpp, Cliniko, Physitrack, OpenClaw)
Real-time listener architecture
Multi-tenant data model (clinicId partitioning)
```

If a change would touch any of the above, **stop and flag it** before proceeding.

---

## Model Usage Rules

| Task | Model |
|------|-------|
| All day-to-day Cursor work | **Sonnet 4 (default)** |
| Genuinely irreversible architectural decisions only | Opus (ask first) |

Irreversible = multi-tenant data modelling, real-time listener architecture, complex state management intersections.

---

## Code Standards

- Return **full files/functions**, never partial snippets unless explicitly asked
- No sweeping rewrites — changes must be **surgical** and limited to what's specified
- Always read the source file before making changes
- Flag security / auth issues **first** when reviewing code
- Don't suggest replacing what's working
- No `console.log` left in production code
- No hardcoded values — reference `brand.ts` and env vars
- TypeScript preferred; match the existing typing conventions in the file being edited

---

## Architecture Principles

### Data
- Firestore region: `europe-west2` (London) — never change
- `clinicId` partitioning is the multi-tenant isolation strategy — respect it in every query
- Metrics are computed and cached in `metrics_weekly` — don't re-derive from raw collections unless building a backfill

### Auth & RBAC
- Firebase Auth only — no custom auth logic
- **Four-tier role hierarchy:** `superadmin > owner > admin > clinician`
- Role is **always read from Firestore** (`users/{uid}.role`) — never from JWT claims or client state
- Permissions enforced at **four layers:** middleware (session cookie), AuthGuard (client redirect), API routes (`requireRole()`), Firestore security rules
- Session cookie: HMAC-signed, HttpOnly, 8hr TTL (matches clinical workday) — contains only `{ uid, exp }`, no role

#### Role Access Summary

| Capability | Superadmin | Owner | Admin | Clinician |
|-----------|-----------|-------|-------|-----------|
| Dashboard (all clinicians) | Yes | Yes | Yes | **Own only** |
| Settings (clinic details, KPIs, integrations) | Yes | Yes | Yes | **No** |
| Settings (password, MFA) | Yes | Yes | Yes | Yes |
| Billing / Checkout | Yes | Yes | Yes | **Redirect** |
| Onboarding wizard | Yes | Yes | Yes | **Redirect** |
| Compliance / SAR | Yes | Yes | Yes | **Redirect** |
| Admin panel | Yes | **Redirect** | **Redirect** | **Redirect** |
| API routes (PMS, HEP, comms, metrics) | Yes | Yes | Yes | **403** |

#### Invite Flow
- Owner adds clinician via Settings → creates Firebase Auth user + `users/{uid}` doc (with correct `clinicId`) + `clinicians` subcollection doc
- Invited clinician sets password via email link, signs in → automatically under correct clinic
- Signup route checks for existing invited users → blocks duplicate clinic creation with `INVITED_USER` error
- Never expose Firebase config in client code outside of env vars

### Integrations
- WriteUpp + Cliniko are primary PMS sources via webhook / OpenClaw bridge
- HEP data sources: Physitrack (live), Rehab My Patient (live), Wibbi (pending)
- n8n handles all automation orchestration — don't replicate automation logic in the app

### Voice (Ava module)
- ElevenLabs Conversational AI for voice agent + Twilio for telephony/SIP
- n8n for webhook routing
- WriteUpp/Cliniko receive booking confirmations via webhook
- White-label future path: Vapify wraps ElevenLabs at reseller phase

---

## Product Positioning — For Copy and Messaging

- **Not** a tool that blames physios — it **surfaces gaps so they can be coached**
- Conservative, clinically-grounded language always preferred over generic marketing copy
- All messaging should connect clinical performance **directly to revenue outcomes**
- NPS and Google Reviews are EBITDA levers, not just feedback
- Target buyer thinks like a business owner and responds to ROI
- Core differentiator: three-stakeholder model (owner / clinician / patient) — no competitor addresses all three
- Built by an operator (Jamal runs Spires) — not a tech consultant's guess

---

## Roadmap Context

### Now
- Core KPI dashboard live with real Physitrack + WriteUpp data
- HEP compliance + NPS tracking end-to-end
- MVP live at Spires as pilot

### Next
- Onboard 1–2 other private physio practices
- Pitch deck + sales motion built around stakeholder triangle
- TM3 (Blue Zinc) integration — dominant legacy UK physio PMS, current blind spot
- PPS (Rushcliff) integration — legacy UK incumbent, 2,400+ clinics, Physio First partner. API docs gated behind PPS Express login.
- Outcome measures layer: NPRS, PSFS, QuickDASH, ODI, NDI (clinical-to-commercial correlation)

### Later
- White-label: therapy → medspa → dental
- Per-seat or per-clinic SaaS pricing
- Vapify white-label layer for Ava at reseller phase
- Full multi-tenant self-serve onboarding

---

## Pending / Known Gaps

- **TM3 (Blue Zinc)** — critical UK PMS integration, not yet built
- **PPS (Rushcliff)** — legacy UK incumbent (2,400+ clinics, Physio First partner). API exists (docs.pps-api.com) but docs gated behind PPS Express login. Token-based API pricing from £80/mo. Contact sales@rushcliff.com for developer access.
- **Pabau** — medspa/aesthetics PMS integration, awaiting API key access
- **Outcome measures** — NPRS, PSFS, QuickDASH, ODI, NDI layer not yet started
- **Loom embed** — demo video section on website, not yet implemented
- **Driiva project** — separate auth + real-time + AI/ML project, requires same structured treatment

---

## What Not to Build

- ROI calculator belongs on the **marketing website only** — never in the app
- No NHS-specific features
- No chatbot UI — Ava is voice-first
- No vanity metrics — if it doesn't connect to outcomes or revenue, it doesn't belong

---

## Naming History (Context Only)

- **TGT** → internal placeholder ("The Gain Train"). Never public-facing. Codebase was `tgt-clinical-dashboard`.
- **StrydeOS** → current name. Stride / progress / MSK movement. macOS-but-MSK energy. Premium, clean.
- Repo renamed: `tgt-clinical-dashboard` → `strydeos`

---

*End of CLAUDE.md. Keep this file current as the product evolves.*
