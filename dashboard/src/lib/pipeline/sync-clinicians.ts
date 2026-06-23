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

/**
 * Reconcile which clinicians are "seats" for the clinic. A StrydeOS seat is a
 * clinician doc referenced by a `users.clinicianId` (i.e. someone with an
 * account). PMS sync imports every practitioner on the connected account, which
 * for a multi-branch PMS pulls clinicians from other branches who have no
 * StrydeOS account — they must stay in the data (for attribution) but be hidden
 * and excluded from seat/tier counts. We model that as `active = isSeat`.
 *
 * Returns the seat clinician ids so callers can gate patient visibility too.
 */
export async function reconcileClinicianSeats(
  db: Firestore,
  clinicId: string
): Promise<{ seatIds: string[]; activated: number; deactivated: number }> {
  const usersSnap = await db
    .collection("users")
    .where("clinicId", "==", clinicId)
    .get();
  const seatIds = new Set<string>();
  for (const u of usersSnap.docs) {
    const cid = u.data().clinicianId as string | undefined;
    if (cid) seatIds.add(cid);
  }

  const cliniciansSnap = await db
    .collection("clinics")
    .doc(clinicId)
    .collection("clinicians")
    .get();

  const now = new Date().toISOString();
  const batch = db.batch();
  let activated = 0;
  let deactivated = 0;
  for (const doc of cliniciansSnap.docs) {
    const isSeat = seatIds.has(doc.id);
    const wasActive = doc.data().active === true;
    if (isSeat && !wasActive) {
      batch.update(doc.ref, { active: true, updatedAt: now });
      activated++;
    } else if (!isSeat && wasActive) {
      batch.update(doc.ref, { active: false, updatedAt: now });
      deactivated++;
    }
  }
  if (activated || deactivated) await batch.commit();
  return { seatIds: [...seatIds], activated, deactivated };
}
