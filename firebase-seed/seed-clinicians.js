require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc, addDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  projectId: process.env.FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const clinicians = [
  { id: "andrew_001", name: "Andrew" },
  { id: "sarah_002", name: "Sarah" },
  { id: "james_003", name: "James" },
  { id: "emma_004", name: "Emma" },
];

const weeks = ["2026-01-27", "2026-02-03", "2026-02-10", "2026-02-17"];

const statsPerClinician = {
  andrew_001: [
    { followUpRate: 2.5, hepRate: 0.88, appointmentsTotal: 14 },
    { followUpRate: 2.7, hepRate: 0.91, appointmentsTotal: 16 },
    { followUpRate: 3.0, hepRate: 0.93, appointmentsTotal: 18 },
    { followUpRate: 3.1, hepRate: 0.96, appointmentsTotal: 19 },
  ],
  sarah_002: [
    { followUpRate: 2.8, hepRate: 0.92, appointmentsTotal: 12 },
    { followUpRate: 2.9, hepRate: 0.94, appointmentsTotal: 14 },
    { followUpRate: 3.2, hepRate: 0.97, appointmentsTotal: 15 },
    { followUpRate: 3.4, hepRate: 0.98, appointmentsTotal: 16 },
  ],
  james_003: [
    { followUpRate: 1.9, hepRate: 0.78, appointmentsTotal: 10 },
    { followUpRate: 2.1, hepRate: 0.82, appointmentsTotal: 11 },
    { followUpRate: 2.4, hepRate: 0.85, appointmentsTotal: 13 },
    { followUpRate: 2.6, hepRate: 0.89, appointmentsTotal: 12 },
  ],
  emma_004: [
    { followUpRate: 3.0, hepRate: 0.95, appointmentsTotal: 18 },
    { followUpRate: 3.1, hepRate: 0.96, appointmentsTotal: 20 },
    { followUpRate: 2.8, hepRate: 0.93, appointmentsTotal: 17 },
    { followUpRate: 3.3, hepRate: 0.97, appointmentsTotal: 21 },
  ],
};

async function seedClinicians() {
  const existing = await getDocs(collection(db, 'weeklyStats'));
  console.log(`Deleting ${existing.size} existing documents...`);
  for (const d of existing.docs) {
    await deleteDoc(doc(db, 'weeklyStats', d.id));
  }

  let count = 0;
  for (const clinician of clinicians) {
    const stats = statsPerClinician[clinician.id];
    for (let i = 0; i < weeks.length; i++) {
      await addDoc(collection(db, 'weeklyStats'), {
        clinicianId: clinician.id,
        clinicianName: clinician.name,
        weekStart: weeks[i],
        ...stats[i],
      });
      count++;
      console.log(`  ✓ ${clinician.name} — ${weeks[i]}`);
    }
  }

  console.log(`\nSeeded ${count} documents for ${clinicians.length} clinicians.`);
  process.exit(0);
}

seedClinicians().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
