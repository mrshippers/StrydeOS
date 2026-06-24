# Dashboard UI Fix Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard cards clickable+hover-lifted+linked, consolidate every insurance surface under a new 4th Pulse tab (off billing), and convert the settings long-scroll into a 4-tab horizontal layout.

**Architecture:** Pure frontend changes in `dashboard/src` (Next.js 15 App Router, client components). Cards become links via Next `<Link>` wrapping (tiles) or inner link affordance (billing cards). Insurance UI moves into a new `InsurancePanel` component rendered as a `continuity` tab. Settings sections are re-housed under a tab shell without rewriting the section components.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, `motion/react`, lucide-react, canonical `GlassCard` + `@/lib/brand` + `@/lib/motion`.

## Global Constraints

- Routing subsystem is a hard-stop: add `<Link>` nav to existing routes only; no new/renamed routes, no middleware/auth changes.
- Module boundaries enforced (`npm run check:boundaries`, pre-commit): no Ava/Pulse/Intelligence cross-import. `components/insurance/*` is already consumed by Pulse — keep it there.
- Brand tokens only (`@/lib/brand`, radius scale 4/8/12/16/20/24/50). No new colour/typography values.
- Canonical `GlassCard` is NOT modified; clickability via wrapping/inner links.
- Owner Summary 4-tile layout stays canonical — interaction only, no layout redesign.
- RBAC: clinician → Account tab only (Profile + Security); owner/admin/superadmin → all four settings tabs.
- No `console.log`. No `--no-verify`. Node 22.x. Run all commands from `dashboard/`.
- Insurance "wrong data" (dataMode=sample) is OUT of scope — deferred destructive ops action.

## Module → route map (used by Tasks 1 & 2)

`intelligence → /intelligence`, `ava → /receptionist`, `pulse → /continuity`.

---

### Task 1: Home overview tiles — clickable + hover affordance

**Files:**
- Modify: `src/app/dashboard/page.tsx` (tile grid, lines 191–205)
- Modify: `src/components/owner-summary/RevenueTile.tsx`, `TodayTile.tsx`, `RetentionTile.tsx`, `UtilisationTile.tsx` (add hover chevron in header row)

**Interfaces:**
- Produces: tiles wrapped in `<Link>` with `group` class; each tile header shows an `ArrowUpRight` that fades in on `group-hover`.
- Consumes: nothing from other tasks.

- [ ] **Step 1:** In `dashboard/page.tsx`, replace the 4 bare tile elements (lines 192–204) with `<Link>`-wrapped versions. `ArrowUpRight` already importable from lucide. Pattern per tile:

```tsx
<Link href="/intelligence" aria-label="Open Intelligence" className="group block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/40">
  <RevenueTile revenueMtdPence={revenueMtdPence} periodLabel={periodConfig.revenueLabel} loading={loading} />
</Link>
```

Targets: Revenue→`/intelligence`, Today→`/continuity`, Retention→`/continuity`, Utilisation→`/receptionist`. (`Link` is already imported in this file.)

- [ ] **Step 2:** In each tile component, add the chevron to the existing header `<div className="flex items-center gap-2">` row — append after the label `<span>`:

```tsx
<ArrowUpRight size={14} className="ml-auto opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 text-navy/40 dark:text-white/40" />
```

Add `ArrowUpRight` to each tile's lucide import. The `group` class on the wrapping `<Link>` drives the hover.

- [ ] **Step 3:** Verify hover lift fires. `GlassCard variant="hero"` already applies `motionTokens.hoverLift.hero` on its own `onMouseEnter`; wrapping in `<Link>` does not block it. Visually confirm in Step (Task 5 build) — no code needed unless lift is suppressed by `surface-emboss` (if so, it's a CSS token issue, not the card).

- [ ] **Step 4:** `npm run lint` — expect clean.

- [ ] **Step 5:** Commit: `feat(dashboard): tiles link to their module + hover affordance`

---

### Task 2: Billing — remove insurance, add "View module →" link

**Files:**
- Modify: `src/app/billing/page.tsx` (remove `InsuranceAddonCard` def lines 288–331 + render line 600–601; add module route map + link in `ModuleCard`)

**Interfaces:**
- Consumes: module→route map (above).
- Produces: billing page with zero insurance references; active module cards show a "View module →" link.

- [ ] **Step 1:** Delete the `InsuranceAddonCard` function (lines 288–331) and its render+comment (lines 600–601). `ArrowRight` and `Lock` imports remain used elsewhere (demo banner / ModuleCard badge) — keep them.

- [ ] **Step 2:** Add a route map near the top of the file (after imports):

```tsx
const MODULE_ROUTE: Record<ModuleKey, string> = {
  intelligence: "/intelligence",
  ava: "/receptionist",
  pulse: "/continuity",
};
```

- [ ] **Step 3:** Add `Link` import: `import Link from "next/link";` (not currently imported). In `ModuleCard`, in the CTA block, add a "View module →" link for the **active** state (currently renders `null`). Replace the trailing `: null}` of the CTA ternary with:

```tsx
) : isActive ? (
  <Link
    href={MODULE_ROUTE[moduleKey]}
    className="mt-auto inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold transition-opacity opacity-80 hover:opacity-100"
    style={{ color }}
  >
    View module <ArrowRight size={13} />
  </Link>
) : null}
```

- [ ] **Step 4:** Confirm active-state correctness: `isActive={hasModule(moduleKey)}` already reads entitlements/featureFlags (Spires: intelligence/receptionist/continuity all true → "Active"). No change needed; just verify no regression.

- [ ] **Step 5:** `npm run lint` — expect clean (watch for unused-import errors after deletion).

- [ ] **Step 6:** Commit: `feat(billing): remove insurance add-on (moved to Pulse) + module view links`

---

### Task 3: Insurance panel + 4th Pulse tab

**Files:**
- Create: `src/components/insurance/InsurancePanel.tsx`
- Modify: `src/app/continuity/page.tsx` (View union line 56; remove standalone SendInsuranceFormButton lines 155–158; add tab + panel)

**Interfaces:**
- Produces: `<InsurancePanel />` (default export, no required props). Renders flag-aware add-on context + `SendInsuranceFormButton` (owner/admin only via its own guard) + a link to `/compliance/insurance` (gated to owner/admin/superadmin).
- Consumes: `useAuth().user.clinicProfile.featureFlags.insuranceIntake`, `user.role`.

- [ ] **Step 1:** Create `InsurancePanel.tsx`:

```tsx
"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import SendInsuranceFormButton from "@/components/insurance/SendInsuranceFormButton";
import { useAuth } from "@/hooks/useAuth";
import { ShieldCheck, ArrowRight, ClipboardList } from "lucide-react";

export default function InsurancePanel() {
  const { user } = useAuth();
  const flags = user?.clinicProfile?.featureFlags;
  const enabled = !!flags?.insuranceIntake;
  const canManage = !!user && ["owner", "admin", "superadmin"].includes(user.role);

  return (
    <div className="animate-fade-in space-y-4">
      <GlassCard variant="standard" tint="pulse" className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded mb-3 bg-cloud-dark text-navy">
              <ShieldCheck size={9} strokeWidth={2.5} /> {enabled ? "Active" : "Add-on"}
            </div>
            <h3 className="text-[20px] text-navy font-display font-normal mb-1">Insurance &amp; Intake</h3>
            <p className="text-[13px] text-muted mb-4 max-w-md">
              Collect patient insurance, pre-authorisation and confirmed address before the
              appointment — written straight back to your PMS. Delivered under Pulse.
            </p>
            {enabled && canManage && (
              <div className="flex items-center gap-3">
                <SendInsuranceFormButton />
                <Link
                  href="/compliance/insurance"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal hover:opacity-80 transition-opacity"
                >
                  <ClipboardList size={13} /> Review queue <ArrowRight size={12} />
                </Link>
              </div>
            )}
            {!enabled && (
              <a
                href={"mailto:jamal@strydeos.com?subject=" +
                  encodeURIComponent("StrydeOS Insurance & Intake add-on") +
                  "&body=" +
                  encodeURIComponent("I'd like to add the Insurance & Intake module to our StrydeOS account.")}
                className="btn-primary btn-primary-teal inline-flex w-fit justify-center"
              >
                Enable Insurance &amp; Intake <ArrowRight size={14} />
              </a>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 2:** In `continuity/page.tsx`: extend the union (line 56) → `type View = "patients" | "sequences" | "log" | "insurance";`

- [ ] **Step 3:** Remove the standalone insurance button block (lines 155–158, the `{/* Manual failsafe ... */}` div). Add `import InsurancePanel from "@/components/insurance/InsurancePanel";` and add `ShieldCheck` to the lucide import.

- [ ] **Step 4:** Add the tab to the tab array (after the `log` entry, ~line 219): `{ id: "insurance" as const, label: "Insurance", icon: ShieldCheck },`

- [ ] **Step 5:** Add the panel render after the Send Log block (after line 420):

```tsx
{activeView === "insurance" && <InsurancePanel />}
```

- [ ] **Step 6:** `npm run lint` + `npm run check:boundaries` — expect clean.

- [ ] **Step 7:** Commit: `feat(pulse): consolidate insurance into a 4th Pulse tab`

---

### Task 4: Settings — 4-tab horizontal layout

**Files:**
- Modify: `src/app/settings/page.tsx` (wrap existing sections in a tab shell; keep section components untouched)

**Interfaces:**
- Produces: tabbed settings; modals (unsaved-changes dialog, SeatLimitModal) stay mounted regardless of active tab.
- Consumes: existing `canManageTeam`.

- [ ] **Step 1:** Add tab type + state at top of `SettingsPage` (after `const cp = ...`):

```tsx
type SettingsTab = "account" | "clinic" | "integrations" | "team";
const [activeTab, setActiveTab] = useState<SettingsTab>("account");
```

- [ ] **Step 2:** Build the tab list (after `canManageTeam` is defined, ~line 459):

```tsx
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = canManageTeam
  ? [
      { id: "account", label: "Account" },
      { id: "clinic", label: "Clinic" },
      { id: "integrations", label: "Integrations" },
      { id: "team", label: "Team" },
    ]
  : [{ id: "account", label: "Account" }];
```

- [ ] **Step 3:** In the returned JSX, after `<PageHeader … />`, render a tab bar (hidden when only one tab), styled like the continuity tab bar for portal consistency:

```tsx
{SETTINGS_TABS.length > 1 && (
  <div className="flex items-center gap-1 bg-cloud-light rounded-xl p-1 border border-border w-full overflow-x-auto">
    {SETTINGS_TABS.map((t) => (
      <button
        key={t.id}
        onClick={() => setActiveTab(t.id)}
        className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
          activeTab === t.id ? "bg-white text-navy shadow-[var(--shadow-card)] button-highlight" : "text-muted hover:text-navy"
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4:** Wrap the existing section groups in `{activeTab === "..." && (<> ... </>)}` blocks, reusing the EXISTING components verbatim:
  - **account:** `RetriggerTourButton` wrapper div + `<ProfileCard />` + `<SecurityCard />`
  - **clinic:** `OnboardingChecklist` (keep `showOnboarding` guard) + ClinicDetails/Targets grid + Save button
  - **integrations:** `PmsIntegrationCard` + `HepIntegrationCard` + Compatible Data Sources block
  - **team:** `TeamManagementCard`
  - Keep the existing `canManageTeam` guards on clinic/integrations/team blocks (defence in depth even though the tab is hidden).
  - Keep the unsaved-changes `<AnimatePresence>` dialog and `<SeatLimitModal>` rendered OUTSIDE the tab switch (always mounted — they are overlays).

- [ ] **Step 5:** `npm run lint` — expect clean.

- [ ] **Step 6:** Commit: `feat(settings): 4-tab horizontal layout (Account/Clinic/Integrations/Team)`

---

### Task 5: Verify — build, lint, tests, boundaries, E2E

**Files:**
- Possibly add/extend: `dashboard/e2e/*` (only if an obvious existing spec covers these pages; otherwise rely on build+lint+unit and note manual checks)

- [ ] **Step 1:** `npm run lint` — clean.
- [ ] **Step 2:** `npm run check:boundaries` — clean.
- [ ] **Step 3:** `npm test` (vitest) — green (or unchanged from baseline; note any pre-existing failures).
- [ ] **Step 4:** `npm run build` — succeeds.
- [ ] **Step 5:** Manual smoke (note in PR): tiles navigate to /intelligence,/continuity,/continuity,/receptionist; billing has no insurance + active cards link out; Pulse shows Insurance tab; settings shows 4 tabs (owner) / Account only (clinician).

---

### Task 6: Ship — push, preview, PR

- [ ] **Step 1:** Confirm commits are clean and on `ship/dashboard-ui-fix-pass`.
- [ ] **Step 2:** Push branch: `git push -u origin ship/dashboard-ui-fix-pass`.
- [ ] **Step 3:** Confirm Vercel preview deploy triggers (auto on push).
- [ ] **Step 4:** Open PR targeting `ship/kpi-connection-gate` with summary, the D1/D2/D3 decisions, the deferred purge:seed ops note, and prod-promote instructions.

---

## Self-review

- **Spec coverage:** WS1 cards → Tasks 1+2; WS2 insurance → Tasks 2(remove)+3(Pulse); WS3 settings → Task 4; testing → Task 5; ship → Task 6. D1 (out of scope, deferred), D2 (link out — Task 3 Step 1), D3 (View module link — Task 2 Step 3) all covered.
- **Placeholders:** none — all code present.
- **Type consistency:** `View` union extended consistently; `SettingsTab` defined once and used in state+list; `MODULE_ROUTE` keyed by `ModuleKey`; `InsurancePanel` default export matches import.
- **Gap check:** "wrong numbers" is intentionally deferred (D1, dataMode=sample) and flagged, not silently dropped.
