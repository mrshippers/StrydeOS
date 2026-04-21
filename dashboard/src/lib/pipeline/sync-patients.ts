import type { Firestore } from "firebase-admin/firestore";
import type { PMSAdapter } from "@/types/pms";
import type { StageResult } from "./types";

const CONCURRENCY = 10;

async function batchAsync<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    for (const r of chunkResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
}

/**
 * Stage 3: Resolve patients from the PMS and create/update Firestore docs.
 *
 * For each unique patient external ID seen in synced appointments:
 *  1. Check if a patients doc with that pmsExternalId already exists
 *  2. If not, call adapter.getPatient() to fetch demographics
 *  3. Create or update the patient doc
 *  4. Assign the primary clinician (most appointments)
 */
export async function syncPatients(
  db: Firestore,
  clinicId: string,
  adapter: PMSAdapter,
  patientExternalIds: Set<string>,
  clinicianMap: Map<string, string>
): Promise<StageResult> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;

  try {
    const patientsRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("patients");

    // Build index of existing patients by pmsExternalId
    const existingSnap = await patientsRef.limit(10000).get();
    const byExternalId = new Map<string, string>();
    for (const doc of existingSnap.docs) {
      const extId = doc.data().pmsExternalId;
      if (extId) byExternalId.set(extId, doc.id);
    }

    // Determine primary clinician per patient from appointments
    const appointmentsSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments")
      .select("patientId", "clinicianId")
      .get();

    const clinicianCounts = new Map<string, Map<string, number>>();
    for (const doc of appointmentsSnap.docs) {
      const { patientId, clinicianId } = doc.data();
      if (!patientId || !clinicianId) continue;
      if (!clinicianCounts.has(patientId)) {
        clinicianCounts.set(patientId, new Map());
      }
      const counts = clinicianCounts.get(patientId)!;
      counts.set(clinicianId, (counts.get(clinicianId) ?? 0) + 1);
    }

    function getPrimaryClinician(patientExtId: string): string {
      const counts = clinicianCounts.get(patientExtId);
      if (!counts || counts.size === 0) {
        return clinicianMap.values().next().value ?? "unknown";
      }
      let best = "";
      let bestCount = 0;
      for (const [cid, cnt] of counts) {
        if (cnt > bestCount) {
          best = cid;
          bestCount = cnt;
        }
      }
      return best;
    }

    const idsToResolve = [...patientExternalIds];
    const now = new Date().toISOString();

    await batchAsync(idsToResolve, CONCURRENCY, async (extId) => {
      try {
        const existingDocId = byExternalId.get(extId);

        // Fetch from PMS only if we don't have this patient yet
        let name = "Unknown";
        let dob: string | undefined;
        let email: string | undefined;
        let phone: string | undefined;
        let insurerName: string | undefined;
        let insuranceFlag = false;

        if (!existingDocId) {
          try {
            const pmsPatient = await adapter.getPatient(extId);
            name =
              [pmsPatient.firstName, pmsPatient.lastName]
                .filter(Boolean)
                .join(" ") || "Unknown";
            dob = pmsPatient.dob;
            email = pmsPatient.email;
            phone = pmsPatient.phone;
            insurerName = pmsPatient.insurerName;
            insuranceFlag = !!insurerName;
          } catch {
            // PMS call failed — create with minimal data, will enrich on next sync
          }
        }

        const primaryClinician = getPrimaryClinician(extId);

        if (existingDocId) {
          // Re-fetch from PMS to keep name + contact in sync
          const updateData: Record<string, unknown> = {
            clinicianId: primaryClinician,
            updatedAt: now,
          };
          try {
            const pmsPatient = await adapter.getPatient(extId);
            const pmsName = [pmsPatient.firstName, pmsPatient.lastName]
              .filter(Boolean)
              .join(" ");
            if (pmsName && pmsName !== "Unknown") {
              updateData.name = pmsName;
            }
            if (pmsPatient.email) updateData["contact.email"] = pmsPatient.email;
            if (pmsPatient.phone) updateData["contact.phone"] = pmsPatient.phone;
            if (pmsPatient.dob) updateData.dob = pmsPatient.dob;
            if (pmsPatient.insurerName) {
              updateData.insurerName = pmsPatient.insurerName;
              updateData.insuranceFlag = true;
            }
          } catch {
            // PMS call failed — update clinician assignment only
          }
          await patientsRef.doc(existingDocId).set(updateData, { merge: true });
        } else {
          const newRef = patientsRef.doc();
          await newRef.set({
            name,
            dob: dob ?? null,
            contact: {
              email: email ?? null,
              phone: phone ?? null,
            },
            clinicianId: primaryClinician,
            insuranceFlag,
            insurerName: insurerName ?? null,
            preAuthStatus: insuranceFlag ? "pending" : "not_required",
            pmsExternalId: extId,
            sessionCount: 0,
            treatmentLength: 6,
            discharged: false,
            churnRisk: false,
            createdAt: now,
            updatedAt: now,
          });
        }

        count++;
      } catch (err) {
        errors.push(
          `Patient ${extId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    stage: "sync-patients",
    ok: errors.length === 0,
    count,
    errors,
    durationMs: Date.now() - start,
  };
}
