# Project name vs Firebase project ID

Your **Firebase app** (and `.env.local`) uses:

- **Project ID:** `clinical-tracker-spires`

So all server-side setup (service account key, Super Admin script) must be done in **that** project, not in a different Google Cloud project (e.g. "StrydeOS").

---

## Where you are now

- **Google Cloud Console** was open on project **"StrydeOS"**.
- The service account `firebase-adminsdk-fbsvc@clinical-tracker-spires.iam.gserviceaccount.com` belongs to the project **clinical-tracker-spires**, not StrydeOS.
- So you need to work in the project whose **ID** is **clinical-tracker-spires**.

---

## What to do

### Option 1 — Use Firebase Console (simplest)

1. Go to: **https://console.firebase.google.com**
2. In the project list, open **clinical-tracker-spires** (the one with project ID `clinical-tracker-spires`).
3. Click the **gear** → **Project settings**.
4. Open the **Service accounts** tab.
5. Click **Generate new private key** → confirm.
6. Save the downloaded JSON as:
   ```
   dashboard/scripts/serviceAccountKey.json
   ```
7. In the dashboard repo:
   ```bash
   cd dashboard && npm run setup:superadmin
   ```
8. Sign in with **jamal@spiresphysiotherapy.com** / **spires2015**.

### Option 2 — Use Google Cloud Console

1. Go to: **https://console.cloud.google.com**
2. Use the **project dropdown** at the top (next to “Google Cloud”).
3. Switch to the project whose **ID** is **clinical-tracker-spires** (the name might be “Clinical Tracker Spires” or similar).
4. Go to **IAM & Admin** → **Service accounts**.
5. Find **firebase-adminsdk-fbsvc@clinical-tracker-spires.iam.gserviceaccount.com**.
6. Open the **⋮** menu → **Manage keys** → **Add key** → **Create new key** → JSON.
7. Save the file as `dashboard/scripts/serviceAccountKey.json`.
8. Run:
   ```bash
   cd dashboard && npm run setup:superadmin
   ```

---

**Summary:** Use the project **clinical-tracker-spires** (in Firebase or Google Cloud). Ignore “StrydeOS” for this key; the service account you need lives under **clinical-tracker-spires**.
