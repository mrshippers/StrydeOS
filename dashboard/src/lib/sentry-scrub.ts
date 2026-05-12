/**
 * Sentry PHI/PII scrubber.
 *
 * Walks any Sentry event object (request body, exception extras, breadcrumbs,
 * contexts, tags, user, etc.) and replaces values whose key matches a known
 * PHI/PII field name with `[REDACTED:phi]` or `[REDACTED:pii]`.
 *
 * The allowlist is derived at module-load from contracts/index.ts
 * `PII_FIELD_MAP` so when new sensitive fields are added to a cross-module
 * shape they are automatically scrubbed everywhere — no second registry to
 * keep in sync.
 *
 * Why a flat key-name walk rather than path-based scrubbing:
 *   - Sentry nests payloads under `request.data`, `extra`, `contexts`,
 *     `breadcrumbs[].data`, `exception.values[].mechanism.data`, etc.
 *     A path-based scrubber would need a giant list and would still miss
 *     anything Sentry adds in a future SDK release.
 *   - Recursing on every key and gating purely on the key name catches the
 *     value at any depth, in any container, including arrays.
 *
 * Trade-off: if a non-PHI field is named the same as a PHI field name we
 * over-redact. That's the safe direction for clinical data.
 */

import type { Event, EventHint } from "@sentry/nextjs";

import { PII_FIELD_MAP, type PIIClass } from "@/lib/contracts";

/**
 * Build a flat lookup from field name → PIIClass by collapsing every
 * per-shape map in PII_FIELD_MAP. If the same field name appears in two
 * shapes with different classes, `phi` wins (more sensitive).
 */
function buildAllowlist(): Map<string, PIIClass> {
  const allowlist = new Map<string, PIIClass>();
  for (const shape of Object.values(PII_FIELD_MAP)) {
    for (const [field, klass] of Object.entries(shape) as Array<[string, PIIClass]>) {
      // Only redact phi / pii. pii-ref (patientId, conversationId) is kept so
      // log aggregators can correlate. public is a no-op.
      if (klass !== "phi" && klass !== "pii") continue;

      const existing = allowlist.get(field);
      // phi outranks pii — promote if we see the same field as phi anywhere.
      if (!existing || (klass === "phi" && existing === "pii")) {
        allowlist.set(field, klass);
      }
    }
  }
  return allowlist;
}

const REDACT_FIELDS = buildAllowlist();

/** Recursion guard for cyclic objects (Sentry events occasionally cycle). */
const MAX_DEPTH = 12;

function redactValue(klass: PIIClass): string {
  return klass === "phi" ? "[REDACTED:phi]" : "[REDACTED:pii]";
}

/**
 * Walk `value` in place and redact any field whose key matches the allowlist.
 * Returns the same reference for ergonomics. `seen` prevents cycles.
 */
function walkAndRedact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return value;
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walkAndRedact(value[i], depth + 1, seen);
    }
    return value;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const klass = REDACT_FIELDS.get(key);
    if (klass) {
      obj[key] = redactValue(klass);
      continue;
    }
    walkAndRedact(obj[key], depth + 1, seen);
  }
  return obj;
}

/**
 * Sentry `beforeSend` hook. Walks the entire event payload and scrubs any
 * PHI/PII field by key name. Safe to call on every event. Returns the same
 * event object (mutated) — Sentry expects the modified event back.
 *
 * Pair with the dev-environment gate in the calling sentry config:
 *
 *   beforeSend(event, hint) {
 *     if (process.env.NODE_ENV === "development") return null;
 *     return scrubSentryEvent(event, hint);
 *   }
 */
export function scrubSentryEvent<E extends Event>(event: E, _hint?: EventHint): E {
  walkAndRedact(event as unknown as Record<string, unknown>, 0, new WeakSet());
  return event;
}

/** Exposed for tests — the field set the scrubber will mask. */
export function getRedactFieldsForTest(): ReadonlyMap<string, PIIClass> {
  return REDACT_FIELDS;
}
