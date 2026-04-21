#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Module boundary check — SPARC coupling gate.
#
# Intelligence and Pulse are separate bounded contexts. They communicate ONLY
# via the shared `/clinics/{clinicId}/events` collection (Intelligence writes,
# Pulse reads + stamps `consumedBy: ['pulse']`). This script enforces:
#
#   1. Intelligence code never reads Pulse-owned collections
#      (`/messages`, `comms_log`).
#   2. Pulse code never reads/writes Intelligence-owned collections
#      (`/kpis`, `computeState`).
#
# Run locally:   npm run check:boundaries
# CI:            wired into .github/workflows/ci.yml
# Exits 1 on violation, 0 on clean.
# ─────────────────────────────────────────────────────────────────────────────

set -u

# Resolve to dashboard/ regardless of where this script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DASHBOARD_DIR"

VIOLATIONS=0

# ── Intelligence → Pulse collections (forbidden) ─────────────────────────────
INTEL_PATHS=(
  "src/lib/intelligence"
  "src/lib/metrics"
  "src/app/intelligence"
  "src/hooks/useIntelligenceData.ts"
  "src/hooks/useKpis.ts"
  "src/hooks/useValueLedger.ts"
)

# Patterns Intelligence must never reference.
# Using fixed strings; the literal `/messages` covers path references; the
# quoted forms of `comms_log` catch Firestore collection names.
INTEL_FORBIDDEN=(
  "/messages"
  "'comms_log'"
  '"comms_log"'
)

for path in "${INTEL_PATHS[@]}"; do
  if [[ ! -e "$path" ]]; then continue; fi
  for pat in "${INTEL_FORBIDDEN[@]}"; do
    matches="$(grep -rn --include='*.ts' --include='*.tsx' -F "$pat" "$path" 2>/dev/null || true)"
    if [[ -n "$matches" ]]; then
      echo "Module boundary violation: Intelligence code references Pulse-owned collection '$pat'"
      echo "$matches"
      echo
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done
done

# ── Pulse → Intelligence collections (forbidden) ─────────────────────────────
PULSE_PATHS=(
  "src/lib/pulse"
  "src/lib/comms"
  "src/components/pulse"
  "src/app/api/n8n"
  "src/app/api/comms"
  "src/hooks/usePatients.ts"
  "src/hooks/useSequences.ts"
  "src/hooks/useCommsLog.ts"
)

# Patterns Pulse must never reference.
PULSE_FORBIDDEN=(
  "/kpis"
  "'kpis'"
  '"kpis"'
  "'computeState'"
  '"computeState"'
)

for path in "${PULSE_PATHS[@]}"; do
  if [[ ! -e "$path" ]]; then continue; fi
  for pat in "${PULSE_FORBIDDEN[@]}"; do
    matches="$(grep -rn --include='*.ts' --include='*.tsx' -F "$pat" "$path" 2>/dev/null || true)"
    if [[ -n "$matches" ]]; then
      echo "Module boundary violation: Pulse code references Intelligence-owned collection '$pat'"
      echo "$matches"
      echo
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done
done

if [[ "$VIOLATIONS" -gt 0 ]]; then
  echo "Module boundary check FAILED: $VIOLATIONS violation(s)."
  echo "Intelligence and Pulse must communicate only via /clinics/{id}/events."
  exit 1
fi

echo "Module boundary check passed."
exit 0
