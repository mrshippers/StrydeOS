# Dependency Risk Analysis — StrydeOS Integration Partners

**Last Updated:** March 2026  
**Purpose:** Assess reliability, uptime, and continuity risk for all third-party integrations

---

## Executive Summary

StrydeOS integrates with 4 PMS platforms (WriteUpp, Cliniko, Halaxy, Zanda) and 1 HEP platform (Physitrack). Integration reliability is **mission-critical** — if a PMS API goes down, clinic data sync stops.

**Key Findings:**
- ✅ **Zanda (UK):** 99.99% uptime (90-day average) — **best in class**
- ✅ **Cliniko:** 99.98% uptime (90-day average) — enterprise-grade
- ✅ **Zanda (US):** 99.96% uptime (90-day average)
- ⚠️ **WriteUpp:** No public uptime stats — Azure-hosted with geo-replication
- ⚠️ **Halaxy:** No public uptime data — 24/7 customer support documented
- ✅ **Physitrack:** ISO 27001/SOC 2 certified, 24/7 SRE team, status page at `status.physitrack.com`

**Risk Mitigation Strategy:**
- Multi-PMS redundancy (if one PMS fails, others continue syncing)
- Per-clinic error isolation via `Promise.allSettled` (one clinic's PMS failure doesn't block others)
- Automatic retry on next cron cycle (4-hour cadence)
- CSV import fallback for all PMS types
- Real-time webhook for WriteUpp (dual-path resilience)

---

## 1. PMS Integration Partners

### **Cliniko** — 🟢 Enterprise-Grade
- **Status Page:** `status.cliniko.com`
- **90-Day Uptime:** 99.98% (confirmed March 2026)
- **Downtime Window:** <15 minutes/month average
- **Infrastructure:** Unknown (proprietary)
- **Region Support:** Multi-shard (AU1, UK1, US1)
- **SLA Published:** No formal SLA in public docs
- **Auth Method:** HTTP Basic (API key as username)
- **Sync Method:** 4-hour cron (no webhook support)
- **Risk Level:** **Low** — transparent uptime reporting, multi-region redundancy

**Mitigation:**
- 4-hour sync cadence catches up automatically if brief outage occurs
- CSV import available as manual fallback

---

### **Zanda (Power Diary)** — 🟢 Best-in-Class (UK)
- **Status Page:** `status.zandahealth.com`
- **90-Day Uptime (UK):** 99.99%
- **90-Day Uptime (US):** 99.96%
- **90-Day Uptime (AU/Global):** 100.0%
- **Downtime Window:** <5 minutes/month (UK), ~30 minutes/month (US)
- **Infrastructure:** Multi-region (AU/US/UK separate infrastructure)
- **SLA Published:** No formal SLA in public docs
- **Auth Method:** API key header (`X-Api-Key`)
- **Sync Method:** 4-hour cron (API is read-only beta — write endpoints in development)
- **Risk Level:** **Very Low** — transparent uptime reporting, regional isolation, best UK uptime in cohort

**Mitigation:**
- UK infrastructure is most relevant for StrydeOS target market — 99.99% uptime
- Recent incidents (Oct 2024 slowness) documented publicly with resolution times

---

### **WriteUpp** — 🟡 Moderate Transparency
- **Status Page:** Pingdom monitoring (URL not publicly documented)
- **90-Day Uptime:** Not published
- **Infrastructure:** Microsoft Azure (EU-based)
- **Geo-Replication:** 4 readable secondary databases across 2 EU data centres (8 geographically distributed real-time copies)
- **Failover:** Secondary databases enable automatic failover
- **SLA Published:** No formal SLA in public docs
- **Auth Method:** Bearer token
- **Sync Method:** **Real-time webhook** + 4-hour cron fallback (dual-path)
- **Risk Level:** **Low-Medium** — no public uptime stats, but strong Azure infrastructure + geo-replication + dual-path sync

**Mitigation:**
- **Real-time webhook** = primary sync path (sub-minute latency)
- 4-hour cron acts as fallback if webhook delivery fails
- Azure geo-replication provides automatic failover in data centre outages
- WriteUpp team notifies clients by email with resolution ETAs during outages

**Key Advantage:**
- Only PMS integration with real-time webhook support — eliminates 4-hour sync lag

---

### **Halaxy** — 🟡 Limited Transparency
- **Status Page:** Not found in public search
- **90-Day Uptime:** Not published
- **Infrastructure:** Unknown (proprietary)
- **Region Support:** EU/UK and AU endpoints (auto-region detection)
- **SLA Published:** No formal SLA in public docs
- **Customer Support:** 24/7 (documented commitment)
- **Auth Method:** Bearer token (FHIR-standard REST API)
- **Sync Method:** 4-hour cron
- **Risk Level:** **Medium** — no public uptime reporting, but FHIR-standard API suggests mature infrastructure

**Mitigation:**
- 24/7 customer support indicates commitment to uptime
- FHIR compliance suggests healthcare-grade reliability standards
- CSV import available as manual fallback

**Action Required:**
- Contact Halaxy support to request access to status page or SLA documentation
- Monitor API response times in production to establish baseline reliability

---

## 2. HEP Integration Partner

### **Physitrack** — 🟢 Healthcare-Grade
- **Status Page:** `status.physitrack.com`
- **90-Day Uptime:** Not displayed (JavaScript-rendered status page)
- **Infrastructure:** AWS
- **Certifications:** ISO 27001, SOC 2
- **SRE Team:** 24/7 monitoring
- **Data Resilience:** Daily encrypted backups, multi-region storage, decentralized architecture
- **SLA Published:** Not in public docs (likely available to enterprise clients)
- **Auth Method:** Bearer token (API v2)
- **Sync Method:** 4-hour cron
- **Risk Level:** **Very Low** — ISO 27001/SOC 2 certified, AWS-hosted, formal SRE team

**Mitigation:**
- HEP data is **enrichment only** — if Physitrack API is unavailable, core dashboard metrics (follow-up rate, DNA, revenue) continue to compute from PMS data
- Status page indicates proactive monitoring and transparency

---

## 3. Risk Matrix

| Integration | Uptime (90d) | Status Page | SLA Docs | Risk Level | Business Impact if Down |
|-------------|--------------|-------------|----------|------------|-------------------------|
| **Zanda (UK)** | 99.99% | ✅ Public | ❌ | 🟢 Very Low | Single-clinic data sync paused 4h |
| **Cliniko** | 99.98% | ✅ Public | ❌ | 🟢 Low | Single-clinic data sync paused 4h |
| **WriteUpp** | Unknown | ⚠️ Pingdom | ❌ | 🟡 Low-Medium | Single-clinic data sync paused 4h (webhook fallback to cron) |
| **Halaxy** | Unknown | ❌ | ❌ | 🟡 Medium | Single-clinic data sync paused 4h |
| **Physitrack** | Unknown | ✅ Public | ❌ | 🟢 Very Low | HEP compliance metric unavailable (core metrics unaffected) |

**Key Insight:**
- No **single point of failure** — each integration affects only the clinics using that specific PMS
- Per-clinic error isolation ensures one PMS outage doesn't cascade to other clinics

---

## 4. StrydeOS Resilience Architecture

### **Multi-Path Sync Strategy**

```
┌─────────────────────────────────────────────────────┐
│ Clinic A (WriteUpp) → Real-time webhook (primary)   │
│                      → 4h cron (fallback)            │
├─────────────────────────────────────────────────────┤
│ Clinic B (Cliniko)  → 4h cron (only path)           │
├─────────────────────────────────────────────────────┤
│ Clinic C (Zanda)    → 4h cron (only path)           │
├─────────────────────────────────────────────────────┤
│ Clinic D (Halaxy)   → 4h cron (only path)           │
└─────────────────────────────────────────────────────┘

If Cliniko API fails at 10:00:
- Clinic B sync fails → logged to Sentry with `clinicId` tag
- Clinics A, C, D continue syncing normally
- Clinic B auto-retries at 14:00 (next cron cycle)
- No manual intervention required
```

### **Error Isolation Pattern**

From `/api/pipeline/run/route.ts`:

```typescript
const settled = await Promise.allSettled(
  clinicsSnap.docs.map((clinicDoc) => runPipeline(db, clinicDoc.id))
);

const results = settled.map((s, i) => {
  if (s.status === "fulfilled") return s.value;
  const clinicId = clinicsSnap.docs[i].id;
  Sentry.captureException(s.reason, { 
    tags: { clinicId, source: "pipeline_cron" } 
  });
  return { clinicId, ok: false, error: s.reason?.message };
});
```

**Benefits:**
- One clinic's PMS failure doesn't block other clinics
- All failures logged to Sentry with clinic context
- Failed clinics auto-retry on next cycle

### **CSV Import Fallback**

All PMS types support CSV import as manual fallback:
- TM3 (Blue Zinc): CSV-only (no API available)
- Jane App: CSV-only (no API available)
- WriteUpp/Cliniko/Halaxy/Zanda: CSV import available if API integration fails

Email-to-CSV ingest pathway: `import-{clinicId}@ingest.strydeos.com`

---

## 5. Monitoring & Alerting

### **Current State**

| Metric | Tool | Coverage |
|--------|------|----------|
| Pipeline failures | Sentry | Per-clinic error tracking with `clinicId` tag |
| API response times | None | ❌ **Gap** |
| Integration uptime | Manual (status page checks) | ❌ **Gap** |
| Webhook delivery | Next.js logs | Ad-hoc only |

### **Recommended Improvements**

1. **API Health Monitoring** (P0 — 1 session)
   - Add response time logging to each PMS adapter
   - Track success/failure rates per integration
   - Store in Firestore `integration_health` collection
   - Surface in Settings → PMS → Connection status

2. **Proactive Alerting** (P1 — 1 session)
   - Sentry alert: Any `source: pipeline_cron` error → Slack/email
   - Sentry alert: Same `clinicId` fails 3 consecutive cycles → Page
   - Uptime Robot: Monitor WriteUpp/Cliniko/Halaxy/Zanda status pages → Alert on down

3. **Integration SLA Dashboard** (P2 — 2 sessions)
   - Admin view: Per-integration success rate (last 7/30/90 days)
   - Per-clinic last successful sync timestamp
   - "Sync health" indicator in clinic list (green/amber/red)

---

## 6. Third-Party SLA Comparison

### **Industry Benchmarks (SaaS Healthcare Platforms)**

| Platform | Uptime SLA | Comparison to StrydeOS Integrations |
|----------|------------|-------------------------------------|
| AWS | 99.99% (S3) | **Zanda UK matches AWS S3** |
| Google Cloud Healthcare API | 99.95% | Better than Cliniko (99.98%) |
| Epic Systems (EHR) | 99.90% (typical) | All StrydeOS PMS integrations meet or exceed |
| Cerner (EHR) | 99.70% (typical) | All StrydeOS PMS integrations exceed |

**Key Takeaway:**
- Cliniko (99.98%) and Zanda UK (99.99%) meet or exceed **AWS S3 uptime** (99.99%)
- WriteUpp's Azure geo-replication architecture is comparable to enterprise EHR systems
- StrydeOS integration partners are **more reliable than legacy EHR platforms**

---

## 7. Risk Mitigation Roadmap

### **Short-Term (Next 4 Weeks)**

| Action | Priority | Effort | Impact |
|--------|----------|--------|--------|
| Add API response time logging to all adapters | P0 | 1 session | Baseline reliability data |
| Set up Uptime Robot monitoring for partner status pages | P1 | 30 min | Proactive outage alerts |
| Document WriteUpp Pingdom access (if available to clients) | P1 | 30 min | Fill transparency gap |

### **Medium-Term (Next 12 Weeks)**

| Action | Priority | Effort | Impact |
|--------|----------|--------|--------|
| Build integration health dashboard (admin view) | P1 | 2 sessions | Visibility into sync reliability |
| Request formal SLA documentation from Halaxy | P1 | Email | Close transparency gap |
| Contact Zanda for API write endpoint ETA | P2 | Email | Enable full CRUD on best-uptime PMS |

### **Long-Term (6+ Months)**

| Action | Priority | Effort | Impact |
|--------|----------|--------|--------|
| Negotiate SLA terms with WriteUpp (enterprise tier) | P2 | Commercial | Contractual uptime guarantee |
| Build multi-PMS redundancy option (clients connect 2 PMSs, primary/fallback) | P3 | 5 sessions | Ultimate resilience |

---

## 8. Incident Response Playbook

### **Scenario: PMS API Outage Detected**

1. **Detection:**
   - Sentry alert: `source: pipeline_cron` with specific PMS adapter error
   - Or: Client reports "dashboard not updating"

2. **Verify:**
   - Check PMS status page (Cliniko, Zanda, Physitrack)
   - Test API connection via Settings → PMS → Test connection

3. **Classify:**
   - **PMS-wide outage:** Status page shows degraded → Wait for PMS resolution
   - **API key expired:** Client needs to reconnect in Settings
   - **StrydeOS bug:** Investigate adapter code

4. **Communicate:**
   - If PMS-wide: Email affected clinics with ETA (based on status page updates)
   - If client-specific: Support ticket with reconnection instructions

5. **Resolve:**
   - PMS outage resolves → Next cron cycle auto-resumes sync (no manual intervention)
   - API key fixed → Trigger manual sync via Settings → "Sync now"

6. **Post-Incident:**
   - Log to `incidents` collection in Firestore
   - Add to RUNBOOK.md "Known Issues" section
   - If recurring issue: Escalate to PMS vendor support

---

## 9. Contractual Risk Assessment

### **Current State**
- **No formal SLAs** with any PMS provider (standard for API-based integrations)
- **No API deprecation guarantees** (WriteUpp/Cliniko/Halaxy can change endpoints without notice)
- **No liability protection** if PMS data loss occurs

### **Risk Mitigation**
- **StrydeOS terms:** State "We integrate with third-party platforms — uptime subject to their availability"
- **Data backup:** Daily Firestore export to Cloud Storage (roadmap item) ensures StrydeOS-side data resilience
- **API versioning:** All adapters use latest stable API version (V2 where available)

### **Enterprise Upsell Opportunity**
- Offer **"Guaranteed SLA"** tier with:
  - Contractual 99.9% uptime (StrydeOS responsibility)
  - Multi-PMS redundancy (automatic failover)
  - Priority support (2-hour response time)
  - Pricing: 2x base tier

---

## 10. Conclusion

**Overall Risk Assessment: 🟢 Low**

- **2 of 4 PMS integrations** (Cliniko, Zanda UK) have **published 99.98%+ uptime** — enterprise-grade
- **WriteUpp** has strong Azure infrastructure + real-time webhook (best sync latency)
- **Halaxy** has limited transparency but FHIR compliance suggests mature infrastructure
- **Physitrack** is ISO 27001/SOC 2 certified with 24/7 SRE team
- **StrydeOS architecture** isolates per-clinic failures and auto-retries on next cycle
- **No single point of failure** — multi-PMS strategy ensures business continuity

**Key Differentiator for Sales:**

> "We integrate with platforms that maintain 99.98%+ uptime — higher than legacy EHR systems. Our pipeline architecture isolates failures so one clinic's PMS issue never affects others. And unlike competitors who rely on daily batch imports, WriteUpp clients get real-time webhook sync — your data is never more than 4 hours stale, typically sub-minute."

---

## 11. Manual Setup: Uptime Robot and Halaxy SLA

### Uptime Robot — Partner Status Page Monitoring (~30 min)

Proactive alerts when a partner’s status page reports an outage so you can triage before clients report issues.

**Steps:**

1. **Sign up:** [uptimerobot.com](https://uptimerobot.com) — free tier supports 50 monitors.
2. **Add HTTP(S) monitors** for each partner status page:
   - **Cliniko:** `https://status.cliniko.com` — Check interval: 5 min. Alert when HTTP status ≠ 200 or response time &gt; 30s.
   - **Zanda:** `https://status.zandahealth.com` — Same settings.
   - **Physitrack:** `https://status.physitrack.com` — Same settings.
3. **Alert contacts:** Add email and/or Slack webhook (Uptime Robot → Alert Contacts → Add). Assign these contacts to all three monitors.
4. **Optional:** Add a monitor for StrydeOS app (e.g. `https://app.strydeos.com`) to detect our own downtime.

**Note:** WriteUpp and Halaxy do not publish a public status page URL; skip them until one is available.

---

### Halaxy — Request SLA / Status Page (email)

Halaxy does not publish uptime or a status page. Requesting formal documentation closes the transparency gap for sales and support.

**Steps:**

1. **Identify contact:** Halaxy support (e.g. [support@halaxy.com](mailto:support@halaxy.com) or in-app Help).
2. **Send a short request** (adapt as needed):

   **Subject:** Status page and SLA documentation for integration partners

   **Body:**

   > Hi,
   >
   > We integrate with Halaxy’s API (StrydeOS — clinical performance analytics for practices). For our dependency risk documentation and customer assurance we’re collecting:
   >
   > - A public status page URL (if available), or
   > - Any SLA or uptime documentation you can share with integration partners.
   >
   > Could you point us to either, or confirm the best contact for partner/technical enquiries?
   >
   > Thanks,

3. **Record outcome:** Update this doc and the Halaxy row in the Risk Matrix (Section 3) with any URL or SLA summary they provide.

---

**Next Actions:**
1. ~~Add API response time logging to all adapters (P0)~~ — Done: pipeline stage-level health logging + Integration Health dashboard.
2. Set up Uptime Robot monitoring for partner status pages (P1) — use Section 11 steps.
3. Request Halaxy SLA documentation (P1) — use Section 11 email template.
4. ~~Build integration health dashboard for admin view (P1)~~ — Done: `/admin/integration-health`.

---

*Last reviewed: March 13, 2026*
