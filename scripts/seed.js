require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "YOUR_API_KEY",
  projectId: process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
  const appointments = [
    { clinicianId: "andrew_001", clinicianName: "Andrew", patientId: "patient_101", date: "2026-02-10", type: "initial", status: "attended", createdAt: "2026-02-10T09:00:00Z" },
    { clinicianId: "andrew_001", clinicianName: "Andrew", patientId: "patient_102", date: "2026-02-10", type: "initial", status: "attended", createdAt: "2026-02-10T10:00:00Z" },
    { clinicianId: "andrew_001", clinicianName: "Andrew", patientId: "patient_101", date: "2026-02-12", type: "followup", status: "attended", createdAt: "2026-02-12T09:00:00Z" },
    { clinicianId: "andrew_001", clinicianName: "Andrew", patientId: "patient_103", date: "2026-02-12", type: "initial", status: "DNA", createdAt: "2026-02-12T11:00:00Z" },
    { clinicianId: "andrew_001", clinicianName: "Andrew", patientId: "patient_104", date: "2026-02-13", type: "initial", status: "attended", createdAt: "2026-02-13T09:00:00Z" },
    { clinicianId: "andrew_001", clinicianName: "Andrew", patientId: "patient_105", date: "2026-02-14", type: "initial", status: "cancelled", createdAt: "2026-02-14T09:00:00Z" },
    { clinicianId: "andrew_001", clinicianName: "Andrew", patientId: "patient_103", date: "2026-02-14", type: "followup", status: "attended", createdAt: "2026-02-14T14:00:00Z" },
    { clinicianId: "andrew_001", clinicianName: "Andrew", patientId: "patient_106", date: "2026-02-15", type: "initial", status: "attended", createdAt: "2026-02-15T10:00:00Z" },
  ];

  const weeklyStats = [
    { clinicianId: "andrew_001", weekStart: "2026-01-27", weekEnd: "2026-02-02", appointmentsTotal: 14, followUpRate: 1.7, hepRate: 0.71 },
    { clinicianId: "andrew_001", weekStart: "2026-02-03", weekEnd: "2026-02-09", appointmentsTotal: 16, followUpRate: 1.9, hepRate: 0.78 },
    { clinicianId: "andrew_001", weekStart: "2026-02-10", weekEnd: "2026-02-16", appointmentsTotal: 18, followUpRate: 2.1, hepRate: 0.89 },
    { clinicianId: "andrew_001", weekStart: "2026-02-17", weekEnd: "2026-02-23", appointmentsTotal: 12, followUpRate: 2.3, hepRate: 0.92 },
  ];

  try {
    for (const a of appointments) await addDoc(collection(db, 'appointments'), a);
    console.log('✓ appointments done');
    for (const s of weeklyStats) await addDoc(collection(db, 'weeklyStats'), s);
    console.log('✓ weeklyStats done');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

seed();
