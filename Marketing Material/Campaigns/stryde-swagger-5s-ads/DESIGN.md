# Stryde · Swagger 5s Ads - Design Identity

Single DESIGN.md shared across all three ad compositions. Every ad in this folder
traces its palette, typography, and motion language back to this file and to
`brand.ts` in the StrydeOS repo (single source of truth for brand tokens).

---

## Style Prompt

Quartr-grade restraint with earned confidence. Navy depth, a single cool-blue
accent lane, typographic drama as the primary design event. Every motion is a
small one. No kinetic type explosions, no particle bursts, no stock zoom.
Fade, slide, small camera moves, a whisper of glow pulse. The ad feels like
something a premium financial terminal would show as a brand spot.

---

## Colors (locked to brand.ts)

| Role             | Token         | Hex       |
| ---------------- | ------------- | --------- |
| Base surface     | Navy          | `#0B2545` |
| Deep surface     | Navy-deep     | `#060F1E` |
| Primary accent   | Blue          | `#1C54F2` |
| Accent bright    | Blue-bright   | `#2E6BFF` |
| Accent glow      | Blue-glow     | `#4B8BF5` |
| Secondary accent | Purple        | `#8B5CF6` |
| Secondary accent | Teal          | `#0891B2` |
| Success accent   | Green-soft    | `#34D399` |
| Text primary     | White @ 100%  | `#FFFFFF` |
| Text secondary   | White @ 60%   | rgba 0.6  |
| Text muted       | White @ 30%   | rgba 0.3  |

Pure black (`#000`) is forbidden. Backgrounds always Navy or Navy-deep.

---

## Typography

- **Display / headlines:** DM Serif Display, weight 400 only. Letterspacing
  `-0.02em` to `-0.03em` at display sizes. 90-140px on 1080×1920.
- **Body / supporting:** Outfit, weights 300 / 500 / 700. 28-36px for body,
  18-24px for eyebrows with `letter-spacing: 0.14em; text-transform: uppercase`.
- **Numeric:** `font-variant-numeric: tabular-nums` on any stacked figures.

Note: the hyperframes house style flags Outfit as an AI default. That rule is
overridden here because Outfit is the brand-locked body font per `brand.ts`
and the brand identity sheet. The serif/sans tension is provided by DM Serif
Display (display) + Outfit (body), which is a valid cross-category pairing.

---

## Motion

| Move            | Use for                                      |
| --------------- | -------------------------------------------- |
| Fade + small y  | Headlines entering                           |
| Scale 0.92 → 1  | Accent lines landing (very subtle)           |
| Stagger 80ms    | List items (KPI pills)                       |
| Slow glow pulse | Ambient decoratives, never text              |

Easing palette (never all the same):
- `power3.out` for headline entrances
- `power2.out` for body/pill entrances
- `expo.out` for punch accent lines ("Ours don't.", "Same postcode.")
- `sine.inOut` for ambient glow breathing

Timing guardrails:
- First element offset by 0.15-0.25s from t=0 (never t=0 sharp)
- Every element durations between 0.4s and 0.9s (no 0.1s slams, no 2s drags)
- Final element (end-card) lands by 4.4s leaving 0.6s clean hold

No exit animations. Content accumulates; end-card fades in below.

---

## Background Layer

Every scene has:
1. Navy base (or Navy-deep) solid fill
2. One radial glow tinted to the accent (Blue, Green-soft, or Purple) at
   low opacity (0.10-0.18), positioned off-centre
3. Dot-grid overlay: `radial-gradient(circle, rgba(255,255,255,0.03) 1px,
   transparent 1px) 32px 32px`
4. Ambient glow breathing animation (scale 1 → 1.04 over 4s, `sine.inOut`,
   repeat count calculated from duration, never `repeat: -1`)

---

## Logo

Monolith mark inlined from `Marketing Material/Brand Assets/monolith.svg`.
Each composition inlines a fresh copy with unique gradient / clipPath IDs
(suffix `-a1`, `-a2`, `-a3`) to prevent DOM conflicts. Sized 140px on end-card.

---

## What NOT to Do

1. No gradient text except on the accent line of each ad (the line that lands
   the punchline). Overuse kills the device.
2. No pure `#000`. No `#fff` without a tint when used on large surfaces.
3. No more than one font weight jump per composition (display 400, body 500, body 300).
4. No scale bounces above 1.05 or below 0.9. This is Quartr, not a game UI.
5. No rotation on anything. No skew. No 3D transforms.
6. No em dashes anywhere in copy.
7. No `repeat: -1`. Calculate finite repeats from `data-duration`.

---

## Copy Source

Headlines pulled directly from `/Users/joa/Desktop/StrydeOS/Marketing
Material/Campaigns/social-cards.html` (Section 01, swagger cards 1, 3, 4).
Secondary lines and stats pulled from verified sources in
`reference_uk_benchmarks.md`. UK English throughout.
