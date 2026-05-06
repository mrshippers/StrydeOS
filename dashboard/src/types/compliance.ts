export type Jurisdiction = "uk" | "us" | "au" | "ca";

export interface ComplianceConfig {
  jurisdiction: Jurisdiction;
  consentModel: "gdpr_lawful_basis" | "hipaa_notice" | "pipeda_express" | "app_explicit";
  mfaRequired: boolean;
  baaRequired: boolean;
  baaSignedAt: string | null;
  dataRegion: string;
  privacyPolicyVersion: string | null;
  consentRecordedAt: string | null;
  dpaAcceptedAt?: string | null;
  commsConsentAt?: string | null;
}

export interface AuditLogEntry {
  userId: string;
  userEmail: string;
  action: "read" | "write" | "update" | "delete" | "export" | "login" | "config_change";
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

export interface SarRequest {
  id: string;
  type: "access" | "correction" | "deletion";
  status: "pending" | "in_progress" | "completed" | "rejected";
  requestedBy: string;
  patientId?: string;
  description: string;
  responseDeadline: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
