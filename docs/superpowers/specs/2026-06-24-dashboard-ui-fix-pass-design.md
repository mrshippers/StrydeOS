# Dashboard UI Fix Pass — Design Spec

- **Date:** 2026-06-24
- **Author:** Jamal (StrydeOS) + Claude
- **App:** `dashboard/` (Next.js 15, Tailwind v4)
- **Branch context:** authored on `ship/kpi-connection-gate` (the card data-sync work overlaps this branch's theme — see Workstream 1).
- **Status:** Awaiting review

---

## Goal

A focused UI polish pass across the StrydeOS portal. Three workstreams, no new features, no unrelated refactors. Reuse canonical components (`GlassCard`, `motion.ts`, `brand.ts`) — nothing hand-rolled.

1. **Cards** — make the home overview tiles *and* the billing module cards reflect real state, lift on hover, and click through to their module page.
2. **Insurance** — pull every insurance surface off the billing page and consolidate it under Pulse (a new 4th tab). Billing ends up with zero insurance references.
3. **Settings** — replace the long vertical scroll with a 4-tab horizontal layout (Account · Clinic · Integrations · Team) using the Outreach modular `GlassCard` panel aesthetic.

---

## Constraints (StrydeOS hard rules — must hold)

- **Routing is a hard-stop subsystem.** This pass adds `<Link>` navigation to *existing* routes and relocates UI between *existing* pages. It does **not** add, rename, or restructure routes. No change to middleware/AuthGuard/route architecture.
- **Module boundaries enforced** (`npm run check:boundaries`, pre-commit). Ava/Pulse/Intelligence cannot import each other. Insurance is already "delivered under Pulse" per the repo CLAUDE.md, and `SendInsuranceFormButton` already renders inside `continuity/page.tsx` — so the insurance move introduces **no new** cross-module import.
- **Owner Summary four-tile layout is canonical** ("don't substitute a generic dashboard"). We keep the 4-tile grid exactly; we only add interaction (hover + link) and fix data state. No layout redesign of the tiles.
- **RBAC preserved.** Settings access by role is unchanged: clinicians see only password/MFA; owner/admin/superadmin see everything. The new tab shell must gate tabs by role, not just hide cards.
- **Brand tokens only.** Colours/typography/radius from `brand.ts` and the 4/8/12/16/20/24/50 radius scale. No new values.
- **Surgical.** Reuse existing section components unchanged where possible; wrap, don't rewrite.
- **No `console.log`, no `--no-verify`.** Pre-commit (lint + secret scan + boundaries) must pass.

---

## Workstream 1 — Cards: sync, hover, click-through

### 1a. Home overview tiles (`dashboard/page.tsx` + `src/components/owner-summary/*`)

Tiles: Revenue, Today, Retention, Utilisation. Each is a presentational `GlassCard variant="hero"` with no inner interactive elements.

- **Hover lift:** Already supported by `GlassCard` (it tracks `hovered` internally and applies `motionTokens.hoverLift[variant]` + `--shadow-elevated`). The tiles render as `hero`, so the lift exists at the component level. Confirm it is actually firing visually; if the tiles read "flat", the cause is most likely (a) the wrapping/stacking context or (b) the `surface-emboss`/`--surface-tile` overriding the shadow. Fix at that level — do **not** add a second bespoke hover animation.
- **Click-through:** Wrap each tile's `<GlassCard>` in a Next `<Link>`. The tiles have no inner buttons, so whole-card-as-link is safe and gives prefetch + correct a11y. Mapping (confirmed with Jamal, driven by existing tile tints):

  | Tile | Tint | Links to |
  |---|---|---|
  | Revenue | intelligence | `/intelligence` |
  | Today | pulse | `/continuity` |
  | Retention | pulse | `/continuity` |
  | Utilisation | ava | `/receptionist` |

  (`/receptionist` is Ava's route — there is no `/ava`.)
- Add a subtle affordance that the tile is now clickable (e.g. cursor + a small chevron/`ArrowUpRight` on hover) using existing icon set + tokens.

### 1b. Billing module cards (`billing/page.tsx`)

Cards: Intelligence / Ava / Pulse (`ModuleCard`), plus the Full Stack bundle card.

- **Active-state accuracy ("wrong active state"):** active state comes from `useEntitlements().hasModule(key)`. Verify `isActive` reflects the clinic's true entitlements and that `isDemo` (demo account) is the only path that shows demo badges. Fix any mismatch at the entitlement source, not in the card.
- **Click-through with a nested-button caveat:** these cards contain an "Activate" button, so we **cannot** wrap the whole card in a `<Link>` (nested interactive elements). Instead add an explicit "View module →" link affordance inside each card pointing to its module page (`/intelligence`, `/receptionist`, `/continuity`). The Activate button keeps its own action.
- **Hover:** same `GlassCard` hover lift; ensure these cards use a hover-capable variant (not `row`).

### 1c. The data-sync reality ("not synced / wrong shit / placeholder")

This is **partly not a code bug** and must be treated honestly:

- `useOwnerSummary` only returns hardcoded `DEMO_DATA` when `user.uid === "demo"`. Real users already subscribe to live `appointments`/`patients`.
- The "placeholder numbers" path is `clinicProfile.dataMode === "sample"` → the `SampleDataBanner` explicitly says "every metric here was written by a seed script, not your live PMS." That is resolved operationally: `npm run purge:seed` + connect a live PMS — **not** by editing card code.

**D1 RESOLVED (2026-06-24, read from Firestore `clinics/clinic-spires`):** the clinic is on **`dataMode: "sample"`** — 2097 seeded appointments + 728 seeded patients. The "wrong/placeholder numbers" are seed data the `SampleDataBanner` already warns about, **not** a card bug. Fix is operational and destructive: `npm run purge:seed -- --apply` (optionally `--nuke-all-patients`) then connect live Cliniko sync (`pmsType: "cliniko"`). **This UI pass does NOT run the purge** — it is a destructive action on the dogfood clinic and needs Jamal's explicit go-ahead. Workstream 1's *code* deliverables (hover, link, active-state) ship regardless and complement the `ship/kpi-connection-gate` connection-gating work.

---

## Workstream 2 — Insurance: consolidate under Pulse, remove from billing

**Target:** all insurance UI lives under Pulse; billing has none.

- **Remove from billing:** delete `InsuranceAddonCard` (defined in `billing/page.tsx` ~lines 290–331) and its render (~line 601). Billing keeps only tiers/modules/Full Stack/seats.
- **Add a 4th Pulse tab:** extend `type View = "patients" | "sequences" | "log"` → add `"insurance"` (`continuity/page.tsx:56`), add the tab button to the tab bar (~lines 214–242), and add an `{activeView === "insurance" && (...)}` panel.
- **Insurance panel contents (consolidated):**
  - The add-on/context copy that previously lived in `InsuranceAddonCard` (relocated, restyled as a Pulse panel — not a billing upsell tile).
  - The existing `SendInsuranceFormButton` action (move it from its current standalone spot at ~line 157 into this panel).
  - A status overview + a link to the existing staff review queue at `/compliance/insurance` (we **link**, not duplicate — that route stays the system of record). See Open Decision D2.
- **Gating (corrected after D1 — `insuranceIntake: false` for Spires):** the insurance tab is **always present** under Pulse so it doesn't vanish for clinics with the flag off. Content is flag-aware: when `featureFlags.insuranceIntake` is **off**, show the relocated add-on/upsell context (the old billing card's purpose); when **on**, show the full tooling (send form + review-queue link). Do **not** hard-gate the tab on the flag.

---

## Workstream 3 — Settings: 4-tab horizontal layout

Replace the single long scroll in `settings/page.tsx` with a horizontal tab shell. **Reuse the existing section components unchanged** — only the container changes.

- **Tab mechanism:** mirror the proven `continuity` pattern — a `type SettingsTab` union + `activeTab` state + a horizontal tab bar; render the active tab's panels below.
- **Panel aesthetic:** Outreach's modular `GlassCard` panels (sectioned, glassy), matching `StrydeOutreach/app/dashboard.css` + `AgentCard`/panel rhythm. Use `GlassCard` from the dashboard's own `ui/GlassCard.tsx` (do not import across apps — replicate the *look*, reuse our own component).
- **Tabs → existing sections:**

  | Tab | Existing components |
  |---|---|
  | **Account** | Profile card, Security card (password/MFA), retrigger-tour |
  | **Clinic** | Clinic details, Targets, Onboarding checklist |
  | **Integrations** | PMS integration, HEP integration, data sources (Heidi / Google Reviews / TM3) |
  | **Team** | Clinicians list + roles, add-new, seat-limit modal |

- **RBAC gating (critical):** a clinician may only access password/MFA. So for `role === "clinician"`, render **only** the Account tab (and within it, only the security/password section) — the Clinic / Integrations / Team tabs must not appear. Owner/admin/superadmin see all four. This preserves the existing `canManageTeam` / role checks; they move from "conditionally render section" to "conditionally render tab + section".
- **Default tab:** Account.

---

## Out of scope (non-goals)

- No new routes, no routing/middleware/auth changes.
- No redesign of the 4-tile owner-summary layout (canonical) — interaction only.
- No rewrite of individual settings section components — only re-housing them in tabs.
- No new insurance functionality — relocation + consolidation only.
- No change to entitlement/PMS sync *architecture*; at most a targeted bug fix once D1 is scoped.
- Purging seed data / connecting a PMS is an ops action, not part of this code pass.

---

## Testing

- `npm run lint`, `npm test` (vitest), `npm run check:boundaries` must pass.
- Playwright: extend/append E2E coverage for (a) tiles navigate to the right module routes, (b) Pulse shows the insurance tab and billing shows no insurance, (c) settings tabs switch and a clinician sees only Account.
- Manual: dark-mode hover lift on all cards; role-based settings tab visibility (clinician vs owner).

---

## File touch list (anticipated)

- `src/app/dashboard/page.tsx` — wrap tiles in `<Link>`, hover affordance.
- `src/components/owner-summary/{RevenueTile,TodayTile,RetentionTile,UtilisationTile}.tsx` — optional click affordance (chevron on hover); keep presentational.
- `src/app/billing/page.tsx` — remove `InsuranceAddonCard` + render; add "View module →" affordance to module cards; verify active-state.
- `src/app/continuity/page.tsx` — extend `View` union, add insurance tab + panel; relocate `SendInsuranceFormButton`.
- Insurance panel: reuse existing insurance components/copy; link to `/compliance/insurance`.
- `src/app/settings/page.tsx` — tab shell wrapping existing section components; role-gated tabs.
- Possibly a small `SettingsTabs`/`Tabs` presentational helper if one doesn't already exist (check before creating).
- E2E specs under `dashboard/e2e/`.

`GlassCard.tsx` is **not** modified — clickability is achieved by wrapping in `<Link>` (tiles) or adding inner link affordances (billing cards).

---

## Decisions (resolved 2026-06-24)

- **D1 — Card data-sync root cause — RESOLVED:** Spires is on `dataMode: "sample"` (2097 seeded appts / 728 patients). Not a card bug. Ops fix (purge seed + connect Cliniko) is destructive and deferred to Jamal's explicit go-ahead; it is **out of scope** for this UI pass. Card code work (hover/link/active-state) proceeds.
- **D2 — Insurance review queue — RESOLVED:** the Pulse insurance tab **links out** to the existing `/compliance/insurance` staff queue (surgical; that route stays the system of record). No embed.
- **D3 — Billing card click target — RESOLVED:** add a "View module →" link affordance inside each billing module card (the Activate button blocks whole-card-as-link). No `stopPropagation` card-body click.
