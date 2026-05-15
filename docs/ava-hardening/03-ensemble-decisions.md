# Stage 3 — Ensemble Decisions

Per-feature decision records. Each shows the rejected alternative and rationale for the chosen approach.

---

## S1-T1: Fix prompt divergence

### Option A (chosen): Copy-paste with SYNC-LOCK comment
Copy `AVA_CORE_PROMPT_TEMPLATE` + `buildAvaCorePrompt` verbatim into `sync-clinic-to-ava.ts`. Add a block comment:
```
// SYNC-LOCK: This template must stay in sync with
// dashboard/src/lib/ava/ava-core-prompt.ts::AVA_CORE_PROMPT_TEMPLATE
// Update both files together.
```

**Score:** Complexity: low. Time-to-ship: immediate. Architectural cleanliness: acceptable. Module-boundary safety: ✅ no new dependencies. Scalability: adequate for current 2-file scope.

### Option B (rejected): Extract to shared npm package
Create a `packages/ava-prompt/` workspace package, import in both the Next.js app and the functions package.

**Rejected because:** Requires adding a monorepo tool (Turborepo / pnpm workspaces), updating `tsconfig.json` for path resolution in both projects, CI pipeline changes, and build-order coordination on deploy. ~4h of scaffolding to solve a 200-line sync problem. The SYNC-LOCK comment + PR convention is sufficient until there's a third consumer.

### Option C (rejected): Cloud Function calls internal API route
Cloud Function calls `POST /api/ava/knowledge` on the Next.js server instead of calling ElevenLabs directly.

**Rejected because:** Creates a runtime dependency between the Cloud Function and Vercel deployment availability. If the Next.js server is cold-starting or experiencing an issue, the Firestore trigger silently fails. Worse reliability than the current direct-API approach.

---

## S1-T2: Fix `computeFreeSlots` clinic hours

### Option A (chosen): Optional `hoursConfig` param with defaults
Extend the function signature: `computeFreeSlots(appointments, dateFrom, dateTo, hoursConfig?)`. Parse "HH:MM" strings to integer hours/minutes. Map day name strings to weekday numbers.

**Score:** Complexity: low. Time-to-ship: fast. Architectural cleanliness: good — function stays pure. Module-boundary safety: ✅. Scalability: handles any hours config including overnight (though unlikely for physio).

### Option B (rejected): Read hours from Firestore inside `computeFreeSlots`
Pass `clinicId` and read `ava.hours` from Firestore inside the function.

**Rejected because:** Makes a pure compute function impure (network-dependent). Breaks testability — tests would need to mock Firestore. The clinic doc is already fetched by the caller; passing the hours downstream is the correct dependency direction.

---

## S1-T3: Unify ElevenLabs KB delete path

### Option A (chosen): Add `agentId` parameter to `deleteKnowledgeBaseDoc`
`deleteKnowledgeBaseDoc(apiKey, agentId, docId)` — uses agent-scoped endpoint.

**Score:** Complexity: trivial. Time-to-ship: immediate. Architectural cleanliness: good — caller now has explicit control over which agent's KB is cleaned. Module-boundary safety: ✅.

### Option B (rejected): Remove `deleteKnowledgeBaseDoc` entirely
`api/ava/knowledge/route.ts` already does its own inline delete (agent-scoped). The helper function in `elevenlabs-agent.ts` appears unused there.

**Rejected because:** The helper function exists as a public API of `elevenlabs-agent.ts` for use by future callers (e.g., an agent-deletion flow). Removing it is premature. Fixing it is the right call.

---

## S2-T1: Physio-native intake fields

### Option A (chosen): Optional tool schema fields + write to appointments doc
Add three optional fields to `book_appointment` tool. Write them to the `appointments` Firestore doc under top-level keys (`bodyRegion`, `isRedFlagScreened`, `insuranceType`).

**Score:** Complexity: low. Time-to-ship: fast. Architectural cleanliness: clean — additive only. Module-boundary safety: ✅ Intelligence and Pulse don't read these fields yet. Scalability: fields are available for Intelligence to surface when outcome-measures layer is built.

### Option B (rejected): Add intake as a separate `intake_assessments` collection
Write a separate Firestore document for the intake data, linked by `appointmentId`.

**Rejected because:** Over-engineered for three fields. Joining across collections on every appointment read adds query complexity. Top-level fields on the appointment document are the correct initial design — they can be migrated to a subcollection if intake grows to 20+ fields.

---

## S2-T2: No-integration entry tier

### Option A (chosen): New `no-pms-handler.ts` module
Isolate the no-PMS logic into a dedicated file. Tools route calls it when `pmsConfig.apiKey` is blank.

**Score:** Complexity: low. Time-to-ship: fast. Architectural cleanliness: good — tools route stays focused on PMS dispatch. Module-boundary safety: ✅. Scalability: easy to add SMS channel, webhook, or n8n trigger from one place.

### Option B (rejected): Inline in tools route
Add the no-PMS block directly in the existing `POST` handler.

**Rejected because:** `api/ava/tools/route.ts` is already 500+ lines. Inlining adds another ~80 lines to a file that is approaching the 500-line limit from CLAUDE.md. Isolation is architecturally correct and makes the no-PMS path testable in isolation.

---

## S3: Call summary email digests

### Option A (chosen): On-demand API route, Vercel cron deferred
`/api/ava/digest` accepts an optional `?since=ISO` param. Clinic admin can trigger manually or it can be called from the dashboard UI. Vercel cron is a follow-up.

**Score:** Complexity: low. Time-to-ship: fast. Architectural cleanliness: good. Module-boundary safety: ✅. Scalability: cron can be layered on top without changing the route.

### Option B (rejected): Cloud Function scheduled trigger (Firebase)
Add a Cloud Scheduler job in the Firebase project that calls a new Cloud Function at 18:30 daily.

**Rejected because:** Requires IAM setup, Cloud Scheduler permissions, and a Firebase Blaze plan usage increase. The Vercel cron approach (single `vercel.json` entry) achieves the same outcome with less infrastructure. The API route also makes the feature testable immediately without waiting for the scheduler window.
