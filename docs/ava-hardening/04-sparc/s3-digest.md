# S3 — Call Summary Email Digest SPARC

## Pre-implementation verification

| Check | Result |
|-------|--------|
| Writes to collections Intelligence reads? | No — read-only + email send |
| `InsightEvent` schema touched? | No |
| Fires `onClinicWrite`? | No |
| Adds new Firestore collection? | No |
| Reads from existing collections? | YES — `clinics/{id}/call_log` (existing, clean) |

## Specification

### Route: `GET /api/ava/digest`
- Auth: `requireRole(user, ["owner", "admin", "superadmin"])`
- Query param: `?since=ISO` — defaults to 24h ago
- Reads `call_log` ordered by `startTimestamp desc`, limit 100
- Aggregates by outcome: booked / follow_up_required / escalated / resolved / voicemail
- Calls `sendAvaDigestEmail` via Resend
- Returns `{ sent: boolean, summary: { booked, callbacks, escalated, info, voicemail, total } }`

### Email template: `src/lib/intelligence/emails/ava-digest.ts`
Uses `wrapEmailLayout` from `layout.ts` with `moduleLabel: "Ava"`.

Sections:
1. Header: clinic name + date range (from subtitle)
2. Summary chips row: Booked N | Callbacks N | Escalated N | Info N | Voicemail N
3. Call table: Time | Outcome | Caller (last 4 digits) | Duration
4. CTA: "View all in Ava dashboard" → `portal.strydeos.com/receptionist`
5. Footer: standard layout.ts footer

## Pseudocode
```
GET /api/ava/digest:
  user = verifyApiRequest(req)
  requireRole(user, ["owner", "admin", "superadmin"])
  clinicId = user.clinicId
  
  since = req.searchParams.get("since") ?? 24h ago ISO
  
  calls = clinics/{clinicId}/call_log
            .where("startTimestamp", ">=", since)
            .orderBy("startTimestamp", "desc")
            .limit(100)
  
  summary = aggregate(calls):
    booked    = count where outcome == "booked"
    callbacks = count where outcome == "follow_up_required"
    escalated = count where outcome == "escalated"
    info      = count where outcome in ["resolved", "info"]
    voicemail = count where outcome == "voicemail"
  
  await sendAvaDigestEmail(clinicEmail, { clinicName, dateRange, summary, calls })
  
  return { sent: true, summary }
```

## Architecture
- New route file: `src/app/api/ava/digest/route.ts`
- New email module: `src/lib/intelligence/emails/ava-digest.ts`
- Follows existing patterns from `src/lib/intelligence/emails/clinician-digest.ts`
- Email accent colour: Ava Blue `#1C54F2`

## Completion criteria
- Route returns 401 without auth, 200 with valid owner session
- Email sends with correct summary fields
- Caller phones truncated to last 4 digits in email body
