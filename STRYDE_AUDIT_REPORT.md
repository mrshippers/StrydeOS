# STRYDE_AUDIT_REPORT.md
**Full System Audit — StrydeOS Dashboard**
Generated: 2026-03-08 | Auditor: Claude Code (Sonnet 4.6)
Codebase: `/dashboard/` — Next.js 15.1 / React 19 / Firebase 12.9 / Tailwind 4

---

## Executive Summary

| Dimension | Rating | Critical Issues |
|---|---|---|
| Security | 🔴 Needs action | 3 critical, 4 high |
| Performance | 🟡 Acceptable | 3 medium, 2 low |
| Code Quality | 🟡 Acceptable | 1 high, 4 medium |
| Data Integrity | 🟠 Risk | 2 critical, 3 medium |
| Deploy Reliability | 🟡 Acceptable | 1 critical, 3 medium |

**Immediate action required:** Plain-text production credentials in the repo, exploitable Firestore privilege escalation, and unauthenticated n8n callback endpoint.

---

## 1. Security

### 🔴 CRITICAL

#### C-SEC-1: Plain-text production passwords (resolved)
**Severity:** Critical | **Status:** File removed from repo

Production credentials must not be stored in the repo. Rotate any affected account passwords in Firebase Auth if they were ever committed. Use a password manager or shared vault for credentials.

---

#### C-SEC-2: Firestore rule allows any authenticated user to self-elevate role
**File:** `dashboard/firestore.rules:30-34`
**Severity:** Critical | **Fix estimate:** 30 minutes

```
match /users/{uid} {
  allow create, update: if isAuthenticated() && request.auth.uid == uid;
  // ↑ Any authenticated user can write ANY field on their own doc,
  //   including role: "superadmin" or role: "owner"
}
```

The comment even acknowledges: *"one-click 'Make me Super Admin' in Settings"* — this is confirmed exploitable. Any clinician can open DevTools, call `updateDoc` on their own user record, set `role: "superadmin"`, and gain full access to the admin console and all clinics.

**Fix:** Add a field restriction to the rule:
```
allow update: if isAuthenticated()
  && request.auth.uid == uid
  && !request.resource.data.diff(resource.data).affectedKeys()
       .hasAny(['role', 'clinicId', 'clinicianId', 'status']);
```
Role changes must only go through Admin SDK (server-side scripts or superadmin API route).

---

#### C-SEC-3: n8n callback endpoint accepts all requests when `N8N_COMMS_WEBHOOK_SECRET` is unset
**File:** `dashboard/src/app/api/n8n/callback/route.ts:34`
**Severity:** Critical | **Fix estimate:** 15 minutes

```typescript
if (N8N_SECRET && secret !== N8N_SECRET) {  // ← if secret unset, anyone passes
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

If `N8N_COMMS_WEBHOOK_SECRET` is not present in Vercel env vars, this endpoint is completely open. Any POST can write arbitrary comms log entries to any `clinicId` passed in the body.

**Fix:** Invert the guard:
```typescript
if (!N8N_SECRET || secret !== N8N_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

---

### 🟠 HIGH

#### H-SEC-4: ~~`RETELL_SKIP_SIG_VERIFY` flag can disable webhook signature verification~~ **RESOLVED — Retell removed**
**Status:** Resolved. Retell integration removed in favour of ElevenLabs Conversational AI. The webhook handler (`webhooks/retell/route.ts`) has been deleted.

---

#### H-SEC-5: ~~Retell webhook falls back to hardcoded project ID~~ **RESOLVED — Retell removed**
**Status:** Resolved. Retell webhook handler deleted. ElevenLabs webhook at `/api/webhooks/elevenlabs` uses explicit clinic routing.
```

`NEXT_PUBLIC_FIREBASE_PROJECT_ID` is the Firebase project ID (e.g. `clinical-tracker-spires`), not a Firestore clinic document ID. The final fallback `"spires"` is a legacy identifier. If `RETELL_CLINIC_ID` is not set in Vercel, call records may be written to a non-existent or wrong clinic document.

**Fix:** Require `RETELL_CLINIC_ID` explicitly; throw a 500 with a clear message if absent.

---

#### H-SEC-6: AuthGuard is client-side only — no server-side route protection
**File:** `dashboard/src/components/AuthGuard.tsx`
**Severity:** High | **Fix estimate:** 2 hours

The AuthGuard is a React component that redirects unauthenticated users client-side. There is no `middleware.ts` in the Next.js app. A user with JavaScript disabled, or who navigates directly to a protected route, will briefly see the page content before the redirect fires. More critically, API routes without `verifyApiRequest` are fully unprotected server-side.

**Fix:** Add `dashboard/src/middleware.ts` using Firebase session cookies or JWT verification. The current API route auth (`auth-guard.ts`) is correct — this issue is purely about the page routes.

---

#### H-SEC-7: `useAuth` defaults to `role: "owner"` for users missing Firestore profile
**File:** `dashboard/src/hooks/useAuth.tsx:91-103, 107-117, 183-195`
**Severity:** High | **Fix estimate:** 30 minutes

When a Firebase Auth user exists but has no document in the `users` collection, `fetchUserProfile` returns a default object with `role: "owner"`. This could happen during incomplete onboarding or if a user doc is accidentally deleted. The user would have owner-level access across the client UI.

**Fix:** Return `null` (or `role: "clinician"`) for users with no Firestore profile, and redirect to a "setup incomplete" page.

---

### 🟡 MEDIUM

#### M-SEC-8: Four `console.log` calls remain in production code
**Files:**
- `dashboard/src/lib/integrations/pms/writeupp/client.ts:74` — logs API connection details
- `dashboard/src/app/admin/page.tsx:305` — logs clinic name on impersonation click
- `dashboard/src/app/api/clinic/resend-invite/route.ts:65` — logs invite link (contains token)
- `dashboard/src/app/api/clinic/check-go-live/route.ts:88` — logs clinic promotion

The invite link log is particularly sensitive — it will appear in Vercel logs, which may be accessible to team members without Firebase access.

**Fix:** Remove all four. For the invite link specifically, this is urgent.

---

#### M-SEC-9: WriteUpp webhook scans all clinics on every call
**File:** `dashboard/src/app/api/webhooks/writeupp/route.ts:44-97`
**Severity:** Medium | **Fix estimate:** 2 hours

The webhook iterates every clinic in Firestore to find WriteUpp configs. This is a cross-clinic scan triggered by an unauthenticated (shared-secret only) endpoint. As clinic count grows, a single webhook event triggers O(n) Firestore reads and O(n) mini-pipeline runs.

**Fix:** Require `clinicId` in the webhook payload (can be set as a custom field in WriteUpp outbound webhooks), or use a routing table.

---

#### M-SEC-10: No rate limiting on any API endpoint
**Severity:** Medium | **Fix estimate:** 4 hours

Neither the pipeline endpoints nor the webhook receivers have rate limiting. A malicious actor with the webhook secret could trigger unlimited pipeline runs, burning API quota and Firestore write units.

**Fix:** Add Vercel Edge middleware or Upstash Redis rate limiting on `/api/webhooks/*` and `/api/pipeline/*`.

---

## 2. Performance

### 🟠 HIGH

#### H-PERF-1: `useWeeklyStats` re-subscribes on every render due to unstable `demoStats` reference
**File:** `dashboard/src/hooks/useWeeklyStats.ts:16, 45`
**Severity:** High | **Fix estimate:** 30 minutes

```typescript
const demoStats = useDemoWeeklyStats(clinicianId); // new array reference every render

useEffect(() => {
  // ...
}, [clinicId, clinicianId, demoStats]); // demoStats changing = new subscription
```

`useDemoWeeklyStats` returns a new array on every call. This means the effect re-runs on every render, creating and tearing down a new Firestore listener repeatedly. This is a real-world subscription leak / excess-read bug.

**Fix:**
```typescript
const demoStats = useMemo(() => useDemoWeeklyStats(clinicianId), [clinicianId]);
// or remove demoStats from the dependency array and capture it in a ref
```

---

### 🟡 MEDIUM

#### M-PERF-2: Pipeline runs all clinics serially — will hit Vercel 10s timeout at scale
**File:** `dashboard/src/app/api/pipeline/run/route.ts:44-49`
**Severity:** Medium | **Fix estimate:** 3 hours

```typescript
for (const clinicDoc of clinicsSnap.docs) {
  const result = await runPipeline(db, clinicDoc.id); // sequential
  results.push(result);
}
```

Each clinic's pipeline can take 2-5 seconds. At 3-4 clinics this will start failing Vercel's default 10-second serverless timeout (configurable up to 60s on Pro, 300s on Enterprise).

**Fix:** Run per-clinic pipelines in parallel with `Promise.allSettled`, or split into per-clinic cron invocations.

---

#### M-PERF-3: `fetchUserProfile` makes two sequential Firestore reads on every auth state change
**File:** `dashboard/src/hooks/useAuth.tsx:105, 133-138`
**Severity:** Medium | **Fix estimate:** 30 minutes

`getDoc(users/{uid})` → then → `getDoc(clinics/{clinicId})` — sequential. These can run in parallel.

**Fix:** `const [userDoc, clinicDoc] = await Promise.all([getDoc(userRef), getDoc(clinicRef)])`.

---

#### M-PERF-4: No bundle analysis tooling configured
**Severity:** Medium | **Fix estimate:** 1 hour

No `@next/bundle-analyzer` configured. Current dependency surface: Firebase SDK (large), recharts, motion, lucide-react. Without analysis there's no visibility into tree-shaking effectiveness.

**Fix:** Add `@next/bundle-analyzer` to package.json devDependencies and wire it into `next.config.ts`.

---

#### M-PERF-5: No caching on any API route
**Severity:** Low | **Fix estimate:** 2 hours

All Next.js API routes make fresh Firestore calls on every request. Routes like `test-connection` or `check-go-live` could benefit from short-lived caches.

**Fix:** Add `next: { revalidate: 60 }` on appropriate fetch calls or use Vercel KV for lightweight caching.

---

## 3. Code Quality

### 🟠 HIGH

#### H-QA-1: Zero automated tests
**Severity:** High | **Fix estimate:** 5+ days

Playwright is installed and in devDependencies. The only spec file (`demo-video/capture-frames.spec.mjs`) captures screenshots for the demo video — it's not a product test. There are no unit tests, integration tests, or E2E tests for any business logic. The eight KPI metrics, pipeline stages, Firestore queries, and auth guard logic are entirely untested.

**Priority areas to test first:**
1. `lib/metrics/compute-weekly.ts` — core business logic
2. `lib/auth-guard.ts` — security-critical
3. `lib/pipeline/run-pipeline.ts` — data pipeline orchestration

---

### 🟡 MEDIUM

#### M-QA-2: Cron auth detection is fragile and confusing
**Files:** `pipeline/run/route.ts`, `pipeline/backfill/route.ts`, `api/metrics/compute/route.ts`
**Severity:** Medium | **Fix estimate:** 1 hour

```typescript
const isCron = request.headers.get("authorization")?.startsWith("Bearer ");
```

User Firebase JWTs also start with `Bearer `. This check is meaningless — it always returns true for authenticated requests. The subsequent try/catch that falls back to user auth works correctly, but the logic is hard to reason about and has no clear intent.

**Fix:** Either (a) use a dedicated `x-cron-secret` header for cron requests, or (b) simply try cron auth first and fall back to user auth without the broken `isCron` heuristic.

---

#### M-QA-3: `firebase-admin.ts` has hardcoded legacy project ID fallback
**File:** `dashboard/src/lib/firebase-admin.ts:64`
**Severity:** Medium | **Fix estimate:** 15 minutes

```typescript
projectId: projectId || "clinical-tracker-spires",
```

`clinical-tracker-spires` is the old Firebase project name (pre-StrydeOS rename). If ADC credentials are available but `FIREBASE_PROJECT_ID` is not set, this silently connects to the wrong project.

**Fix:** Remove the fallback; throw if projectId is missing.

---

#### M-QA-4: `firebase-admin` is in devDependencies, not dependencies
**File:** `dashboard/package.json:35`
**Severity:** Medium | **Fix estimate:** 5 minutes

`firebase-admin` is listed under `devDependencies`. It is used by production API routes (`firebase-admin.ts`, all pipeline/webhook routes). In a clean CI `npm install --production`, it would not be installed. This is currently masked by Vercel's default install behaviour (installs all deps).

**Fix:** Move `firebase-admin` to `dependencies`.

---

#### M-QA-5: Admin "View as clinic" feature is a stub
**File:** `dashboard/src/app/admin/page.tsx:303-307`
**Severity:** Low | **Fix estimate:** N/A — needs design decision

```typescript
onClick={() => {
  console.log(`[SuperAdmin] View as ${clinic.name}`); // not implemented
}}
```

The superadmin impersonation feature is unbuilt. The button exists in the UI with no action. Log line should be removed regardless.

---

## 4. Data Integrity

### 🔴 CRITICAL

#### C-DATA-1: Demo data activates silently on Firestore error — production users may see fake numbers
**Files:** `dashboard/src/hooks/useWeeklyStats.ts:37-40`, similar pattern in all data hooks
**Severity:** Critical | **Fix estimate:** 2 hours

```typescript
(err) => {
  console.error("Firestore error:", err);
  setStats(demoStats);  // ← silently shows synthetic data on any error
  setUsedDemo(true);
  setLoading(false);
}
```

If Firestore is temporarily unavailable, rate-limited, or the user's `clinicId` is misconfigured, the dashboard silently flips to demo data. The "Demo" chip appears but is easy to miss. A clinic owner could believe they're looking at real KPIs when they are not.

The same pattern exists in: `useClinicians`, `usePatients`, `useClinicianSummaryStats`, `useCommsLog`, `useCallLogs`.

**Fix:** Differentiate between "no data yet" (show demo with clear explanation) and "Firestore error" (show an explicit error state with retry). Never silently show demo data on error.

---

#### C-DATA-2: `useDemoData.ts` contains real Spires clinician names and performance trajectories
**File:** `dashboard/src/hooks/useDemoData.ts:46-82`
**Severity:** Critical | **Fix estimate:** 1 hour

```typescript
// Spires real trajectories — production data:
// Andrew Henry: 1.9 → 2.5 (target 2.9).
// Joe Korge: Admin/Owner, caseload 2, FU 3.8 — statistically non-representative
```

The demo data contains real full names (Andrew Henry, Max Hubbard, Jamal Adu, Joe Korge) and their real performance metrics. If a prospective customer or an investor is shown a demo, they see real clinician data. If the codebase becomes public or is shared, this is a privacy concern.

**Fix:** Replace with generic fictionalised names. Separate "Spires internal demo" data (private) from "product demo" data (shareable).

---

### 🟡 MEDIUM

#### M-DATA-3: Comprehensive demo data inventory

The following demo/mock/synthetic data patterns exist in production-shipped code:

| Location | Data Type | Activation Trigger |
|---|---|---|
| `useDemoData.ts` | Weekly stats, clinicians, patients | Firestore empty or error |
| `useDemoIntelligence.ts` | Revenue, DNA, referrals, NPS, benchmarks | Always (imported directly) |
| `useDemoComms.ts` | Comms log, sequence stats | Imported directly |
| `useAuth.tsx:DEMO_USER` | Full fake auth user | `enterDemoMode()` on login page |
| `admin/page.tsx:DEMO_CLINICS` | 4 fake clinic profiles | Firestore empty or error |

The Intelligence module (`/intelligence`) appears to always use demo functions from `useDemoIntelligence.ts` directly, with no real Firestore data path. **The Intelligence module may have no live data pipeline wired to its UI at all.**

---

#### M-DATA-4: Real data flow — gaps and risks

**Confirmed real data path:**
```
WriteUpp webhook → /api/webhooks/writeupp → mini-pipeline → Firestore
Cron (00:00 UTC) → /api/pipeline/run → runPipeline() → Firestore
                                                         ↓
   Stage 1: sync-clinicians    → clinics/{id}/clinicians
   Stage 2: sync-appointments  → clinics/{id}/appointments
   Stage 3: sync-patients      → clinics/{id}/patients
   Stage 4: sync-hep           → (enriches patients with HEP compliance)
   Stage 5: compute-patients   → (derives churn risk, course progress)
   Stage 5b: trigger-comms     → n8n → email/SMS
   Stage 6: compute-metrics    → clinics/{id}/metrics_weekly  ← UI reads this
   Stage 7: sync-reviews       → clinics/{id}/reviews
```

**Gaps:**
- The Intelligence module's revenue, DNA breakdown, referral sources, NPS charts — **no confirmed Firestore collection or pipeline stage populates this data**. These charts appear to be UI-complete but data-incomplete.
- `comms_log` is populated by n8n callback but the callback endpoint lacks auth hardening (C-SEC-3).
- `voiceInteractions` collection has no Firestore rule (defaults to `allow write: if false`, which is actually safe — server writes via Admin SDK bypass rules).

---

#### M-DATA-5: Metrics cron runs at 00:00 UTC — wrong during BST
**File:** `dashboard/vercel.json:5-8`
**Severity:** Low | **Fix estimate:** 5 minutes

The cron fires at midnight UTC. UK clinics are UTC+1 (BST) in summer. This means the daily pipeline runs at 1am BST, which is fine. However, for any future non-UK clinic in a significantly different timezone, this is worth revisiting. Current status: acceptable for Spires.

---

## 5. Deploy Reliability

### 🟠 HIGH

#### H-DEPLOY-1: No CI/CD pipeline
**Severity:** High | **Fix estimate:** 3 hours

There is no `.github/workflows/` directory. Deployments happen by pushing to the main branch and letting Vercel auto-deploy. There is no:
- Pre-deploy lint check
- TypeScript type check (`tsc --noEmit`)
- Test run
- Build validation

A broken TypeScript file or ESLint error can ship to production without any gate.

**Fix:** Add a minimal GitHub Actions workflow:
```yaml
# .github/workflows/ci.yml
- run: npm ci
- run: npm run lint
- run: npx tsc --noEmit
- run: npm run build
```

---

### 🟡 MEDIUM

#### M-DEPLOY-2: Env vars not fully documented — five vars undocumented in `.env.example`
**File:** `dashboard/.env.example`
**Severity:** Medium | **Fix estimate:** 30 minutes

The following env vars are used in source but absent from `.env.example`:

| Variable | Used In | Effect if Missing |
|---|---|---|
| ~~`RETELL_CLINIC_ID`~~ | ~~`webhooks/retell/route.ts`~~ | **Resolved — Retell removed** |
| ~~`RETELL_SKIP_SIG_VERIFY`~~ | ~~`webhooks/retell/route.ts`~~ | **Resolved — Retell removed** |
| `GOOGLE_APPLICATION_CREDENTIALS` | `firebase-admin.ts` | Falls through to ADC |
| `NEXT_PUBLIC_APP_ENV` | `StagingBanner.tsx` | Staging banner won't show |

**Fix:** Document all vars in `.env.example` with clear descriptions.

---

#### M-DEPLOY-3: No Node.js version lock
**File:** `dashboard/package.json`
**Severity:** Medium | **Fix estimate:** 10 minutes

No `engines` field in `package.json` and no `.nvmrc`. The app uses Next.js 15 + React 19, which require Node 18+. Without a version lock, a Vercel infra change could break the build silently.

**Fix:**
```json
"engines": { "node": ">=20.0.0" }
```

---

#### M-DEPLOY-4: All dependencies use `^` semver — build not reproducible across environments
**Severity:** Medium | **Fix estimate:** 15 minutes

All `package.json` dependencies use `^` (caret) ranges. While `package-lock.json` locks versions for local installs, Vercel's build should use `npm ci` to respect the lockfile. Verify Vercel is configured with `npm ci` not `npm install`.

The root-level `package.json` (`tgt-automations`) still uses the old project name — this is cosmetic but should be updated to `strydeos` for consistency.

---

#### M-DEPLOY-5: Vercel `buildCommand` uses `npm run build` not `npm ci && npm run build`
**File:** `dashboard/vercel.json:3`
**Severity:** Low | **Fix estimate:** 5 minutes

Vercel handles dependency installation separately, so this is fine as-is. But there's no `installCommand` override, meaning Vercel uses its default install strategy. Explicitly setting `"installCommand": "npm ci"` ensures lockfile-consistent installs.

---

## Prioritised Action Plan

### Immediate (do today)

| # | Action | File | Time |
|---|---|---|---|
| 1 | **Rotate all 4 production passwords** | Firebase Auth console | 15 min |
| 2 | **Fix Firestore rule** to block role/clinicId self-modification | `firestore.rules` | 30 min |
| 3 | **Fix n8n callback** to reject when secret is unset | `api/n8n/callback/route.ts` | 15 min |
| 4 | **Remove invite-link `console.log`** | `api/clinic/resend-invite/route.ts:65` | 5 min |

### This sprint (< 1 week)

| # | Action | File | Time |
|---|---|---|---|
| ~~6~~ | ~~Fix `RETELL_SKIP_SIG_VERIFY` production guard~~ | **Resolved — Retell removed** | — |
| ~~7~~ | ~~Fix Retell clinic routing~~ | **Resolved — Retell removed** | — |
| 8 | Fix `useAuth` not to default to `role: "owner"` | `useAuth.tsx` | 30 min |
| 9 | Fix `useWeeklyStats` unstable `demoStats` reference (perf bug) | `useWeeklyStats.ts` | 30 min |
| 10 | Move `firebase-admin` from devDeps to deps | `package.json` | 5 min |
| 11 | Document undocumented env vars in `.env.example` | `.env.example` | 30 min |
| 12 | Add `engines` field and lock Node version | `package.json` | 10 min |
| 13 | Remove 3 remaining `console.log` calls | `admin/page.tsx`, `check-go-live/route.ts`, `writeupp/client.ts` | 15 min |
| 14 | Separate real-name demo data from product demo data | `useDemoData.ts` | 1 hour |

### Next sprint (1–2 weeks)

| # | Action | File | Time |
|---|---|---|---|
| 15 | Differentiate Firestore error vs "no data" in all data hooks | All hooks | 2 hours |
| 16 | Fix cron auth detection (remove `isCron` heuristic) | `pipeline/run/route.ts`, `backfill/route.ts`, `metrics/compute/route.ts` | 1 hour |
| 17 | Parallelise pipeline for multiple clinics | `pipeline/run/route.ts` | 3 hours |
| 18 | Parallelise `fetchUserProfile` Firestore reads | `useAuth.tsx` | 30 min |
| 19 | Add CI/CD (GitHub Actions) | `.github/workflows/ci.yml` | 3 hours |
| 20 | Wire Intelligence module to real Firestore data | `useDemoIntelligence.ts`, new pipeline stage | 3–5 days |

---

## Metrics Summary

| Metric | Value |
|---|---|
| Source files analysed | ~105 TypeScript/TSX files |
| API routes | 12 endpoints |
| Demo/mock data sources | 5 (3 hooks, 1 auth file, 1 page) |
| `console.log` in production | 4 (1 critical — invite token) |
| Test coverage | 0% (no tests exist) |
| Documented env vars | 11/16 used (69%) |
| Firestore security rules | Mostly correct — 1 critical privilege escalation |
| CI/CD gates | None |

---

*End of audit. Priority order: credentials → Firestore rule → n8n auth → console.log cleanup → performance fixes → CI setup.*
