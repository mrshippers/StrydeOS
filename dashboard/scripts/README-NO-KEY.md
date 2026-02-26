# Super Admin setup **without** downloading a key

If you see **"Key creation is not allowed on this service account"** in Firebase (org policy blocking key download), use **Application Default Credentials** instead. No key file, no clicking "Generate new private key".

---

## Steps

**1. Install Google Cloud CLI** (if you don’t have it)

- Mac: `brew install google-cloud-sdk`
- Or: https://cloud.google.com/sdk/docs/install

**2. Log in with the account that has access to the Firebase project**

Use the same Google account you use for Firebase (e.g. info@driiva.co.uk or jamal@…):

```bash
gcloud auth application-default login
```

A browser window opens; sign in with that account and allow access.

**3. Set the project** (optional; script will use your app’s project from .env if needed)

```bash
gcloud config set project clinical-tracker-spires
```

**4. Run the setup script**

From the **dashboard** directory:

```bash
npm run setup:superadmin
```

The script will use your gcloud login and create/update the super admin user. No service account key is needed.

**5. Sign in to the app**

- Email: **jamal@spiresphysiotherapy.com**
- Password: **spires2015**

You’ll land on `/admin`.
