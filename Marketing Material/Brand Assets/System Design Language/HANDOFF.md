# StrydeOS — Handoff to Claude Code

Pick this up and ship. Everything below is canonical. Don't second-guess it — the founder has signed off.

---

## What StrydeOS is

The Clinic OS for private physiotherapy practice. Three modules on one platform: **Ava** (AI voice receptionist), **Pulse** (patient retention), **Intelligence** (KPIs + benchmarks). Built by Driiva. Founder: Jamal Adu — qualified physio, founder of Spires Physiotherapy, London.

**ICP:** Independent clinic owners, 30s–50s, running 2–10 clinicians. Smart, time-poor, business-minded. Allergic to SaaS speak.

---

## The non-negotiables

1. **Read `CLAUDE.md` first.** That's the project memory. Every rule below has a one-line version there.
2. **Source all colour from `dashboard/src/lib/brand.ts`.** Never invent hexes. Deprecated: `#1648BC`, `#2968E0` — purge on sight.
3. **Two fonts only:** DM Serif Display (headings, 32px+) and Outfit (300–700, everything else). No Inter. No Roboto.
4. **The Monolith mark is gradient glass.** Always. The only exception is Solid Royal — and that's for app icons / favicons only. Email signatures, web headers, marketing → gradient glass.
5. **Voice bar:** "Would I send this to Joe without editing?" If no, rewrite.
6. **UK English. UK cities.** Sheffield, Bristol, Manchester, Birmingham, Edinburgh, Clapham. Not "downtown". Not "leverage".
7. **Tabular numerals** on every numeric value: `font-variant-numeric: tabular-nums`.

---

## File map

```
/Design System.html          ← the master design system (open this first)
/CLAUDE.md                   ← project memory (read second)
/context/
  brand-identity-sheet.html  ← v4.0 brand identity — palette, mark spec, lockups
  logo-sheet.html            ← every Monolith size (favicons, social, app icon, wordmarks)
  email-footer.html          ← canonical email signatures — copy SVG from here, never redraw
  social-cards.html          ← social card templates
  architecture-loop.html     ← 1920×1080 architecture diagram reference
  stryde-roadmap.html        ← Year-One roadmap (dark composition reference)
  ava-graph.html             ← Ava metrics visualisation reference
  brand-voice-guide.md       ← full voice doctrine
  swagger-copy-bank.md       ← ready-to-lift hero/kicker/CTA/social copy
  ava-personality.md         ← Ava character brief (Friday from Iron Man)
  ava-one-pager.md           ← Ava product spec, pricing, comparison
```

---

## Tokens — paste into `brand.ts`

```ts
export const brand = {
  navy: '#0B2545',        navyMid: '#132D5E',
  blue: '#1C54F2',        blueBright: '#2E6BFF',  blueGlow: '#4B8BF5',
  teal: '#0891B2',        purple: '#8B5CF6',
  cloud: '#F2F1EE',       cloudLight: '#F9F8F6',  cloudDark: '#E8E6E0',  cream: '#FAF9F7',
  ink: '#111827',         muted: '#5C6370',       mutedStrong: '#3F4752', border: '#E2DFDA',
  success: '#059669',     warning: '#F59E0B',     danger: '#EF4444',
} as const;
```

### CSS custom properties — into `globals.css`

```css
:root {
  /* radii */
  --radius-card: 16px;
  --radius-chip: 50px;
  --radius-inner: 10px;
  /* shadows */
  --shadow-card: 0 2px 12px rgba(11,37,69,.06);
  --shadow-elevated: 0 8px 32px rgba(11,37,69,.10);
  /* focus */
  --focus-halo: 0 0 0 2px var(--cloud), 0 0 0 6px rgba(28,84,242,.30);
}
```

---

## Component contracts

### Buttons (pill, 50px radius)

```
btn-primary    — linear-gradient(135deg, #2E6BFF, #1C54F2)
                 + inset 0 1px 0 rgba(255,255,255,.15) highlight
                 + 0 2px 8px rgba(28,84,242,.19) shadow
btn-teal       — same construction, #0AADCF → #0891B2  (Pulse)
btn-purple     — same construction, #A78BFA → #8B5CF6  (Intelligence)
btn-success    — #10B981 → #059669
btn-secondary  — transparent, 1.5px border rgba(255,255,255,.18)  (dark)
               — transparent, 1.5px border #E2DFDA                 (light)
```

### Cards

```
background: var(--cloud-light);
border: 1px solid var(--border);
border-radius: var(--radius-card);
box-shadow: var(--shadow-card);
padding: 22–32px;
```

### Module cards (Ava / Pulse / Intelligence)

Title in DM Serif Display in the module accent colour. Icon in a 44×44 inner tile (`radius-inner` 10px, `rgba(255,255,255,.04)` background, `rgba(255,255,255,.08)` border). Subtitle in Outfit 14px at 55% white.

### Email signatures

Use the exact tables in `context/email-footer.html`. **Don't redraw the SVG.** White background, 3px blue top-bar, table-based markup so iCloud / Apple Mail / Gmail / Outlook all render it.

---

## The Monolith — implementation notes

- **viewBox** always `0 0 100 100`. Renders cleanly at any size.
- **Container gradient:** linear `#2E6BFF @ 58% → #091D3E @ 72%` (`0.1,0 → 0.85,1`) PLUS radial light `#6AABFF @ 42% → transparent` at `28% 24% r=60%`.
- **Container stroke:** 1.2px, linear `#7ABBFF @ 65% → #1C54F2 @ 6%`.
- **Pillar:** rect (35,20) → (57,80), rx:5, white @ 7%. Lower half darkened with black @ 10% from y=46.
- **Three chevrons:** clipped inside pillar via `clipPath`. Ascending stroke/opacity: bottom (32,80→46,72→60,80) sw:2 @ 20% → mid sw:2.5 @ 42% → top sw:3.2 @ 72%.
- **Catch-light:** diagonal cut polygon (35,52)→(57,40)→(57,20)→(35,20). White gradient 55%→97%. Plus 1.2px white line at 55% along the cut.
- **Unique gradient IDs per instance** (`sigA-c`, `sigB-c`, etc.) — never reuse, they conflict in shared DOM.

For `≤24px` use the `simplified` prop on `MonolithLogo.tsx` — omits the catch-light gradient (still gradient glass, just lighter SVG).

**On Cream variant:** chevrons become Royal Blue `#1C54F2` at 30/55/85% opacity (instead of white).
**On Dark:** chevrons white at 20/42/72% opacity.
**Solid Royal (app icons ONLY):** flat `#1C54F2` fill, white pillar at 15%, white chevrons.

---

## Voice — Quartr precision meets Charlie Sheen confidence

Pull headlines from `context/swagger-copy-bank.md` — it's organised by module (Intelligence, Ava, Pulse, Platform) plus kickers, CTAs, social posts, email subject lines. Lift directly when on-brief.

### Structural rules

- Lead with the specific number. Follow with the implication. Never the reverse.
- Two beats > rule of three (rule of three is AI tell).
- One idea per headline. Don't stack two payoffs.
- State the fact. No "What if..." setups.
- Mix questions, incomplete thoughts, mid-beat pauses.

### Ava tone specifically

Read `context/ava-personality.md` before writing any Ava copy or voice script. The reference is **Friday from Iron Man** — intelligent, warm, dry, never robotic. Collaborative framing always: "Let Sue enjoy her coffee. Ava's got the phones." Never replacement framing.

### Banned phrases (purge on sight)

revolutionising · game-changing · seamlessly · leveraging · harnessing · at the forefront of · in today's landscape · journey · unlock · empower · showcase · highlight · underscore · tapestry · pivotal · vibrant · groundbreaking · nestled · testament · crucial · delve · foster · enhance · align with · "Works weekends" · "No sick days" · "Zero guesswork" · anything that punches at workers.

---

## Pricing (canonical)

| Tier   | Clinicians | Monthly | Annual (20% off) |
|--------|-----------|---------|-------------------|
| Solo   | 1         | £99     | £950.40          |
| Studio | 2–5       | £149    | £1,430.40        |
| Clinic | 6+        | £159    | £1,526.40        |

One-time setup: £195. No contracts. Cancel anytime.

---

## What to build next (open questions for Jamal)

- Marketing site IA (homepage, Ava page, Pulse page, Intelligence page, pricing, about, login)
- Dashboard shell — top nav with module switcher, sidebar with KPI quick-links
- Onboarding flow — PMS connection (WriteUpp / Cliniko / TM3 / PPS / Pabau)
- Ava call log + transcript view
- Pulse patient cohort dashboard
- Intelligence KPI dashboard with the six headline numbers

Don't start any of these without confirming scope with Jamal first.

---

*Locked v4.0 · Feb 2026 · © 2026 StrydeOS Ltd · Confidential*
