/**
 * Heidi per-clinician opt-in access helpers.
 *
 * Pure functions mirroring the server-side rules in
 * src/app/api/clinicians/[id]/heidi/route.ts. Used by the settings UI
 * to gate controls so clinicians don't see options they can't use.
 */

const ADMIN_ROLES = new Set(["owner", "admin", "superadmin"]);

type Viewer = {
  role: "owner" | "admin" | "superadmin" | "clinician";
  clinicianId: string | undefined;
};

/**
 * Can the viewer edit the Heidi settings for `targetClinicianId`?
 *
 * Rule: admins (owner/admin/superadmin) can edit anyone in their clinic;
 * clinicians can only edit their own record.
 */
export function canEditHeidi(viewer: Viewer, targetClinicianId: string): boolean {
  if (ADMIN_ROLES.has(viewer.role)) return true;
  return !!viewer.clinicianId && viewer.clinicianId === targetClinicianId;
}

export type HeidiPatchInput = {
  enabled: boolean;
  email?: string;
};

export type HeidiPatchContext = {
  clinicHeidiConnected?: boolean;
};

export type HeidiPatchValidation =
  | { ok: true; enabled: boolean; email: string | null }
  | { ok: false; error: string };

// Minimal email sanity check — matches the server's trim() + presence check
// plus a simple shape filter so the UI can flag obvious typos before a round trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate + normalise a Heidi patch payload before sending it.
 *
 * When enabling:
 *   - email is required
 *   - email is trimmed and shape-checked
 *   - clinic-level Heidi config must be connected (context.clinicHeidiConnected)
 *
 * When disabling: accepts any state.
 */
export function validateHeidiPatch(
  input: HeidiPatchInput,
  context: HeidiPatchContext = {},
): HeidiPatchValidation {
  if (!input.enabled) {
    return { ok: true, enabled: false, email: null };
  }

  if (context.clinicHeidiConnected === false) {
    return {
      ok: false,
      error: "Connect Heidi at the clinic level first before enabling it for a clinician.",
    };
  }

  const email = input.email?.trim() ?? "";
  if (!email) {
    return { ok: false, error: "Heidi email is required when enabling the integration." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid Heidi email address." };
  }

  return { ok: true, enabled: true, email };
}
