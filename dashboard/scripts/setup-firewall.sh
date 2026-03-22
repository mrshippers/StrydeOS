#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# StrydeOS — Vercel Firewall Rate Limiting Setup
#
# Configures WAF rate limiting rules via the Vercel REST API.
# vercel.json only supports deny/challenge — rate limiting needs the API.
#
# Prerequisites:
#   export VERCEL_TOKEN="your-token"
#   export VERCEL_PROJECT_ID="prj_xxx"
#   export VERCEL_TEAM_ID="team_xxx"
#
# Usage: bash scripts/setup-firewall.sh
# ──────────────────────────────────────────────────────────────

set -euo pipefail

API="https://api.vercel.com/v1/security/firewall/config"
QS="?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}"
AUTH="Authorization: Bearer ${VERCEL_TOKEN}"
CT="Content-Type: application/json"

echo "→ Enabling firewall..."
curl -s -X PATCH "${API}${QS}" -H "$AUTH" -H "$CT" \
  -d '{"action":"firewallEnabled","value":true}' | jq .

echo "→ Adding rate limit: /api/clinic/signup — 5 req/min per IP"
curl -s -X PATCH "${API}${QS}" -H "$AUTH" -H "$CT" \
  -d '{
    "action": "rules.insert",
    "value": {
      "name": "Rate limit signup",
      "active": true,
      "conditionGroup": [{
        "conditions": [
          { "type": "path", "op": "eq", "value": "/api/clinic/signup" },
          { "type": "method", "op": "eq", "value": "POST" }
        ]
      }],
      "action": {
        "mitigate": {
          "action": "rate_limit",
          "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 5, "keys": ["ip"], "action": "deny" }
        }
      }
    }
  }' | jq .

echo "→ Adding rate limit: /api/pms/test-connection — 10 req/min per IP"
curl -s -X PATCH "${API}${QS}" -H "$AUTH" -H "$CT" \
  -d '{
    "action": "rules.insert",
    "value": {
      "name": "Rate limit PMS test-connection",
      "active": true,
      "conditionGroup": [{
        "conditions": [
          { "type": "path", "op": "eq", "value": "/api/pms/test-connection" },
          { "type": "method", "op": "eq", "value": "POST" }
        ]
      }],
      "action": {
        "mitigate": {
          "action": "rate_limit",
          "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 10, "keys": ["ip"], "action": "deny" }
        }
      }
    }
  }' | jq .

echo "→ Adding rate limit: /api/hep/test-connection — 10 req/min per IP"
curl -s -X PATCH "${API}${QS}" -H "$AUTH" -H "$CT" \
  -d '{
    "action": "rules.insert",
    "value": {
      "name": "Rate limit HEP test-connection",
      "active": true,
      "conditionGroup": [{
        "conditions": [
          { "type": "path", "op": "eq", "value": "/api/hep/test-connection" },
          { "type": "method", "op": "eq", "value": "POST" }
        ]
      }],
      "action": {
        "mitigate": {
          "action": "rate_limit",
          "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 10, "keys": ["ip"], "action": "deny" }
        }
      }
    }
  }' | jq .

echo "→ Adding rate limit: /api/webhooks/* — 120 req/min per IP"
curl -s -X PATCH "${API}${QS}" -H "$AUTH" -H "$CT" \
  -d '{
    "action": "rules.insert",
    "value": {
      "name": "Rate limit webhook endpoints",
      "active": true,
      "conditionGroup": [{
        "conditions": [
          { "type": "path", "op": "pre", "value": "/api/webhooks/" }
        ]
      }],
      "action": {
        "mitigate": {
          "action": "rate_limit",
          "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 120, "keys": ["ip"], "action": "deny" }
        }
      }
    }
  }' | jq .

echo "→ Adding rate limit: /api/* global — 200 req/min per IP"
curl -s -X PATCH "${API}${QS}" -H "$AUTH" -H "$CT" \
  -d '{
    "action": "rules.insert",
    "value": {
      "name": "Global API rate limit",
      "active": true,
      "conditionGroup": [{
        "conditions": [
          { "type": "path", "op": "pre", "value": "/api/" }
        ]
      }],
      "action": {
        "mitigate": {
          "action": "rate_limit",
          "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 200, "keys": ["ip"], "action": "deny" }
        }
      }
    }
  }' | jq .

echo "→ Enabling Bot Protection (challenge mode)"
curl -s -X PATCH "${API}${QS}" -H "$AUTH" -H "$CT" \
  -d '{
    "action": "managedRules.update",
    "id": "bot_protection",
    "value": { "active": true, "action": "challenge" }
  }' | jq .

echo "✓ Firewall setup complete. Verify at: https://vercel.com/dashboard"
