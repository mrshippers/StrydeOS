# Pulse Hardening — Changelog

Equivalent of the Ava hardening workflow (`docs/ava-hardening/`), run on the
Pulse module. Stage-1 audit is `docs/PULSE_AUDIT.md` (10 prioritised issues).

**Key finding:** most of the audit's issues were already closed by the SPARC
refactor `b49a3a6 feat(pulse): pending lifecycle + pulseState + event
consumption`. This pass re-verified current state against the audit and closed
the one remaining contained correctness bug. The two larger items are scoped
below as a feature-plan requiring sign-off (they touch the multi-tenant data
model — a CLAUDE.md hard stop).

---

## State reconciliation (audit issue → current code)

| # | Audit issue | Status now | Evidence |
|---|-------------|-----------|----------|
| 1 | Patient detail page demo-only | **Partial** — demo bleed closed (gated to `uid==='demo'`), but no live-data path; real clinics get "Patient not found" | `src/app/patients/[id]/page.tsx:201` |
| 2 | Templates hardcoded in source | **Open (arch)** | `src/types/comms.ts:226` `SMS_TEMPLATES` |
| 3 | No `pulseState` document | **Fixed** | `src/lib/comms/trigger-sequences.ts:64-118,382-391` |
| 4 | Comms lifecycle missing `pending` | **Fixed** | `trigger-sequences.ts:347` writes `outcome:"pending"` |
| 5 | PatientEditModal shadow-state divergence | **Fixed this pass** | see below |
| 6 | Intelligence events not consumed as triggers | **Fixed** | SPARC commit `b49a3a6` (insight-event-consumer) |
| 7 | `useClinicalNotes` one-shot `getDocs` | **Fixed** | `src/hooks/useClinicalNotes.ts:45` now `onSnapshot` |
| 8 | `comms_log` lacks campaign/template FKs | **Open (arch)** — depends on #2/#10 | `comms_log` keyed on `sequenceType` |
| 9 | `useCommsLog` demo-bleed race | **Fixed** | `src/hooks/useCommsLog.ts:42-45` demo set inside `useEffect` |
| 10 | No `campaigns` collection | **Open (arch)** | no `collection('campaigns')` anywhere |

---

## Fixed this pass

### P5: PatientEditModal stale-write guard

**Problem:** the modal copies patient fields into local `useState` at open time.
The `patient` prop stays live (board subscribes via `onSnapshot`), so a PMS sync
or another user's write during an open edit silently staled the editor's
snapshot — and Save would clobber the fresher server data.

**Fix:**
- New pure helper `isPatientStale(openedUpdatedAt, currentUpdatedAt)` comparing
  the `updatedAt` captured at open against the live prop.
- Modal captures the baseline in a `useRef`, computes `stale` each render, shows
  a warning banner with a **Reload latest values** action (re-syncs fields +
  re-baselines), blocks Save while stale, and toasts on attempted stale save.

**Files:**
- created `src/lib/pulse/patient-edit-guard.ts`
- created `src/lib/pulse/__tests__/patient-edit-guard.test.ts` (5 tests)
- modified `src/components/pulse/PatientEditModal.tsx`

**Verification:** `vitest run src/lib/pulse src/components/pulse` → 24 passed
(5 new). eslint clean on changed files.

---

## Remaining — feature-plan (needs sign-off)

### Sprint A — Live patient detail page (audit #1)
`/patients/[id]/page.tsx` is demo-only. The bleed is closed, but real clinics
have no working patient detail. Building it is a feature, not a one-liner:
- single-patient live read scoped to `clinicId` + auth guard (reuse `usePatients`
  or add `subscribePatient`)
- a real activity timeline (currently hardcoded `buildTimeline`) sourced from
  `comms_log` + sessions/HEP/outcome events — needs a product call on which
  event sources populate the timeline for live data.

### Sprint B — Templates + campaigns to Firestore (audit #2, #8, #10) — HARD STOP
Moving `SMS_TEMPLATES`/sequence defaults into `templates/{id}` + `campaigns/{id}`
collections with `approvedBy`/`version` and adding `templateId`/`campaignId` FKs
to `comms_log` is a multi-tenant data-model change requiring a data migration of
existing `sequence_definitions`. Per CLAUDE.md this must be flagged and signed
off before implementation.
