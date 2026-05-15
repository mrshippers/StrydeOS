# S1-T1 — Prompt Sync SPARC

## Pre-implementation verification

| Check | Result |
|-------|--------|
| Writes to collections Intelligence reads? | No — writes to ElevenLabs API only |
| Fires `onClinicWrite`? | No — this IS the `onClinicWrite` handler body |
| Adds new Firestore collection? | No |
| `InsightEvent` schema touched? | No |
| `isOnlySyncStateWrite` guard still works? | Yes — `buildAvaCorePrompt` only affects the ElevenLabs PATCH; Firestore writes remain `ava.syncState.*` |

## Specification
Replace the diverged `buildSystemPrompt` function in `functions/src/sync-clinic-to-ava.ts` with a verbatim copy of `AVA_CORE_PROMPT_TEMPLATE` + `buildAvaCorePrompt` variable injection, so every `onClinicWrite` trigger produces the canonical Ava personality.

## Pseudocode
```
1. Delete buildSystemPrompt() (lines 80–118)
2. Add AVA_CORE_PROMPT_TEMPLATE constant (verbatim copy from ava-core-prompt.ts)
3. Add buildAvaCorePrompt() with replaceAll injection (same logic as ava-core-prompt.ts)
4. Add SYNC-LOCK comment citing the canonical file path
5. Replace buildSystemPrompt({...}) call with buildAvaCorePrompt({...})
   — variable names are identical, no other changes needed
```

## Architecture
- No new dependencies introduced
- Functions package remains self-contained (cannot import from `src/`)
- Template is copied not imported — SYNC-LOCK comment is the enforcement mechanism

## Refinement — risk
The only risk is template drift re-occurring. The SYNC-LOCK comment + PR convention from `03-ensemble-decisions.md` mitigates this until a third consumer warrants a shared package.

## Completion criteria
After deploy, triggering `syncClinicToAva` for Spires must produce an ElevenLabs agent system prompt containing `[1 — IDENTITY]` with the full Friday/Iron Man brief.
