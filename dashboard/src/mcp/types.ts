import type { Firestore } from "firebase-admin/firestore";
import type { UserRole } from "@/types";

export type Role = UserRole;

export interface ToolContext {
  clinicId: string;
  role: Role;
  db: Firestore;
  env: {
    elevenLabsApiKey?: string;
    firebaseProjectId?: string;
    appUrl?: string;
  };
}

export interface ToolResult<T = unknown> {
  data: T;
  summary: string;
}

export const ALL_ROLES: readonly Role[] = ["clinician", "admin", "owner", "superadmin"];
export const OWNER_ADMIN_SUPERADMIN: readonly Role[] = ["admin", "owner", "superadmin"];

export function hasRole(actual: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(actual);
}
