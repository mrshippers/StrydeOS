# StrydeOS — Operations Runbook

Internal ops reference for the Intelligence dashboard. Not for end-users.

---

## Environment Variables

All variables must be set in the Vercel dashboard under **Settings → Environment Variables** for the `dashboard` project.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | Sentry DSN (public — safe in browser bundles) |
| `SENTRY_AUTH_TOKEN` | CI only | Sentry auth token for source map upload during builds |
| `SENTRY_ORG` | CI only | Sentry organisation slug |
| `SENTRY_PROJECT` | CI only | Sentry project slug |
| `CRON_SECRET` | **Yes** | Shared secret Vercel uses to authenticate cron invocations. Generate with `openssl rand -hex 32`. |
| `CSV_INBOUND_SECRET` | Yes | Shared secret for inbound email-to-CSV webhook (Mailgun/SendGrid/n8n). |
| `INGEST_EMAIL_DOMAIN` | Yes | Domain for ingest addresses — `ingest.strydeos.com` |
| `APP_URL` | **Yes** | Full app URL — `https://portal.strydeos.com` (no trailing slash). Used by Stripe checkout/portal return URLs. |
| `FIREBASE_*` | Yes | Firebase Admin SDK credentials |
| `STRIPE_SECRET_KEY` | **Yes** | Stripe secret key — use `sk_live_ ...` in production |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | Stripe webhook signing secret — `whsec_ ...` from Stripe Dashboard |
| `STRIPE_PRICE_*` | **Yes** | Per-module/tier/interval price IDs — see Stripe section below |

### Confirming `CRON_SECRET` is set

1. Vercel dashboard → Project → Settings → Environment Variables
2. Verify `CRON_SECRET` exists for **Production** environment
3. After any change, redeploy (Vercel caches env at build time)
4. To test: `curl -X POST https://portal.strydeos.com/api/pipeline/run -H "Authorization: Bearer <secret>"` — should return `200`, not `500 CRON_SECRET not configured`

---

## Cron Schedule

Pipeline runs every **4 hours** for all connected clinics.

```json
{ "path": "/api/pipeline/run", "schedule": "0 */4 * * *" }
```

Runs at: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC.

### Checking cron health

- Vercel dashboard → Project → **Deployments** → **Cron Jobs** tab shows last run time and status
- Sentry will surface any pipeline exceptions automatically (tagged with `clinicId` and `source: pipeline_cron`)
- If a cron invocation fails auth: check `CRON_SECRET` is set and matches what Vercel sends

### Real-time sync availability by PMS

| PMS | Sync method | Notes |
|---|---|---|
| WriteUpp | Webhook (real-time) | `POST /api/webhooks/writeupp` |
| Cliniko | Cron only (every 4h) | Cliniko has no outbound webhooks — pull-only API |
| TM3 | Email-ingest (manual trigger) | See TM3 section below |
| Jane App | CSV / email-ingest | No API |

---

## Pipeline Architecture

The 7-stage pipeline (`/lib/pipeline/run-pipeline.ts`) runs per-clinic:

1. **Fetch** — pull appointments from PMS adapter (WriteUpp API / Cliniko API / CSV)
2. **Normalise** — map PMS fields to `PMSAppointment` canonical shape
3. **Upsert** — write to Firestore `appointments` collection with `clinicId` partition
4. **Compute metrics** — derive weekly KPIs from appointment data
5. **Cache** — write computed metrics to `metrics_weekly` collection
6. **HEP sync** — fetch HEP compliance data from connected HEP provider (Physitrack / Rehab My Patient)
7. **n8n callback** — trigger any downstream automation flows

The pipeline is idempotent — safe to re-run. All writes are upserts keyed on `{clinicId}_{appointmentId}`.

---

## TM3 — Email-Ingest Pathway

TM3 (Blue Zinc) has no public API. The interim automation pathway is:

**Export → Email → Auto-import**

1. Set up a scheduled export in TM3 (or export manually)
2. Email the CSV attachment to the clinic's ingest address:  
   `import-{clinicId}@ingest.strydeos.com`
3. The inbound webhook (`POST /api/pms/import-csv/inbound`) receives the email via Mailgun/SendGrid, validates the `X-Inbound-Secret` header, extracts the clinic ID from the recipient address, and runs `runCSVImport()`

### Mailgun setup (if using Mailgun for inbound)

1. Add `ingest.strydeos.com` as a receiving domain in Mailgun
2. Set up a Route: match `import-*@ingest.strydeos.com` → forward to `https://portal.strydeos.com/api/pms/import-csv/inbound`
3. Add the `X-Inbound-Secret` header to the forwarded request (Mailgun supports custom headers in route forwarding, or proxy via n8n)
4. Set `CSV_INBOUND_SECRET` env var to match

### n8n alternative (simpler)

Use an n8n Email Trigger node → HTTP Request node to `POST /api/pms/import-csv/inbound` with `X-Inbound-Secret` header. Attach the CSV from the email trigger payload as a `file` form field.

---

## Sentry

Error monitoring is live on all API routes and the client bundle.

| Component | Coverage |
|---|---|
| API routes (server) | All unhandled exceptions via `handleApiError()` |
| Pipeline cron | Per-clinic failures captured with `clinicId` tag |
| Billing webhook | Stripe errors tagged with `stripeEvent` |
| Client bundle | Unhandled JS errors + 5% session replay |

**DSN:** set `NEXT_PUBLIC_SENTRY_DSN` in Vercel — use the project DSN from sentry.io → Project Settings → Client Keys.

**Source maps:** set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for readable production stack traces.

### Alert 1 — Pipeline cron failures

1. sentry.io → **Alerts** → **Create Alert** → **Issues**
2. Conditions:
   - **When:** A new issue is created
   - **If:** `source` tag **equals** `pipeline_cron`
3. Actions: send to your email or Slack channel
4. Name: `pipeline_cron — new failure`

### Alert 2 — CRON_SECRET not configured

1. sentry.io → **Alerts** → **Create Alert** → **Issues**
2. Conditions:
   - **When:** An issue is seen more than 0 times in 1 hour
   - **Filter:** Issue title **contains** `CRON_SECRET not configured`
3. Actions: send to email (or page via PagerDuty/Opsgenie)
4. Name: `CRON_SECRET misconfigured — immediate`

### Alert 3 — Performance (p95 > 10s)

1. sentry.io → **Alerts** → **Create Alert** → **Performance**
2. Metric: `p95(transaction.duration)` **>** `10000ms`
3. Environment: Production
4. Actions: email warning
5. Name: `p95 API latency > 10s`

---

## Stripe — Billing Setup

### Environment variables required

```
STRIPE_SECRET_KEY=sk_live_ ...          # Production key from Stripe Dashboard → API Keys
STRIPE_WEBHOOK_SECRET=whsec_ ...        # Set after registering webhook endpoint (see below)
APP_URL=https://portal.strydeos.com       # Required for checkout/portal return URLs

# Per-module/tier/interval price IDs (create products in Stripe first)
# Pattern: STRIPE_PRICE_{MODULE}_{TIER}_{INTERVAL}
STRIPE_PRICE_INTELLIGENCE_SOLO_MONTH=price_...
STRIPE_PRICE_INTELLIGENCE_STUDIO_MONTH=price_...
STRIPE_PRICE_INTELLIGENCE_CLINIC_MONTH=price_...
STRIPE_PRICE_INTELLIGENCE_SOLO_YEAR=price_...
STRIPE_PRICE_INTELLIGENCE_STUDIO_YEAR=price_...
STRIPE_PRICE_INTELLIGENCE_CLINIC_YEAR=price_...
STRIPE_PRICE_AVA_SOLO_MONTH=price_...
STRIPE_PRICE_AVA_STUDIO_MONTH=price_...
STRIPE_PRICE_AVA_CLINIC_MONTH=price_...
STRIPE_PRICE_AVA_SOLO_YEAR=price_...
STRIPE_PRICE_AVA_STUDIO_YEAR=price_...
STRIPE_PRICE_AVA_CLINIC_YEAR=price_...
STRIPE_PRICE_AVA_SETUP=price_...       # £250 one-time
STRIPE_PRICE_PULSE_SOLO_MONTH=price_...
STRIPE_PRICE_PULSE_STUDIO_MONTH=price_...
STRIPE_PRICE_PULSE_CLINIC_MONTH=price_...
STRIPE_PRICE_PULSE_SOLO_YEAR=price_...
STRIPE_PRICE_PULSE_STUDIO_YEAR=price_...
STRIPE_PRICE_PULSE_CLINIC_YEAR=price_...
STRIPE_PRICE_FULLSTACK_SOLO_MONTH=price_...
STRIPE_PRICE_FULLSTACK_STUDIO_MONTH=price_...
STRIPE_PRICE_FULLSTACK_CLINIC_MONTH=price_...
STRIPE_PRICE_FULLSTACK_SOLO_YEAR=price_...
STRIPE_PRICE_FULLSTACK_STUDIO_YEAR=price_...
STRIPE_PRICE_FULLSTACK_CLINIC_YEAR=price_...
```

> **Note:** `STRIPE_PRICE_*` IDs come from Stripe Dashboard → Products → each product's price row. Run `scripts/setup-stripe-products.ts` to create all products programmatically.

### Webhook endpoint

Register a webhook in **Stripe Dashboard → Developers → Webhooks → Add endpoint**:

- **URL:** `https://portal.strydeos.com/api/billing/webhooks`
- **Events to listen to:**
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- After saving, copy the **Signing secret** (`whsec_ ...`) → set as `STRIPE_WEBHOOK_SECRET` in Vercel

### Customer Portal

Configure in **Stripe Dashboard → Settings → Billing → Customer Portal**:

- Enable: **Allow customers to update subscriptions** (add/remove items)
- Enable: **Allow customers to cancel subscriptions**
- Enable: **Show invoices**
- Set **Business information** (name, URL, privacy, ToS links)
- Return URL: `https://portal.strydeos.com/billing`

The portal is triggered from Settings → Billing → **Manage subscription** button. It calls `POST /api/billing/portal` which returns a Stripe session URL and redirects.

### Checkout flow

`POST /api/billing/checkout` accepts:
```json
{
  "modules": ["intelligence"],
  "tier": "studio",
  "interval": "month",
  "includeAvaSetup": false
}
```
Returns `{ url }` — redirect the user to the Stripe-hosted checkout page.

### Testing locally

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks to local
stripe listen --forward-to localhost:3000/api/billing/webhooks

# Trigger a test event
stripe trigger customer.subscription.created
```

---

## Integration Health (Admin)

Tracks per-clinic, per-provider sync health from the `integration_health` Firestore collection.

**Page:** `/admin/integration-health` — superadmin only.

**API:** `GET /api/admin/integration-health`

Query params:
- `days` (default: 30) — lookback window
- `clinicId` (optional) — filter to a specific clinic

Returns per-clinic `ProviderHealthStats`:
- `successRate` — % of syncs that completed without error
- `avgDurationMs`
- `lastSuccessAt` / `lastFailureAt`
- `lastErrors` — last error message(s)
- `status` — `healthy` / `degraded` / `down`
  - `healthy`: ≥95% success rate, no 3-in-a-row failures
  - `degraded`: 70–95% success rate
  - `down`: <70% success rate or 3 consecutive failures

**Where populated:** The pipeline writes `IntegrationHealthEntry` docs to `clinics/{clinicId}/integration_health/{entryId}` after each sync attempt (Firestore rules: server-side write only).

**When to use:**
- Check before contacting a clinic about stale data
- Identify which provider is causing failures (`source: pipeline_cron` in Sentry maps to entries here)
- Validate a new PMS integration is syncing correctly after onboarding

---

## WriteUpp Probe (Admin Diagnostic)

Diagnostic endpoint to validate WriteUpp API field names without touching production data.

```
POST /api/debug/writeupp-probe
Authorization: Bearer <Firebase ID token>
Content-Type: application/json

{ "clinicId": "<clinicId>" }
```

**Auth:** `owner`, `admin`, or `superadmin`. Non-superadmin can only probe their own clinic.

**Returns:**
```json
{
  "ok": true,
  "summary": {
    "dateFrom": "2026-03-06",
    "dateTo": "2026-03-13",
    "totalReturned": 12,
    "keyShape": [
      { "keys": ["id", "startTime", "clinicianId", ...], "sample": { "id": "string", ... } }
    ],
    "confirmedFields": ["id", "startTime", ...]
  }
}
```

**When to use:**
- WriteUpp field names have changed (after an API version bump)
- Verifying a clinic's API key is valid
- Debugging stale/missing appointment data before touching the mapper

---

## Manual Pipeline Trigger ("Sync now")

From the dashboard → Settings → click **Sync now**.

This calls `POST /api/pipeline/run` with `{ clinicId }` body using the logged-in user's Firebase ID token. Requires `owner`, `admin`, or `superadmin` role.

To trigger from the CLI (e.g. backfill after a bug fix):

```bash
# Get a Firebase ID token for a superadmin account
TOKEN=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<WEB_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@strydeos.com","password":"...","returnSecureToken":true}' \
  | jq -r .idToken)

curl -X POST https://portal.strydeos.com/api/pipeline/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clinicId":"<clinicId>"}'
```

---

## Backfill

`POST /api/pipeline/backfill` runs the pipeline over a longer historical window. Use this when:
- A new clinic is onboarded (populate historical metrics)
- A bug in the pipeline corrupted metric data
- A new metric is added and needs to be computed historically

Same auth as `/api/pipeline/run`.

---

## Firestore Rules — Deploying

Rules live in `dashboard/firestore.rules`. Deploy them after every change.

```bash
# First-time or after token expiry
cd dashboard
firebase login --reauth

# Set active project (one-time per machine)
firebase use --add
# Select your project from the list, give it an alias (e.g. "production")

# Deploy rules only
firebase deploy --only firestore:rules
```

To verify rules are live: Firebase Console → Firestore → Rules tab — check the "Last modified" timestamp.

---

## Incident Response

### Pipeline failures showing in Sentry

1. Check Sentry → Issues → filter by `source: pipeline_cron`
2. Identify which `clinicId` is affected
3. Check Integration Health page (`/admin/integration-health`) for the affected clinic
4. Check clinic's PMS credentials in Firestore `clinics` collection → `pmsConfig`
5. Run WriteUpp probe (`POST /api/debug/writeupp-probe`) to validate API key and field shape
6. Trigger a manual sync via CLI once credentials are fixed

### Cron not running

1. Vercel dashboard → Cron Jobs — check last invocation time
2. If last run was >5h ago, check Vercel deployment status (crons only run on active deployments)
3. If deployment is healthy but cron is skipped, check Vercel cron logs for auth failures
4. Verify `CRON_SECRET` is set and matches

### Stripe webhook not firing

1. Stripe Dashboard → Developers → Webhooks → select the endpoint → check **Recent deliveries**
2. If deliveries are failing: check `STRIPE_WEBHOOK_SECRET` in Vercel matches the endpoint's signing secret
3. If URL is wrong: update the endpoint URL in Stripe Dashboard to `https://portal.strydeos.com/api/billing/webhooks`
4. Retry the failed delivery from the Stripe Dashboard if needed (safe — webhook handler is idempotent)

### Billing portal not opening

- Verify `APP_URL=https://portal.strydeos.com` is set in Vercel
- Verify Customer Portal is configured in Stripe Dashboard → Settings → Billing → Customer Portal
- The clinic must have a `billing.stripeCustomerId` in Firestore — if not, they haven't checked out yet

### High DNA rate spike at a clinic

Not an incident — surface to the clinic owner via the Intelligence dashboard. This is signal, not error.

---

---

## i18n (Internationalisation)

The dashboard uses `next-intl` for internationalisation.

### Architecture

- **Messages:** `dashboard/messages/en.json` — all translatable strings (English default)
- **Server config:** `dashboard/src/i18n/request.ts` — locale resolution
- **Type safety:** `dashboard/global.d.ts` — typed message keys from `en.json`
- **Root layout:** `NextIntlClientProvider` wraps the app with locale + messages

### Adding a new language

1. Create `dashboard/messages/{locale}.json` (e.g. `fr.json`) with same key structure as `en.json`
2. Update `dashboard/src/i18n/request.ts` to resolve the new locale
3. Translations are available immediately — no build step required

### Current state

- English (`en`) only — foundation is wired, no other locales active yet
- All new user-facing strings should use `useTranslations()` hook rather than hardcoded text

---

*Last updated: 24 March 2026*
