import type { ClinicProfile } from "./clinic";

export type UserRole = "owner" | "admin" | "clinician" | "superadmin";
export type UserStatus = "invited" | "onboarding" | "registered";

export interface UserDocument {
  clinicId: string;
  clinicianId?: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  status: UserStatus;
  firstLogin: boolean;
  tourCompleted: boolean;
  /** Multi-site: additional clinic IDs this user can access (server-set only). */
  allowedClinicIds?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface AuthUser {
  uid: string;
  email: string;
  clinicId: string;
  clinicianId?: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  firstLogin: boolean;
  tourCompleted: boolean;
  status: UserStatus;
  mfaEnrolled: boolean;
  clinicProfile: ClinicProfile | null;
  /** Multi-site: all clinic IDs this user can access (includes primary clinicId). */
  allowedClinicIds: string[];
  /** Multi-site: clinic ID + name pairs for the picker dropdown. */
  allowedClinics: { id: string; name: string }[];
  /** Multi-site: the currently active clinic (may differ from primary clinicId). */
  activeClinicId: string;
  /** Multi-site: true when user has access to 2+ clinics. */
  isMultiSite: boolean;
}
