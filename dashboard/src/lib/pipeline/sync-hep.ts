import type { Firestore, WriteBatch } from "firebase-admin/firestore";
import type { HEPAdapter } from "@/lib/integrations/hep/types";
import type { StageResult } from "./types";

const CONCURRENCY = 5;
const MAX_BATCH_SIZE = 500;

/**
 * Stage 4: Enrich appointments and patients with HEP provider data.
 *
 * For each active (non-discharged) patient with a pmsExternalId:
 *  1. Query the connected HEP provider for assigned programmes
 *  2. If programme exists: mark hepAssigned on recent appointments, set hepProgramId on patient
 *  3. Store completionPercent for metrics computation
 */
export async function syncHep(
  db: Firestore,
  clinicId: string,
  hepAdapter: HEPAdapter
): Promise<StageResult> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;

  try {
    const patientsRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("patients");
    const appointmentsRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments");

    // Get active patients with external IDs
    const patientsSnap = await patientsRef
      .where("discharged", "==", false)
      .get();

    const patients = patientsSnap.docs
      .map((d) => ({
        id: d.id,
        pmsExternalId: d.data().pmsExternalId as string | undefined,
        physitrackPatientId: d.data().physitrackPatientId as
          | string
          | undefined,
      }))
      .filter((p) => p.pmsExternalId || p.physitrackPatientId);

    // Process in batches to respect API rate limits
    for (let i = 0; i < patients.length; i += CONCURRENCY) {
      const chunk = patients.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (patient) => {
          const lookupId =
            patient.physitrackPatientId ?? patient.pmsExternalId;
          if (!lookupId) return null;

          const programmes = await hepAdapter.getProgrammes({
            patientExternalId: lookupId,
          });

          if (programmes.length === 0) return null;

          // Use the most recently assigned programme
          const sorted = [...programmes].sort((a, b) =>
            b.assignedAt.localeCompare(a.assignedAt)
          );
          const latest = sorted[0];

          // Pull adherence data when adapter supports it (e.g. Physitrack V2)
          let hepAdherence: {
            adherencePercent: number;
            sessionsCompleted: number;
            lastSessionAt?: string;
          } | undefined;
          if (hepAdapter.getAdherence && latest.externalId) {
            const adherence = await hepAdapter.getAdherence(
              lookupId,
              latest.externalId
            );
            if (adherence) {
              hepAdherence = {
                adherencePercent: adherence.adherencePercent,
                sessionsCompleted: adherence.sessionsCompleted,
                lastSessionAt: adherence.lastSessionAt,
              };
            }
          }

          return {
            patientDocId: patient.id,
            pmsExternalId: patient.pmsExternalId,
            programmeId: latest.externalId,
            completionPercent: latest.completionPercent,
            hepAdherence,
          };
        })
      );

      let batch: WriteBatch = db.batch();
      let batchCount = 0;

      for (const result of results) {
        if (result.status === "rejected") {
          errors.push(result.reason?.message ?? String(result.reason));
          continue;
        }
        if (!result.value) continue;

        const {
          patientDocId,
          pmsExternalId,
          programmeId,
          completionPercent,
          hepAdherence,
        } = result.value;

        const patientUpdate: Record<string, unknown> = {
          hepProgramId: programmeId,
          hepCompletionPercent: completionPercent,
          updatedAt: new Date().toISOString(),
        };
        if (hepAdherence) {
          patientUpdate.hepAdherence = hepAdherence;
        }

        // Update patient doc with HEP programme info and optional adherence
        batch.update(patientsRef.doc(patientDocId), patientUpdate);
        batchCount++;

        // Mark hepAssigned on this patient's recent completed appointments
        if (pmsExternalId) {
          const recentAppts = await appointmentsRef
            .where("patientId", "==", pmsExternalId)
            .where("status", "==", "completed")
            .get();

          for (const apptDoc of recentAppts.docs) {
            if (apptDoc.data().hepAssigned !== true) {
              batch.update(appointmentsRef.doc(apptDoc.id), {
                hepAssigned: true,
                hepProgramId: programmeId,
              });
              batchCount++;

              if (batchCount >= MAX_BATCH_SIZE) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
              }
            }
          }
        }

        count++;
      }

      if (batchCount > 0) {
        await batch.commit();
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    stage: "sync-hep",
    ok: errors.length === 0,
    count,
    errors,
    durationMs: Date.now() - start,
  };
}
