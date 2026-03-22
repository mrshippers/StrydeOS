# CLAUDE.md — StrydeOS

> Claude Code operating instructions for the StrydeOS codebase.  
> Read this before touching anything. Last updated: 2025.

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
- **Roadmap:** TM3 (Blue Zinc), Pabau (requires API key), Jane App
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
| `monolith.svg` | Canonical logo mark — do not reinterpret |
| `MonolithLogo.tsx` | Logo React component |
| `brand-identity-sheet.html` | Brand identity reference |
| `strydeOS-website.jsx` | Marketing website |
| `email-footer.html` | Email footer template |

### Logo Rules
- The Monolith mark: gradient glass container (not solid), ghost pillar, three ascending chevrons clipped inside
- **Never reinterpret the mark**
- In multi-logo sheets: each instance must use unique gradient and clipPath ID prefixes to prevent DOM conflicts

---

## KPI Metrics — Confirmed from Spires

These seven metrics are validated from live Spires data. They are the canonical set for the dashboard.

1. **Follow-up rate** — follow-ups booked ÷ initial assessments (weekly + rolling 90-day window)
2. **HEP compliance** — patients given a programme ÷ patients seen
3. **Programme assignment rate** — initial programme assigned at first contact
4. **Utilisation** — booked slots ÷ available slots
5. **DNA rate** — did-not-attend ÷ total booked
6. **Revenue per session** — total revenue ÷ sessions delivered
7. **NPS** — net promoter score (treated as EBITDA lever, not vanity)

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

### Auth
- Firebase Auth only — no custom auth logic
- Role model: `owner`, `clinician` — permissions enforced server-side in Firestore rules
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
- Outcome measures layer: NPRS, PSFS, QuickDASH, ODI, NDI (clinical-to-commercial correlation)

### Later
- White-label: therapy → medspa → dental
- Per-seat or per-clinic SaaS pricing
- Vapify white-label layer for Ava at reseller phase
- Full multi-tenant self-serve onboarding

---

## Pending / Known Gaps

- **TM3 (Blue Zinc)** — critical UK PMS integration, not yet built
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
