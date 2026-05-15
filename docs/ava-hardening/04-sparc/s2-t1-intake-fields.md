# S2-T1 — Physio-Native Intake Fields SPARC

## Pre-implementation verification

| Check | Result |
|-------|--------|
| Writes to collections Intelligence reads? | YES — `appointments` collection. New fields are additive (optional). No existing query breaks. |
| `InsightEvent` schema touched? | No |
| Fires `onClinicWrite`? | No |
| Adds new Firestore collection? | No |
| Intelligence / Pulse code reads new fields? | Not yet — fields are available for future use |
| Backward compat? | Yes — all three fields are optional in tool schema and written as null when absent |

## Specification
Add `body_region`, `is_red_flag_screened`, `insurance_type` to the `book_appointment` ElevenLabs tool schema and write them to the Firestore appointments doc.

## New tool schema fields
```
body_region (string, optional)
  enum: shoulder | knee | back | neck | hip | ankle | elbow | wrist | other
  description: guides ElevenLabs to ask "which area is bothering you?"

is_red_flag_screened (boolean, optional)
  description: set true only after asking one red-flag screening question

insurance_type (string, optional)
  enum: self_pay | insurance | unknown
  description: how the patient intends to pay
```

## Pseudocode
```
handleBookAppointment:
  // existing field extraction
  bodyRegion      = input.body_region ?? null
  isRedFlagScreened = input.is_red_flag_screened (boolean) ?? null
  insuranceType   = input.insurance_type ?? null
  
  // existing Firestore write — add three fields:
  appointments.doc(id).set({
    ...existing fields,
    bodyRegion,
    isRedFlagScreened,
    insuranceType,
  }, { merge: true })
```

## Architecture
- Two files modified: `elevenlabs-agent.ts` (tool schema), `tools/route.ts` (extraction + write)
- No new imports
- Existing agents need tool rotation via `/api/ava/rotate-tools` to pick up new schema (note in changelog)

## Completion criteria
- `createAvaTools` includes three new optional fields in `book_appointment` schema
- `handleBookAppointment` writes `bodyRegion`, `isRedFlagScreened`, `insuranceType` to appointments doc
- TypeScript compiles, existing tests pass
