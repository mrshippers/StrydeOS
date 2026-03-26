# Disaster Recovery — StrydeOS

## Recovery Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| **RTO** (Recovery Time Objective) | 4 hours | Clinic hours are typically 8am–7pm; 4h allows same-day recovery |
| **RPO** (Recovery Point Objective) | 24 hours | Firestore daily automatic backups; worst case = 1 day of data |

---

## Firestore Backup & Restore

### Automatic Backups (Google-managed)
- Firestore has automatic daily backups enabled via Google Cloud.
- Region: `europe-west2` (London) — DO NOT change.
- Retention: 7 days (Google default for automatic backups).

### Manual Export (On-demand)

Run from a machine with `gcloud` authenticated as a project admin:

```bash
# Export entire database
gcloud firestore export gs://clinical-tracker-spires-backups/$(date +%Y-%m-%d) \
  --project=clinical-tracker-spires

# Export specific collections only
gcloud firestore export gs://clinical-tracker-spires-backups/$(date +%Y-%m-%d)-clinics \
  --project=clinical-tracker-spires \
  --collection-ids=clinics,users
```

### Restore from Export

```bash
# Restore from a specific export
gcloud firestore import gs://clinical-tracker-spires-backups/2026-03-25 \
  --project=clinical-tracker-spires
```

**Warning:** Import merges data — it does not replace. To do a clean restore, you must delete existing documents first.

---

## Firebase Auth Backup

Firebase Auth does not support automatic backups. To export users:

```bash
# Export all users to JSON
firebase auth:export users.json --project=clinical-tracker-spires

# Import users from JSON
firebase auth:import users.json --project=clinical-tracker-spires
```

Run this export **weekly** as part of ops routine, or before any major migration.

---

## Stripe Recovery

Stripe is the system of record for billing. No backup needed — Stripe retains all customer, subscription, and invoice data indefinitely. Recovery involves re-linking Stripe customer IDs to Firestore clinic docs.

---

## Vercel Deployment Recovery

All deployments are tied to the GitHub `main` branch. To recover:

1. Ensure the GitHub repo is intact (it's the source of truth).
2. Push to `main` — Vercel auto-deploys.
3. Re-set environment variables in Vercel dashboard if the project is recreated.

Environment variable reference: `/dashboard/.env.example` (129 variables documented).

---

## Incident Response Checklist

### If Firestore data is corrupted or lost:
1. Identify scope — which collections/clinics are affected.
2. Check `/api/status` endpoint for service health.
3. Restore from most recent automatic backup (< 24h old).
4. Re-run pipeline sync (`/api/pipeline/run`) to backfill any gap from PMS sources.
5. Notify affected clinics.

### If Firebase Auth is compromised:
1. Rotate `SESSION_SECRET` in Vercel env vars — invalidates all active sessions.
2. Review Firebase Auth console for unauthorized user creation.
3. If needed, export and re-import legitimate users.
4. Rotate `STRYDE_ADMIN_SECRET`.

### If a PMS integration key is compromised:
1. Revoke the API key in the PMS provider dashboard (WriteUpp/Cliniko/etc).
2. Update the key in Firestore: `clinics/{id}/integrations_config/pms`.
3. Re-test connection via Settings > PMS Integration.

### If Stripe webhook secret is compromised:
1. Rotate the webhook secret in Stripe dashboard.
2. Update `STRIPE_WEBHOOK_SECRET` in Vercel env vars.
3. Redeploy (or wait for next push to `main`).

---

## Secret Rotation Schedule

| Secret | Rotation | Owner |
|--------|----------|-------|
| `SESSION_SECRET` | Every 90 days | Jamal |
| `STRYDE_ADMIN_SECRET` | Every 90 days | Jamal |
| `CRON_SECRET` | Every 90 days | Jamal |
| `CSV_INBOUND_SECRET` | Every 90 days | Jamal |
| `STRIPE_SECRET_KEY` | On compromise only | Jamal |
| `STRIPE_WEBHOOK_SECRET` | On compromise only | Jamal |
| PMS API keys | Per-clinic, on compromise | Clinic owner |
| `ELEVENLABS_API_KEY` | Every 180 days | Jamal |
| `TWILIO_AUTH_TOKEN` | Every 180 days | Jamal |

---

## Recovery Testing

Test the restore process **quarterly**:

1. Export Firestore to a test bucket.
2. Import into a separate Firebase project (staging).
3. Verify data integrity — spot-check 3 clinics' appointment counts.
4. Verify auth — export/import users to staging and confirm login works.
5. Document results and any issues found.

---

## Contacts

| Role | Person | Contact |
|------|--------|---------|
| Technical lead | Jamal | (add contact) |
| Firebase/GCP | Google Cloud Support | console.cloud.google.com |
| Vercel | Vercel Support | vercel.com/support |
| Stripe | Stripe Support | dashboard.stripe.com |
