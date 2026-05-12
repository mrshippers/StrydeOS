# StrydeOS Module Briefs

Internal product documents for each StrydeOS module. One brief per module — the canonical reference for what it does *now*, how value is attributed, and where the gaps are.

| Module | Brief | Status | Price (Studio) |
|--------|-------|--------|----------------|
| Intelligence | [intelligence.md](./intelligence.md) | Live | £99/mo |
| Ava | [ava.md](./ava.md) | Live | £149/mo (+£195 one-time setup) |
| Pulse | [pulse.md](./pulse.md) | Live | £99/mo |

Each brief follows the same structure:

1. **What it actually does now** — live capabilities only, no roadmap items
2. **The Value Equation** — illustrative ROI example, every figure traceable to inputs an owner can verify
3. **Attribution Rules** — the non-negotiables that keep £-claims defensible
4. **Deep Metrics** — what the module measures beyond surface KPIs
5. **Stakeholder framing** — what owner/clinician/patient each get from it
6. **Firestore Schema** — collections the module owns
7. **Computation Pipeline** — data flow from input to attribution
8. **Gaps** — what's not built yet, prioritised
9. **Product Argument** — vs the competition
10. **Files Delivered** — the canonical implementation surface

Pricing matrix and setup-fee policy: see [`dashboard/src/lib/billing.ts`](../../dashboard/src/lib/billing.ts) (`MODULE_PRICING`).

Update the relevant brief when shipping a feature that changes what the module does, what it attributes, or what the gaps are.
