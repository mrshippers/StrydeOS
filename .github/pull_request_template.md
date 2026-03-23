## What does this PR do?
<!-- One sentence. Link to the issue/ticket if there is one. -->


## Why?
<!-- What problem does this solve or what value does it add? -->


## How to test
<!-- Steps for the reviewer to verify this works. -->
1.
2.
3.

---

## Review Checklist

### Correctness
- [ ] Code does what the PR description says
- [ ] Edge cases handled (null/undefined, empty arrays, missing fields)
- [ ] Error paths handled — Sentry captures what it should
- [ ] Async/await correct — no unhandled rejections
- [ ] TypeScript types accurate — no `any` or unsafe casts
- [ ] Bug fixes include a test that catches the original bug
### Next.js / React
- [ ] Server vs Client Components split correctly (`"use client"` only where needed)
- [ ] No waterfall data fetches that could be parallel
- [ ] API routes validate method, body, and query params
- [ ] `NEXT_PUBLIC_` prefix only on browser-safe values

### Firebase
- [ ] Correct Firestore collection paths and document refs
- [ ] Admin SDK server-side only — not in client bundles
- [ ] Client SDK initialised once, not per-component
- [ ] Firestore listeners cleaned up on unmount

### Integrations (Stripe / Twilio / Resend / ElevenLabs)
- [ ] Stripe webhooks verify signature before processing
- [ ] Payment flows handle all terminal states
- [ ] SMS/email/voice calls have error handling and don't block the request
- [ ] Integration credentials from env vars, not hardcoded

### Security ⚠️
- [ ] No secrets, API keys, or tokens committed
- [ ] Firestore rules updated if data access patterns changed
- [ ] RBAC enforced: role-scoped access correct (superadmin/owner/admin/member/clinician)
- [ ] Protected user fields (role, clinicId, clinicianId, status) not client-modifiable
- [ ] Patient data scoped to assigned clinician (unless owner/admin/superadmin)
- [ ] No PII in logs or Sentry breadcrumbs
### API Correctness ⚠️
- [ ] Every API route validates auth (Firebase token verification)
- [ ] Request validation rejects bad input with clear errors + correct HTTP status
- [ ] Response shapes consistent across endpoints
- [ ] Error responses don't leak internals (stack traces, Firestore paths)

### Data Integrity ⚠️
- [ ] New collections/fields follow existing naming + nesting under `/clinics/{id}/...`
- [ ] Multi-document operations use transactions or batched writes
- [ ] Deletes don't orphan subcollection documents
- [ ] Document references consistent across related collections

### Performance
- [ ] No unbounded Firestore queries — `limit()` or pagination used
- [ ] No N+1 patterns — batch reads, not loops
- [ ] `useEffect` dependencies correct — no infinite re-renders
- [ ] Bundle size impact considered for new dependencies

### Python (`ava_graph`) — if applicable
- [ ] Changes have corresponding tests
- [ ] `pytest` passes locally
- [ ] API endpoints validate input and return structured errors

### Test Coverage
- [ ] New functionality has tests (happy path + at least one failure case)
- [ ] Firestore interactions tested with emulator or mocked
- [ ] No `.skip` or `.only` left from debugging

### Deployment
- [ ] Vercel env vars set for any new env vars
- [ ] `firestore.rules` deployed alongside code that depends on them
- [ ] `firestore.indexes.json` updated if new query patterns added

---

**Screenshots / recordings** (if UI change):
<!-- Paste here -->