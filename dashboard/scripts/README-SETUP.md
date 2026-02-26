# Super Admin Setup

To log in as super admin and see the `/admin` panel:

## Step 1: Get Firebase Admin credentials

**Option A — Service account JSON (easiest)**

1. Open [Firebase Console](https://console.firebase.google.com) → your project
2. Project Settings (gear) → **Service accounts**
3. Click **Generate new private key**
4. Save the JSON file as `scripts/serviceAccountKey.json` in this folder
5. **Do not commit** this file (it’s in `.gitignore`)

**Option B — Add to .env.local**

From the same service account JSON, add to `.env.local`:

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

(Use the real `project_id`, `client_email`, and `private_key` from the JSON. Keep the `\n` in the key.)

## Step 2: Run the setup script

```bash
cd dashboard
npm run setup:superadmin
```

Or with a different email:

```bash
npx tsx scripts/setup-superadmin.ts your@email.com
```

## Step 3: Sign in

- **Email:** jamal@spiresphysiotherapy.com (or the email you used)
- **Password:** spires2015

You’ll be redirected to `/admin` and see the Stryde Super User link in the sidebar.
