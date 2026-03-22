# Pricing strategy logic

## The naming conflict

You built three **products** (`Ava`, `Pulse`, `Intelligence`). But an older pricing draft packaged them into three **tiers** (`Intelligence`, `Perform`, `Growth OS`). These are two completely different mental models fighting each other.

- **With products**, a customer thinks: "I want the AI receptionist" → buys Ava. Clear. Simple.
- **With tiers**, a customer thinks: "I want the AI receptionist" → has to buy the old "Perform" tier (which also included Intelligence whether they wanted it or not). And they couldn't get Pulse without the old "Growth OS" bundle.

The tier model forces a linear journey: **Intelligence → Intelligence + Ava → Intelligence + Ava + Pulse**. But that's not how clinic owners think. Some want Ava first because they're haemorrhaging missed calls. Some want Intelligence first because they have no visibility. Some want Pulse first because patients are dropping off mid-course. Forcing a ladder means you're either blocking the sale or giving away stuff they didn't ask for.

---

## Edge cases that will bite you

1. **Solo physio** who answers their own phone but has terrible follow-up rates wants Pulse only. Under the tier model, they have to buy the full stack. They walk.

2. **6-clinician practice** with a full-time receptionist doesn't need Ava at all — they want Intelligence + Pulse. Under tiers, there's no path to that. They're paying for a product they'll never switch on.

3. **Clinic owner** sees their data for the first time on Intelligence, realises their missed call rate is 30%, and wants to add Ava. Under tiers, that's a jump from £149 to £349 — a 134% price increase overnight for one feature. That's a churn conversation, not an upsell.

---

## The FAQ nightmare on discovery calls

- **"Can I just get the dashboard without the phone thing?"** — No, that's fine, that's Tier 1. But then...
- **"Can I just get the phone thing without the dashboard?"** — Under the old tier model, no.
- **"I want the patient follow-up stuff but I don't need an AI receptionist."** — Under the old tier model, no.
- **"What's the difference between Intelligence the product and Intelligence the tier?"** — This one alone will murder your sales calls.

---

## The fix

**Sell modules, not tiers.** Price each product independently. Let people build their own stack. Then make the full bundle cheaper than buying all three separately — that's your upsell lever.

---

## Working backwards from £380–500 full-stack target

The **recommended** Studio Full Stack (2–4 clinicians) price is **£399/month** (see table and section below). The £380–500 band is justified as follows:

- **£449** is where the maths sit: a 3-clinician practice earning £250–300k/year would spend **£5,388 annually** — roughly **1.8–2.2% of revenue**. That's above current UK clinic software spend (~0.5–1.5%) but well under the 3–6% healthcare IT benchmark. It's also **less than a part-time receptionist** (£12–15k/year), which is your strongest sales line. So the *analytical* sweet spot is in this range.
- **At £380**, you're pricing below the fragmented stack cost (Cliniko £76 + Norango £190 + Physitrack £30 + manual follow-up time = £296+ before you factor in the owner's time). That's too cheap — you're giving away margin for no reason.
- **At £500**, you're bumping against the psychological ceiling where a UK clinic owner starts thinking "that's a car payment." The jump from their current £150/month total software spend to £500 is a 3.3x increase. Possible but harder to close on a 15-minute call.

Within that band, **£399 is the chosen target**; the next section explains why not £449.

---

## Revised model: modules + full stack

| | Solo (1 clinician) | Studio (2–4) | Clinic (6+) |
|--|--|--|--|
| **Intelligence** (dashboard, KPIs, trends, alerts) | £79/mo | £129/mo | £199/mo |
| **Ava** (AI voice receptionist, booking, no-show recovery) | £149/mo | £199/mo | £299/mo |
| **Pulse** (patient continuity, dropout prevention, discharge flows) | £99/mo | £149/mo | £229/mo |
| **StrydeOS Full Stack** (all three) | £279/mo | **£399/mo** | £599/mo |

The full stack discount is roughly **15–20%** versus buying all three individually. That creates a genuine incentive to bundle without forcing it.

---

## Annual billing and setup

- **Annual billing:** 20% off (same as your original doc — it works). So Studio Full Stack annual = **£3,830/year** (~£319/mo effective). That's an easy yes for a practice doing £250k+.
- **Setup fees:**
  - £0 for Intelligence (self-serve PMS read connection).
  - £250 for Ava (phone provisioning, voice config).
  - £0 for Pulse (software-only, no hardware).
  - £250 for Full Stack (covers Ava setup).
  - Keep these low — Norango charges nothing, Cliniko charges nothing. Setup fees are conversion killers in this market.

---

## Why £399 for Studio Full Stack, not £449

The revenue-ratio and receptionist-comparison logic above still holds at £399: a £250k practice pays ~£4,788/year (~1.9% of revenue), still under a part-time receptionist. So we are not undercutting the rationale — we are choosing a price *within* the justified band.

**Recommendation: £399.** At £399 you land **under the £400 psychological barrier**, which matters more than the £50 in margin. You're still 2.6x what they currently spend on software, but the "under £400" framing is easier to say on a call. If you want to push it, £429 works too — odd numbers feel more considered than round ones.

---

## Where you're NOT undercutting yourself

The individual module prices are strong:

- **Intelligence** at £129/mo for a Studio practice is 2.5x what Dataplayer charges and there's no UK alternative.
- **Ava** at £199/mo is right between Norango's Essential (£70) and Signature (£300) — positioned as premium but not outrageous.
- **Pulse** at £149/mo has literally zero direct competitors in the UK physio space. You own that category.

---

## Where you WOULD be undercutting yourself

If you go **below £349** on the Full Stack Studio tier. At that point your per-module economics don't work — you'd be giving away one product essentially free, which devalues the whole platform and makes it harder to price individual modules later.
