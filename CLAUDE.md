# CLAUDE.md — StrydeOS

> Claude Code operating instructions for the StrydeOS codebase.  
> Read this before touching anything. Last updated: 2026-06-09.

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

## Repo Layout

- `dashboard/` — primary Next.js 15 app. Tailwind v4, LangChain/LangGraph, AI SDK Gateway, ElevenLabs client, Sentry + OpenTelemetry, Playwright E2E. **All dev commands live here** (root `package.json` is a seed-only stub). Contains `src/mcp/` (the `stryde-ops` MCP server) and `src/app/api/mcp/` (its HTTP transport).
- `StrydeOutreach/` — autonomous QA + 4-touch outreach engine. Live since 14 May 2026 at `outreach.strydeos.com`. **Nested independent git repo** (own `.git`, not a submodule) — has its own CLAUDE.md.
- `StrydeLens/` — Lens subproject (repo created March 2026). **Nested independent git repo.** Its CLAUDE.md is a stale verbatim copy of the *old* StrydeOS root doc — the header still self-labels "Last updated: 2025" (a placeholder, not a real date: StrydeLens did not exist in 2025), and it carries a 1hr TTL, a 4-collection list, and real Spires PII. Nothing in it reflects StrydeLens — do not trust it; rewrite or delete (still carries PII).
- `ava_graph/` — Ava voice agent: LangGraph definitions **+ deployed to Cloud Run** with its own PMS-booking MCP (`ava_graph/mcp_server.py`) and intent eval harness (`ava_graph/tests/eval/`).
- `Marketing Material/` — brand assets, pitch deck source, email comms templates (canonical).
- `docs/` — module briefs (`docs/module-briefs/`), audits, technical whitepaper, sub-processor DPA register.
- `scripts/` — reusable ops scripts, incl. the reference `strydeOS_mcp.py` (pricing/capability MCP).
- `website/` — marketing site source. Hosts the live Ava demo (repaired `277d1e3`).
- `Research/`, `To do/`, `logs/`, `test-results/` — non-code.

---

## Commands

Run inside `dashboard/`:

```bash
npm run dev                # Next dev server (doppler run -- next dev)
npm run dev:mobile         # Next dev exposed on 0.0.0.0 (LAN testing)
npm run build              # Production build
npm run lint               # eslint src
npm test                   # vitest run
npm run test:e2e           # playwright (E2E_NO_SERVER=1)
npm run test:e2e:ui        # playwright UI mode
npm run test:e2e:headed    # playwright headed
npm run test:e2e:full      # full E2E (boots a server)
npm run check:boundaries   # enforces Ava/Pulse/Intelligence module isolation
npm run mcp:stdio          # run the stryde-ops MCP server over stdio (Claude Code)
npm run audit:contrast     # WCAG contrast audit via CDP-attached Playwright
npm run analyze            # bundle analyzer
npm run seed:clinic        # seed a single clinic
npm run seed:spires        # local seed
npm run seed:production     # production seed (use with care)
npm run purge:seed         # remove seeded data
npm run setup:superadmin   # bootstrap a superadmin
npm run promote:superadmin # promote a user to superadmin
```

Node is pinned to **`22.x`** (`engines` in `dashboard/package.json`).
Module-boundary check runs as part of pre-commit. Don't bypass with `--no-verify`.

---

## MCP Servers

Three MCP servers live in this repo (see `dashboard/src/mcp/README.md`):

1. **`stryde-ops`** (`dashboard/src/mcp/`, TypeScript) — inbound, founder-local. 11 tools over clinic data + Ava control. Two transports share one registry: **stdio** (`npm run mcp:stdio`, for Claude Code) and **HTTP** at `portal.strydeos.com/api/mcp` (claude.ai custom integration). ⚠ The HTTP transport scopes to `CLINIC_ID` (default **`clinic-spires`** — the real Spires Firestore doc id, NOT `spires`; see "Canonical clinic id" under Architecture → Data) + `MCP_ROLE=superadmin` — **anyone holding `MCP_BEARER_SECRET` has founder-equivalent access**. Per-clinic scoping + full OAuth is Phase D (deferred); OAuth client_credentials + Authorization Code/PKCE endpoints exist for the claude.ai flow.
2. **`ava-pms-tools`** (`ava_graph/mcp_server.py`, Python FastMCP) — outbound; Ava's live-call PMS booking tools (cliniko / writeupp / tm3 / jane).
3. **`strydeOS`** (`scripts/strydeOS_mcp.py`, Python FastMCP) — reference server for marketing/sales drafting: `get_pricing_tiers`, `get_pilot_metrics`, `get_pms_capability`. Treat as the canonical machine-readable pricing/capability source — keep it in sync with this file.

---

## Product Modules

Three modules. Names are **locked** — do not rename, do not alias.

| Module | Colour | Hex | Function |
|--------|--------|-----|----------|
| **Ava** | Royal Blue | `#1C54F2` | AI voice receptionist (ElevenLabs + Twilio + n8n) |
| **Pulse** | Teal | `#0891B2` | Patient continuity / retention engine |
| **Intelligence** | Purple | `#8B5CF6` | Clinical performance dashboard |

### Pricing (locked — April 2026)

|                | Solo (1)  | Studio (2–5) | Clinic (6+) |
|----------------|-----------|--------------|-------------|
| Intelligence   | £69       | £99          | £149        |
| Ava            | £99       | £149         | £199        |
| Pulse          | £79       | £99          | £149        |
| **Full Stack** | **£199**  | **£299**     | **£399**    |

**Setup fee: £195 one-time, Ava standalone only** — covers phone provisioning + voice training. No setup fee on Intelligence or Pulse, and **waived on Full Stack** (Ava's setup is bundled in). No lock-in contracts at any tier.

Bundle discount applied automatically on Full Stack. Mix-and-match any two modules ~10% off.

Do not invent or round prices. Canonical artifact: `Marketing Material/Decks & Docs/strydeos-pricing-deck.html`. Machine-readable source: the `strydeOS` MCP `get_pricing_tiers` tool (`scripts/strydeOS_mcp.py`). Secondary reference: `StrydeOutreach/CLAUDE.md`.

> ✅ **Pricing reconciled to the deck (2026-06-09).** Both prior discrepancies are resolved against the canonical deck above: (a) the £195 setup fee is **Ava standalone only and waived on Full Stack** — `scripts/strydeOS_mcp.py` was corrected (no Full Stack setup fee); (b) Clinic-tier modules are **Intelligence £149 / Ava £199 / Pulse £149** — deck-confirmed by the maths (Clinic Full Stack £399 at a £98/mo saving = £497 of modules) — and `StrydeOutreach/CLAUDE.md` had stale Clinic cells (Intelligence £199, Ava £159, Pulse £119), now corrected. All three sources agree.

### Insurance / Intake (module — shipped, delivered under Pulse)

A patient insurance + address intake surface added in commits `9dea070` / `f80b494`:
- Public token-gated form at `/intake/[token]` (postcodes.io address lookup) → staff review queue at `/compliance/insurance` → staff-approved write back to the PMS (Cliniko writes insurance summary + confirmed address to the patient profile).
- PMS-agnostic core in `dashboard/src/lib/insurance/`; Cliniko is the only wired PMS today.
- Daily cron `/api/insurance/poll-and-send` (09:00) polls Cliniko upcoming bookings, windows/dedupes, and emails patients a secure intake link.
- Gated by `featureFlags.insuranceIntake`. Collections: `insurance_intake_links`, `pre_auths`.

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
- **Collections (core):** `clinics`, `users`, `clinicians`, `appointments`, `patients`, `metrics_weekly`, `reviews`, `insight_events`, `comms_log`, `audit_logs`, `sequence_definitions`, `insurance_intake_links`, `pre_auths` (~30 total referenced in code; `physitrack_programs` is no longer used). All `clinicId`-partitioned.
- **Hosting:** Vercel / Firebase Hosting

### Automation & Integrations
- **Automation:** n8n
- **Voice AI:** ElevenLabs (Conversational AI) + Twilio (telephony/SIP)
- **White-label voice layer (future):** Vapify (wraps ElevenLabs at reseller phase)
- **PMS integrations:** all four **live in code** — Cliniko (REST API, production), WriteUpp (live via import pipeline), Halaxy (live in code), Zanda / Power Diary (live in code). Spires runs primarily on WriteUpp + Physitrack. Production rollout maturity differs from code-completeness — confirm per-clinic before promising "live integration" in sales conversation.
- **Roadmap:** TM3 (Blue Zinc) and Jane App — Ava booking-tool **stubs now exist in code** (`ava_graph/tools/tm3.py`, `jane.py`), not production. PPS (Rushcliff — API docs gated, requires PPS Express login), Pabau (requires API key).
- **HEP integrations:** Physitrack (live), Rehab My Patient (live), Wibbi (pending — auth model needs rework)
- **Clinical tools:** Heidi Health — clinical scribe (legacy positioning as data enrichment) **+ Heidi Comms** (AI receptionist, launched Feb 2026). Heidi Comms overlaps with Ava on voice/SMS/chat/scheduling but Heidi remains NHS/GP/horizontal — no physio-specific KPIs, no HEP compliance tracking, no patient retention engine. **StrydeOS positioning: physio-vertical OS, not generic AI care platform.** Concede notes integration entirely (don't build scribe). Their distribution + capital advantage is real; market overlap in private UK physio is minimal today, will widen in 12–18 months. Track but don't react.
- **PMS API bridge:** OpenClaw (handles PMS API access without official integration)

### Dev Environment
- **Primary IDE:** Cursor (Sonnet 4 as default model)
- **Prototyping:** Claude Code
- **Version control:** GitHub (private repos — commercial product)
- **Deployment:** Vercel

---

## Secrets & Environment — Doppler is Source of Truth

All secrets live in **Doppler** (project: `strydeos`, configs: `dev` / `stg` / `prd`).
Every project root has a committed `doppler.yaml` that pins it to the right config.

### Rules

- **Never read from `.env.local`.** Every `package.json` dev/build/start script must be prefixed with `doppler run --`. The dashboard script is `"dev": "doppler run -- next dev"` — match that pattern.
- **Never commit `.env*` files.** `.env*` is gitignored. If you find one in a project root, it's a stale artifact — delete it or upload its contents to Doppler with `doppler secrets upload <file> --project strydeos --config dev`.
- **Worktrees Just Work.** Because `doppler.yaml` is committed at every project root, a fresh worktree resolves Doppler config automatically. Do not copy or symlink `.env.local` into worktrees.
- **Vercel pulls from Doppler** via the Doppler→Vercel integration. Do not set env vars manually in the Vercel dashboard — change them in Doppler and they propagate to preview + production.
- **Firebase Functions secrets** are pushed from Doppler with `doppler secrets download --no-file --format env | xargs -I{} firebase functions:secrets:set {}` (or per-secret with `doppler run -- firebase deploy --only functions`). Functions never read from a `.env` file.

### When something is missing locally

If `npm run dev` errors with "X env var required":
1. Check it exists in Doppler: `doppler secrets get X`
2. If missing, add it: `doppler secrets set X=value --project strydeos --config dev`
3. If present, you're not running through Doppler — check the dev script starts with `doppler run --`

The class of bug "blank screen because env var missing in dev" is structurally impossible when this pattern is followed. If you hit it, the fix is to add Doppler — not to copy a `.env.local`.

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

### Email Comms Templates — Canonical

Location: `Marketing Material/Email comms templates/`. Seven canonical HTML templates:

1. `1-invite.html` — clinician invite
2. `2-urgent-alert.html` — clinic urgent notifications
3. `3-state-of-clinic.html` — weekly summary
4. `4-clinician-digest.html` — per-clinician weekly digest
5. `5-welcome.html` — owner welcome
6. `6-marketing-announcement.html` — product/marketing announcements
7. `7-how-to-import.html` — onboarding import guide

Plus `sig-option-a.html` / `sig-option-b.html` — email signature variants (table-layout rebuild, commit `6d37067`).

**Rules:** Never plain text for product emails. Never use the Driiva sender identity for StrydeOS mail. Em dashes were stripped in commit `2bb5901` — don't reintroduce. iCloud Mail MCP defaults to `"Jamal @ StrydeOS" <jamal@strydeos.com>`.

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
- **Canonical clinic id (Spires): `clinic-spires`.** The live Spires data lives at `clinics/clinic-spires/*` and every real user's `users/{uid}.clinicId` is `clinic-spires`. There is NO `clinics/spires` doc — a bare `spires` id reads an empty/non-existent clinic and silently returns 0 rows (this bit the ops MCP). Never hardcode `spires`; resolve `clinicId` from the authenticated user, or default any clinic-scoped tooling/env (`CLINIC_ID`) to `clinic-spires`.
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

#### In-app role editor
- Owner/admin can change a member's role in Settings via `PATCH /api/clinicians/[id]/role`. Guards: last-owner protection (can't demote the only owner), no self-change, admin cannot grant `owner`. (Role is no longer set only at invite time.)

#### Feature flags
- Per-clinic capabilities live in `featureFlags` on the clinic doc (`dashboard/src/types/clinic.ts`): `intelligence`, `continuity`, `receptionist`, `outcomeTracking`, `insuranceIntake`, `clinicianNudges`, `clinicianDigest`. Treat as part of the multi-tenant model — gate features off the flag, never a hardcoded `clinicId` check.

### Integrations
- WriteUpp + Cliniko are primary PMS sources via webhook / OpenClaw bridge
- HEP data sources: Physitrack (live), Rehab My Patient (live), Wibbi (pending)
- n8n handles all automation orchestration — don't replicate automation logic in the app

### Voice (Ava module)
- ElevenLabs Conversational AI for voice agent + Twilio for telephony/SIP
- n8n for webhook routing
- WriteUpp/Cliniko receive booking confirmations via webhook
- **`ava_graph` is deployed to Cloud Run** (no longer just LangGraph definitions) with its own PMS-booking MCP (`ava-pms-tools`); the portal proxies to it
- **Post-call webhook** (`/api/ava/post-call`, `/api/webhooks/elevenlabs`) writes call facts/transcripts on ElevenLabs transcription events (auth via `ELEVENLABS_WEBHOOK_SECRET`)
- **Real pause/resume:** `/api/ava/toggle` attaches/detaches the clinic phone number from the ElevenLabs agent — paused = no `agent_id`, calls go unanswered
- White-label future path: Vapify wraps ElevenLabs at reseller phase

---

## Secrets — Doppler

Doppler is the single source of truth for secrets across StrydeOS + Driiva. Workspace: `Driiva Stryde`, project: `strydeos`, configs: `dev`, `dev_personal`, `stg`, `prd`.

- **Never** set secrets directly in Vercel / Firebase / GitHub Actions — set in Doppler, let integrations sync downstream.
- **Never** `vercel env pull` or `doppler secrets download` to disk for inspection. Audit value-free (key name + length + pollution flag only).
- **Known pattern:** paste pollution leaves a literal 2-char `\n` escape at value ends — silently breaks Firebase Installations (400 INVALID_ARGUMENT), CORS matching, WebAuthn origin matching. Re-run the clean script if symptoms return.
- Adding/rotating: set in Doppler `prd` → Vercel sync propagates ~30s → trigger rebuild (trivial commit or `vercel redeploy`).

---

## Build Style — Dashboard

- **Module boundaries enforced.** Ava / Pulse / Intelligence cannot import from each other directly. Cross-module work goes through `shared/` or the data layer. `npm run check:boundaries` runs at pre-commit; failures block the commit.
- **Testing:** vitest for unit/integration, Playwright for E2E. E2E runs with `E2E_NO_SERVER=1` against a pre-built server.
- **Observability:** Sentry + OpenTelemetry. Don't add bespoke logging — instrument with OTel spans.
- **AI orchestration:** LangChain + LangGraph for agentic flows (Ava). AI SDK Gateway for model routing — don't import provider SDKs (`@ai-sdk/anthropic`, `@ai-sdk/openai`) directly unless explicitly asked.
- **Pre-commit:** Husky runs lint + secret scanner + module-boundary check. Don't bypass.
- **Owner Summary** four-tile layout is the canonical landing page (commit `5eef643` replaced the prior landing). Don't substitute a generic dashboard.
- **TypeScript first** — match the existing typing conventions in the file being edited.

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

- **`harden/alpha-security` is merged into `main`** (merge `0c30e6d`, 2026-06-09; `main` then advanced with the short-intake-link work). All June work (security hardening, per-clinic PMS ingest, insurance/intake, RBAC role editor, Ava intent eval, website Ava-demo fix) is now on `main`. `main` is the trunk again — branch from `main`, not `harden/alpha-security` (which is retained but stale).
- **TM3 (Blue Zinc)** — critical UK PMS integration; only an Ava booking-tool stub exists, not production
- **PPS (Rushcliff)** — legacy UK incumbent (2,400+ clinics, Physio First partner). API exists (docs.pps-api.com) but docs gated behind PPS Express login. Token-based API pricing from £80/mo. Contact sales@rushcliff.com for developer access.
- **Pabau** — medspa/aesthetics PMS integration, awaiting API key access
- **Outcome measures** — NPRS, PSFS, QuickDASH, ODI, NDI layer not yet started (`featureFlags.outcomeTracking` exists, surface not built)
- **Ava live demo** shipped on the marketing website (`277d1e3`) — supersedes the old "Loom embed" gap.

### Cron jobs (`dashboard/vercel.json`, 7 total)

`/api/pipeline/run` (06:00) · `/api/intelligence/detect` (06:30) · `/api/intelligence/digest` (Sun 07:00) · `/api/intelligence/clinician-digest` (Mon 07:30) · `/api/data-health/check-staleness` (08:00) · `/api/data-health/cleanup` (Sun 03:00) · `/api/insurance/poll-and-send` (09:00).

### Security posture (alpha hardening, `harden/alpha-security`)

- Cleared critical protobufjs RCE + all highs (Next 15.5.15 → 15.5.18).
- Rate-limiter `failClosed` option — secret/auth endpoints refuse rather than fail-open when Redis (Upstash) is unavailable.
- Atomic `create()` dedup claim on the WriteUpp webhook (concurrent retries can't double-fire).
- Per-clinic HMAC ingest token bound to `clinicId` for `pms/import-csv/inbound` (set `inboundTokenRequired` to retire the global secret).
- Constant-time Bearer comparison on `api/ava/tools`.

---

## Operator Ecosystem (sibling projects)

All of Jamal's ventures run under the **Shippers** operator brand (GitHub/HF: `mrshippers`) and share the no-em-dash / UK-English / "ship, don't ask" conventions. Each has its own CLAUDE.md — keep cross-references accurate.

| Project | Path | What it is | Secrets |
|---|---|---|---|
| **StrydeOS** (this repo) | `~/Desktop/StrydeOS` | Clinical performance SaaS for UK private physio. Flagship. | Doppler `strydeos` |
| **Driiva** | `~/Documents/DriivaMVP` | Telematics insurtech for young UK drivers. Pre-raise. | Doppler `driiva` |
| **TradeMind** | `~/Downloads/AI/Shippers/TradeMind` | Mobile AI for UK electricians (voice → EIC/EICR certs). Client: Addison Garnett. | Supabase fn secrets |
| **shippers-tt** | `~/Projects/shippers-tt` | Personal operator system (timetable + venture dashboard). Tracks all the above. | Doppler `shippers-tt` |

Canonical Driiva is `~/Documents/DriivaMVP` (remote `mrshippers/Driiva.git`). The stale uppercase `~/DRIIVA` copy (abandoned 12 Apr, separate remote `mrshippers/DRIIVA.git`) was **deleted 2026-06-09** — if it reappears, it is not canonical.

- **Driiva project** — separate codebase at `Documents/DriivaMVP/`. Has its own CLAUDE.md and shares the `Driiva Stryde` Doppler workspace.

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
