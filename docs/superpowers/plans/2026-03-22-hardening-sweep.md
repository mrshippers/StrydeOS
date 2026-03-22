# StrydeOS Hardening Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically fix the 9 known weaknesses in StrydeOS: rate limiting, ESLint, logging, code splitting, accessibility, testing, secret scanning, debug endpoints, and API docs.

**Architecture:** Phased approach — security first (rate limiting, debug endpoints, secrets), then quality (ESLint, logging, Speed Insights), then performance/a11y/testing. Each phase is independent and can be worked in parallel.

**Tech Stack:** Vercel Firewall (WAF rules), ESLint 9 flat config, existing `withRequestLog` wrapper, `@vercel/speed-insights`, `next/dynamic`, ARIA landmarks

---

## Phase 1: Rate Limiting (Vercel Firewall)

**Files:**
- Modify: `dashboard/vercel.json`
- Create: `dashboard/scripts/setup-firewall.sh`

vercel.json gets basic deny/challenge rules for common attack vectors.
Actual rate limiting configured via Vercel Firewall dashboard or REST API (not supported in vercel.json).

## Phase 2: ESLint Setup

**Files:**
- Create: `dashboard/eslint.config.mjs`
- Modify: `dashboard/package.json` (add eslint + plugins to devDeps)

## Phase 3: Structured Logging

**Files:**
- Modify: All 36 API route handlers — wrap with `withRequestLog`
- Modify: `dashboard/src/lib/request-logger.ts` — handle route params

## Phase 4: Speed Insights

**Files:**
- Modify: `dashboard/src/app/layout.tsx`
- Modify: `dashboard/package.json` (add `@vercel/speed-insights`)

## Phase 5: Debug Endpoint Hardening + Secret Scanning

**Files:**
- Modify: `dashboard/src/app/api/debug/writeupp-probe/route.ts`
- Create: `dashboard/.husky/pre-commit` or `.githooks/pre-commit`

## Phase 6: Code Splitting

**Files:**
- Modify: Heavy client components (Recharts, CommandPalette, HelpPanel, FirstLoginTour)

## Phase 7: Accessibility

**Files:**
- Modify: `dashboard/src/app/layout.tsx` (landmarks)
- Modify: `dashboard/src/components/ui/Toast.tsx` (aria-live)
- Modify: Various dropdown/menu components (keyboard nav)

## Phase 8: Test Coverage

**Files:**
- Create: Tests for `auth-guard.ts`, PMS adapters, pipeline stages, webhook handlers
