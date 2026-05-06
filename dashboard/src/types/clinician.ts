export interface Clinician {
  id: string;
  name: string;
  role: string;
  email?: string;
  authRole?: "clinician" | "admin";
  status?: "invited" | "active";
  authUid?: string;
  pmsExternalId?: string;
  physitrackId?: string;
  active: boolean;
  avatar?: string;
  /** Clinician can opt out of the weekly digest email. Default false. */
  digestOptOut?: boolean;
  /**
   * Heidi Health opt-in (per-clinician).
   * When true the clinician's sessions are included in the Heidi sync pipeline.
   * Requires heidiEmail to be set — Heidi JWTs are issued per-user via email.
   */
  heidiEnabled?: boolean;
  /** Heidi account email for this clinician. Required when heidiEnabled is true. */
  heidiEmail?: string | null;
  createdAt?: string;
  createdBy?: string;
}
