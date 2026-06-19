# Personal Data Breach Notification Runbook (UK GDPR)

> Owner: StrydeOS DPO / founder. Last updated: 2026-06-20.
> Scope: any confirmed or suspected personal data breach affecting StrydeOS
> systems (portal.strydeos.com, outreach.strydeos.com, the Ava voice agent, the
> Firestore data store, or any sub-processor handling clinic or patient data).

StrydeOS acts as a **data processor** for clinic and patient data; each clinic is
the **data controller**. This runbook codifies the statutory clock so the duty is
met in practice, not just on paper. The machine-readable timeframes live in
`dashboard/src/data/compliance-config.ts` (`breachNotification` per jurisdiction)
so the DPIA and product stay in sync with this document.

---

## The clock (UK GDPR Articles 33 and 34)

| Obligation | Deadline | Trigger |
|---|---|---|
| Processor → controller (clinic) notice | **Without undue delay** on becoming aware | Any personal data breach (Art. 33(2)) |
| Controller → ICO notice | **Within 72 hours** of the controller becoming aware | Breach likely to result in a risk to rights and freedoms (Art. 33(1)) |
| Controller → affected individuals | **Without undue delay** | Breach likely to result in a **high** risk to rights and freedoms (Art. 34) |

"Becoming aware" means having a reasonable degree of certainty that a security
incident has compromised personal data. The 72-hour clock starts then, not at
the moment of final root-cause analysis. If the full picture is not yet known,
notify the ICO on a provisional basis within 72 hours and supply details in
phases (Art. 33(4)).

ICO breach line: **0303 123 1113** / report at https://ico.org.uk/for-organisations/report-a-breach/.

---

## Step-by-step

### 0. Detect and triage (hour 0)
- Sources: Sentry alerts, Firestore/audit-log anomalies, a sub-processor notice,
  or a report via `security.txt` (`privacy@strydeos.com`).
- Open an incident record. Stamp the **time of awareness** explicitly — this is
  the start of the 72-hour clock.

### 1. Contain (hours 0–4)
- Revoke compromised credentials/tokens; rotate `MCP_BEARER_SECRET`,
  `STRYDE_ADMIN_SECRET`, and any exposed per-clinic API keys in Doppler.
- Isolate the affected surface. Preserve logs and audit trails — do not wipe.

### 2. Assess scope (hours 0–24)
- Which clinics? Which data categories (identity, contact, clinical notes, HEP,
  call transcripts)? How many data subjects? Special-category (health) data
  raises the likely-risk assessment.
- Determine whether the breach is **likely to result in a risk** (→ ICO) and/or
  a **high risk** (→ individuals).

### 3. Notify the affected clinics — processor duty (without undue delay)
- StrydeOS, as processor, tells each affected clinic (controller) what happened,
  the categories and approximate number of records, likely consequences, and the
  measures taken. This enables the clinic to meet its own 72-hour ICO duty.

### 4. ICO notification (within 72 hours of controller awareness)
Where reportable, the notification must include (Art. 33(3)):
- Nature of the breach, categories and approximate number of data subjects and
  records affected.
- Name and contact details of the DPO / contact point.
- Likely consequences of the breach.
- Measures taken or proposed to address it and mitigate harm.

If outside 72 hours, notify anyway and record the reasons for delay.

### 5. Notify affected individuals (high risk only — without undue delay)
- Clear, plain-language description of the breach, the contact point, likely
  consequences, and mitigation steps for the individual.
- Not required if data was encrypted/unintelligible, if mitigating measures mean
  high risk is no longer likely, or if it would involve disproportionate effort
  (in which case make a public communication instead).

### 6. Record (always)
- Log every breach in the breach register **regardless of whether it was
  reportable**, with facts, effects, and remedial action (Art. 33(5)).
- Retained, PII-free erasure proofs for terminated clinics live in the
  `_erasure_log` Firestore collection; security incidents are tracked in Sentry
  plus the incident record.

### 7. Post-incident review
- Root cause, control gaps, and follow-up actions. Feed material changes back
  into the DPIA and this runbook.

---

## Sub-processors

A breach at a sub-processor is still our breach to assess and escalate. Current
processors handling personal data (see the sub-processor / DPA register in
`docs/`): Google Cloud Platform (Firestore, europe-west2), Resend/SendGrid,
Twilio, ElevenLabs, Sentry, Upstash. On a sub-processor breach notice, run this
runbook from Step 2.

---

## Other jurisdictions (reference)

The same `breachNotification` config carries the equivalent obligations for the
markets StrydeOS may enter:

- **US (HIPAA):** as Business Associate, report breaches of unsecured PHI to the
  Covered Entity within **5 business days**; the Covered Entity then notifies
  individuals and HHS (45 CFR §164.410).
- **AU (OAIC NDB scheme):** assess a suspected eligible breach within **30 days**;
  notify the OAIC and individuals as soon as practicable (Privacy Act Part IIIC).
- **CA (PIPEDA):** report breaches of security safeguards posing a real risk of
  significant harm to the OPC and individuals **as soon as feasible**; retain
  breach records for 24 months (PIPEDA s.10.1).
