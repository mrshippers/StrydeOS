# AVA_SYNC_AUDIT.md

Phase 1 read-only audit of the Ava module sync architecture.
Files examined: `receptionist/page.tsx`, `useAvaConfig.ts`, `useAvaKnowledge.ts`, `useCallLogs.ts`, `KnowledgeBaseEditor.tsx`, `api/ava/agent/route.ts`, `api/ava/knowledge/route.ts`, `ava-core-prompt.ts`.

---

## 1. Data origins per tab

### Tab: Call Dashboard (`activeView === "dashboard"`)

| Field | Origin | Fetch type |
|---|---|---|
| Total calls, Booked, Missed/VM, Info Only, Avg Duration, Revenue Captured | Derived from `calls` array (via `useCallLogs`) | `onSnapshot` (real-time) |
| `avgAppointmentValue` | `user.clinicProfile.sessionPricePence` from `useAuth` — **hardcoded fallback of `85` (£85)** if absent | One-shot (session cookie decode) |
| 7-day volume chart data | Derived from `calls` (same `onSnapshot` feed) | `onSnapshot` |
| Today's call log table rows | From `calls` array filtered to today | `onSnapshot` |
| After-hours digest content | Computed from `todaysCalls` in-memory (voicemail calls from same feed) | Derived, no extra fetch |

`useCallLogs` subscribes via `subscribeTodaysElevenLabsCalls` which uses Firestore `onSnapshot` on `clinics/{clinicId}/call_log`. Cleanup runs on unmount. Call log tab is fully real-time.

---

### Tab: Configuration (`activeView === "config"`)

#### On/Off switch + phone display

| Field | Origin | Fetch type |
|---|---|---|
| `config.enabled` | `useAvaConfig` → `getDoc("clinics/{clinicId}")` → `data.ava.enabled` | **One-shot `getDoc`** |
| `config.phone` | `data.phone` OR `data.ava.config.phone` (fallback chain) | **One-shot `getDoc`** |

#### Call Handling Rules

| Field | Origin | Fetch type |
|---|---|---|
| `rules.new_patient_booking` | `data.ava.rules.new_patient_booking` with `?? true` default | **One-shot `getDoc`** |
| `rules.cancellation_recovery` | `data.ava.rules.cancellation_recovery` with `?? true` default | **One-shot `getDoc`** |
| `rules.noshow_followup` | `data.ava.rules.noshow_followup` with `?? true` default | **One-shot `getDoc`** |
| `rules.emergency_routing` | `data.ava.rules.emergency_routing` with `?? true` default — **locked in UI** | **One-shot `getDoc`** |
| `rules.faq_handling` | `data.ava.rules.faq_handling` with `?? true` default | **One-shot `getDoc`** |

All rules default to `true` if absent — a Firestore doc with no `ava.rules` subtree will show all rules as enabled.

#### Clinic Details

| Field | Origin | Fetch type |
|---|---|---|
| `config.address` | `data.address` OR `data.ava.config.address` (fallback) | **One-shot `getDoc`** |
| `config.ia_price` | Derived from `data.sessionPricePence / 100` OR `data.ava.config.ia_price` (fallback) with DEFAULT `"85"` | **One-shot `getDoc`** |
| `config.fu_price` | `data.ava.config.fu_price` with DEFAULT `"65"` | **One-shot `getDoc`** |
| `config.nearest_station` | `data.ava.config.nearest_station` with DEFAULT `""` | **One-shot `getDoc`** |
| `config.parking_info` | `data.parkingInfo` OR `data.ava.config.parking_info` (fallback) with DEFAULT `""` | **One-shot `getDoc`** |

Fields are read once on mount. No live updates — edits made directly in Firestore console will not appear in the UI without a page refresh.

There is also a `configDraft` local `useState` in the page component that shadows `config`. The page syncs `configDraft` to `config` via a `useEffect([config])`. This means the local draft can diverge from Firestore if a save fails silently.

#### Knowledge Base (rendered as `<KnowledgeBaseEditor>`)

| Field | Origin | Fetch type |
|---|---|---|
| `entries` (all KB entries) | `useAvaKnowledge` → `getDoc("clinics/{clinicId}")` → `data.ava.knowledge` | **One-shot `getDoc`** |
| `lastSyncedAt` | `data.ava.knowledgeLastSyncedAt` on initial load; updated in local state from API response on sync | **One-shot `getDoc`** on load; `useState` thereafter |
| `hasPendingChanges` | Local `useState` flag — set to `true` on `updateEntry`, reset to `false` after `saveEntries`/`syncToAgent` | Local state only |
| Auto-populated location entries (address, station, parking) | Passed from `KnowledgeBaseEditor` via a second `useAvaConfig(clinicId)` call — **this is a duplicate instantiation** of the hook, meaning two separate `getDoc` fetches fire on mount | **One-shot `getDoc`** (duplicate call) |

---

## 2. What does the "Sync" button do?

**There is only one "Sync" button — in `KnowledgeBaseEditor`, labelled "Sync to Ava".**

There is **no top-level "Sync" button** for clinic config (address, pricing, rules). Those fields sync to ElevenLabs automatically via a debounced handler in `ReceptionistContent`:
- On any `handleConfigChange` call, a 500ms debounce fires `save({ config: newDraft })` then `createOrUpdateAgent()`
- `createOrUpdateAgent()` POSTs to `/api/ava/agent`

### "Sync to Ava" button (Knowledge Base only)

Call chain: `handleSync()` → `useAvaKnowledge.syncToAgent()` → `POST /api/ava/knowledge`

**What `/api/ava/knowledge` writes:**

1. Reads `ava.knowledge` entries from Firestore (admin SDK `get()`)
2. Primary path: uploads each knowledge category as a document to the ElevenLabs KB API (`POST /convai/agents/{agentId}/add-to-knowledge-base`). Deletes old KB doc IDs first.
3. On KB upload success: writes to Firestore:
   - `ava.elevenLabsKbDocIds` (new doc IDs)
   - `ava.knowledgeLastSyncedAt` (ISO string)
   - `updatedAt`
4. Fallback (if ElevenLabs KB API fails): appends compiled knowledge to the system prompt and PATCHes the agent. Writes `ava.knowledgeLastSyncedAt` and `updatedAt` to Firestore.
5. On any unhandled error: returns HTTP error response — `handleApiError` determines status code.

**Does it `await`?** Yes — all Firestore and ElevenLabs calls are fully `await`ed.

**Does it surface success/failure in the UI?**
- Success: `syncToAgent()` returns `{ success: true }` → `setSyncSuccess(true)` → shows "Knowledge synced — Ava is updated" for 3 seconds, then reverts.
- The `lastSyncedAt` local state is updated immediately from `data.syncedAt` in the response — it does NOT re-fetch from Firestore.
- Failure: `syncToAgent()` returns `{ success: false, error: message }` → `setError(message)` in `useAvaKnowledge` → displayed as an inline error banner above the KB cards.

### `/api/ava/agent` (config sync, triggered automatically)

Invoked by: (a) debounced config field change, (b) toggle enabled/disabled, (c) toggle rule.

**What it writes:**
- Reads full clinic doc from Firestore
- Builds system prompt via `buildAvaCorePrompt` (injects `clinic_name`, `clinic_email`, `clinic_phone` only)
- Appends `ava.knowledge` entries to the prompt as inline text
- Creates or updates ElevenLabs agent
- On success: writes `ava.agent_id`, `ava.toolIds`, `ava.provider` to Firestore
- **Does NOT write `lastSyncedAt`, `syncStatus`, or any audit trail**

**Does it surface failure in the UI?**
- On debounced config change: errors are `console.error`'d and set to `agentError` state → shown as `<ErrorBanner>` above the config section
- On rule toggle: errors are `console.error`'d only — **silently swallowed**, no UI feedback

---

## 3. `onSnapshot` vs one-shot fetches

| Hook / source | Fetch type | Has cleanup? |
|---|---|---|
| `useCallLogs` → `subscribeTodaysElevenLabsCalls` | `onSnapshot` | Yes — `return () => unsub()` |
| `useAvaConfig` | `getDoc` (one-shot) | N/A |
| `useAvaKnowledge` | `getDoc` (one-shot) | Debounce timer only |
| `KnowledgeBaseEditor` → second `useAvaConfig(clinicId)` | `getDoc` (one-shot) — **duplicate instantiation** | N/A |

**Summary:** The call log tab is fully real-time. The entire configuration tab — including all clinic details, rules, the on/off toggle, and the knowledge base — is **one-shot only**. If Firestore data changes externally (e.g. Firestore console, another browser tab, a webhook write), the config tab will show stale data until the page is refreshed.

---

## 4. Does any sync write `lastSyncedAt` / `syncStatus` back to Firestore?

| Sync action | Writes to Firestore | What it writes |
|---|---|---|
| Knowledge sync (`/api/ava/knowledge`) | Yes | `ava.knowledgeLastSyncedAt`, `ava.elevenLabsKbDocIds`, `updatedAt` |
| Agent sync (`/api/ava/agent`) | Partial — writes agent identity only | `ava.agent_id`, `ava.toolIds`, `ava.provider`, `updatedAt` |
| Agent sync on error | No write at all | — |

**No `syncStatus` field exists anywhere.** There is no `status: 'synced' | 'error'` field in Firestore for agent sync. Error state lives only in React local state and is lost on refresh.

---

## 5. Is the ElevenLabs system prompt templated or static?

**Templated with 3 variables, regenerated from scratch each sync.**

`buildAvaCorePrompt(vars)` in `ava-core-prompt.ts`:
- Takes `{ clinic_name, clinic_email, clinic_phone }`
- Replaces `{{clinic_name}}`, `{{clinic_email}}`, `{{clinic_phone}}` in `AVA_CORE_PROMPT_TEMPLATE`
- Returns a complete string — the base template is not cached or diffed

The template is a single static export (`AVA_CORE_PROMPT_TEMPLATE`) in the file. It does not include address, pricing, or scheduling variables — those fields are expected to live in the ElevenLabs knowledge base.

Knowledge is appended by `/api/ava/agent` as inline text concatenated to the core prompt: `corePrompt + "\n\n...\n\nCLINIC KNOWLEDGE BASE\n\n" + knowledgeDoc`. This means the system prompt as sent to ElevenLabs **duplicates** what the knowledge sync also uploads to the ElevenLabs KB — creating potential for content drift between the two sources.

---

## Summary of key issues for Phase 2

1. **No `onSnapshot` on config tab** — `useAvaConfig` and `useAvaKnowledge` both use one-shot `getDoc`. External Firestore writes are invisible until page refresh.
2. **Duplicate `useAvaConfig` instantiation** — `KnowledgeBaseEditor` calls `useAvaConfig(clinicId)` and so does `ReceptionistContent`. Two separate `getDoc` calls fire on mount, and their state can diverge.
3. **No `syncStatus` / `lastSyncedAt` for agent sync** — `/api/ava/agent` writes `agent_id` but no audit trail. The user cannot tell when config was last pushed to ElevenLabs.
4. **Rule toggle errors are swallowed** — `toggleRule` calls `createOrUpdateAgent()` but only `console.error`s failures; the UI shows nothing.
5. **`configDraft` local shadow state** — a save failure leaves `configDraft` ahead of both Firestore and `config`, making the displayed value wrong.
6. **Knowledge duplicated in two places** — both inline in the system prompt (via `/api/ava/agent`) and as KB documents (via `/api/ava/knowledge`). These sync independently.
7. **`avgAppointmentValue` hardcoded fallback** — silent `£85` default masks missing `sessionPricePence` data; Revenue Captured stat can be wrong.
