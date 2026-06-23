/**
 * patient-edit-guard.ts
 *
 * PatientEditModal copies the patient's fields into local state when it opens,
 * so the editor works against a snapshot taken at open time. The patient prop
 * itself stays live (the board subscribes via `onSnapshot`), so if a PMS sync
 * or another user writes to the patient document while the modal is open, the
 * snapshot the user is editing silently goes stale — and a blind Save would
 * overwrite the fresher server data.
 *
 * This guard detects that divergence by comparing the `updatedAt` the editor
 * opened against the current `updatedAt` on the live patient document.
 *
 * Pure + dependency-free so it is unit-testable without a render harness
 * (the repo has no @testing-library/react — see PatientBoard.test.ts).
 */

/**
 * Returns true when the underlying patient record has changed since the editor
 * captured its working snapshot — i.e. saving now would clobber fresher data.
 *
 * @param openedUpdatedAt  `patient.updatedAt` captured when the modal opened
 * @param currentUpdatedAt `patient.updatedAt` on the live (onSnapshot) prop now
 */
export function isPatientStale(
  openedUpdatedAt: string | undefined,
  currentUpdatedAt: string | undefined,
): boolean {
  // No baseline to compare against — cannot prove staleness, so allow the save.
  if (!openedUpdatedAt || !currentUpdatedAt) return false;
  return openedUpdatedAt !== currentUpdatedAt;
}
