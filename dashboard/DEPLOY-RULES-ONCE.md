# Deploy Firestore rules once (for "Make me Stryde Super User" button)

The app has a **one-click "Make me Stryde Super User"** button in **Settings**. It only works after you update Firestore rules once.

**Do this once:**

1. Open **Firebase Console** → project **clinical-tracker-spires** → **Firestore Database** → **Rules**.
2. Replace the whole rules editor content with the contents of **`firestore.rules`** in this repo (copy the entire file).
3. Click **Publish**.

Then in the app: **Settings** → **Make me Stryde Super User** → you’re done.
