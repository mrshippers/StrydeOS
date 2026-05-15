# S2-T2 — No-Integration Entry Tier SPARC

## Pre-implementation verification

| Check | Result |
|-------|--------|
| Writes to collections Intelligence reads? | No — `contact_requests` subcollection is new, not read by Intelligence |
| `InsightEvent` schema touched? | No |
| Fires `onClinicWrite`? | No |
| Adds new Firestore collection? | YES — `contact_requests` subcollection under `clinics/{id}` |
| Firestore rules needed? | YES — `allow read: if isClinicOwnerOrAdmin(clinicId)` |
| Index needed? | YES — `contact_requests` by `createdAt desc` |

## Specification
When `pmsConfig.apiKey` is blank, instead of returning a static message:
1. Write contact request to `clinics/{id}/contact_requests/{conversationId}`
2. Email clinic admin via Resend
3. Return a speakable response string

## New module: `src/lib/ava/no-pms-handler.ts`
```
handleNoPmsToolCall(clinicId, clinicEmail?, toolName, toolInput, conversationId, callerPhone):
  Extract from toolInput:
    callerName  = first_name + last_name
    reason      = from appointment_type or tool name
    preferredTime = preferred_day or slot_datetime
    bodyRegion  = body_region
    insuranceType = insurance_type

  Write to clinics/{clinicId}/contact_requests/{conversationId}:
    { callerPhone, callerName, reason, bodyRegion, preferredTime, insuranceType,
      toolName, conversationId, createdAt }

  If clinicEmail:
    Send Resend email — structured "New contact from Ava" template
    Fire-and-forget — swallow errors (don't fail the voice call)

  Return speakable string (addresses caller by first name if available)
```

## tools/route.ts changes
```
const clinicData = clinicSnap.docs[0].data()  // add after clinicId extraction

if (!pmsConfig?.apiKey?.trim()):
  response = await handleNoPmsToolCall(
    clinicId, clinicData.email, tool_name, toolInput,
    conversation_id, caller_phone
  )
  return NextResponse.json({ response }, 200)
```

## Completion criteria
- `no-pms-handler.test.ts` passes: contact_requests doc written, Resend called, no email when clinicEmail absent
- `firestore.rules` includes `contact_requests` rule
- `firestore.indexes.json` includes `contact_requests` createdAt index
