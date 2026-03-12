# Billing & typical customer flow (UI/UX)

## Is Stripe “all done”?

**Code:** Yes. Checkout (tier + interval + modules + Ava setup fee), webhooks (subscription created/updated/deleted, payment failed), Customer Portal link, and entitlements (`useEntitlements` → `ModuleGuard` / `LockedModulePage`) are implemented.

**To go live you still need:**
- Stripe products/prices created (e.g. run `scripts/setup-stripe-products.ts`) and all `STRIPE_PRICE_*` + `STRIPE_WEBHOOK_SECRET` in env.

**Add-on behaviour (implemented):** When a customer adds another module via the Billing page, the app creates a second Stripe subscription. The webhook **merges** all active/trialing subscriptions for that customer: it lists subscriptions by `stripeCustomerId`, aggregates line items, derives `featureFlags` from the combined set, and writes once. So “Activate” on a second module works: both subscriptions contribute to access. On subscription deleted, the webhook recomputes flags from any remaining active subscriptions (or clears all if none).

---

## Where “onboarding” happens

- **Marketing website** (e.g. strydeOS-website): no self-serve signup in-code; typically “Book demo” / “Contact” → manual invite or link to app.
- **App onboarding** (in-dashboard): after first login, clinic is in status `onboarding`. Steps (Settings / onboarding wizard):
  1. Connect PMS (WriteUpp / Cliniko)
  2. Confirm clinicians
  3. Set KPI targets  
  When those are done, check-go-live can promote the clinic to `live`.
- **Trial:** `trialStartedAt` on the clinic doc gives full access to all modules for the trial period. `TrialBanner` shows “X days remaining” and links to `/billing`.

So: **website** = lead/demo; **onboarding** = in-app setup (PMS, clinicians, targets); **billing** = trial + subscription (Stripe).

---

## Typical customer flow (UI/UX)

### 1. From website to app

- User hits marketing site → “Book demo” or “Start trial” (or you send them a direct app link).
- They sign in (Firebase Auth). If new, they’re associated with a clinic (invite flow or manual creation).
- First time: onboarding widget / Settings shows “Connect PMS”, “Confirm clinicians”, “Set targets”. Dashboard and any allowed modules are available (trial = all modules).

### 2. During trial

- **Sidebar:** All module links (Intelligence, Pulse, Ava) are active (no lock icon).
- **TrialBanner** (amber): “X days remaining — Subscribe to keep access” → links to `/billing`.
- They can use all three modules; no payment yet.

### 3. Billing page (`/billing`)

- **Subscription status:** Active / Trial / Past due / Canceled / Inactive; “Manage billing” opens Stripe Customer Portal (if they have `stripeCustomerId`).
- **Tier:** Solo | Studio | Clinic.
- **Interval:** Monthly | Annual (Save 20%).
- **Module cards:** Intelligence, Pulse, Ava — each shows price for selected tier/interval, “Active” (with check) if they have it, or “Activate” to start checkout.
- **Full Stack:** Single card for all three; “Get Full Stack” or “All modules active”.
- **Checkout:** Click “Activate” or “Get Full Stack” → POST `/api/billing/checkout` → redirect to Stripe Checkout → payment → redirect back to `/billing?checkout=success` (or `canceled`). Webhook updates `featureFlags` and billing fields; UI updates from `useEntitlements` / clinic profile.

### 4. After subscription (one module)

- **Sidebar:** Subscribed module(s) are clickable; **others show a lock icon** and link to `/billing` (not to the module).
- **Clicking a locked module:** `ModuleGuard` shows **LockedModulePage** in place: soft glow, module benefits, “Unlock [Module]” → `/billing`.

### 5. “They have one module then decide to add another”

- They go to **Billing**. They see e.g. Intelligence “Active”, Pulse and Ava with “Activate”.
- They choose tier/interval and click “Activate” on e.g. Pulse.
- **What happens:** A new Stripe Checkout session is created for Pulse only → second subscription. The webhook (on subscription created/updated) lists **all** active/trialing subscriptions for that customer, merges their line items, and writes `featureFlags` from the combined set. So `featureFlags = { intelligence: true, continuity: true, receptionist: false }` and both modules stay unlocked. If they cancel one subscription later, the webhook recomputes flags from remaining subscriptions (or revokes all if none).
- **Alternative:** They can use “Manage billing” → Stripe Customer Portal to add/change plans on a single subscription if you configure that in Stripe.

### 6. Renewal / payment failure

- Renewal: Stripe charges; no change in `featureFlags`; `currentPeriodEnd` can be updated on next subscription.updated if you use it.
- **Payment failed:** Webhook sets `billing.subscriptionStatus = past_due`; access is **not** revoked (per current logic). You can surface “Payment overdue” in the Billing block and nudge them to update payment method in the Portal.

---

## Summary

| Stage              | Where it happens | What they see |
|--------------------|------------------|----------------|
| Lead/demo          | Marketing site   | CTA → app or contact |
| First login        | App              | Onboarding: PMS, clinicians, targets |
| Trial              | App              | All modules open, TrialBanner → Billing |
| Subscribe          | `/billing`       | Tier + interval + Activate/Full Stack → Stripe Checkout |
| After pay          | App              | Sidebar: active = links, inactive = lock → Billing |
| Locked module tap  | In-app           | LockedModulePage (benefits + “Unlock” → Billing) |
| Add another module| Billing          | “Activate” on second module → second subscription → webhook merges all active subs → both modules active. |
| Manage plan/card   | Billing          | “Manage billing” → Stripe Customer Portal |

Stripe integration is implemented end-to-end, including add-on flow (webhook merges multiple active subscriptions per customer).
