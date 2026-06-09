# Polish pass — 2026-06-09

Ship-grade QA pass across `dashboard/` and `website/`. Three phases, committed separately
(`6650b04`, `44e6523`, `ee0346f`, + phase 3 commit). All 907 unit tests green, both apps
build clean, lint has 0 errors.

---

## Bugs found and fixed

### P1 — broken flows (5 fixed)

1. **Clinic-tier pricing was stale everywhere it renders.** Website pricing section
   (`strydeOS-website.jsx`), module pricing banners on /ava /pulse /intelligence
   (`ModulePricingBanner.jsx`) and the dashboard's own billing display
   (`dashboard/src/lib/billing.ts`) all carried Intelligence £199 / Ava £159 / Pulse £119 —
   the exact cells root CLAUDE.md documents as stale. Corrected to the canonical deck:
   Intelligence £149 / Ava £199 / Pulse £149 (sums to £497, matching the documented
   £98/mo Full Stack saving). Verified rendering live on the Clinic tab.
2. **"Sign in" was unreachable from inside the demo.** `src/middleware.ts` had
   `isDemoSession` hardcoded to `false` (a stub), so any valid demo cookie bounced
   /login straight back to /dashboard. The demo banner literally says "Sign in to use
   your own clinic" — the link was a trap. Demo sessions now pass through to the form.
   ⚠ This touched middleware (a CLAUDE.md hard-stop area). The change implements the
   intent already written in the code's own comments; real sessions behave identically.
   Flagging rather than asking forgiveness — review the diff in `ee0346f`.
3. **Hard refresh killed the demo.** Demo identity lived only in React state; any reload
   mid-demo dumped the viewer at the login screen. Now restored from the existing
   sessionStorage scenario marker (cookie re-minted server-side). Sign-in and sign-out
   both clear the marker so a demo can never resurrect under a real account.
4. **Demo mode fired permission-denied Firestore errors on every page.** Three listeners
   (clinic profile snapshot in `useAuth`, clinician probe in `AccountSetupWidget`,
   milestone listener in `useInsightEngineUnlock`) queried Firestore with no Firebase
   Auth identity. All three now skip for demo sessions. Console is clean in demo.
5. **Patient detail page served fabricated records to real accounts.** `/patients/[id]`
   rendered hardcoded demo patients (names, NPRS scores, session notes) for any
   authenticated user who hit the URL. Now demo-only; real accounts get the not-found
   state. (See "half-built" below — this surface needs a real data path eventually.)

### P2 — cosmetic / correctness (3 fixed)

6. **Duplicate demo banner** on /dashboard (rendered by both AppShell and the page).
7. **Dead "Book a demo" button** on the website FAQ (`href="#"`) — now points at the
   Calendly link used elsewhere.
8. **Lint error** (`no-unused-expressions`) in the patient page toggle — the only hard
   lint error in the repo; now 0 errors.

### Found, not fixed (logged below as product decisions)

- Fabricated case studies on the website (see decision 1).
- Website dev server webpack-cache corruption appeared twice during the session after
  HMR edits (`Cannot find module './NNNN.js'`). Same failure class already documented
  for the Evidence repo. Fix is `rm -rf .next` + restart; no code change applicable.

## AI tells removed

**Copy (4 rewritten):**
- `ModuleGuard` CTA "Unlock {module}" → "Add {module} to your plan".
- `InsightEngineUnlocked` badge "New Capability Unlocked" (Title Case + gamification) →
  "Insight engine active".
- First-login tour, both variants: "designed to optimise your practice from just 'good'
  to industry-leading" → states what the dashboard actually shows. Demo variant
  similarly de-hyped.

**Code (8 statements + dead code):**
- 2 `console.log` in production API routes (`ava/post-call`, `ava/toggle`).
- 6 `console.log` in the public website Ava demo card (call transcripts were being
  logged to the visitor's console).
- Dead `isDemoSession` stub + unreachable bypass block in middleware; dead
  `usedDemo`/`DemoBanner` wiring on the dashboard page; unused `PageHeader` import.
- Audit found **zero** restating comments, zero AI-naming patterns, zero over-commented
  files — the codebase was already clean here.

**Design:** no stock-gradient heroes, no identical 3-column icon-card grids on
authenticated surfaces. Border-radius follows the brand scale. No action needed.

## Premium polish — verified rather than changed

- KPI formatting already correct: `£14,685` (commas), percentages, "2m ago" relative
  times. Verified on the live demo dashboard.
- Global `:focus-visible` ring (light + dark) present in `globals.css`.
- Per-route `loading.tsx` skeletons exist for dashboard, checkout, login, onboarding, trial.
- Deuteranopia: status badges pair colour with icon/label (checked Pulse board chips and
  retention card); no red/green-only indicator found on walked surfaces.
- Both apps production-build clean; 907/907 vitest pass; `eslint` 0 errors.

## Needs a product decision (logged, not guessed)

1. **Website case studies are fabricated.** "TGT Physio · Nicholas, Managing Director"
   (TGT is the internal pre-rename codename — it was never a clinic), "Riverside
   Physiotherapy · Sarah Mitchell", "TBSport Therapy · Tammy", plus the
   /case-studies page's "Notting Hill physio clinic" with invented metrics
   (1.90→2.50 follow-up, ~£14k/yr). Named people + invented numbers on a clinical
   product is a credibility and ASA risk. Options: replace with real pilot numbers
   framed per the brand rule ("my own private clinic in Camden, London"), or pull the
   Results section + /case-studies page until real customer data exists. The "absolute
   game changer" quote inside also reads as an AI tell — left untouched pending this call.
2. **Stripe Clinic-tier Price IDs need verification.** Charging uses env-mapped Stripe
   Price IDs, not the display constants I corrected. Confirm the Stripe Prices behind
   `STRIPE_PRICE_{AVA,PULSE,INTELLIGENCE}_CLINIC_*` charge £199/£149/£149 — if they
   still carry the old amounts, displayed price and charged price now disagree.
3. **Annual billing 20% discount** exists in both the website calculator and
   `billing.ts` ("Annual = 20% off") but is absent from the locked pricing matrix in
   CLAUDE.md. Confirm it's sanctioned and add it to CLAUDE.md, or remove the toggle.
4. **Changelog v1.4.6 entry** cites the old Clinic prices ("Intelligence £199, Ava £159,
   Pulse £119"). It's a historical record — decide whether to annotate it or leave it.
5. **`MANUAL-TEST-CHECKLIST copy.md` / `copy 2.md`** sit in `dashboard/` root — stale
   duplicates worth deleting once confirmed unneeded.

## Half-built or unclear surfaces

- **`/patients/[id]`** — demo-only showcase; no real-data path. Its only entry point
  (`PatientRow.tsx`) is dead code: nothing imports it, so the page is reachable only by
  URL. Either wire it to real PMS-synced patients or remove route + component.
- **Outcome measures** (`featureFlags.outcomeTracking`) — flag exists, no surface.
  Already on the roadmap in CLAUDE.md; nothing in the UI dangles, so fine to ship.
- **Insurance/intake** — shipped and coherent under Pulse; no issues found on walk.

## Not covered in this pass

- Full Lighthouse run and `npm run audit:contrast` (CDP-attached) — recommend running
  both before the marketing push; nothing visual suggested a regression.
- E2E suite (`npm run test:e2e`) not run — needs a built server; unit suite + manual
  walk covered the changed paths.
