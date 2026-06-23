import { getAdminDb } from "@/lib/firebase-admin";
import type { ToolContext, Role } from "./types";
import { ALL_ROLES } from "./types";

const DEFAULT_CLINIC_ID = "clinic-spires";
const DEFAULT_ROLE: Role = "superadmin";

export function resolveStdioContext(): ToolContext {
  const clinicId = (process.env.CLINIC_ID || DEFAULT_CLINIC_ID).trim();
  const rawRole = (process.env.MCP_ROLE || DEFAULT_ROLE).trim();

  if (!ALL_ROLES.includes(rawRole as Role)) {
    throw new Error(
      `Invalid MCP_ROLE '${rawRole}'. Must be one of: ${ALL_ROLES.join(", ")}`
    );
  }

  return {
    clinicId,
    role: rawRole as Role,
    db: getAdminDb(),
    env: {
      elevenLabsApiKey: process.env.ELEVENLABS_API_KEY?.trim(),
      firebaseProjectId: (
        process.env.FIREBASE_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      )?.trim(),
      appUrl: process.env.APP_URL?.trim() || "https://portal.strydeos.com",
    },
  };
}
