const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
require('dotenv').config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  projectId: process.env.FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const updatedStats = [
  { weekStart: "2026-01-27", followUpRate: 1.8, hepRate: 0.35, appointmentsTotal: 16 },
  { weekStart: "2026-02-03", followUpRate: 2.0, hepRate: 0.52, appointmentsTotal: 18 },
  { weekStart: "2026-02-10", followUpRate: 2.2, hepRate: 0.71, appointmentsTotal: 20 },
  { weekStart: "2026-02-17", followUpRate: 2.4, hepRate: 0.85, appointmentsTotal: 19 },
];

async function updateStats() {
  const snapshot = await getDocs(collection(db, 'weeklyStats'));
  
  for (const document of snapshot.docs) {
    const data = document.data();
    const match = updatedStats.find(s => s.weekStart === data.weekStart);
    if (match) {
      await updateDoc(doc(db, 'weeklyStats', document.id), match);
      console.log(`✓ Updated ${data.weekStart}`);
    }
  }
  
  console.log('Done!');
  process.exit(0);
}

updateStats();
