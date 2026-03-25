import type { Firestore } from "firebase-admin/firestore";

export interface Migration {
  id: string;
  description: string;
  up: (db: Firestore, clinicId: string) => Promise<void>;
}

// Re-export the canonical migration list
export { MIGRATIONS } from "./migrations";

/**
 * Schema version doc path: clinics/{clinicId}/_schema_version/current
 *
 * Doc shape:
 *   { appliedMigrations: Array<{ id: string; appliedAt: string }> }
 */
const SCHEMA_DOC_ID = "current";

function schemaRef(db: Firestore, clinicId: string) {
  return db
    .collection("clinics")
    .doc(clinicId)
    .collection("_schema_version")
    .doc(SCHEMA_DOC_ID);
}

export interface MigrationResult {
  clinicId: string;
  applied: string[];
  errors: Array<{ id: string; error: string }>;
}

/**
 * Run all pending migrations for a single clinic tenant.
 * Safe to call repeatedly — already-applied migrations are skipped.
 */
export async function runMigrations(
  db: Firestore,
  clinicId: string,
  migrations: Migration[]
): Promise<MigrationResult> {
  const result: MigrationResult = { clinicId, applied: [], errors: [] };
  const ref = schemaRef(db, clinicId);

  // Read current state
  const snap = await ref.get();
  const data = snap.data() as
    | { appliedMigrations?: Array<{ id: string; appliedAt: string }> }
    | undefined;

  const appliedIds = new Set(
    (data?.appliedMigrations ?? []).map((m) => m.id)
  );

  const pending = migrations.filter((m) => !appliedIds.has(m.id));

  // Track the full list so each write is cumulative
  const allApplied = [...(data?.appliedMigrations ?? [])];

  for (const migration of pending) {
    try {
      await migration.up(db, clinicId);

      // Append and persist after each successful migration
      allApplied.push({ id: migration.id, appliedAt: new Date().toISOString() });
      await ref.set({ appliedMigrations: allApplied }, { merge: true });
      result.applied.push(migration.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[migrations] Failed ${migration.id} for clinic ${clinicId}:`,
        message
      );
      result.errors.push({ id: migration.id, error: message });
      // Stop processing further migrations for this clinic on failure
      break;
    }
  }

  return result;
}
