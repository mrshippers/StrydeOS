# Stage 6 — Code Review Checklist

Reviewed against the implementation in this session.

---

## Sprint 1 — Prompt integrity + booking accuracy

### S1-T1: Prompt sync

- [x] `AVA_CORE_PROMPT_TEMPLATE` in Cloud Function (`functions/src/sync-clinic-to-ava.ts`) verbatim matches `src/lib/ava/ava-core-prompt.ts::AVA_CORE_PROMPT_TEMPLATE`
- [x] SYNC-LOCK comment present, cites canonical file path
- [x] `buildAvaCorePrompt` variable injection logic mirrors canonical `buildAvaCorePrompt`
- [x] All 8 variables injected: `clinic_name`, `clinic_email`, `clinic_phone`, `hours`, `services_block`, `clinicians_block`, `pricing_block`, `pms_name`
- [x] `isOnlySyncStateWrite` guard unchanged — infinite trigger loop prevention intact
- [x] No new imports added to functions package (self-contained)

### S1-T2: computeFreeSlots hours

- [x] `computeFreeSlots` extracted to `src/lib/ava/compute-free-slots.ts` (exported)
- [x] `HoursConfig` interface exported for downstream use
- [x] Old `computeFreeSlots` function removed from `tools/route.ts`
- [x] Import added to `tools/route.ts`
- [x] `handleCheckAvailability` receives `hoursConfig?` 4th parameter
- [x] Main handler extracts `clinicData.ava.hours` and passes as `hoursConfig`
- [x] `hoursConfig` absent → defaults to Mon–Fri 09:00–18:00 (backward compat confirmed by unit test)
- [x] Unit tests: 8 cases passing — default hours, Tue–Thu, afternoon-only, weekend, busy slot, defaults match explicit config

### S1-T3: KB delete path

- [x] `deleteKnowledgeBaseDoc` signature updated: `(apiKey, agentId, docId)`
- [x] Uses agent-scoped endpoint: `DELETE /v1/convai/agents/{agentId}/knowledge-base/{docId}`
- [x] No active callers affected (`api/ava/knowledge/route.ts` uses inline delete independently)
- [x] `deleteKnowledgeBaseDoc` still exported as public API for future agent-deletion flow

---

## Sprint 2 — Physio-native intake + no-integration tier

### S2-T1: Intake fields

- [x] `createAvaTools` in `elevenlabs-agent.ts`: `book_appointment` schema includes `body_region`, `is_red_flag_screened`, `insurance_type`
- [x] All three fields are optional in schema (no required array changes)
- [x] `handleBookAppointment` extracts `bodyRegion`, `isRedFlagScreened`, `insuranceType` from tool input
- [x] Three fields written to Firestore `appointments` doc (additive, null when absent)
- [x] `InsightEvent` schema unchanged
- [x] Intelligence pipeline queries unaffected (no filter on these fields)
- [x] Changelog note needed: existing agents require tool rotation via `/api/ava/rotate-tools`

### S2-T2: No-integration tier

- [x] `no-pms-handler.ts` created in `src/lib/ava/`
- [x] Writes to `clinics/{id}/contact_requests/{conversationId}` via Admin SDK
- [x] Resend email send is fire-and-forget (swallows errors — does not fail the voice call)
- [x] No-PMS path in `tools/route.ts` calls `handleNoPmsToolCall` instead of returning static string
- [x] Clinic email passed from clinic doc (`clinicData.email`)
- [x] `firestore.rules`: `contact_requests` subcollection added — `read` for `isClinicOwnerOrAdmin`, `write: false`
- [x] `firestore.indexes.json`: `contact_requests` createdAt desc index added
- [x] Caller phone privacy: full phone stored in Firestore doc (admin-only collection), no masking needed
- [x] Unit tests: 6 cases passing — doc write, email send, email skip, speakable string, first name in response, empty conversationId

---

## Sprint 3 — Call summary email digest

- [x] `GET /api/ava/digest` route created in `src/app/api/ava/digest/`
- [x] Auth: `requireRole(user, ["owner", "admin", "superadmin"])` via `verifyApiRequest`
- [x] Clinic isolation: reads only `clinics/{user.clinicId}/call_log`
- [x] `?since=ISO` param supported; defaults to 24h ago
- [x] Aggregates: booked / follow_up_required / escalated / info / voicemail — correct field names match call_log
- [x] `ava-digest.ts` email template created in `src/lib/intelligence/emails/`
- [x] Uses `wrapEmailLayout` from `layout.ts` — consistent brand shell
- [x] Caller phone truncated to last 4 digits in email body (privacy)
- [x] Full phone retained in Firestore call_log (admin-accessible dashboard)
- [x] CTA links to `portal.strydeos.com/receptionist`
- [x] HTML + plaintext both generated

---

## Cross-module isolation

- [x] No Intelligence source files modified
- [x] No Pulse source files modified
- [x] `InsightEvent` schema in `src/types/insight-events.ts` unchanged
- [x] No writes to `metrics_weekly`, `clinicians`, or `insight_events` from new code
- [x] Twilio HMAC signature check in `inbound-call/route.ts` untouched
- [x] ElevenLabs webhook HMAC check untouched
- [x] `clinicId` partitioning maintained in all new Firestore writes

---

## Security

- [x] No secrets hardcoded
- [x] No API keys in source files
- [x] Resend email from address is a system address (not clinic-specific)
- [x] Digest route gated at owner/admin/superadmin
- [x] `contact_requests` collection write is server-only (`allow write: if false` in rules)
- [x] `call_log` reads in digest route scoped to authenticated user's `clinicId`

---

## Known gaps (deferred)

- Existing ElevenLabs agents need tool rotation via `/api/ava/rotate-tools` to pick up `book_appointment` schema changes (intake fields)
- Vercel cron for daily digest deferred (route is live and callable manually or from UI)
- `resend.test.ts` and `twilio.test.ts` have 6 pre-existing failures unrelated to this sprint
