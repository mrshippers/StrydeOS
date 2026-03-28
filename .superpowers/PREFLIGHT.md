# StrydeOS Preflight Checklist

> Run through this before onboarding any external clinic.
> Each test uses your real Spires account on portal.strydeos.com.
> Mark each item as you go. If something fails, note it and keep moving — don't block on one item.

---

## 1. Auth & Access Control

### Owner flow
- [ ] Log in as Jamal (owner) — dashboard loads, greeting shows, sidebar works
- [ ] Check all nav items accessible: Dashboard, Clinicians, Pulse, Ava, Intelligence, Settings, Billing
- [ ] Open Settings > Team — add a test clinician (use a throwaway email you control)
- [ ] Check invite email arrives (if Resend configured) or copy invite link manually
- [ ] Open invite link in incognito — set password, sign in
- [ ] Verify clinician can ONLY see their own dashboard (not all clinicians)
- [ ] Verify clinician CANNOT access Settings, Billing, or Admin
- [ ] Delete the test clinician from Settings > Team
- [ ] Sign out and back in — session cookie works, no redirect loop

### MFA (optional but test it)
- [ ] Settings > Security > Enable Two-Factor Authentication
- [ ] Scan QR with authenticator app, enter code
- [ ] Sign out, sign back in — MFA prompt appears
- [ ] Enter correct code — passes through

---

## 2. PMS Integration (WriteUpp / Cliniko)

### Connection
- [ ] Settings > PMS Connection — your current provider shows as connected
- [ ] If WriteUpp: CSV import flow works (upload a real CSV, check field mapping)
- [ ] If Cliniko: API key is saved, "Test Connection" returns success
- [ ] Check sync indicator on dashboard shows "Synced X ago" (not "very stale")

### Data flow
- [ ] Dashboard shows real appointment count for current week
- [ ] Navigate week picker backwards — historical weeks have data
- [ ] Clinician names match your actual team (Andrew, Max)
- [ ] Initial assessments vs follow-ups split looks accurate against your PMS

### Manual verification
- [ ] Pick 3 random appointments from the dashboard numbers
- [ ] Cross-check them against WriteUpp/Cliniko — do the counts match?
- [ ] Check follow-up rate calculation: follow-ups / initial assessments = displayed rate

---

## 3. HEP Integration (Physitrack)

- [ ] Settings > HEP Integration — Physitrack shows as connected
- [ ] Dashboard > Compliance card — HEP assigned % is not 0% or NaN%
- [ ] Cross-check: pick 2 patients from Physitrack, verify they show as "programme assigned" in StrydeOS
- [ ] If HEP shows 0%: check API key, run a manual sync from Settings

---

## 4. Ava (Voice Receptionist)

### Configuration
- [ ] Navigate to `/receptionist`
- [ ] Switch to Configuration tab
- [ ] Verify clinic details are populated (phone, address, pricing, parking)
- [ ] Check knowledge base has entries (or add a test one)
- [ ] Toggle Ava ON — no errors, status shows "Active"

### Live call test
- [ ] Call your Twilio number from your personal mobile
- [ ] Ava should answer within 3 rings
- [ ] Have a brief conversation: "I'd like to book an appointment"
- [ ] Ava should ask relevant questions (name, preferred time, etc.)
- [ ] Hang up after 30-60 seconds

### Call logging
- [ ] Switch to Call Dashboard tab
- [ ] Your test call should appear in "Today's Calls" within 60 seconds
- [ ] Check: caller name/number, duration, outcome badge, summary
- [ ] Click the row — transcript expands (if ElevenLabs logged it)
- [ ] Top stats update: Total Calls increments, duration shows

### After-hours test
- [ ] Set Ava's hours to a window that's currently "after hours"
- [ ] Call again — should still answer but route to after-hours flow
- [ ] Check After-Hours Digest section populates

### Edge cases
- [ ] Call and immediately hang up — should log as "missed" not crash
- [ ] Call and say something completely unrelated — Ava handles gracefully
- [ ] Two calls in quick succession — both log correctly

---

## 5. Dashboard KPIs

### Accuracy check
- [ ] Follow-up rate: does the number match your manual calculation?
- [ ] DNA rate: check against actual no-shows this week in your PMS
- [ ] Utilisation: booked slots / available slots — sanity check
- [ ] Revenue per session: total revenue / sessions delivered
- [ ] Appointments total: matches PMS appointment count for the week

### Trend indicators
- [ ] Green dot = on target, orange = warning, red = danger — do they make sense?
- [ ] Trend arrows (up/down) — compare with last week's numbers
- [ ] 6-week trend chart in bottom right — line goes in the right direction

### Clinician summary table
- [ ] Table loads (no "Failed to load clinician stats" error)
- [ ] Each clinician row shows their individual metrics
- [ ] Click a row — navigates to clinician detail view
- [ ] Badge colours match their performance vs targets

---

## 6. Pulse (Patient Retention)

### Patient Board
- [ ] Navigate to `/continuity`
- [ ] Patient Board tab — patients grouped by segment (active, churn risk, post-discharge)
- [ ] Churn risk patients have risk badges
- [ ] Click "Send reminder" on a test patient — modal appears
- [ ] DON'T send to a real patient yet — just verify the UI works

### Comms Sequences
- [ ] Switch to Comms Sequences tab
- [ ] 6 sequences visible (HEP reminder, rebooking, pre-auth, review, reactivation x2)
- [ ] Toggle one OFF and back ON — saves without error
- [ ] Click "Preview" on a sequence — template renders with variable placeholders

### Send Log
- [ ] Switch to Send Log tab
- [ ] If you've sent any test comms, they appear here
- [ ] Outcome badges render (rebooked/responded/no action)

### Live comms test (use your own number)
- [ ] Update a test patient record with YOUR phone number
- [ ] Trigger a manual reminder from Patient Board
- [ ] Check: SMS arrives on your phone within 60 seconds
- [ ] Check: Send Log updates with the sent message
- [ ] IMPORTANT: change the number back after testing

---

## 7. Intelligence

### Insights feed
- [ ] Navigate to `/intelligence`
- [ ] Insights tab — at least 1 insight card shows (or empty state if no anomalies)
- [ ] Notification bell in sidebar shows unread count matching insights

### Revenue tab
- [ ] Revenue chart renders with real data
- [ ] Per-clinician breakdown shows correct names
- [ ] Revenue per session trending line matches dashboard

### Outcome measures
- [ ] Outcomes tab — form to record NPRS/PSFS/QuickDASH scores
- [ ] Enter a test score for a patient — saves without error
- [ ] Score appears in the outcomes list

---

## 8. Checkout & Billing

### Stripe test mode
- [ ] Navigate to `/checkout`
- [ ] Select a module (e.g. Intelligence)
- [ ] Select tier (Studio) and billing period (Monthly)
- [ ] Price breakdown shows correctly (no NaN, correct amounts)
- [ ] Click "Continue to payment" — Stripe checkout loads
- [ ] Use Stripe test card: `4242 4242 4242 4242`, any future date, any CVC
- [ ] Complete payment — redirects back to portal
- [ ] Billing page shows active subscription

### Stripe webhook
- [ ] Check Stripe dashboard > Webhooks — recent events show `checkout.session.completed`
- [ ] Portal billing page reflects the subscription status
- [ ] Module unlocks in sidebar (no lock icon)

---

## 9. Onboarding (fresh clinic simulation)

- [ ] Open incognito browser
- [ ] Go to `portal.strydeos.com/trial`
- [ ] Create a new account with a test email
- [ ] Step through the 5-step wizard:
  1. Account details — saves
  2. Clinic verification — DPA acceptance works
  3. Module selection — pricing preview shows
  4. PMS connection — skip works (or test with a dummy key)
  5. Go Live — summary renders, launch button works
- [ ] Dashboard loads after completion
- [ ] Onboarding widget in top-right shows progress (3/5, 4/5, etc.)
- [ ] Delete the test clinic from Firebase console after

---

## 10. Dark Mode & Polish

- [ ] Toggle dark mode (Cmd+D or sidebar toggle)
- [ ] Dashboard: all text readable, no invisible elements
- [ ] Settings: PMS grid logos visible, form inputs readable
- [ ] Ava: call dashboard readable, config form inputs visible
- [ ] Pulse: patient board text visible, sequence cards readable
- [ ] Intelligence: all 7 tabs readable, charts render correctly
- [ ] Checkout: pricing breakdown visible, button gradient shows
- [ ] Toggle back to light mode — everything reverts cleanly

---

## 11. Marketing Website

- [ ] Visit strydeos.com — homepage loads, hero visible
- [ ] Dark mode toggle — all text readable (the fix we just shipped)
- [ ] Click each nav item: Products, How it works, Pricing, About — smooth scroll
- [ ] Visit /ava, /pulse, /intelligence — each module page loads
- [ ] "Start free trial" CTA — navigates to portal.strydeos.com/trial
- [ ] "Log In" — navigates to portal login
- [ ] Mobile: resize browser to 375px width — responsive layout works
- [ ] Pricing cards — all 3 modules show correct prices
- [ ] ROI calculator — sliders work, numbers update

---

## 12. Pre-Launch Sanity

- [ ] Vercel dashboard: both `dashboard` and `website` deployments green
- [ ] Custom domains: portal.strydeos.com and strydeos.com both resolve
- [ ] SSL certificates valid (padlock icon in browser)
- [ ] Firebase console: Firestore security rules deployed, no open reads
- [ ] Stripe: webhook endpoint configured for production URL
- [ ] ElevenLabs: agent ID matches production config
- [ ] Twilio: phone number forwarding to ElevenLabs SIP
- [ ] Resend: domain verified, API key in Vercel env vars
- [ ] Environment variables: all production keys set in Vercel (not just .env.local)

---

## Pass / Fail Summary

| Section | Pass | Fail | Notes |
|---------|------|------|-------|
| Auth & Access | | | |
| PMS Integration | | | |
| HEP Integration | | | |
| Ava | | | |
| Dashboard KPIs | | | |
| Pulse | | | |
| Intelligence | | | |
| Checkout & Billing | | | |
| Onboarding | | | |
| Dark Mode | | | |
| Marketing Website | | | |
| Pre-Launch Sanity | | | |

**Decision:** If all critical sections pass (Auth, PMS, Ava, Dashboard, Checkout), you're clear to onboard the first external clinic. Polish items (dark mode, marketing) can ship incrementally.

---

*Last updated: 28 March 2026*
*Run this checklist before every new clinic onboard until you've done 3.*
