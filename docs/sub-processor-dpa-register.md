# Sub-Processor DPA Register

> StrydeOS Limited — Data Processing Agreement tracker for all third-party sub-processors.
> Last reviewed: 2026-03-27

StrydeOS acts as a **data processor** on behalf of clinic customers (data controllers). Under UK GDPR Article 28, we must have a Data Processing Agreement (DPA) in place with every sub-processor that handles personal data on our behalf.

---

## Register

### 1. Google Cloud Platform (Firebase)

| Field | Detail |
|-------|--------|
| **Service** | Firestore, Firebase Auth, Cloud Functions, Cloud Storage |
| **Data processed** | Patient records, appointment data, clinician profiles, auth credentials, clinic configuration |
| **Data categories** | Health data (Art. 9), personal identifiers, contact details |
| **Processing location** | `europe-west2` (London) — primary region |
| **DPA URL** | https://cloud.google.com/terms/data-processing-addendum |
| **DPA type** | Auto-incorporated into Cloud Terms of Service |
| **UK GDPR coverage** | Yes — EU SCCs + UK-specific transfer mechanisms (Appendix 3) |
| **Sub-processor list** | https://cloud.google.com/terms/subprocessors |
| **Certifications** | ISO 27001, SOC 2/3, ISO 27017, ISO 27018 |
| **Deletion period** | 180 days maximum post-termination |
| **Status** | **ACTIVE** |
| **Action required** | None — auto-incorporated |

---

### 2. Twilio (Telephony + SendGrid)

| Field | Detail |
|-------|--------|
| **Service** | SIP trunking for Ava voice module, SMS (future), SendGrid email delivery |
| **Data processed** | Phone numbers, call metadata, call recordings (Ava), email addresses, email content |
| **Data categories** | Personal identifiers, communication content |
| **Processing location** | US (primary), with EU/UK edge infrastructure |
| **DPA URL** | https://www.twilio.com/en-us/legal/data-protection-addendum |
| **DPA type** | Auto-incorporated into service agreement |
| **UK GDPR coverage** | Yes — EU SCCs (Modules 1, 2, 3) + UK International Data Transfer Addendum |
| **Sub-processor list** | https://www.twilio.com/legal/sub-processors |
| **Change notification** | 30 days (infrastructure), 10 days (other), with objection rights |
| **Certifications** | SOC 2 Type 2, ISO 27001, PCI DSS |
| **Retention** | SendGrid: 1 year post-termination; standard Twilio: 60 days |
| **Status** | **ACTIVE** |
| **Action required** | None — auto-incorporated |

---

### 3. ElevenLabs (Conversational AI Agents)

| Field | Detail |
|-------|--------|
| **Service** | ElevenLabs Conversational AI Agents — powers Ava voice module |
| **Data processed** | Agent configuration, call routing metadata. **No patient data is sent to ElevenLabs** — voice interactions are telephony-layer only (Twilio SIP → ElevenLabs agent). Patient records, clinical data, and health information stay in Firebase/StrydeOS. |
| **Data categories** | Technical identifiers, call metadata (phone numbers, timestamps, duration) |
| **Processing location** | US/EU (verify current routing) |
| **DPA URL** | https://elevenlabs.io/dpa |
| **DPA type** | Verify in browser (client-rendered page) |
| **UK GDPR coverage** | Verify — EU-headquartered (Poland/UK offices), GDPR compliance expected |
| **Sub-processor list** | Verify via DPA page |
| **Risk level** | **Low** — no health data processed. Phone numbers and call metadata are the only personal data. |
| **Status** | **VERIFY** |
| **Action required** | Open DPA URL in browser, confirm terms cover call metadata processing under UK GDPR. Low urgency — no Art. 9 data involved. |

---

### 4. Stripe

| Field | Detail |
|-------|--------|
| **Service** | Payment processing, subscription billing, checkout |
| **Data processed** | Cardholder names, email addresses, billing addresses, payment card data (tokenised) |
| **Data categories** | Personal identifiers, financial data |
| **Processing location** | EU (Stripe Payments Europe Limited for non-Americas customers) |
| **DPA URL** | https://stripe.com/gb/legal/dpa |
| **DPA type** | Standard DPA, PDF download available |
| **UK GDPR coverage** | Yes — EU SCCs (Modules 1, 2) + UK International Data Transfer Addendum |
| **Sub-processor list** | https://stripe.com/legal/service-providers |
| **Change notification** | 30 days advance notice, email subscription available |
| **Certifications** | PCI Level 1, SOC 1/2, ISO 27001, AES-256 encryption |
| **Breach notification** | 48 hours for GDPR-affected data |
| **Status** | **ACTIVE** |
| **Action required** | Download and retain a copy of the GB DPA for records |

---

### 5. Resend

| Field | Detail |
|-------|--------|
| **Service** | Transactional email delivery (invite emails, notifications, sequences) |
| **Data processed** | Email addresses, email content, delivery metadata |
| **Data categories** | Personal identifiers, communication content |
| **Processing location** | US |
| **DPA URL** | https://resend.com/legal/dpa |
| **DPA type** | Click-through, binding upon entering the Agreement |
| **UK GDPR coverage** | Yes — EU SCCs (Module 2) + UK Data Protection Act 2018 reference |
| **Sub-processor list** | https://resend.com/legal/subprocessors |
| **Change notification** | 14 days advance notice |
| **Deletion period** | 90 days post account termination |
| **Certifications** | EU-U.S. Data Privacy Framework |
| **Status** | **ACTIVE** |
| **Action required** | None — click-through DPA in effect |

---

### 6. Heidi Health

| Field | Detail |
|-------|--------|
| **Service** | Clinical documentation / AI scribe (data enrichment layer) |
| **Data processed** | Clinical notes, consultation transcripts, patient identifiers |
| **Data categories** | Health data (Art. 9), personal identifiers |
| **Processing location** | Australia (primary) — verify UK/EU routing |
| **DPA URL** | https://www.heidihealth.com/data-processing-agreement |
| **DPA type** | Verify in browser (client-rendered page) |
| **UK GDPR coverage** | Verify — AU-based company, UK GDPR adequacy may require direct enquiry |
| **Sub-processor list** | Verify via DPA page |
| **Status** | **ACTION REQUIRED** |
| **Action required** | Open DPA URL in browser, review terms. Confirm: (1) UK GDPR coverage exists, (2) data residency for UK clinic data, (3) health data processing safeguards. If UK GDPR coverage is absent, request a bespoke DPA or addendum. Contact their legal/privacy team. |

---

### 7. Sentry

| Field | Detail |
|-------|--------|
| **Service** | Error monitoring, performance monitoring, session replay |
| **Data processed** | Error stack traces (may contain PII), IP addresses, user agent strings, session data |
| **Data categories** | Personal identifiers, technical identifiers |
| **Processing location** | EU (signing up to EU instance — data stays in EU) |
| **DPA URL** | https://sentry.io/legal/dpa/ |
| **DPA type** | Click-through via Zendesk |
| **Signing instructions** | https://sentry.zendesk.com/hc/en-us/articles/23856572755611 |
| **UK GDPR coverage** | Yes — EU SCCs (Modules 2, 3) + UK International Data Transfer Addendum. EU data residency eliminates cross-border transfer concerns. |
| **Sub-processor list** | https://sentry.io/legal/subprocessors/ (RSS feed available) |
| **Change notification** | 30 days advance written notice with objection rights |
| **Restriction** | Sensitive/special category data (Art. 9) is **prohibited** — ensure PII scrubbing is configured |
| **Status** | **SIGN ON SETUP** |
| **Action required** | Sign the DPA when setting up the EU Sentry instance. Configure SDK data scrubbing to strip any patient identifiers from error reports. |

---

### 8. Vercel

| Field | Detail |
|-------|--------|
| **Service** | Frontend hosting, serverless functions, edge network, build pipeline |
| **Data processed** | HTTP request/response data, function logs, deployment metadata, visitor IP addresses |
| **Data categories** | Personal identifiers, technical identifiers |
| **Processing location** | US (primary), global edge network |
| **DPA URL** | https://vercel.com/legal/dpa |
| **DPA type** | Auto-incorporated into Agreement |
| **UK GDPR coverage** | Yes — EU SCCs (2021, Module 2) + UK IDTA (Schedule 5) |
| **Sub-processor list** | https://security.vercel.com (Vercel Trust Center) |
| **Change notification** | 5-day objection window (shorter than industry standard) |
| **Certifications** | SOC 2 Type 2, ISO 27001, PCI DSS, HIPAA |
| **Deletion period** | "Commercially reasonable timeframe" post-termination |
| **Status** | **ACTIVE** |
| **Action required** | Subscribe to sub-processor change notifications via privacy@vercel.com. Note the short 5-day objection window. |

---

## Summary

| Provider | Role | DPA Status | Health Data? | Action |
|----------|------|------------|--------------|--------|
| Google/Firebase | Database, auth, infra | Active (auto) | Yes | None |
| Twilio/SendGrid | Telephony, email | Active (auto) | No | None |
| ElevenLabs | Voice AI (Ava) | **Verify** | No (metadata only) | Low priority — confirm DPA covers call metadata |
| Stripe | Payments | Active (download) | No | Retain GB DPA copy |
| Resend | Transactional email | Active (click-through) | No | None |
| Heidi Health | Clinical docs | **Verify** | Yes | Review DPA, confirm UK GDPR coverage |
| Sentry | Error monitoring | **Sign on setup** | No (must scrub) | Sign DPA when setting up EU instance |
| Vercel | Hosting, compute | Active (auto) | No | Subscribe to sub-processor notifications |

---

## Immediate Actions

1. **Heidi Health** — Open https://www.heidihealth.com/data-processing-agreement in browser, confirm UK GDPR adequacy. AU-based company handling health data — highest priority to verify.
2. **Sentry** — Sign the DPA when setting up the EU instance. Configure SDK data scrubbing to strip patient identifiers from error reports.
3. **Stripe** — Download and file the GB DPA PDF for your compliance records.
4. **Vercel** — Email privacy@vercel.com to subscribe to sub-processor change notifications (5-day objection window is tight).
5. **ElevenLabs** — Low priority. No patient data sent — only call metadata (phone numbers, timestamps). Confirm DPA covers this when convenient.

---

## Review Schedule

This register should be reviewed **quarterly** or when:
- A new sub-processor is added
- An existing sub-processor changes their DPA terms
- A sub-processor change notification is received
- StrydeOS expands into a new jurisdiction

Next review due: **2026-06-27**

---

## Notes

- This register covers sub-processors that handle personal data. Development tools that do not process customer/patient data (e.g., GitHub for source code only) are excluded.
- Heidi Health is positioned as a data enrichment layer, not a core processor. If Heidi never receives patient-identifiable data (only anonymised clinical notes), the DPA requirement may be reduced — but confirm with legal counsel.
- US BAA requirements (compliance-config.ts) are not yet relevant — UK-only for now. Revisit when expanding to US market.
