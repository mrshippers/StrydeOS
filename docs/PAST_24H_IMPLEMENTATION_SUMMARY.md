# Past 24 Hours — Implementation Summary

**Date:** 13 March 2026  
**Status:** Uncommitted work → ready to push and deploy (almost live).

---

## What’s New (Implemented)

### Auth & Security
- **Login page** (`/login`) — Sign-in, sign-up, password reset, **MFA challenge flow** (TOTP + phone), “Try demo”, last-email memory, role-based redirect (superadmin → `/admin`, others → `/dashboard`).
- **MFA setup page** (`/mfa-setup`) — Dedicated enrollment for TOTP/phone; HIPAA compliance copy when `mfaRequired`; skip only when not required.
- **AuthGuard** — Tighter handling when Firebase isn’t configured; avoids flash of protected content.
- **useAuth** — Small fixes for demo/Firebase state.

**Where:** `dashboard/src/app/login/page.tsx`, `dashboard/src/app/mfa-setup/page.tsx`, `dashboard/src/components/AuthGuard.tsx`, `dashboard/src/hooks/useAuth.tsx`.

---

### Admin & Ops
- **Integration Health** — New admin page and API:
  - **Page:** `/admin/integration-health` — Per-clinic, per-provider health (PMS + Physitrack, etc.), success rate, last sync, status badges (healthy/degraded/down), expandable stage-level stats. Superadmin only.
  - **API:** `GET /api/admin/integration-health?days=30&clinicId=...` — Reads `integration_health` collection (server-side); role-gated.
- **WriteUpp probe** — `POST /api/debug/writeupp-probe` — Admin diagnostic: live WriteUpp API call, returns key shape of first 3 appointments (no PHI). Used to validate mappers.

**Where:**  
`dashboard/src/app/admin/integration-health/page.tsx`,  
`dashboard/src/app/api/admin/integration-health/route.ts`,  
`dashboard/src/app/api/debug/writeupp-probe/route.ts`.

---

### Settings & Sidebar (Global UI)
- **Settings** (`/settings`) — Expanded: profile, **billing/portal**, **MFA management**, pipeline “Sync now”, PMS connection status. Central place for account and clinic config.
- **Sidebar** — **Billing** link, **Integration health** link (superadmin), **MFA/security** cues, theme toggle (Moon/Sun), Help, alerts badge, Pulse churn badge. Nav reflects new routes and roles.

**Where:** `dashboard/src/app/settings/page.tsx`, `dashboard/src/components/ui/Sidebar.tsx`.

---

### Backend & Integrations
- **PMS disconnect** — `POST /api/pms/disconnect` — Clears PMS config for a clinic (owner/admin/superadmin).
- **PMS save-config** — `POST /api/pms/save-config` — Validates and stores PMS credentials; improved error handling.
- **Physitrack (HEP)** — Client and adapter extended: better error handling, **typed responses** (`dashboard/src/lib/integrations/hep/types.ts`), program/compliance mapping fixes. Sync pipeline uses updated adapter.
- **WriteUpp adapter** — Small fixes for field mapping/robustness.
- **Pipeline sync-hep** — Physitrack sync stage updated to use new adapter and types; more resilient to API quirks.

**Where:**  
`dashboard/src/app/api/pms/disconnect/route.ts`,  
`dashboard/src/app/api/pms/save-config/route.ts`,  
`dashboard/src/lib/integrations/hep/physitrack/adapter.ts`,  
`dashboard/src/lib/integrations/hep/physitrack/client.ts`,  
`dashboard/src/lib/integrations/hep/types.ts`,  
`dashboard/src/lib/integrations/pms/writeupp/adapter.ts`,  
`dashboard/src/lib/pipeline/sync-hep.ts`.

---

### Data & Compliance
- **SAR email templates** — Centralised Subject Access Request templates (acknowledgement, completion for access/erasure, refusal) for privacy workflow.

**Where:** `dashboard/src/data/sar-email-templates.ts`.

---

### Firestore & Docs
- **Firestore rules** — `integration_health` and `sar_requests` (and existing subcollections) covered; `integration_health` read/write server-only; SAR create allowed for owners/admins.
- **Dependency risk analysis** — `docs/DEPENDENCY_RISK_ANALYSIS.md` updated with integration partners, uptime notes, and mitigation.

**Where:** `dashboard/firestore.rules`, `docs/DEPENDENCY_RISK_ANALYSIS.md`.

---

### Dependencies
- **package.json / package-lock.json** — New or version bumps for dashboard (e.g. motion, deps for admin/health UI). No breaking changes.

**Where:** `dashboard/package.json`, `dashboard/package-lock.json`.

---

## Global Visual / UI Summary

| Area | Change |
|------|--------|
| **Login** | Single page for sign-in, sign-up, reset, MFA challenge; demo CTA; gradient background. |
| **Sidebar** | Billing, Integration health (admin), theme toggle, Help, alerts/Pulse badges. |
| **Settings** | One place for profile, billing, MFA, sync, PMS. |
| **Admin** | New Integration Health page with provider status and history. |

No global design system or brand token changes; existing Navy/Blue/Teal/Purple and Outfit/DM Serif remain.

---

## What’s Left (Pre–Live Checklist)

- [ ] **Env vars** — Ensure Vercel has `CRON_SECRET`, Firebase, Sentry, `CSV_INBOUND_SECRET`, etc. (see RUNBOOK.md).
- [ ] **Stripe** — Billing/portal and webhooks configured; backup codes not in repo (e.g. `stripe_backup_code.txt` in `.gitignore`).
- [ ] **Firebase** — Deploy rules after push: `cd dashboard && firebase deploy --only firestore:rules`.
- [ ] **Cron** — Confirm 4-hour pipeline cron in Vercel and one successful run.
- [ ] **Smoke test** — Login (with MFA if enabled), Settings, Billing link, Admin → Integration health (superadmin), Sync now.

---

## Tomorrow’s Todo List

1. **Smoke test in production** — Full login → dashboard → settings → billing → admin integration health; trigger “Sync now” once.
2. **Sentry** — Confirm alerts for `pipeline_cron` and `CRON_SECRET` (see RUNBOOK).
3. **Stripe** — Verify portal and webhook URLs and test subscription/portal flow if not done.
4. **Documentation** — Add Integration Health and WriteUpp probe to RUNBOOK (optional).
5. **TM3 / Pabau** — No code changes in this 24h; keep on roadmap.
6. **Optional** — One final pass on empty states and error copy on login/settings for “almost live” polish.

---

## Where to Find What

| Feature | Route / API | Role |
|--------|-------------|------|
| Login (sign-in, sign-up, reset, MFA) | `/login` | All |
| MFA enrollment | `/mfa-setup` | Logged-in users (required if `mfaRequired`) |
| Settings (profile, billing, MFA, sync, PMS) | `/settings` | Owner / admin |
| Integration health | `/admin/integration-health` | Superadmin |
| Integration health API | `GET /api/admin/integration-health` | Superadmin (or scoped by clinic) |
| WriteUpp probe | `POST /api/debug/writeupp-probe` | Owner / admin / superadmin |
| PMS disconnect | `POST /api/pms/disconnect` | Owner / admin / superadmin |
| PMS save config | `POST /api/pms/save-config` | Owner / admin / superadmin |
| SAR email copy | `dashboard/src/data/sar-email-templates.ts` | N/A (server/ops) |

---

*Generated 13 March 2026. After push: deploy Firestore rules and confirm Vercel build + cron.*
