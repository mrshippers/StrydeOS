# S1-T3 — KB Delete Path SPARC

## Pre-implementation verification

| Check | Result |
|-------|--------|
| Writes to collections Intelligence reads? | No — ElevenLabs API only |
| Fires `onClinicWrite`? | No |
| Adds new Firestore collection? | No |
| Public API breakage? | `deleteKnowledgeBaseDoc` is exported — signature changes from `(apiKey, docId)` to `(apiKey, agentId, docId)` |
| Existing callers? | `api/ava/knowledge/route.ts` already does its own inline agent-scoped delete — does NOT call this helper. The helper is unused in production today. |

## Specification
Update `deleteKnowledgeBaseDoc` to use the agent-scoped ElevenLabs endpoint: `DELETE /v1/convai/agents/{agentId}/knowledge-base/{docId}`.

## Pseudocode
```
deleteKnowledgeBaseDoc(apiKey, agentId, docId):
  fetch DELETE /v1/convai/agents/{agentId}/knowledge-base/{docId}
    headers: xi-api-key: apiKey
  return res.ok  // 404 treated as success (doc already gone)
```

## Architecture
- One function signature change in `elevenlabs-agent.ts`
- No caller updates needed (no active callers)
- The Cloud Function's delete loop already uses the agent-scoped endpoint directly (not this helper)

## Completion criteria
`deleteKnowledgeBaseDoc` uses agent-scoped endpoint. TypeScript compiles. No active callers broken.
