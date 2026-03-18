# UI Polish Changelog — Review Checklist

> Toggle dark/light mode and navigate around the app to verify each item.

---

## Theme Transition

- [ ] Wipe animation feels slower and smoother (1100ms, was 800ms)
- [ ] Radial wipe has depth — gradient goes from light centre to darker edges, not flat
- [ ] Subtle blue glow halo leads the wipe (fades in ahead, fades out after)
- [ ] No hard colour snap — overlay fades in from 60% opacity before going solid
- [ ] Content beneath updates early (at ~35% of animation) so it feels responsive

## Crossfade on Theme Toggle

- [ ] Cards, borders, text all smoothly crossfade (0.5s) when switching theme — no snapping
- [ ] Buttons and links still feel snappy on hover (0.2s, not slowed down)
- [ ] Skeleton loaders and SVG sparklines are unaffected (no weird flicker)

## Page Transitions (navigate between routes)

- [ ] Route changes have a gentle fade + slight upward slide (6px, was 12px)
- [ ] Subtle blur-in/blur-out effect on page enter/exit
- [ ] Duration feels right (~0.4s) — not too fast, not laggy

## Text Legibility

- [ ] Body text is 14px base with relaxed line height — comfortable to read
- [ ] Dark mode text is brighter (88% white vs 85% before)
- [ ] Muted/secondary text is more readable in dark mode (58% vs 55%)
- [ ] StatCard labels are 11px (was 10px) and use stronger contrast colour
- [ ] StatCard target/insight text bumped to 12px (was 11px)
- [ ] Sidebar nav items are 14px (was 13px), inactive items brighter (50% vs 45%)
- [ ] Sidebar section headers ("Navigation", "System") are 11px (was 10px)
- [ ] Table column headers are 11px with stronger contrast
- [ ] RAG badges in clinician table are 13px (was 12px)
- [ ] Clinician names in table are 14px
- [ ] Tooltips are 12px (was 11px)
- [ ] Daily snapshot chips are 13px (was 12px)
- [ ] ChipBadge components are 11px (was 10px)
- [ ] Empty state body text is 15px (was 14px)
- [ ] Notification panel alert names are 13px, descriptions 12px

## Dashboard Page

- [ ] Stagger animations are subtler (10px slide, was 16px) and slightly slower (0.55s)
- [ ] Subtext under greeting uses stronger contrast + relaxed line height
- [ ] "Live" and "Synced" chips are 12px (was 11px)
- [ ] Week picker buttons have smoother transitions (200ms ease-out)
- [ ] Clinician filter buttons are 13px (was 12px)
- [ ] "Viewing:" label uses stronger muted colour + medium weight

## Sidebar

- [ ] Mobile slide-in is 300ms with custom easing (was 200ms linear)
- [ ] All nav links transition `all` properties smoothly (200ms ease-out)
- [ ] Hover states are brighter (80% white vs 75%)
- [ ] Quick search and dark mode toggle text is 12px (was 11px)
- [ ] Keyboard shortcuts (⌘K, ⌘D) are 10px (was 9px)
- [ ] Profile area: initials 11px, status label 11px, email 12px
- [ ] Profile dropdown links are 13px with smoother transitions
- [ ] Notification bell alert text is larger and more readable

## StatCard

- [ ] Card hover transition is 300ms ease-out (was 200ms)
- [ ] Active press scale is 0.99 (was 0.98) — less aggressive
- [ ] Status dot is 7px with 8px glow (was 6px/6px)
- [ ] Action links are 12px (was 11px)
- [ ] Value font size is 44px (was 48px/text-5xl) — slightly tighter, still prominent
- [ ] Unit text is 13px (was 12px)
- [ ] Trend percentage is 11px (was 10px)

## Clinician Table

- [ ] Row hover transitions smoothly (200ms)
- [ ] Avatar initials are 11px (was 10px)
- [ ] Session and revenue columns are 14px
- [ ] Metric info tooltip text is 12px with 90% white (was 11px/100%)

---

*Delete this file once verified — it's not part of the codebase.*
