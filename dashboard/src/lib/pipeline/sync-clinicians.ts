import type { Firestore } from "firebase-admin/firestore";
import type { PMSAdapter } from "@/types/pms";
import type { StageResult } from "./types";

/**
 * Stage 1: Sync clinicians from the PMS into Firestore.
 *
 * Upserts by pmsExternalId. Creates new clinicians, updates existing ones.
 * Never hard-deletes — deactivates clinicians missing from the PMS response.
 */
export async function syncClinicians(
  db: Firestore,
  clinicId: string,
  adapter: PMSAdapter
): Promise<StageResult> {
  const start = Date.now();
  const errors: string[] = [];
  let count = 0;

  try {
    const pmsClinicians = await adapter.getClinicians();

    const cliniciansRef = db
      .collection("clinics")
      .doc(clinicId)
      .collection("clinicians");

    const existingSnap = await cliniciansRef.limit(500).get();
    const byExternalId = new Map<string, string>();
    const allInternalIds = new Set<string>();

    for (const doc of existingSnap.docs) {
      allInternalIds.add(doc.id);
      const extId = doc.data().pmsExternalId;
      if (extId) byExternalId.set(extId, doc.id);
    }

    const now = new Date().toISOString();
    const batch = db.batch();
    const seenExternalIds = new Set<string>();

    for (const pms of pmsClinicians) {
      seenExternalIds.add(pms.externalId);
      const existingId = byExternalId.get(pms.externalId);

      if (existingId) {
        batch.update(cliniciansRef.doc(existingId), {
          name: pms.name,
          role: pms.role ?? "Physiotherapist",
          active: pms.active,
          pmsExternalId: pms.externalId,
          updatedAt: now,
        });
      } else {
        const newRef = cliniciansRef.doc();
        batch.set(newRef, {
          name: pms.name,
          role: pms.role ?? "Physiotherapist",
          active: pms.active,
          pmsExternalId: pms.externalId,
          createdAt: now,
          createdBy: "pipeline",
        });
      }
      count++;
    }

    // Deactivate clinicians that are no longer in the PMS
    for (const [extId, intId] of byExternalId) {
      if (!seenExternalIds.has(extId)) {
        batch.update(cliniciansRef.doc(intId), {
          active: false,
          updatedAt: now,
        });
      }
    }

    await batch.commit();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    stage: "sync-clinicians",
    ok: errors.length === 0,
    count,
    errors,
    durationMs: Date.now() - start,
  };
}

/** Build a map from PMS external clinician ID to Firestore internal ID. */
export async function buildClinicianMap(
  db: Firestore,
  clinicId: string
): Promise<Map<string, string>> {
  const snap = await db
    .collection("clinics")
    .doc(clinicId)
    .collection("clinicians")
    .get();

  const map = new Map<string, string>();
  for (const doc of snap.docs) {
    const extId = doc.data().pmsExternalId;
    if (extId) map.set(extId, doc.id);
  }
  return map;
}
