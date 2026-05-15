# Stage 1 — Code Audit

Prior art: `docs/AVA_SYNC_AUDIT.md` (covers Config view data-flow in detail). This document extends it with current-state findings across the full Ava surface.

---

## BLOCKER-1: Prompt divergence in Cloud Function

**File:** `dashboard/functions/src/sync-clinic-to-ava.ts:80-136`  
**Severity:** Blocker — silently overwrites agent prompt on every clinic doc change

The Cloud Function contains a local `buildSystemPrompt` function. The canonical behavioural prompt lives in `dashboard/src/lib/ava/ava-core-prompt.ts::AVA_CORE_PROMPT_TEMPLATE`.

**Differences confirmed:**

| Section | Canonical (`ava-core-prompt.ts`) | Cloud Function (`sync-clinic-to-ava.ts`) |
|---------|----------------------------------|------------------------------------------|
| `[1 — IDENTITY]` | Full Friday/Iron Man brief, cultural variance handling, register adaptation note | Shortened — missing register adaptation and cultural variance lines |
| `[3 — VOICE]` | Full voice guidance: Richmond not Kensington, detailed rhythm notes | Stripped — "British English. Naturally well-spoken, not RP" only |
| `[4 — CLINIC CONTEXT]` | 8-variable injection via `{{placeholders}}` | 8 variables via string interpolation — no `{{pms_name}}` fallback pattern |
| `[6 — SAFETY]` | Full red-flag routing + mental health crisis line | Present — correctly duplicated |
| `[7 — SELF-AWARENESS]` | Present | Present |

**Impact:** `onClinicWrite` fires on any clinic document change. Every settings save, KB knowledge edit, or integration config change overwrites the ElevenLabs agent with the stripped-down Cloud Function prompt, silently discarding the canonical template's carefully crafted guidance.

**Fix:** Replace `buildSystemPrompt` in the Cloud Function with a verbatim copy of `AVA_CORE_PROMPT_TEMPLATE` + `buildAvaCorePrompt` variable-injection logic. Add SYNC-LOCK comment.

---

## BLOCKER-2: `computeFreeSlots` ignores clinic operating hours

**File:** `dashboard/src/app/api/ava/tools/route.ts:423-424`  
**Severity:** Blocker — patient-facing booking errors for non-standard hours clinics

```typescript
const CLINIC_START_HOUR = 9;   // hardcoded
const CLINIC_END_HOUR = 18;    // hardcoded
```

The clinic's `ava.hours` document (`start`, `end`, `days`) is available — it's read by both `handleCheckAvailability` and `handleBookAppointment` via the clinic doc fetch. It is never passed to `computeFreeSlots`.

**Impact:** A clinic operating Tue-Thu 10:00-16:30 will have Ava offer Monday and Friday slots, and 09:00/17:00/17:30 slots that don't exist. Callers book times that aren't in the diary. PMS write-back may succeed but the appointment will conflict.

**Fix:** Pass `clinicDoc.data()?.ava?.hours` to `computeFreeSlots`. Make `hoursConfig` an optional param — defaults preserve current behaviour for unset clinics.

---

## BLOCKER-3: ElevenLabs KB delete endpoint inconsistency

**File:** `dashboard/src/lib/ava/elevenlabs-agent.ts::deleteKnowledgeBaseDoc`  
**Severity:** Blocker — stale KB docs accumulate on re-sync; agent context grows unboundedly

`deleteKnowledgeBaseDoc` in `elevenlabs-agent.ts` uses the global KB endpoint:
```
DELETE /v1/convai/knowledge-base/{docId}
```

The Cloud Function and `/api/ava/knowledge/route.ts` both upload via the agent-scoped endpoint:
```
POST /v1/convai/agents/{agentId}/add-to-knowledge-base
```
and attempt deletes via:
```
DELETE /v1/convai/agents/{agentId}/knowledge-base/{docId}
```

The IDs returned by agent-scoped upload are agent-local document references, not global KB document IDs. Calling `DELETE /convai/knowledge-base/{docId}` with an agent-local ID either 404s silently or deletes the wrong document.

**Fix:** Update `deleteKnowledgeBaseDoc` to accept `agentId` and use the agent-scoped endpoint consistently. Update the single caller in `api/ava/knowledge/route.ts` (already uses agent-scoped manually; `deleteKnowledgeBaseDoc` is unused there — it was the legacy global path).

---

## SMELL-1: `book_appointment` lacks physio-native intake fields

**File:** `dashboard/src/lib/ava/elevenlabs-agent.ts::createAvaTools` (tool schema), `dashboard/src/app/api/ava/tools/route.ts::handleBookAppointment`  
**Severity:** Product gap — no MSK-specific data captured, no clinical differentiation vs Heidi

Current `book_appointment` tool schema:
- `patient_first_name`, `patient_last_name`, `patient_phone`, `patient_email` — identity
- `slot_datetime`, `clinician_name`, `appointment_type` — booking logistics

Missing:
- `body_region` — which body part is affected (shoulder, knee, back, neck, hip, ankle, elbow, wrist, other)
- `is_red_flag_screened` — has Ava asked the one red-flag question and confirmed no red flags
- `insurance_type` — self_pay / insurance / unknown (routes admin workflow, affects revenue reporting)

These fields are already written to the `appointments` document in some form (there is an open `metadata` field and `source: "strydeos_receptionist"`). They need to be first-class tool schema fields so ElevenLabs captures them during the conversation.

---

## SMELL-2: No structured path when PMS is not configured

**File:** `dashboard/src/app/api/ava/tools/route.ts:252-259`  
**Severity:** Commercial gap — clinics in onboarding get zero structured data from Ava calls

Current behaviour when `pmsConfig.apiKey` is blank:
```typescript
return NextResponse.json(
  { response: "The booking system isn't connected for this clinic yet. Let me take your details and have someone call you back." },
  { status: 200 },
);
```

The caller intent, name, phone, reason, and preferred time are lost. No Firestore write. No admin notification.

**Fix:** When PMS is not configured, run the no-integration handler:
1. Collect what's available from the tool call inputs
2. Write to `clinics/{id}/contact_requests/{conversationId}`
3. Email clinic admin via Resend with structured summary

---

## NIT-1: No call summary email digests

**Files:** None — feature does not exist  
**Severity:** Retention gap — admin has no passive visibility into Ava's activity

SMS notifications fire for callbacks and escalations. There is no daily or on-demand email digest summarising the full day's Ava activity (booked/callbacks/escalated/info/voicemail counts + call table).

---

## CONFIRMED CLEAN (prior audit gaps now resolved)

| Prior gap | Status |
|-----------|--------|
| `useAvaConfig` one-shot `getDoc` | ✅ Fixed — now uses `onSnapshot` |
| `useAvaKnowledge` one-shot `getDoc` | ✅ Fixed — now uses `onSnapshot` |
| No `syncStatus` written to Firestore | ✅ Fixed — `syncState.status`, `syncState.lastError`, `syncState.syncLog` all written by Cloud Function |
| No sync log | ✅ Fixed — 10-entry log in `ava.syncState.syncLog` |
| No diff tracking | ✅ Fixed — `ava.syncState.lastSyncDiff` written |
| Three prompt variables vs five | ✅ Fixed — 8 variables now (`clinic_name`, `clinic_email`, `clinic_phone`, `hours`, `clinicians`, `pricing_table`, `services`, `pms_name`) |
| No Cloud Function trigger | ✅ Fixed — `onClinicWrite` deployed |
| Config/knowledge sync uncoordinated | ✅ Partially fixed — Cloud Function handles both; client route still exists for manual sync |
| `KnowledgeBase` not a first-class object | ✅ Fixed — `ava.knowledge[]` in clinic doc, full CRUD in `useAvaKnowledge` |

---

## File-level summary

| File | Findings |
|------|----------|
| `functions/src/sync-clinic-to-ava.ts` | BLOCKER-1 (prompt divergence) |
| `src/app/api/ava/tools/route.ts` | BLOCKER-2 (hardcoded hours), SMELL-1 (intake fields), SMELL-2 (no-PMS path) |
| `src/lib/ava/elevenlabs-agent.ts` | BLOCKER-3 (KB delete path), SMELL-1 (tool schema extension) |
| `src/lib/ava/ava-core-prompt.ts` | Clean — canonical source, no changes needed |
| `src/lib/ava/ava-knowledge.ts` | Clean |
| `src/app/api/webhooks/elevenlabs/route.ts` | Clean — InsightEvent writes correct, idempotent |
| `src/app/api/ava/inbound-call/route.ts` | Clean — Twilio signature verified |
| `src/app/api/ava/knowledge/route.ts` | BLOCKER-3 partial (uses agent-scoped delete already, `deleteKnowledgeBaseDoc` helper is unused) |
| `src/hooks/useAvaConfig.ts` | Clean — `onSnapshot` confirmed |
| `src/hooks/useAvaKnowledge.ts` | Clean — `onSnapshot` confirmed |
| `src/lib/ava/enrich/` | Clean — clinic enrichment orchestrator solid |
| `src/types/insight-events.ts` | Clean — AVA_* event types present, backwards-compatible |
