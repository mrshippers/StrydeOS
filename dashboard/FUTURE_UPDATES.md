# Future Updates — n8n & Product Logic

Important reference for how n8n fits across StrydeOS and what to build next.

---

## Core layout

| Domain        | Role |
|---------------|------|
| **Pulse**     | n8n = delivery for all patient comms (HEP reminder, rebooking, pre-auth, discharge → review, NPS, etc.). App = rules + state; n8n = send + callback. |
| **Intelligence** | Optional: n8n = *when* and *delivery* for reports/alerts (e.g. weekly KPI email, "metric dropped" Slack). Numbers stay in app/Firestore. |
| **Ava**       | ElevenLabs = live call (Conversational AI) + Twilio = telephony/SIP. n8n = post-call actions based on outcome (e.g. booking confirmed → confirmation email/SMS; cancel → recovery flow; no-show → outbound 2h later). |

**In short:** Pulse = n8n for comms; Intelligence = n8n for reports/alerts where useful; Ava = ElevenLabs for the call, Twilio for telephony, n8n for what happens after.

---

## What n8n is used for today

- **Pulse comms** — Dashboard triggers sequences (who/when); n8n runs workflows that send email (Resend) / SMS (Twilio) and call back to log in `comms_log`.
- Planned workflows: post-session HEP reminder, rebooking prompt (72h after session 2+), insurance pre-auth at booking, discharge → Google Review prompt, NPS post-discharge.

---

## Other ways to use n8n (future)

- **Staff / internal** — Weekly digest, DNA/referral alerts, clinician invite emails (optional move from in-app).
- **Ava follow-ups** — No-show outbound (2h after DNA), cancellation recovery, post-call confirmation email/SMS.
- **Scheduling** — Run pipeline on a schedule via n8n instead of/in addition to Vercel Cron; react to PMS webhooks (e.g. new booking → Slack).
- **Reports & exports** — Clinical governance PDF per clinician per quarter; scheduled revenue/KPI report email.
- **Billing / ops (v1.0+)** — Stripe webhooks (payment failed → email owner); new clinic signup → welcome email + internal notify.

Use this doc when prioritising n8n workflows and deciding which domain "owns" each automation.
