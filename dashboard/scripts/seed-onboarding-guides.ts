/**
 * Seed onboarding_guides collection in Firestore.
 * Run: npx tsx scripts/seed-onboarding-guides.ts
 *
 * Each doc stores PMS-specific export instructions shown in the
 * Settings → Data Import wizard (Phase 5).
 * Adding a new PMS = adding a new doc here. No code change needed.
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

const keyPath = path.resolve(__dirname, "serviceAccountKey.json");
if (!admin.apps.length) {
  if (fs.existsSync(keyPath)) {
    const sa = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}

const db = admin.firestore();

interface GuideStep {
  heading: string;
  body?: string;
}

interface OnboardingGuide {
  title: string;
  steps: GuideStep[];
}

const guides: Record<string, OnboardingGuide> = {
  writeupp: {
    title: "WriteUpp Export Guide",
    steps: [
      {
        heading: "Open WriteUpp",
        body: "Log in to your WriteUpp account at app.writeupp.com.",
      },
      {
        heading: "Navigate to Data Export",
        body: "Click the menu icon (top-left) → Tools → Data Export.",
      },
      {
        heading: "Select Appointments tab",
        body: "Switch to the Appointments tab. Set the date range to cover the period you want to import.",
      },
      {
        heading: "Export to CSV",
        body: "Click 'Export to CSV'. The file will download to your computer.",
      },
      {
        heading: "Upload to StrydeOS",
        body: "Drag the downloaded CSV into the Appointments CSV upload zone in Settings.",
      },
    ],
  },

  cliniko: {
    title: "Cliniko Export Guide",
    steps: [
      {
        heading: "Open Cliniko",
        body: "Log in to your Cliniko account.",
      },
      {
        heading: "Go to Reports",
        body: "Navigate to Reports → Individual Appointments.",
      },
      {
        heading: "Set filters and export",
        body: "Set your date range and any filters, then click 'Export'. Cliniko will email the CSV to your registered email address.",
      },
      {
        heading: "Download the CSV",
        body: "Check your email, download the attached CSV file.",
      },
      {
        heading: "Upload to StrydeOS",
        body: "Drag the CSV into the Appointments CSV upload zone in Settings. Cliniko format is auto-detected.",
      },
    ],
  },

  tm3: {
    title: "TM3 (Blue Zinc) Export Guide",
    steps: [
      {
        heading: "Open TM3",
        body: "Log in to your TM3 system.",
      },
      {
        heading: "Navigate to Reports",
        body: "Go to Management → Reports → Appointment Reports.",
      },
      {
        heading: "Configure and export",
        body: "Select your date range. Ensure columns include Date, Therapist, Status, Forename, Surname. Click Export/Download CSV.",
      },
      {
        heading: "Upload to StrydeOS",
        body: "Drag the CSV into the Appointments CSV upload zone. TM3 format is auto-detected.",
      },
    ],
  },

  jane: {
    title: "Jane App Export Guide",
    steps: [
      {
        heading: "Open Jane",
        body: "Log in to your Jane App account.",
      },
      {
        heading: "Go to Reports",
        body: "Navigate to Reports → Schedule → Appointments.",
      },
      {
        heading: "Export your data",
        body: "Set the date range, then click the Export/CSV button to download.",
      },
      {
        heading: "Upload to StrydeOS",
        body: "Drag the CSV into the Appointments CSV upload zone. Jane format is auto-detected.",
      },
    ],
  },

  other: {
    title: "Custom PMS Export Guide",
    steps: [
      {
        heading: "Export appointments from your PMS",
        body: "Look for a Data Export, Reports, or CSV Export option in your practice management system. Export your appointment data as a CSV file.",
      },
      {
        heading: "Upload to StrydeOS",
        body: "Drag the CSV into the Appointments CSV upload zone below.",
      },
      {
        heading: "Map your columns",
        body: "If StrydeOS doesn't recognise the format, you'll be asked to map each column to a field (Date, Practitioner, Status, etc.). This only happens once — future uploads with the same format are mapped automatically.",
      },
    ],
  },
};

async function seed() {
  const coll = db.collection("onboarding_guides");
  for (const [id, guide] of Object.entries(guides)) {
    await coll.doc(id).set(guide, { merge: true });
    console.log(`  ✓ ${id}`);
  }
  console.log(`\nSeeded ${Object.keys(guides).length} onboarding guides.`);
}

seed().catch(console.error);
