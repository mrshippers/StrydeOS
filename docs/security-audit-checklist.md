# Security & Hardening Audit Checklist

> Portable checklist derived from the StrydeOS hardening sweep (March 2026).
> Use this to audit any project — check what's in place, flag what's missing.

---

## 1. Rate Limiting & DDoS Protection

- [ ] **Global API rate limit** — all `/api/*` routes capped per IP (e.g. 200 req/min)
- [ ] **Auth endpoint rate limit** — signup, login, password reset tightly capped (e.g. 5 req/min)
- [ ] **Sensitive endpoint rate limits** — test-connection, CSV upload, admin provisioning
- [ ] **Webhook rate limits** — inbound webhooks capped per IP (e.g. 120 req/min)
- [ ] **WAF deny rules** — block common scanner paths (WordPress, phpinfo, .env, xmlrpc)
- [ ] **Bot protection enabled** — challenge mode for non-browser traffic
- [ ] **DDoS protection** — platform-level (Vercel/Cloudflare) or application-level

## 2. Secret Management

- [ ] **No secrets in code** — API keys, tokens, private keys only in env vars
- [ ] **`.env*` in .gitignore** — `.env`, `.env.local`, `.env*.local` all excluded
- [ ] **Service account keys in .gitignore** — Firebase admin SDK, GCP credentials
- [ ] **Pre-commit secret scanning** — hook that blocks commits containing key patterns
- [ ] **Secret patterns covered:**
  - [ ] Stripe keys (`sk_live_*`, `sk_test_*`, `whsec_*`)
  - [ ] Firebase private keys (`-----BEGIN PRIVATE KEY-----`)
  - [ ] API keys (provider-specific: Retell, ElevenLabs, Resend, Twilio, etc.)
  - [ ] Webhook secrets
  - [ ] Cron/internal secrets
- [ ] **No secrets in client-side code** — server-only env vars not prefixed with `NEXT_PUBLIC_`
- [ ] **Env example file exists** — `.env.example` with placeholder values, no real secrets
- [ ] **Secrets rotation plan** — process documented for rotating compromised keys

## 3. Authentication & Authorization

- [ ] **Auth on all API routes** — every route verifies identity (token, session, API key)
- [ ] **Role-based access control** — routes enforce allowed roles (owner, admin, clinician, etc.)
- [ ] **Multi-tenant isolation** — queries scoped by tenant ID (clinicId, orgId, etc.)
- [ ] **Superadmin bypass is explicit** — not accidental; clearly coded and auditable
- [ ] **Cron endpoints verify secret** — `CRON_SECRET` header checked on scheduled routes
- [ ] **Webhook endpoints verify signatures** — HMAC/signature validation on inbound webhooks
- [ ] **Session/token expiry** — auth tokens have reasonable TTL
- [ ] **Middleware protects UI routes** — unauthenticated users redirected to login
- [ ] **No auth bypass via direct URL** — protected pages can't be accessed by guessing paths

## 4. Debug & Development Endpoints

- [ ] **Debug endpoints disabled in production** — hard-disabled, not gated by env flag
- [ ] **Auth required even for debug** — superadmin/admin role check before env check
- [ ] **No sensitive data in debug responses** — keys only, no PHI/PII in probe responses
- [ ] **No test/seed scripts accessible via API** — seed scripts are CLI-only, not routes
- [ ] **Staging banner visible** — staging/preview environments clearly marked in UI

## 5. Code Quality & Static Analysis

- [ ] **ESLint configured** — with framework-specific plugin (Next.js, React, etc.)
- [ ] **TypeScript strict mode** — `strict: true` in tsconfig
- [ ] **`no-console` rule** — warns on `console.log`, allows `.warn`/`.error`
- [ ] **`no-debugger` rule** — errors on debugger statements
- [ ] **Unused variable detection** — `@typescript-eslint/no-unused-vars`
- [ ] **React hooks rules** — `rules-of-hooks` error, `exhaustive-deps` warn
- [ ] **Lint runs in CI** — build fails or warns on lint errors
- [ ] **No `any` sprawl** — `@typescript-eslint/no-explicit-any` at least at warn level

## 6. Observability & Logging

- [ ] **Structured request logging** — every API route logs method, path, status, duration as JSON
- [ ] **Error tracking** — Sentry, Datadog, or equivalent capturing unhandled exceptions
- [ ] **Client-side error tracking** — browser errors captured (Sentry client SDK, etc.)
- [ ] **Web Analytics** — page views, traffic sources tracked (`@vercel/analytics` or equivalent)
- [ ] **Speed Insights / RUM** — Core Web Vitals monitored (`@vercel/speed-insights` or equivalent)
- [ ] **Log aggregation** — structured logs forwarded to central platform (Drains, CloudWatch, etc.)
- [ ] **Request IDs** — traceable across client, server, and external services
- [ ] **Tenant ID in logs** — multi-tenant apps include tenant identifier in every log entry
- [ ] **No sensitive data in logs** — PII/PHI stripped or masked before logging
- [ ] **Error responses are generic** — internal error details not leaked to client (500 = "Internal server error")

## 7. Performance & Code Splitting

- [ ] **Route-level code splitting** — framework handles this (Next.js App Router, etc.)
- [ ] **Heavy components lazy-loaded** — `next/dynamic` or `React.lazy` for charting libs, editors, etc.
- [ ] **Loading states for lazy components** — skeleton/placeholder matching component dimensions
- [ ] **No unnecessary `'use client'`** — Server Components where possible
- [ ] **Images optimized** — `next/image` or equivalent with proper sizing
- [ ] **Fonts optimized** — `next/font` or equivalent (zero CLS)
- [ ] **Bundle analysis done** — know what's in the bundle, no surprise 500KB dependencies
- [ ] **Tree shaking working** — unused exports eliminated at build time

## 8. Accessibility (WCAG AA)

- [ ] **Skip-to-content link** — first focusable element, visible on focus
- [ ] **Main content landmark** — `<main id="main-content">` or equivalent
- [ ] **Navigation landmark** — `<nav>` or `role="navigation"` with `aria-label`
- [ ] **Toast/notification region** — `aria-live="polite"` container for dynamic messages
- [ ] **Alert role for errors** — `role="alert"` on error/warning notifications
- [ ] **All icon buttons have labels** — `aria-label` on buttons with only icon content
- [ ] **Keyboard navigation** — all interactive elements reachable via Tab, operable via Enter/Space
- [ ] **Focus visible** — `:focus-visible` styles not removed
- [ ] **Color contrast** — text meets 4.5:1 ratio (AA), large text meets 3:1
- [ ] **Reduced motion** — `prefers-reduced-motion` media query respected
- [ ] **Form labels** — all inputs have associated `<label>` or `aria-label`
- [ ] **Error messages linked** — `aria-describedby` connecting inputs to their error text

## 9. Testing

- [ ] **Test runner configured** — Jest, Vitest, Node native test runner, etc.
- [ ] **Auth logic tested** — role checks, tenant isolation, error cases
- [ ] **API route handlers tested** — at least smoke tests for critical paths
- [ ] **Data adapters tested** — PMS/CRM/integration adapters and their mappings
- [ ] **Webhook handlers tested** — signature verification, event routing, idempotency
- [ ] **Pipeline/ETL tested** — data transformation, metric computation
- [ ] **Status/enum maps tested** — external status codes mapped to internal states
- [ ] **Tests run in CI** — automated on every PR/push
- [ ] **No flaky tests** — deterministic, no timing dependencies
- [ ] **Edge cases covered** — empty inputs, malformed data, missing fields

## 10. API Documentation

- [ ] **Endpoints catalogued** — all routes listed with method, path, purpose
- [ ] **Auth requirements documented** — which auth method, which roles
- [ ] **Request/response shapes** — body params, query params, response types
- [ ] **Error codes documented** — what each status code means for each endpoint
- [ ] **Webhook payloads documented** — inbound webhook event shapes and verification
- [ ] **Business context** — who uses each endpoint and why (not just technical spec)

## 11. Infrastructure & Deployment

- [ ] **Environment separation** — dev/staging/production with separate credentials
- [ ] **Preview deployments isolated** — preview URLs don't hit production data
- [ ] **Rollback capability** — can revert to previous deploy quickly
- [ ] **Build verification** — build passes before deploy (TypeScript, lint, tests)
- [ ] **No force-push to main** — branch protection enabled
- [ ] **Dependency audit** — `npm audit` / `pnpm audit` checked periodically
- [ ] **Node.js version pinned** — `.nvmrc` or `engines` field in package.json

---

## Audit Template

| Area | StrydeOS | Driiva | Notes |
|------|----------|--------|-------|
| Rate limiting | Done | | |
| Secret scanning | Done | | |
| Auth on all routes | Done | | |
| Debug endpoints hardened | Done | | |
| ESLint | Done | | |
| Structured logging | Done | | |
| Error tracking (Sentry) | Done | | |
| Speed Insights | Done | | |
| Code splitting | Done | | |
| Accessibility | Done | | |
| Test coverage | Done (38 tests) | | |
| API docs | Done | | |
| Pre-commit hooks | Done | | |
| WAF / Firewall | Script ready | | |
