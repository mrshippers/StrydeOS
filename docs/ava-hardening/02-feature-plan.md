# Stage 2 — Feature Plan

Three sprints, each shippable independently.

---

## Sprint 1 — Prompt integrity + booking accuracy

**Commercial outcome:** Ava's behaviour exactly matches the canonical configuration on every sync. Correct slots are offered to every caller regardless of clinic hours.

---

### S1-T1: Fix prompt divergence in Cloud Function

**Problem:** `functions/src/sync-clinic-to-ava.ts` uses a local `buildSystemPrompt` that has diverged from `src/lib/ava/ava-core-prompt.ts::AVA_CORE_PROMPT_TEMPLATE`. Every `onClinicWrite` trigger silently overwrites the agent with the stripped-down version.

**Architecture decisions:**
- The functions package (`strydeos-functions`) is a separate TypeScript project. It cannot import from `src/`. Shared logic must be copied.
- The fix is to replace the local function with a verbatim copy of `AVA_CORE_PROMPT_TEMPLATE` + the `buildAvaCorePrompt` variable-injection pattern from the canonical file.
- Add a `// SYNC-LOCK` comment pointing to the canonical file.

**Files to modify:**
- `dashboard/functions/src/sync-clinic-to-ava.ts` — replace lines 80-136 (`buildSystemPrompt`)

**Verification:** After deploy, trigger `syncClinicToAva` for Spires. Check ElevenLabs agent system prompt contains `[1 — IDENTITY]` with the full Friday/Iron Man brief and `[3 — VOICE]` with Richmond/Kensington line.

**Testing:** Cloud Functions don't have a unit test in this repo. Verification is done via the Stage 7 callable trigger check.

---

### S1-T2: Fix `computeFreeSlots` to respect `ava.hours`

**Problem:** Hardcoded Mon-Fri 09:00-18:00 in `api/ava/tools/route.ts:423-424`. Clinic `ava.hours` is already loaded from Firestore in both `handleCheckAvailability` and `handleBookAppointment` — it's just not passed through.

**Architecture decisions:**
- `computeFreeSlots` signature: add optional `hoursConfig?: { start?: string; end?: string; days?: string[] }` param
- Parse `start`/`end` as "HH:MM" strings to hours/minutes
- Filter by `days` array (["mon", "tue", ...]) instead of weekday numbers
- Defaults preserve current behaviour (`09:00`-`18:00`, Mon-Fri) when param absent

**Files to modify:**
- `dashboard/src/app/api/ava/tools/route.ts`

**New test file:**
- `dashboard/src/lib/ava/__tests__/compute-free-slots.test.ts`
- Test cases: default hours, Tue-Thu clinic (assert no Mon/Fri slots), afternoon-only clinic, weekend clinic

---

### S1-T3: Unify ElevenLabs KB delete path

**Problem:** `elevenlabs-agent.ts::deleteKnowledgeBaseDoc` uses the global endpoint (`/convai/knowledge-base/{docId}`). Agent-scoped uploads return agent-local IDs; the global endpoint uses different IDs. Stale KB docs are not cleaned up.

**Architecture decisions:**
- Update `deleteKnowledgeBaseDoc(apiKey, docId)` → `deleteKnowledgeBaseDoc(apiKey, agentId, docId)`
- Use endpoint: `DELETE /v1/convai/agents/{agentId}/knowledge-base/{docId}`
- The only current caller of this function is in `elevenlabs-agent.ts` itself; `api/ava/knowledge/route.ts` does its own inline delete (already agent-scoped). The helper is used for the standalone tool interface.

**Files to modify:**
- `dashboard/src/lib/ava/elevenlabs-agent.ts`

---

## Sprint 2 — Physio-native intake + no-integration tier

**Commercial outcome:** Every Ava booking captures MSK-specific intake data that Heidi doesn't collect. Clinics without PMS write-back get structured contact capture instead of a dead end.

---

### S2-T1: Physio-native intake fields

**Problem:** `book_appointment` tool schema captures only logistics (name, phone, date, clinician). No body region, red-flag screen, or insurance type. This is the core product differentiator vs Heidi's generic healthcare intake.

**Architecture decisions:**
- Extend `book_appointment` tool schema in `createAvaTools` with three new optional fields:
  - `body_region: string` — enum list in description to guide ElevenLabs
  - `is_red_flag_screened: boolean` — Ava must ask one red-flag question before booking
  - `insurance_type: string` — enum: `self_pay`, `insurance`, `unknown`
- Write to `appointments` Firestore document: `bodyRegion`, `isRedFlagScreened`, `insuranceType`
- These fields are entirely new — no existing Intelligence or Pulse code reads them yet. They are additive, no schema break.
- Do NOT add red-flag routing logic (no 999-routing based on this field). That belongs in LangGraph graph nodes. This sprint records only.

**Files to modify:**
- `dashboard/src/lib/ava/elevenlabs-agent.ts` (tool schema in `createAvaTools`)
- `dashboard/src/app/api/ava/tools/route.ts` (extract and write in `handleBookAppointment`)

**Existing agents:** Updating `createAvaTools` generates new tool schemas for new agents. Existing agents provisioned before this change need their tools rotated via `/api/ava/rotate-tools` (already exists). Note this in the changelog.

---

### S2-T2: No-integration entry tier

**Problem:** When `pmsConfig.apiKey` is blank, all tool calls return a generic "have someone call you back." No data captured, no admin notified.

**Architecture decisions:**
- New file: `dashboard/src/lib/ava/no-pms-handler.ts`
  - `handleNoPmsToolCall(clinicId, toolName, toolInput, conversationId, callerPhone)` → `Promise<string>`
  - Writes to `clinics/{id}/contact_requests/{conversationId}` (merge)
  - Calls Resend via `src/lib/resend.ts` to email `clinicData.email` with structured summary
  - Returns a speakable response string
- The tools route calls `handleNoPmsToolCall` when `!pmsConfig?.apiKey?.trim()`
- `contact_requests` Firestore path: subcollection of `clinics`, no new top-level collection
- Firestore rules: `allow read, write: if isClinicMember()` (same pattern as `call_log`)
- New index: `contact_requests` by `createdAt desc` (for admin list view)

**Email template fields:**
- Caller phone, name (if captured), reason, body region, preferred time, insurance type, call date/time, link to dashboard

**Files to create:**
- `dashboard/src/lib/ava/no-pms-handler.ts`
- `dashboard/src/lib/ava/__tests__/no-pms-handler.test.ts`

**Files to modify:**
- `dashboard/src/app/api/ava/tools/route.ts`
- `dashboard/firestore.rules`
- `dashboard/firestore.indexes.json`

---

## Sprint 3 — Call summary email digests

**Commercial outcome:** Clinic admins get passive visibility into Ava's daily activity. Reduces churn by keeping Ava visible without requiring login.

---

### S3-T1: `/api/ava/digest` route

**New file:** `dashboard/src/app/api/ava/digest/route.ts`

- Auth: `requireRole(user, ['owner', 'admin', 'superadmin'])`
- Query param: `?since=ISO` (default: 24h ago)
- Reads `clinics/{id}/call_log` ordered by `startTimestamp desc`, limit 100
- Aggregates by outcome: booked / follow_up_required / escalated / resolved / voicemail
- Calls `sendAvaDigestEmail` (new function in `src/lib/intelligence/emails/ava-digest.ts`)
- Returns `{ sent: boolean, summary: { booked, callbacks, escalated, info, voicemail, total } }`

---

### S3-T2: Digest email template

**New file:** `dashboard/src/lib/intelligence/emails/ava-digest.ts`

Follows the existing pattern in `src/lib/intelligence/emails/` (layout.ts provides the shell).

**Email sections:**
1. Header: clinic name + date range
2. Summary row: Booked N | Callbacks N | Escalated N | Info-only N | Voicemail N
3. Call table: Time | Outcome | Caller | Duration (up to 20 rows, most recent first)
4. CTA: "View all in Ava dashboard" link to `portal.strydeos.com/receptionist`
5. Footer: standard layout from `layout.ts`

**Caller phone display:** last 4 digits only for privacy in email (full phone is in the dashboard).
