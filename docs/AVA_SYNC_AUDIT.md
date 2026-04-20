# AVA_SYNC_AUDIT.md

Phase 1 audit — read-only. No code changes. Covers every question in the brief.

Files examined: `receptionist/page.tsx`, `useAvaConfig.ts`, `useAvaKnowledge.ts`, `useCallLogs.ts`, `KnowledgeBaseEditor.tsx`, `api/ava/agent/route.ts`, `api/ava/knowledge/route.ts`, `ava-core-prompt.ts`, `lib/firebase/voiceInteractions.ts`.

---

## 1. Tab-by-tab data source map

The Ava page (`dashboard/src/app/receptionist/page.tsx`) has two views toggled by `activeView` state: **Dashboard** and **Config**. The Knowledge Base section lives inside the Config view as a rendered component.

---

### Dashboard view

All call data flows through `useCallLogs` → `subscribeTodaysElevenLabsCalls` → **`onSnapshot`** (real-time).
Source collection: `clinics/{clinicId}/call_log` (ElevenLabs format).
Falls back to hardcoded `DEMO_CALLS` array when `isDemo === true` or Firebase is not configured.

| Field | Source | Mechanism |
|---|---|---|
| Total Calls | `todaysCalls.length` | Derived from `onSnapshot` calls array |
| Booked | `calls.filter(outcome === "booked").length` | Derived from `onSnapshot` |
| Missed / VM | `calls.filter(outcome === "voicemail" \|\| inVoicemail).length` | Derived from `onSnapshot` |
| Info Only / Handled | `calls.filter(outcome === "resolved").length` | Derived from `onSnapshot` |
| Avg Duration | Sum of `durationSeconds` / count | Derived from `onSnapshot` |
| Revenue Captured | `booked * avgAppointmentValue` | `onSnapshot` count x `user.clinicProfile.sessionPricePence` (React context via `useAuth`) |
| 7-day volume chart | `buildVolumeBuckets(calls)` | Derived from `onSnapshot` array |
| Call filter tabs (All / Needs Callback / Escalated) | Client-side filter on `todaysCalls` | Derived from `onSnapshot` |
| Today's calls table | `filteredCalls` — `todaysCalls` filtered by `callFilter` state | Derived from `onSnapshot` |
| Active call banner | `calls.find(callStatus === "ongoing")` | Derived from `onSnapshot` |

---

### Config view

Config data flows through `useAvaConfig` → **`getDoc`** (one-shot, on mount only).
Source: `clinics/{clinicId}` document, `ava.*` and top-level fields.

| Field | Firestore path read | Mechanism |
|---|---|---|
| Master On/Off toggle | `clinicDoc.ava.enabled` | `getDoc` on mount |
| Phone number | `clinicDoc.phone` → fallback `clinicDoc.ava.config.phone` | `getDoc` on mount |
| Initial Assessment Price | `clinicDoc.sessionPricePence / 100` → fallback `clinicDoc.ava.config.ia_price` | `getDoc` on mount |
| Follow-up Price | `clinicDoc.ava.config.fu_price` | `getDoc` on mount |
| Address | `clinicDoc.address` → fallback `clinicDoc.ava.config.address` | `getDoc` on mount |
| Nearest Station | `clinicDoc.ava.config.nearest_station` | `getDoc` on mount |
| Parking Info | `clinicDoc.parkingInfo` → fallback `clinicDoc.ava.config.parking_info` | `getDoc` on mount |
| New Patient Booking toggle | `clinicDoc.ava.rules.new_patient_booking` | `getDoc` on mount |
| Cancellation Recovery toggle | `clinicDoc.ava.rules.cancellation_recovery` | `getDoc` on mount |
| No-show Follow-up toggle | `clinicDoc.ava.rules.noshow_followup` | `getDoc` on mount |
| Emergency Routing toggle (locked) | `clinicDoc.ava.rules.emergency_routing` | `getDoc` on mount |
| FAQ Handling toggle | `clinicDoc.ava.rules.faq_handling` | `getDoc` on mount |
| Operating Hours (start, end, days) | `clinicDoc.ava.hours.*` | `getDoc` on mount |
| After-hours mode | `clinicDoc.ava.hours.after_hours_mode` | `getDoc` on mount |
| Fallback number | `clinicDoc.ava.hours.fallback_number` | `getDoc` on mount |

**Defaults that shadow missing live data** (hardcoded in `useAvaConfig.ts:36-66`):
- `ia_price` defaults to `"85"` (`DEFAULT_CONFIG`)
- `fu_price` defaults to `"65"` (`DEFAULT_CONFIG`)
- Hours default to Mon-Fri 09:00-18:00, voicemail after-hours

---

### Knowledge Base (KnowledgeBaseEditor component)

Data flows through `useAvaKnowledge` → **`getDoc`** (one-shot, on mount only).
Source: `clinics/{clinicId}.ava.knowledge` and `clinics/{clinicId}.ava.knowledgeLastSyncedAt`.

| Field | Firestore path | Mechanism |
|---|---|---|
| Knowledge entries (all categories) | `clinicDoc.ava.knowledge[]` | `getDoc` on mount |
| Last synced timestamp | `clinicDoc.ava.knowledgeLastSyncedAt` | `getDoc` on mount; updated in local state after sync — not re-read from Firestore |
| Location auto-entries (address, station, parking) | Derived from `useAvaConfig` config state | Derived from same `getDoc` |

---

## 2. What the Sync button does — full trace

**Button location:** `KnowledgeBaseEditor.tsx` footer, rendered inside the Config view.

**Handler (`KnowledgeBaseEditor.tsx:31-37`):**
```typescript
const handleSync = async () => {
  const result = await syncToAgent();
  if (result.success) {
    setSyncSuccess(true);
    setTimeout(() => setSyncSuccess(false), 3000);
  }
};
```

**`syncToAgent` (`useAvaKnowledge.ts:158-203`):**
1. Flushes any pending debounced saves to Firestore (`updateDoc` on `clinics/{clinicId}.ava.knowledge`)
2. Gets a Firebase ID token from `auth.currentUser.getIdToken()`
3. POSTs to `/api/ava/knowledge` with `Authorization: Bearer {token}`
4. `await`s the full response
5. On success: sets `lastSyncedAt` from `data.syncedAt` in local state; sets `hasPendingChanges = false`
6. On failure: sets `error` string in local state; returns `{ success: false, error }`

**`/api/ava/knowledge` route (`dashboard/src/app/api/ava/knowledge/route.ts`):**

Reads from Firestore (Admin SDK): `clinics/{clinicId}` full document.

**Primary path (ElevenLabs Knowledge Base API):**
- DELETE existing KB docs listed in `ava.elevenLabsKbDocIds[]` via ElevenLabs API
- POST each compiled knowledge chunk to `convai/agents/{agentId}/add-to-knowledge-base`
- On success, writes to Firestore (`updateDoc`):
  - `ava.elevenLabsKbDocIds: string[]` — new KB doc IDs
  - `ava.knowledgeLastSyncedAt: ISO string`
  - `updatedAt: ISO string`

**Fallback path (triggered if KB API throws):**
- Calls `buildAvaCorePrompt()` with `clinic_name`, `clinic_email`, `clinic_phone`
- Appends compiled knowledge doc to core prompt text
- PATCH `convai/agents/{agentId}` with `{ system_prompt: fullPrompt }`
- On success, writes to Firestore (`updateDoc`):
  - `ava.knowledgeLastSyncedAt: ISO string`
  - `updatedAt: ISO string`
  - Does **not** write `elevenLabsKbDocIds`

**Returns to caller:** `{ message, syncMethod, syncedAt, entriesCount }` on success; HTTP error on failure.

**UI feedback:**
- Button label "Syncing..." + spinner while `syncing === true`; button disabled
- Success: green "Knowledge synced — Ava is updated" badge for 3 seconds + green flash overlay on footer
- Error: red `AlertCircle` banner above the category cards
- The "Last synced Xm ago" label in the footer derives from **local state** (`lastSyncedAt`), not a re-read from Firestore

**Agent route (`/api/ava/agent`) — separate action:**
Called automatically when config fields are edited (via `handleConfigChange` debounce → `createOrUpdateAgent()`) and when rules are toggled (`toggleRule`). Writes `ava.agent_id`, `ava.toolIds`, `ava.provider`. Does **not** write any `lastSyncedAt`.

---

## 3. `onSnapshot` vs one-shot fetches

| Hook / File | Mechanism | Cleanup |
|---|---|---|
| `useCallLogs` → `subscribeTodaysElevenLabsCalls` (`voiceInteractions.ts:186`) | **`onSnapshot`** — real-time | Unsubscribed on unmount via `return () => unsub()` |
| `useAvaConfig` (`useAvaConfig.ts:85`) | **`getDoc`** — one-shot | n/a — fires once at mount |
| `useAvaKnowledge` (`useAvaKnowledge.ts:40`) | **`getDoc`** — one-shot | n/a — fires once at mount |

**Conclusion:** Only call log data is live. All Ava configuration and knowledge base data is fetched once at mount. If Firestore is updated externally (Firestore console, another session, server-side write), the Config view will not reflect it until the page is reloaded.

---

## 4. Does a successful sync write `lastSyncedAt` / `syncStatus` back to Firestore?

**Partial — `lastSyncedAt` only. No `syncStatus`, no error field, no diff, no log.**

| Field | Written on sync? | Firestore path | Value |
|---|---|---|---|
| `ava.knowledgeLastSyncedAt` | Yes — both KB and fallback paths | `clinics/{clinicId}` | ISO timestamp string |
| `ava.elevenLabsKbDocIds` | Yes — KB path only | `clinics/{clinicId}` | `string[]` |
| `updatedAt` | Yes — both paths | `clinics/{clinicId}` | ISO timestamp string |
| `ava.syncStatus` | **No** | — | Not implemented |
| `ava.lastError` | **No** | — | Not implemented |
| `ava.lastSyncDiff` | **No** | — | Not implemented |
| Sync log / history | **No** | — | Not implemented |

The only durable signal that a sync succeeded is `ava.knowledgeLastSyncedAt`. If the sync fails, nothing is written to Firestore — the previous `knowledgeLastSyncedAt` remains, so a failed sync is indistinguishable from no sync having been attempted.

---

## 5. System prompt — templated or static regeneration?

**Templated, with three runtime variables. Knowledge content is separate.**

**Template:** `AVA_CORE_PROMPT_TEMPLATE` in `dashboard/src/lib/ava/ava-core-prompt.ts:32-48` — a static behavioural-only string covering identity, provenance, voice, safety, and self-awareness. The template text never changes between syncs.

**Variables injected at sync time via `buildAvaCorePrompt(vars)` (`ava-core-prompt.ts:22-27`):**
- `{{clinic_name}}` → `clinicData.name`
- `{{clinic_email}}` → `clinicData.email`
- `{{clinic_phone}}` → `clinicData.receptionPhone || avaConfig.config.phone`

**What is NOT in the template:**
Services, pricing, clinician names/schedules, location, FAQs, policies. These live in `ava.knowledge[]` and are either uploaded to the ElevenLabs Knowledge Base (primary path) or compiled and appended to the system prompt as a `CLINIC KNOWLEDGE BASE` block (fallback path).

**Rebuild pattern:** `buildAvaCorePrompt()` is called fresh on every `/api/ava/agent` call and on every `/api/ava/knowledge` fallback. The template itself lives in source code only — it is not persisted to Firestore.

**Gap relative to Phase 2 spec:** Current template has three slots (`clinic_name`, `clinic_email`, `clinic_phone`). Phase 2 requires five additional: `{{hours}}`, `{{clinicians}}`, `{{pricing_table}}`, `{{services}}`, `{{pms_name}}`.

---

## Gaps — input to Phase 2

| # | Gap | Impact |
|---|---|---|
| 1 | No `onSnapshot` on `useAvaConfig` or `useAvaKnowledge` | Config view goes stale if Firestore is updated externally. Editing pricing in Firestore console has no effect until page reload. |
| 2 | `syncStatus` / `lastError` not written to Firestore | Silent failures — a failed sync leaves `knowledgeLastSyncedAt` pointing to the last success with no error record. |
| 3 | No diff tracking | "Unsaved changes" indicator is client-side `hasPendingChanges` state only — resets on reload. No record of what changed since last sync. |
| 4 | No sync log | No history of past attempts, results, or sync methods. |
| 5 | Agent sync and knowledge sync are separate, uncoordinated | Config/rule changes trigger `/api/ava/agent`; knowledge changes trigger `/api/ava/knowledge`. Different `lastSyncedAt` semantics. No unified "in sync" signal. |
| 6 | Three prompt variables vs five required by Phase 2 | Template missing `hours`, `clinicians`, `pricing_table`, `services`, `pms_name`. |
| 7 | No Cloud Function or Firestore trigger | Sync is entirely client-initiated via Next.js API routes. No auto-sync on document writes. |
