# Stage 7 — Cross-module Verification + Changelog

## Test results

```
Test Files  64 passed + 2 pre-existing failures (resend.test.ts, twilio.test.ts)
Tests       778 passed + 6 pre-existing failures
New tests   14 passed (compute-free-slots: 8, no-pms-handler: 6)
```

Pre-existing failures in `resend.test.ts` and `twilio.test.ts` are unrelated to this sprint — confirmed by running the full suite before and after.

---

## Files changed

### Created
| File | Purpose |
|------|---------|
| `src/lib/ava/compute-free-slots.ts` | Extracted + extended free-slot computation module |
| `src/lib/ava/__tests__/compute-free-slots.test.ts` | 8 unit tests |
| `src/lib/ava/no-pms-handler.ts` | No-PMS call capture + admin email notification |
| `src/lib/ava/__tests__/no-pms-handler.test.ts` | 6 unit tests |
| `src/lib/intelligence/emails/ava-digest.ts` | Ava daily digest email template |
| `src/app/api/ava/digest/route.ts` | On-demand digest API route |
| `docs/ava-hardening/00-system-map.md` | Cross-module architecture map |
| `docs/ava-hardening/01-audit.md` | Code audit — 3 blockers, 2 smells, 1 nit |
| `docs/ava-hardening/02-feature-plan.md` | 3-sprint feature plan |
| `docs/ava-hardening/03-ensemble-decisions.md` | Approach decision records |
| `docs/ava-hardening/04-sparc/{6 files}` | Per-feature SPARC verification docs |
| `docs/ava-hardening/05-review.md` | Code review checklist |
| `docs/ava-hardening/06-changelog.md` | This file |

### Modified
| File | Change |
|------|--------|
| `functions/src/sync-clinic-to-ava.ts` | S1-T1: Replace `buildSystemPrompt` with canonical `AVA_CORE_PROMPT_TEMPLATE` + `buildAvaCorePrompt` |
| `src/lib/ava/elevenlabs-agent.ts` | S1-T3: Fix `deleteKnowledgeBaseDoc` to use agent-scoped endpoint; S2-T1: Add intake fields to `book_appointment` tool schema |
| `src/app/api/ava/tools/route.ts` | S1-T2: Import `computeFreeSlots` from new module, pass `hoursConfig`; S2-T1: Write intake fields to appointments; S2-T2: Route no-PMS calls through `handleNoPmsToolCall` |
| `firestore.rules` | S2-T2: Add `contact_requests` subcollection rule |
| `firestore.indexes.json` | S2-T2: Add `contact_requests` createdAt desc index |

---

## Sprint 1 — Prompt integrity + booking accuracy

### S1-T1: Cloud Function prompt sync
**Impact:** Every future `onClinicWrite` trigger now writes the canonical Friday/Iron Man brief to ElevenLabs agents — not the stripped-down version that was missing register adaptation, cultural variance handling, and the detailed `[3 — VOICE]` guidance.

**Verification:** Trigger `syncClinicToAva` for Spires. Confirm ElevenLabs agent system prompt contains `[1 — IDENTITY]` with "Think Friday from Iron Man: capable, warm, quick, funny".

### S1-T2: Clinic hours in slot computation
**Impact:** Ava now only offers slots within `ava.hours` (start, end, days). A Tue–Thu 10:00–16:30 clinic will no longer offer Mon/Fri slots or 09:00/17:00 times that don't exist in the diary.

**Verification:** Set a test clinic's `ava.hours` to `{ start: "10:00", end: "16:30", days: ["tue", "wed", "thu"] }`. Call `check_availability` — confirm no Mon/Fri slots returned.

### S1-T3: KB delete path
**Impact:** `deleteKnowledgeBaseDoc` now uses the agent-scoped endpoint consistently. Stale KB docs will be correctly cleaned on re-sync when this helper is called in a future agent-deletion flow.

**Verification:** TypeScript compiles. No active callers affected.

---

## Sprint 2 — Physio-native intake + no-integration tier

### S2-T1: Intake fields
**Impact:** ElevenLabs agents now ask callers for `body_region`, confirm `is_red_flag_screened`, and record `insurance_type` during `book_appointment`. All three fields are written to the Firestore `appointments` doc and available for future Intelligence/Pulse consumption.

**Action required:** Existing agents provisioned before this change need tool rotation:
```
POST /api/ava/rotate-tools
{ "clinicId": "<id>" }
```

### S2-T2: No-integration entry tier
**Impact:** Callers reaching Ava when PMS is not configured now get structured data capture instead of a dead end. `contact_requests` subcollection receives caller phone, name, reason, body region, preferred time, and insurance type. Clinic admin receives a Resend email immediately.

**Verification:** Configure a test clinic with no PMS API key. Place a call, trigger a `book_appointment` tool call. Confirm `contact_requests` doc written and email sent.

---

## Sprint 3 — Call summary email digest

### S3-T1/T2: Digest route + template
**Impact:** Clinic owners and admins can now trigger a call summary email digest via `GET /api/ava/digest`. The email shows outcome chips (Booked / Callbacks / Escalated / Info / Voicemail), a call table with masked caller phones, and a CTA to the Ava dashboard.

**Verification:** Authenticate as owner, hit `GET /api/ava/digest`. Confirm email arrives with correct summary counts.

**Deferred:** Vercel cron for daily 18:30 digest — add `vercel.json` cron entry when ready. Route is live and accepts `?since=ISO` param for any window.

---

## Out-of-scope log (`_followups.md`)

Items identified during hardening that are deferred to future sessions:

- **Vercel cron digest trigger** — add `vercel.json` cron job at 18:30 Mon–Fri calling `/api/ava/digest`
- **Intelligence module hardening** — separate session
- **Pulse module hardening** — separate session
- **TM3 / PPS integration hooks** on `no-pms-handler` (SMS / webhook channels)
- **Mid-call dual-channel SMS** — requires ElevenLabs custom tool + Twilio reply webhook
- **Red-flag routing logic** — LangGraph graph node based on `isRedFlagScreened` field (recorded but not acted on in this sprint)
- **`contact_requests` admin list view** — UI component for Ava dashboard showing no-PMS contact capture
- **Stage 7 smoke test** — live telephony test (07424829343): TwiML → ElevenLabs → tool call → call_log write → InsightEvent write. Requires production deploy.
