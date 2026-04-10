/**
 * sync-heidi.ts
 *
 * Stage 4b: Enrich patients with Heidi clinical notes and complexity signals.
 *
 * Heidi has no webhooks — this stage polls the REST API for sessions
 * updated since the last sync. For each session:
 *   1. Fetch documents (generated notes)
 *   2. Fetch clinical codes (ICD-10/SNOMED)
 *   3. Ask Heidi for pain score, discharge outlook, psychosocial flags
 *   4. Match patient via ehr_patient_id → pmsExternalId
 *   5. Write ClinicalNote to Firestore
 *   6. Update patient.complexitySignals
 *
 * Triggered from run-pipeline.ts after the HEP stage, or standalone via API.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { HeidiIntegrationConfig, ClinicalCode } from "@/types";
import type { StageResult } from "./types";
import { INTEGRATIONS_CONFIG } from "./types";
import {
  getHeidiJwt,
  fetchSessions,
  fetchSessionDocuments,
  fetchClinicalCodes,
  fetchPatientProfile,
  askHeidi,
} from "@/lib/integrations/heidi/client";
import { composeComplexitySignals } from "./extract-complexity";

const CONCURRENCY = 3;

const ASK_PAIN = "What is the patient's current pain score on a 0-10 numeric pain rating scale (NPRS or VAS)? Provide just the number if mentioned.";
const ASK_DISCHARGE = "Is discharge discussed in this session? Rate the likelihood of discharge as low, moderate, or high based on the clinical plan.";
const ASK_PSYCHOSOCIAL = "Are there any psychosocial yellow or red flags mentioned? Look for fear-avoidance, catastrophising, kinesiophobia, anxiety, depression, sleep disturbance, or hypervigilance.";

export async function syncHeidi(
  db: Firestore,
  clinicId: string,
): Promise<StageResult> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;

  try {
    // ── Load Heidi config ──────────────────────────────────────────────────
    const configRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection(INTEGRATIONS_CONFIG)
      .doc("heidi");

    const configSnap = await configRef.get();
    const config = configSnap.data() as HeidiIntegrationConfig | undefined;

    if (!config?.enabled || !config?.apiKey?.trim()) {
      return {
        stage: "sync-heidi",
        ok: true,
        count: 0,
        errors: ["No Heidi config — skipping"],
        durationMs: Date.now() - start,
      };
    }

    // Decrypt API key if encrypted (backward-compatible with plaintext)
    let apiKey = config.apiKey;
    try {
      const { isEncrypted, decryptCredential } = await import("@/lib/crypto/credentials");
      if (isEncrypted(apiKey)) {
        apiKey = decryptCredential(apiKey, clinicId);
      }
    } catch { /* CREDENTIAL_MASTER_SECRET not set — use as-is */ }
    const clientConfig = { apiKey, region: config.region };
    const since = config.lastSyncAt ?? undefined;

    // ── Load opted-in clinicians (heidiEnabled = true, heidiEmail set) ────
    const cliniciansSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("clinicians")
      .where("active", "==", true)
      .get();

    const clinicians = cliniciansSnap.docs
      .map((d) => ({
        id: d.id,
        name: d.data().name as string,
        heidiEnabled: d.data().heidiEnabled as boolean | undefined,
        email: d.data().heidiEmail as string | undefined,
      }))
      .filter(
        (c): c is { id: string; name: string; heidiEnabled: boolean; email: string } =>
          c.heidiEnabled === true && !!c.email,
      );

    // ── Load patients for matching ─────────────────────────────────────────
    const patientsSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("patients")
      .where("discharged", "==", false)
      .get();

    const patientsByPmsId = new Map<string, string>();
    const patientsByHeidiId = new Map<string, string>();

    for (const doc of patientsSnap.docs) {
      const data = doc.data();
      if (data.pmsExternalId) patientsByPmsId.set(data.pmsExternalId, doc.id);
      if (data.heidiPatientId) patientsByHeidiId.set(data.heidiPatientId, doc.id);
    }

    const notesRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("clinical_notes");

    const patientsRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("patients");

    // ── Process each opted-in clinician ────────────────────────────────────
    for (const clinician of clinicians) {
      let jwt: string;
      try {
        jwt = await getHeidiJwt(clientConfig, clinician.email, clinician.id);
      } catch (err) {
        errors.push(
          `JWT failed for ${clinician.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      // Fetch sessions updated since last sync
      let sessions;
      try {
        sessions = await fetchSessions(clientConfig, jwt, {
          since,
          status: "APPROVED",
        });
      } catch (err) {
        errors.push(
          `Fetch sessions failed for ${clinician.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      // Process sessions in batches
      for (let i = 0; i < sessions.length; i += CONCURRENCY) {
        const chunk = sessions.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (session) => {
            // Dedup: skip if we already have this session
            const existingSnap = await notesRef
              .where("heidiSessionId", "==", session.id)
              .limit(1)
              .get();
            if (!existingSnap.empty) return;

            // Fetch documents and clinical codes in parallel
            const [docs, codes] = await Promise.all([
              fetchSessionDocuments(clientConfig, jwt, session.id),
              fetchClinicalCodes(clientConfig, jwt, session.id),
            ]);

            if (docs.length === 0) return;

            // Match patient
            let patientId: string | undefined;

            if (session.patient_profile_id) {
              // Check cache first
              patientId = patientsByHeidiId.get(session.patient_profile_id);

              if (!patientId) {
                // Fetch patient profile from Heidi and match by ehr_patient_id
                try {
                  const profile = await fetchPatientProfile(
                    clientConfig,
                    jwt,
                    session.patient_profile_id,
                  );
                  if (profile.ehr_patient_id) {
                    patientId = patientsByPmsId.get(profile.ehr_patient_id);
                  }
                } catch {
                  // Patient profile fetch failed — continue without match
                }
              }
            }

            if (!patientId) {
              errors.push(
                `No patient match for Heidi session ${session.id} — skipping`,
              );
              return;
            }

            // Ask Heidi for structured data extraction
            const askAnswers: {
              painAnswer?: string;
              dischargeAnswer?: string;
              psychosocialAnswer?: string;
            } = {};

            const askQuestions = [
              { key: "painAnswer" as const, question: ASK_PAIN },
              { key: "dischargeAnswer" as const, question: ASK_DISCHARGE },
              { key: "psychosocialAnswer" as const, question: ASK_PSYCHOSOCIAL },
            ];

            await Promise.allSettled(
              askQuestions.map(async ({ key, question }) => {
                try {
                  askAnswers[key] = await askHeidi(
                    clientConfig,
                    jwt,
                    session.id,
                    question,
                  );
                } catch {
                  // Ask Heidi failed — derive from codes only
                }
              }),
            );

            // Compose complexity signals
            const complexitySignals = composeComplexitySignals(codes, askAnswers);

            // Map Heidi clinical codes to our format
            const clinicalCodes: ClinicalCode[] = codes.map((c) => ({
              code: c.primary_code.code,
              system: c.primary_code.code_system as ClinicalCode["system"],
              description: c.primary_code.display,
              relevanceScore: c.relevance_score,
            }));

            // Use the first (primary) document
            const primaryDoc = docs[0];
            const now = new Date().toISOString();

            // Write clinical note
            await notesRef.add({
              patientId,
              clinicianId: clinician.id,
              source: "heidi",
              heidiSessionId: session.id,
              receivedAt: now,
              sessionDate: session.created_at,
              noteContent: primaryDoc.content,
              noteContentType: primaryDoc.content_type,
              clinicalCodes,
              complexitySignals,
              raw: { session, documents: docs, codes },
            });

            // Update patient with latest complexity signals
            await patientsRef.doc(patientId).update({
              complexitySignals,
              complexityUpdatedAt: now,
              ...(session.patient_profile_id && !patientsByHeidiId.has(session.patient_profile_id)
                ? { heidiPatientId: session.patient_profile_id }
                : {}),
            });

            count++;
          }),
        );

        // Collect errors from rejected promises
        for (const result of results) {
          if (result.status === "rejected") {
            errors.push(
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
            );
          }
        }
      }
    }

    // ── Update lastSyncAt ────────────────────────────────────────────────────
    await configRef.update({
      lastSyncAt: new Date().toISOString(),
      status: errors.length === 0 ? "connected" : "connected",
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    stage: "sync-heidi",
    ok: errors.length === 0,
    count,
    errors,
    durationMs: Date.now() - start,
  };
}
