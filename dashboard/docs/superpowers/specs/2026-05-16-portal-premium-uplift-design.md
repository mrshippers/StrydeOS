# Portal Premium UX/UI Uplift - Design

**Date:** 2026-05-16
**Status:** Approved (brainstorming complete, ready for `writing-plans`)
**Owner:** Jamal
**Branch:** `portal-premium-uplift` (single worktree, fix-per-commit)
**Scope target:** every authenticated portal surface - pilot Intelligence, then parallel fan-out

---

## Context

The portal IS the product. Clinic owners pay £69–£399/month and spend their working day inside it. Current state reads as a Retool template, not £200–£400/month clinical software. This work closes that gap by landing the existing StrydeOS pattern library - six-layer PS5 glass, three-layer shadow stacks, sliding pill indicators, two-stage value morphs, drifting ambient glows, double-rAF mount fades - at full fidelity inside the dashboard.

The pattern library is canonical and locked. It is lifted verbatim from:

- `website/ava-conversation-card.jsx:647-695` - six-layer glass primitives (L1 top catch-light, L2 diagonal sheen, L3 radial light source, L4 bottom edge reflection, L5 left edge sheen, L6 inner border highlight)
- `website/components/ModulePricingBanner.jsx:50` - double rAF mount fade
- `website/components/ModulePricingBanner.jsx:53-60` - two-stage value morph (150ms out → swap → 30ms in)
- `website/components/ModulePricingBanner.jsx:103` - sliding pill (`transition: left 0.4s cubic-bezier(0.16,1,0.3,1)`)
- `website/prototypes/strydeos-pricing-section.jsx:142-169, 325-348` - drift glow keyframes

Failure mode this design prevents: previous attempts skipped architecture, invented patterns instead of lifting from canon, shipped without telemetry. Same anti-pattern that caused the Ava sync bug, applied to design. Result was a product that looks cheaper than it is priced.

---

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Scope = all authenticated surfaces, pilot Intelligence first, fan out in parallel after sign-off | Intelligence is one route (`/intelligence`) with five components → tight feedback loop before broader risk |
| D2 | Single `<GlassCard variant="hero \| primary \| standard \| row">` wrapper owns glass + shadow + hover + mount fade | One canonical implementation; mount fade is universal per Fix 7 → belongs in the wrapper, not opt-in |
| D3 | Motion hooks (`useMorphValue`, `useSlidingPill`, `useDoubleRAF`) separate at `src/lib/motion.ts` | Content-level motion is per-call (a value changing, a tab selecting), not card-level |
| D4 | One worktree `portal-premium-uplift`, fix-per-commit | Single Vercel preview chain, single PR (or grouped PRs), clean ADR linkage |
| D5 | Tokens split into `src/lib/tokens/{colors,shadows,motion,glass,index}.ts`; `brand.ts` becomes thin re-export | Reliability at scale, zero import breakage for existing consumers |
| D6 | Lighthouse gate = `/intelligence` only | Token system is shared; regression on the pilot route surfaces shared regressions |
| D7 | ADR lives in repo at this path only - Notion skipped | Single source of truth, no sync risk |
| D8 | Show-me checkpoint after pilot = preview URL + before/after screenshots + contrast audit JSON + Sentry delta + Lighthouse delta | Eyeball + sign-off in chat |

---

## Card archetype inventory

Every dashboard card maps to one of four variants. One additional primitive (`segment`) covers sliding-pill toggles.

| Variant | Hover lift | Border opacity rest → hover | Drift glow default | Use for |
|---|---|---|---|---|
| `hero` | `translateY(-6px) scale(1.015)` | 0.07 → 0.6 | **on** | Owner-summary tiles, module landing heroes, banners |
| `primary` | `translateY(-6px) scale(1.015)` | 0.07 → 0.6 | off | High-emphasis KPI cards, primary modals |
| `standard` | `translateY(-2px)` | 0.07 → 0.6 | off | Workhorse - most cards |
| `row` | none | static 0.07 | off | Table rows / list items inside an enclosing card |

Component → variant map (canonical):

| Variant | Components |
|---|---|
| `hero` | `owner-summary/RetentionTile`, `RevenueTile`, `TodayTile`, `UtilisationTile`, `intelligence/InsightBanner`, `intelligence/EventsActionedByPulseTile` |
| `primary` | `ui/StatCard`, `intelligence/KpiProjectionStrip` cells, `pulse/PatientEditModal`, `settings/_components/SeatLimitModal`, `settings/_components/SecurityCard` 2FA dialog |
| `standard` | `intelligence/InsightEventCard`, `intelligence/InsightFeed` items, `pulse/SequenceCard`, `pulse/ComplexityPanel`, `pulse/RiskFactorPanel`, `pulse/SessionThresholdStrip`, `pulse/ClinicalNotesPanel`, `pulse/CustomisePanel`, `ava/KnowledgeCategoryCard`, `ava/KnowledgeEntryRow`, every `settings/_components/*Card.tsx`, `ui/EmptyState`, `ui/EmptyStateCard`, `ui/InsightNudge`, `ui/TodaysFocus` |
| `row` | `ui/CliniciansTable` rows, `pulse/PatientBoard` rows, `settings/_components/pms/ImportHistory` rows |
| `segment` primitive (not a card) | `continuity/page.tsx:215-226` tab toggle, `settings/page.tsx` tabs |

---

## Composition - `<GlassCard>` wrapper

**Location:** `dashboard/src/components/ui/GlassCard.tsx` (shared; module-boundary safe - Ava/Pulse/Intelligence can all import from `ui/`).

### API

```ts
type Variant = 'hero' | 'primary' | 'standard' | 'row';
type Tint = 'ava' | 'pulse' | 'intelligence' | 'neutral';

interface GlassCardProps {
  variant?: Variant;       // default 'standard'
  tint?: Tint;             // ambient glow + hover border colour; default 'neutral'
  ambient?: boolean;       // override drift glow; default true for 'hero', false otherwise
  as?: 'div' | 'section' | 'article' | 'aside';  // default 'div'
  className?: string;      // content padding/layout only - must not override depth
  children: React.ReactNode;
}
```

### Baked in (zero opt-out)

- Six layers L1-L6 rendered as `position: absolute`, `pointer-events: none`, on a parent with `overflow: hidden`. Lifted verbatim from `website/ava-conversation-card.jsx:647-695`.
- Three-layer rest shadow → three-layer hover shadow (see Fix 3 values).
- Hover lift + border opacity transition (see Fix 4 values).
- Mount fade via `useDoubleRAF()`: opacity 0→1 + translateY(12→0) over 500ms with the canonical easing.
- `tint` drives ambient glow colour for `hero` (radial gradient at 4-6% module-color alpha) and the hover border tint.

### Module-boundary safety

`GlassCard` consumes `tint` (`'ava' | 'pulse' | 'intelligence' | 'neutral'`) and resolves the colour internally via `moduleColors`. Consumer modules pass a string, not a colour value - no cross-module imports.

---

## Tokens directory

### File tree

```
dashboard/src/lib/
├── brand.ts                  # thin barrel - re-exports everything below
└── tokens/
    ├── colors.ts             # existing palette + dark-mode lifts (Fix 1)
    ├── shadows.ts            # rest stack, hover stack, modal stack
    ├── motion.ts             # EASING, DURATION, lift values, drift keyframes
    ├── glass.ts              # L1-L6 gradient strings + ambient opacities
    └── index.ts              # `export * from './colors' ...` barrel
```

### `brand.ts` after migration (the entire file)

```ts
export { brand, moduleColors, hexToRgba } from './tokens/colors';
export type { BrandColor } from './tokens/colors';
export { shadows } from './tokens/shadows';
export { motion as motionTokens } from './tokens/motion';
export { glass } from './tokens/glass';
```

Every existing `import { brand, moduleColors, hexToRgba } from '@/lib/brand'` keeps working. No flag day. Future code grows toward `from '@/lib/tokens'`.

### What goes where

- `colors.ts` - current `brand`, `moduleColors`, `hexToRgba` + **dark-mode token lifts from Fix 1**. The dark-mode block in `globals.css:65-76` already exists; this file owns the source values referenced from there.
- `shadows.ts` - three named stacks: `rest`, `hover`, `modal`. Each a `string` (CSS box-shadow value, comma-separated layers).
- `motion.ts` - `EASING`, `DURATION` object, `hoverLift` per variant.
- `glass.ts` - opacities and gradient strings for L1-L6, plus ambient glow opacities per variant.

---

## Motion - `dashboard/src/lib/motion.ts`

```ts
export const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

export const DURATION = {
  mount: 500,
  hover: 300,
  pill: 400,
  morphOut: 150,
  morphIn: 30,
  subtitleDelay: 30,
} as const;

export function useDoubleRAF(): boolean;
// Returns `mounted`; flips true after 2× rAF. GlassCard uses internally for mount fade.

export function useMorphValue<T>(target: T): { value: T; isAnimating: boolean };
// 150ms out → swap → 30ms in. Consumer binds opacity to !isAnimating.
// Use for: any number/string that animates between renders (KPI counters, prices, status badges).

export function useSlidingPill(
  activeIndex: number,
  count: number
): { pillStyle: React.CSSProperties };
// Returns inline style for the absolute-positioned pill underneath buttons.
// Pattern: pill zIndex 1, buttons transparent zIndex 2.
```

All three hooks ≤40 LOC each. No new dependencies.

### `useMorphValue` reference behaviour

```tsx
const { value, isAnimating } = useMorphValue(currentKpi);

<div style={{
  opacity: isAnimating ? 0 : 1,
  transform: isAnimating ? 'translateY(6px)' : 'translateY(0)',
  transition: `all ${DURATION.morphOut}ms ease`,
}}>
  {value}
</div>
<p style={{
  opacity: isAnimating ? 0 : 1,
  transform: isAnimating ? 'translateY(4px)' : 'translateY(0)',
  transition: `all ${DURATION.morphOut}ms ease ${DURATION.subtitleDelay}ms`,
}}>
  Subtitle
</p>
```

Subtitle stagger is non-negotiable - 30ms delay after the headline.

### `useSlidingPill` reference behaviour

Pill zIndex 1 (absolute, positioned via returned `left`/`width`). Buttons zIndex 2 (transparent background). Transition is `left 0.4s ${EASING}`. Zero jump-cuts anywhere in the portal.

---

## Six-layer glass system (Fix 2)

Lifted verbatim from `website/ava-conversation-card.jsx:647-695`. All six rendered inside `GlassCard` with `position: absolute`, `pointer-events: none`. Parent has `overflow: hidden`.

| Layer | Role | Reference line |
|---|---|---|
| L1 | Top catch-light | `:649` |
| L2 | Full diagonal sheen | `:658` |
| L3 | Radial light source - `radial-gradient(circle, rgba(255,255,255,0.2), transparent 65%)` | `:673-677` |
| L4 | Bottom edge reflection | `:681` |
| L5 | Left edge sheen | `:688` |
| L6 | Inner border highlight | `:695` |

Tokens move to `tokens/glass.ts`. Exact opacity and gradient values are mechanical lifts - implementer copies from the canonical file, does not invent.

---

## Three-layer shadow stack (Fix 3)

Replace every single-layer shadow in the portal. Defined in `tokens/shadows.ts`.

```ts
export const shadows = {
  rest:  '0 1px 2px rgba(0,0,0,0.03), 0 4px 24px rgba(0,0,0,0.04), 0 12px 48px rgba(0,0,0,0.02)',
  hover: '0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06), 0 16px 56px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)',
  modal: '0 32px 80px rgba(0,0,0,0.25)',
} as const;
```

`globals.css:28-29` previously defined `--shadow-card` and `--shadow-elevated` as single-layer. After migration those CSS variables are sourced from `shadows.ts` via the build (or replaced inline in the wrapper). Single-layer `shadow-[var(--shadow-card)]` usages get eliminated as components migrate to `GlassCard`.

---

## Hover lift (Fix 4)

Defined in `tokens/motion.ts`.

```ts
export const motion = {
  hoverLift: {
    hero:     { transform: 'translateY(-6px) scale(1.015)' },
    primary:  { transform: 'translateY(-6px) scale(1.015)' },
    standard: { transform: 'translateY(-2px)' },
    row:      { transform: 'none' },
  },
  borderOpacity: { rest: 0.07, hover: 0.6 },
} as const;
```

Transitions use `${EASING}` over `DURATION.hover` (300ms).

---

## Drift glow (Fix 5)

Hero variant only. Two overlapping radial blobs, second offset by 2s with reversed direction.

```css
@keyframes driftGlow {
  0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
  50%      { transform: translate(20px, -10px) scale(1.1); opacity: 0.9; }
}
```

Applied to two absolutely-positioned blobs inside `hero` cards when `ambient !== false`. Keyframes live in `globals.css`; the wrapper toggles classes that consume them. Blobs use module `tint` colour at 4-6% alpha (matches `ModulePricingBanner.jsx:84`).

---

## Sliding pill (Fix 6)

Every segmented control in the portal uses `useSlidingPill`. No CSS transitions on individual buttons - the pill moves, the buttons stay transparent.

Concrete consumer migrations:
- `app/continuity/page.tsx:215-226` - main tab toggle
- `app/settings/page.tsx` - tab toggle (writing-plans will pin the exact selector by re-grepping the route at implementation time)

The pattern from `ModulePricingBanner.jsx:96-105` is the reference.

---

## Mount fade (Fix 7)

Built into `GlassCard` via `useDoubleRAF()`. Single rAF misses the first paint frame; double rAF is mandatory.

```tsx
function useDoubleRAF() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id2);
    });
    return () => cancelAnimationFrame(id1);
  }, []);
  return mounted;
}
```

Wrapper style:

```tsx
style={{
  opacity: mounted ? 1 : 0,
  transform: mounted ? 'translateY(0)' : 'translateY(12px)',
  transition: `all ${DURATION.mount}ms ${EASING}`,
}}
```

---

## Two-stage value morph (Fix 8)

`useMorphValue(target)` returns `{ value, isAnimating }`. Consumer renders the value with opacity bound to `!isAnimating`. Stagger between primary value and subtitle is 30ms - non-negotiable.

Reference behaviour at `ModulePricingBanner.jsx:53-60` and `:122-128`.

---

## Fix 1 - Contrast audit (sequential gate)

This is the only fix that blocks all others. Premium standard = WCAG AA minimum, AAA where reasonable.

### Root cause (confirmed during exploration)

Dark mode tokens ARE defined in `globals.css:65-76`, but most dashboard components use hardcoded Tailwind classes (`text-navy`, `text-muted`, `text-ink`) instead of CSS variables. Dark mode swaps `--color-ink` from `#111827` to `rgba(255,255,255,0.95)` - but `text-navy` remains hardcoded to `#0B2545`, so dark text renders on dark background.

### Audit tool

Playwright script (attaches to existing Chrome over CDP per project `CLAUDE.md`) walks every authenticated route, every text node, computes contrast ratio of the rendered text colour against its computed background colour. Output: JSON table keyed by route → element selector → text colour → bg colour → ratio → pass/fail/AAA.

Location: `dashboard/scripts/audit-contrast.ts` (new). Runs via `npm run audit:contrast`.

### Targets

- Body text: ≥ 4.5:1 (AA)
- Large text (≥18.66px, or ≥14px bold): ≥ 3:1 (AA)
- Reach AAA (≥7:1) wherever the same token lift gets us there with no design cost.

### Fix strategy

- **Never darken backgrounds.** Always lift text token brightness in `tokens/colors.ts`.
- Replace hardcoded `text-navy` / `text-muted` / `text-ink` Tailwind classes with `text-[var(--color-ink)]` / `text-[var(--color-muted)]` etc.
- Where the same lift would also improve AAA, take it.

### Output

Before/after JSON table written to `dashboard/docs/superpowers/specs/2026-05-16-portal-premium-uplift-design.contrast.json` and summarised inline in the show-me checkpoint.

---

## Dispatch plan

### Phase 1 - Foundation (sequential, branch `portal-premium-uplift`)

| Commit | Description |
|---|---|
| A | `src/lib/tokens/{colors,shadows,motion,glass,index}.ts` + thin `brand.ts` re-export + `globals.css` shadow-variable update |
| B | `src/components/ui/GlassCard.tsx` + `src/lib/motion.ts` (`useDoubleRAF`, `useMorphValue`, `useSlidingPill`) + Vitest covering wrapper render and hook contracts |
| C | Fix 1 audit tool (`scripts/audit-contrast.ts`) + dark-mode token lifts in `tokens/colors.ts` → all-green |

Each commit independently builds, lints, and tests. No commit is merged until its Vercel preview build logs + runtime logs are clean and Sentry shows zero new issues vs baseline.

### Phase 2 - Intelligence pilot (sequential, same branch)

| Commit | Description |
|---|---|
| D | Migrate `src/app/intelligence/page.tsx` + all five `src/components/intelligence/*` to `GlassCard` + motion hooks |

After Commit D:
1. Vercel preview deploys.
2. Lighthouse runs on `/intelligence` (before/after pinned to Commit A baseline).
3. Contrast audit re-runs → all-green.
4. Sentry MCP confirms no new issues vs Commit A baseline.
5. **Show-me checkpoint** delivered to user: preview URL, side-by-side screenshots per component (light + dark), contrast audit JSON delta, Sentry delta, Lighthouse delta.
6. User signs off in chat **before** Phase 3 starts.

### Phase 3 - Parallel fan-out (after pilot sign-off, same branch)

Five concurrent agents dispatched via `dispatching-parallel-agents`. Each owns its surface; commits are sequential within a surface but parallel across surfaces. Code-reviewer + production-bug-hunter sweep each commit.

Each agent owns the modals co-located with their surface (PatientEditModal stays with Pulse, SeatLimitModal stays with Settings). Agent E owns only truly app-level chrome and errors.

| Agent | Surface | Paths |
|---|---|---|
| A | Ava | `src/app/receptionist/*`, `src/components/ava/*` |
| B | Pulse | `src/app/continuity/*`, `src/app/patients/*`, `src/components/pulse/*` (incl. PatientEditModal) |
| C | Owner landing + clinicians | `src/app/page.tsx`, `src/app/dashboard/*`, `src/app/clinicians/*`, `src/components/owner-summary/*` |
| D | Account, settings, billing | `src/app/settings/*`, `src/app/onboarding/*`, `src/app/mfa-setup/*`, `src/app/trial/*`, `src/app/billing/*`, `src/app/checkout/*`, `src/components/settings/*` (incl. SeatLimitModal, SecurityCard 2FA dialog), `src/components/onboarding/*` |
| E | Global chrome + errors | `CommandPalette.tsx`, `WhatsNew.tsx`, `TrialBanner.tsx`, `LockedModulePage.tsx`, `FirstLoginTour.tsx`, `ModuleGuard.tsx`, `InsightEngineUnlocked.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` |

Out of fan-out scope (and out of scope overall):
- `src/app/admin/*` - superadmin tooling, separate aesthetic
- `src/app/login/*` - auth screens, separate pass later if needed
- `src/app/help/*`, `src/app/privacy/*`, `src/app/compliance/*` - informational pages, low priority
- `src/app/api/*`, `src/app/api-docs/*` - non-rendered routes

After all five agents complete:
- Lighthouse re-runs on `/intelligence` to verify no drift from token-system changes.
- Contrast audit re-runs across all routes.
- Sentry watched 24h post-merge.

---

## Telemetry plumbing

### Sentry

- **Baseline**: capture dashboard project issue count + 24h new-issue rate via Sentry MCP **before Commit A**. Recorded in this spec's commit message AND in the PR description.
- **Watch**: every commit on `portal-premium-uplift` checks Sentry for new issues vs baseline.
- **Rule**: a regression introduced by a specific commit → revert that commit only. Do not revert the whole branch.

### Lighthouse

- **Route**: `/intelligence` (pilot).
- **Run mode**: mobile + desktop, performance + accessibility categories.
- **Baseline**: captured pre-Commit A, recorded in PR description.
- **Bar**: ≤3 point performance drop or revert the offending layer.
- **Reruns**: after Commit D (pilot), after Phase 3 (fan-out complete).

### Vercel

- Every commit on `portal-premium-uplift` produces a preview via `deploy_to_vercel` MCP.
- `get_deployment_build_logs` and `get_runtime_logs` must be clean before progressing.
- `get_access_to_vercel_url` produces the URL attached to each show-me checkpoint and PR.

### CDP browser

Per project `CLAUDE.md`: all Playwright/Chrome automation attaches to the existing instance at `http://localhost:9222`. Never launches. Used for the contrast audit and any in-situ demo of motion.

---

## Definition of done

### Per commit

1. Vercel preview build logs clean
2. Vercel preview runtime logs clean
3. `npm run lint` clean
4. `npm run build` succeeds
5. `npm test` passes (unit + integration)
6. `npm run check:boundaries` passes (pre-commit hook enforces this)
7. Sentry zero new issues vs baseline
8. code-reviewer agent run on the diff with no blocking findings

### Per phase

- **Phase 1**: foundation commits A–C land green; tokens directory in place; `GlassCard` + hooks have unit coverage; contrast audit produces all-green output for the routes it can already reach.
- **Phase 2 (pilot)**: `/intelligence` migrated; show-me checkpoint delivered (preview URL + screenshots + contrast JSON + Sentry delta + Lighthouse delta); user signs off in chat.
- **Phase 3 (fan-out)**: all five agents complete; Lighthouse on `/intelligence` within +3 points of baseline; contrast audit all-green across all routes; Sentry watched 24h post-merge with no regressions.

---

## Rollback strategy

- **Per commit**: each fix is one commit. `git revert <sha>` restores prior state cleanly.
- **Per token**: tokens are isolated in `tokens/*.ts`. A bad token value is one-line revert without touching consumers.
- **Per variant**: `GlassCard` variant logic is keyed; a bad variant can be force-mapped to `standard` as a hot-fix.
- **Per agent**: Phase 3 agents commit independently. One agent's bad surface can be reverted without affecting the others.

---

## Non-negotiables

From the prompt and project `CLAUDE.md`:

- Read `tokens/*` BEFORE component code. Brand tokens only from `tokens/*`. Missing token → add to `tokens/*`, never inline.
- No new dependencies.
- Surgical edits - no copy, routing, business logic, Firebase logic, auth, real-time listener, or multi-tenant data-model changes.
- Three modules. Names locked (`Ava`, `Pulse`, `Intelligence`).
- Module boundaries enforced - `npm run check:boundaries` runs at pre-commit. Don't bypass with `--no-verify`.
- No em dashes anywhere in code, comments, or copy (per user memory `feedback_no_em_dashes`). Single hyphens only.
- Border-radius scale strict: 4 / 8 / 12 / 16 / 20 / 24 / 50px only.
- Dark surfaces use Navy `#0B2545` - no pure black anywhere.
- Vercel build + runtime logs clean before merge.
- Sentry baseline captured before, watched after.
- ADR (this doc) finalised before Commit A.

### Do NOT touch

- `website/*` - marketing site, canonical reference, read-only.
- `Marketing Material/*` - brand assets, read-only.
- `brand.ts` colour values that already exist - only ADD dark-mode siblings.
- `src/app/login/*` - auth screens, separate concern.
- `src/app/admin/*` - superadmin surfaces, separate aesthetic.

---

## Out of scope

- Copy changes. Visual depth only.
- Routing changes.
- Business logic changes.
- Firestore schema or query changes.
- New routes or new components beyond `GlassCard` and the three motion hooks.
- The marketing website.
- Login / signup / MFA screens - separate pass.
- Admin tooling at `/admin` - separate aesthetic.

---

## Open items

- **ADR finalisation**: this document IS the ADR. Once user reviews and approves, it is locked.
- **Sentry baseline capture**: deferred to start of implementation (writing-plans phase will schedule it as the first action before Commit A).
- **Lighthouse baseline capture**: same - first action before Commit A.
- **Show-me checkpoint format**: confirmed - preview URL + screenshots + audit deltas + Sentry delta + Lighthouse delta in chat.

---

## Handoff

Next step after user approval of this spec: invoke the `writing-plans` skill to produce the implementation plan (concrete file edits, commit boundaries, agent prompts for Phase 3).
