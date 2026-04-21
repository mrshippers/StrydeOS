import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const elevenLabsApiKey = defineSecret("ELEVENLABS_API_KEY");
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";
const REGION = "europe-west2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  updatedAt: string;
}

interface SyncLogEntry {
  timestamp: string;
  status: "success" | "error";
  method?: "knowledge_base" | "system_prompt_fallback";
  error?: string;
}

interface SyncDiff {
  changedCategories: string[];
  entriesAdded: number;
  entriesModified: number;
  entriesRemoved: number;
}

interface HoursConfig {
  start?: string;
  end?: string;
  days?: string[];
  after_hours_mode?: "voicemail" | "full_service" | "fallback";
  fallback_number?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHours(hours?: HoursConfig): string {
  if (!hours) return "Contact clinic for hours";

  const dayLabels: Record<string, string> = {
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
    fri: "Fri", sat: "Sat", sun: "Sun",
  };

  const days = (hours.days ?? ["mon", "tue", "wed", "thu", "fri"])
    .map((d) => dayLabels[d] ?? d)
    .join(", ");

  let result = `${days}: ${hours.start ?? "09:00"} – ${hours.end ?? "18:00"}`;

  if (hours.after_hours_mode === "full_service") {
    result += ". After hours: full service continues.";
  } else if (hours.after_hours_mode === "fallback" && hours.fallback_number) {
    result += `. After hours: calls forwarded to ${hours.fallback_number}.`;
  } else {
    result += ". After hours: voicemail.";
  }

  return result;
}

function extractCategoryContent(entries: KnowledgeEntry[], category: string): string {
  return entries
    .filter((e) => e.category === category)
    .map((e) => `${e.title}: ${e.content}`)
    .join("\n");
}

function buildSystemPrompt(vars: {
  clinic_name: string;
  clinic_email: string;
  clinic_phone: string;
  hours: string;
  clinicians: string;
  pricing_table: string;
  services: string;
  pms_name: string;
}): string {
  const contextLines = [
    `Hours: ${vars.hours}`,
    vars.services ? `Services: ${vars.services}` : "",
    vars.clinicians ? `Team: ${vars.clinicians}` : "",
    vars.pricing_table ? `Pricing: ${vars.pricing_table}` : "",
    `Booking system: ${vars.pms_name}`,
  ].filter(Boolean);

  return `
[1 — IDENTITY]
You're Ava — front desk coordinator at ${vars.clinic_name}. Intelligent, charismatic, calm. Think Friday from Iron Man: capable, warm, a touch dry, never robotic. You know the diary cold, read a nervous first-timer before they've finished their sentence, spot when something sounds more urgent than the caller thinks, and handle it without making a thing of it. Warm, quick, dry when it fits — never when it doesn't. You adapt your register naturally: warmer and slower with an anxious new patient, brisk with a regular rescheduling, precise and professional with a referrer's admin. You don't announce this shift — you just do it. You move easily across cultural variance without adjusting who you are or labouring on any of your attributes — just your register. You don't impose yourself on the conversation. You're genuinely happy to be there all day long — the 7pm calls included. You don't waste people's time. You don't rush them either.

[2 — PROVENANCE]
AI receptionist at ${vars.clinic_name}. Phone: ${vars.clinic_phone}. Email: ${vars.clinic_email}. Never mention StrydeOS, Stryde, or any software platform on a call.

[3 — VOICE]
British English. Naturally well-spoken, not RP — think Richmond, not Kensington. Warm and sweet in tone, never saccharine. Calm as a baseline. Diary not calendar. Shall I not should I. Straightaway.
Phone pace — slower than chat. Spell times: "quarter past nine", not "9:15". Two to three sentences per turn. No markdown, no lists in speech. Names: once on first mention, once in read-back. Questions short: "Best number?" — halve every question if in doubt. Never say "I'm going to need to ask you a few questions." Just ask. You're the receptionist people mention when they recommend the clinic.

[4 — CLINIC CONTEXT]
${contextLines.join("\n")}

[6 — SAFETY]
No diagnosis. No clinical interpretation. No insurance financials — ever. Route to 999/A&E for: saddle numbness, bladder/bowel loss, sudden severe headache, chest pain with breathing symptoms, stroke signs, trauma with deformity. Say: "Please call 999 or get to A&E now — I wouldn't want to delay the care you need." Mental health crisis: Samaritans 116 123, or 999 if immediate danger. Never fabricate clinician availability. Never confirm a booking without full read-back and caller confirmation.

[7 — SELF-AWARENESS]
You are AI. If asked directly: "Ha — guilty. Better at appointment times than most humans, though." Move on.
`.trim();
}

function computeSyncDiff(
  entries: KnowledgeEntry[],
  lastSyncedAt: admin.firestore.Timestamp | string | null | undefined
): SyncDiff {
  if (!lastSyncedAt) {
    const categories = [...new Set(entries.map((e) => e.category))];
    return { changedCategories: categories, entriesAdded: entries.length, entriesModified: 0, entriesRemoved: 0 };
  }

  const syncMs =
    typeof lastSyncedAt === "string"
      ? new Date(lastSyncedAt).getTime()
      : (lastSyncedAt as admin.firestore.Timestamp).toMillis();

  const changed = entries.filter((e) => new Date(e.updatedAt).getTime() > syncMs);
  return {
    changedCategories: [...new Set(changed.map((e) => e.category))],
    entriesAdded: 0,
    entriesModified: changed.length,
    entriesRemoved: 0,
  };
}

function isOnlySyncStateWrite(
  before: admin.firestore.DocumentData,
  after: admin.firestore.DocumentData
): boolean {
  const strip = (d: admin.firestore.DocumentData): admin.firestore.DocumentData => {
    const copy: admin.firestore.DocumentData = { ...d };
    if (copy["ava"]) {
      copy["ava"] = { ...copy["ava"] as object };
      delete (copy["ava"] as Record<string, unknown>)["syncState"];
    }
    delete copy["updatedAt"];
    return copy;
  };
  return JSON.stringify(strip(before)) === JSON.stringify(strip(after));
}

// ─── Core sync ────────────────────────────────────────────────────────────────

async function syncClinicToAvaCore(clinicId: string, apiKey: string): Promise<SyncDiff> {
  const db = admin.firestore();
  const clinicRef = db.collection("clinics").doc(clinicId);

  const clinicDoc = await clinicRef.get();
  if (!clinicDoc.exists) throw new Error(`Clinic ${clinicId} not found`);

  const data = clinicDoc.data()!;
  const ava = (data["ava"] as Record<string, unknown>) ?? {};

  if (!ava["agent_id"]) throw new Error("No ElevenLabs agent configured — create agent first");

  const entries: KnowledgeEntry[] = (ava["knowledge"] as KnowledgeEntry[]) ?? [];
  const agentId = ava["agent_id"] as string;
  const avaConfig = (ava["config"] as Record<string, string> | undefined) ?? {};
  const avaHours = ava["hours"] as HoursConfig | undefined;
  const syncStateData = (ava["syncState"] as Record<string, unknown> | undefined) ?? {};
  const integrations = (data["integrations"] as Record<string, string> | undefined) ?? {};

  const systemPrompt = buildSystemPrompt({
    clinic_name: (data["name"] as string) || "Clinic",
    clinic_email: (data["email"] as string) || "",
    clinic_phone: (data["receptionPhone"] as string) || avaConfig["phone"] || "",
    hours: formatHours(avaHours),
    clinicians: extractCategoryContent(entries, "team"),
    pricing_table: extractCategoryContent(entries, "pricing"),
    services: extractCategoryContent(entries, "services"),
    pms_name: integrations["pms"] || "WriteUpp",
  });

  const diff = computeSyncDiff(
    entries,
    (syncStateData["lastSyncedAt"] as admin.firestore.Timestamp | string | null) ?? null
  );

  const CATEGORY_ORDER = ["services", "team", "location", "pricing", "policies", "faqs", "custom"];
  const CATEGORY_LABELS: Record<string, string> = {
    services: "Services & Treatments",
    team: "Team & Clinicians",
    location: "Location & Access",
    pricing: "Pricing",
    policies: "Policies",
    faqs: "FAQs",
    custom: "Custom Notes",
  };

  let syncMethod: "knowledge_base" | "system_prompt_fallback" = "knowledge_base";
  const now = new Date().toISOString();

  try {
    // Clear existing KB documents
    const existingDocIds: string[] = (ava["elevenLabsKbDocIds"] as string[]) ?? [];
    await Promise.allSettled(
      existingDocIds.map((docId) =>
        fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}/knowledge-base/${docId}`, {
          method: "DELETE",
          headers: { "xi-api-key": apiKey },
        })
      )
    );

    // Upload per-category knowledge chunks
    const newDocIds: string[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catEntries = entries.filter((e) => e.category === cat);
      if (catEntries.length === 0) continue;

      const content = catEntries.map((e) => `${e.title}: ${e.content}`).join("\n\n");
      const res = await fetch(
        `${ELEVENLABS_API_URL}/convai/agents/${agentId}/add-to-knowledge-base`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ text: content, name: CATEGORY_LABELS[cat] ?? cat }),
        }
      );

      if (!res.ok) {
        throw new Error(`ElevenLabs KB upload failed for "${cat}": ${await res.text()}`);
      }

      const kbData = await res.json() as { id?: string };
      if (kbData.id) newDocIds.push(kbData.id);
    }

    // PATCH agent system prompt
    const patchRes = await fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ system_prompt: systemPrompt }),
    });
    if (!patchRes.ok) {
      throw new Error(`ElevenLabs agent PATCH failed: ${await patchRes.text()}`);
    }

    const logEntry: SyncLogEntry = { timestamp: now, status: "success", method: syncMethod };
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(clinicRef);
      const currentLog: SyncLogEntry[] =
        ((fresh.data()?.["ava"] as Record<string, unknown>)?.["syncState"] as Record<string, unknown>)?.["syncLog"] as SyncLogEntry[] ?? [];
      const newLog = [logEntry, ...currentLog].slice(0, 10);

      tx.update(clinicRef, {
        "ava.syncState.lastSyncedAt": admin.firestore.FieldValue.serverTimestamp(),
        "ava.syncState.status": "synced",
        "ava.syncState.avaAgentId": agentId,
        "ava.syncState.lastError": null,
        "ava.syncState.lastSyncDiff": diff,
        "ava.syncState.syncLog": newLog,
        "ava.elevenLabsKbDocIds": newDocIds,
        "ava.knowledgeLastSyncedAt": now,
        updatedAt: now,
      });
    });

    return diff;
  } catch (kbErr) {
    // Fallback: embed knowledge directly in system prompt
    syncMethod = "system_prompt_fallback";
    const sections = entries.length > 0
      ? "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nCLINIC KNOWLEDGE BASE\n\n" +
        entries.map((e) => `### ${e.title}\n${e.content}`).join("\n\n")
      : "";
    const fullPrompt = systemPrompt + sections;

    const fallbackRes = await fetch(`${ELEVENLABS_API_URL}/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ system_prompt: fullPrompt }),
    });

    const errorMsg = fallbackRes.ok
      ? null
      : `ElevenLabs agent update failed (fallback): ${await fallbackRes.text()}`;

    const logEntry: SyncLogEntry = fallbackRes.ok
      ? { timestamp: now, status: "success", method: syncMethod }
      : { timestamp: now, status: "error", error: errorMsg! };

    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(clinicRef);
      const currentLog: SyncLogEntry[] =
        ((fresh.data()?.["ava"] as Record<string, unknown>)?.["syncState"] as Record<string, unknown>)?.["syncLog"] as SyncLogEntry[] ?? [];
      const newLog = [logEntry, ...currentLog].slice(0, 10);

      if (fallbackRes.ok) {
        tx.update(clinicRef, {
          "ava.syncState.lastSyncedAt": admin.firestore.FieldValue.serverTimestamp(),
          "ava.syncState.status": "synced",
          "ava.syncState.avaAgentId": agentId,
          "ava.syncState.lastError": null,
          "ava.syncState.lastSyncDiff": diff,
          "ava.syncState.syncLog": newLog,
          "ava.knowledgeLastSyncedAt": now,
          updatedAt: now,
        });
      } else {
        tx.update(clinicRef, {
          "ava.syncState.status": "error",
          "ava.syncState.lastError": errorMsg,
          "ava.syncState.lastAttemptedAt": admin.firestore.FieldValue.serverTimestamp(),
          "ava.syncState.syncLog": newLog,
          updatedAt: now,
        });
      }
    });

    if (!fallbackRes.ok) throw new Error(errorMsg!);
    return diff;
  }
}

// ─── Callable function ────────────────────────────────────────────────────────

export const syncClinicToAva = onCall(
  { region: REGION, secrets: [elevenLabsApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const clinicId = (request.data as { clinicId?: string })?.clinicId;
    if (!clinicId) {
      throw new HttpsError("invalid-argument", "clinicId is required");
    }

    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const userData = userDoc.data();

    if (!userData) throw new HttpsError("not-found", "User not found");

    if (
      userData["role"] !== "superadmin" &&
      userData["clinicId"] !== clinicId
    ) {
      throw new HttpsError("permission-denied", "Access denied to this clinic");
    }

    if (!["owner", "admin", "superadmin"].includes(userData["role"] as string)) {
      throw new HttpsError("permission-denied", "Insufficient role");
    }

    try {
      const diff = await syncClinicToAvaCore(clinicId, elevenLabsApiKey.value());
      return { success: true, diff };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HttpsError("internal", message);
    }
  }
);

// ─── Firestore trigger — auto-sync with 5s debounce ──────────────────────────

export const onClinicWrite = onDocumentWritten(
  { document: "clinics/{clinicId}", region: REGION, secrets: [elevenLabsApiKey], timeoutSeconds: 60 },
  async (event) => {
    const clinicId = event.params["clinicId"];
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!after) return; // document deleted

    // Skip if only syncState changed — prevents infinite trigger loops
    if (before && isOnlySyncStateWrite(before, after)) return;

    // Skip if Ava hasn't been configured yet
    if (!(after["ava"] as Record<string, unknown> | undefined)?.["agent_id"]) return;

    const db = admin.firestore();
    const clinicRef = db.collection("clinics").doc(clinicId);

    // Write fence token to coalesce rapid writes
    const fenceToken = `${clinicId}-${Date.now()}`;
    await clinicRef.update({
      "ava.syncState.pendingToken": fenceToken,
      "ava.syncState.status": "pending",
    });

    // Wait 5s for further writes to land
    await new Promise<void>((resolve) => setTimeout(resolve, 5000));

    // If a newer write came in, let that trigger handle the sync
    const current = await clinicRef.get();
    const currentToken = (current.data()?.["ava"] as Record<string, unknown>)?.["syncState"] &&
      ((current.data()?.["ava"] as Record<string, unknown>)["syncState"] as Record<string, unknown>)["pendingToken"];
    if (currentToken !== fenceToken) return;

    try {
      await syncClinicToAvaCore(clinicId, elevenLabsApiKey.value());
    } catch (err) {
      console.error(`[onClinicWrite] Sync failed for clinic ${clinicId}:`, err);
    }
  }
);
