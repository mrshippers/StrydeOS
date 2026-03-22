import type { Jurisdiction } from "@/types";

export interface JurisdictionConsentConfig {
  jurisdiction: Jurisdiction;
  label: string;
  consentTitle: string;
  consentBody: string;
  dataProcessingBasis: string;
  healthDataNote: string;
  automatedDecisionDisclosure?: string;
  crossBorderTransferNote?: string;
  baaText?: string;
  privacyHighlights: string[];
}

export const JURISDICTION_CONFIGS: Record<Jurisdiction, JurisdictionConsentConfig> = {
  uk: {
    jurisdiction: "uk",
    label: "United Kingdom / EU",
    consentTitle: "Data Processing Notice",
    consentBody: `StrydeOS processes your clinic data under the lawful basis established by the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.

We process clinic and patient data on the basis of **legitimate interest** for service delivery — specifically, to provide clinical performance analytics, patient retention tools, and AI-powered practice management. You maintain data controller responsibility for all patient health information.

Marketing communications require your explicit consent, which you can withdraw at any time via your account settings.`,
    dataProcessingBasis: "Legitimate interest (service delivery) — GDPR Article 6(1)(f)",
    healthDataNote: "Health data is processed under GDPR Article 9(2)(h) — provision of health or social care treatment, assessment of working capacity, and management of health systems and services.",
    privacyHighlights: [
      "Your patient data remains under your control as the data controller",
      "StrydeOS acts as a data processor on your behalf",
      "All data is stored in the London region (europe-west2)",
      "You have the right to access, rectify, and request deletion of data at any time",
      "Data retention aligns with NHS clinical record retention guidelines (8 years post-discharge)",
    ],
  },

  us: {
    jurisdiction: "us",
    label: "United States",
    consentTitle: "HIPAA Notice of Privacy Practices",
    consentBody: `StrydeOS operates as a Business Associate under the Health Insurance Portability and Accountability Act (HIPAA). By using StrydeOS, you acknowledge that you have reviewed and agree to the Business Associate Agreement, which establishes our obligations regarding Protected Health Information (ePHI).

This service processes ePHI solely for the purpose of providing clinical analytics, patient engagement tools, and practice management functionality. We do not use or disclose ePHI for any purpose not permitted by HIPAA or your Business Associate Agreement.

**Multi-factor authentication is required** for all users accessing ePHI under HIPAA compliance standards.`,
    dataProcessingBasis: "Business Associate Agreement under HIPAA Privacy Rule (45 CFR § 164.502(e))",
    healthDataNote: "All Protected Health Information (ePHI) is encrypted at rest and in transit, stored in HIPAA-compliant infrastructure (GCP us-central1), and subject to comprehensive audit logging.",
    baaText: `# Business Associate Agreement

**Effective Date:** [Date of acceptance]

This Business Associate Agreement ("BAA") is entered into by and between your clinic ("Covered Entity") and StrydeOS Limited ("Business Associate") to satisfy requirements under the Health Insurance Portability and Accountability Act of 1996 ("HIPAA").

## 1. Definitions

All capitalized terms not defined herein shall have the meanings set forth in HIPAA, including the Privacy Rule (45 CFR Part 160 and Part 164, Subparts A and E) and the Security Rule (45 CFR Part 164, Subparts A and C).

## 2. Permitted Uses and Disclosures

Business Associate may use or disclose Protected Health Information (PHI) only to:
- Provide clinical analytics, patient retention tools, and practice management services as specified in the Service Agreement
- Comply with legal obligations
- Perform Business Associate's management and administration functions

Business Associate shall not use or disclose PHI in any manner that would constitute a violation of HIPAA if used or disclosed by Covered Entity.

## 3. Obligations of Business Associate

Business Associate shall:
- Implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of ePHI
- Report to Covered Entity any use or disclosure of PHI not permitted by this BAA within 5 business days of discovery
- Ensure that any subcontractors that create, receive, maintain, or transmit PHI on behalf of Business Associate agree to the same restrictions and conditions
- Make available PHI in accordance with individuals' rights under 45 CFR § 164.524
- Make available PHI for amendment and incorporate any amendments as directed by Covered Entity
- Maintain and make available the information required to provide an accounting of disclosures
- Make internal practices, books, and records relating to PHI available to HHS for compliance determination

## 4. Data Security

Business Associate implements:
- Encryption at rest (AES-256) and in transit (TLS 1.3)
- Multi-factor authentication for all user accounts
- Role-based access controls
- Comprehensive audit logging of all ePHI access
- Annual third-party security assessments
- Incident response procedures compliant with 45 CFR § 164.410

## 5. Breach Notification

Business Associate shall report any breach of unsecured PHI to Covered Entity without unreasonable delay and in no case later than 5 business days after discovery. Notification shall include:
- A description of what happened, including the date of the breach and the date of discovery
- The types of PHI involved
- The identification of individuals affected
- Steps Business Associate has taken to mitigate harm
- Contact procedures for individuals to learn more

## 6. Termination

Upon termination of the Service Agreement, Business Associate shall:
- Return or destroy all PHI received from Covered Entity, or created or received by Business Associate on behalf of Covered Entity
- Retain no copies of PHI
- If return or destruction is not feasible, extend the protections of this BAA to such PHI and limit further uses and disclosures

## 7. Liability and Indemnification

Business Associate shall indemnify and hold harmless Covered Entity from any claims, losses, or damages arising from Business Associate's breach of this BAA or violation of HIPAA.

## 8. Subcontractors

Business Associate currently utilizes the following HIPAA-compliant subcontractors:
- Google Cloud Platform (signed BAA on file)
- Twilio / SendGrid (signed BAA on file)
- ElevenLabs (signed BAA on file)

All subcontractors are required to enter into written agreements that contain terms substantially similar to those in this BAA.

## 9. Miscellaneous

This BAA shall be governed by and construed in accordance with the laws of the jurisdiction in which Covered Entity is located. Any amendments to HIPAA that affect Business Associate's obligations shall automatically be incorporated into this BAA.

---

**By clicking "I Accept", you acknowledge that you have read, understood, and agree to be bound by this Business Associate Agreement.**`,
    privacyHighlights: [
      "StrydeOS is your HIPAA-compliant Business Associate",
      "All ePHI is encrypted at rest and in transit",
      "Multi-factor authentication is required for all users",
      "Comprehensive audit logs track all ePHI access",
      "Data stored in HIPAA-compliant GCP infrastructure (us-central1)",
      "Breach notification within 5 business days per HIPAA requirements",
    ],
  },

  au: {
    jurisdiction: "au",
    label: "Australia",
    consentTitle: "Privacy Consent — Australian Privacy Principles",
    consentBody: `StrydeOS collects and processes health information with your explicit consent under the Australian Privacy Principles (APPs) established by the Privacy Act 1988 (Cth).

**Health information** includes patient names, contact details, appointment records, treatment notes, home exercise programme data, and clinical outcome measures. Under APP 3, health information is classified as **sensitive information** and requires explicit consent for collection and use.

By proceeding, you explicitly consent to StrydeOS collecting, using, and disclosing health information for the purpose of:
- Providing clinical performance analytics and insights
- Facilitating patient retention and engagement tools
- Enabling AI-powered practice management functionality`,
    dataProcessingBasis: "Explicit consent under Australian Privacy Principle 3 (APP 3) — Collection of solicited personal information",
    healthDataNote: "Sensitive information (health information) is collected and handled in accordance with APP 3.3 and APP 3.4, which require explicit consent and lawful necessity.",
    automatedDecisionDisclosure: `### Automated Decision-Making Disclosure (APP 1.3)

From December 2026, APP entities must disclose where computer programs use personal information to make automated decisions that could significantly affect individuals' rights or interests.

**StrydeOS uses automated decision-making in the following ways:**

1. **Pulse — Churn Risk Scoring**
   - Uses patient appointment history, rebooking patterns, and HEP compliance data to predict dropout likelihood
   - Determines which patients receive retention outreach sequences
   - Does not make clinical treatment decisions

2. **Ava — Call Routing & Prioritisation**
   - Uses patient data (appointment history, urgency flags, insurance status) to prioritise and route inbound calls
   - Determines call handling priority and clinician assignment
   - Does not make clinical treatment decisions

Both systems support human review and override. Clinic owners and clinicians can adjust retention sequences and call routing rules at any time. Patients can opt out of automated outreach via account settings or by contacting the clinic directly.`,
    privacyHighlights: [
      "Your clinic is the APP entity responsible for patient health information",
      "StrydeOS acts as a contracted service provider under APP 8",
      "Data stored in Australian region infrastructure (australia-southeast1)",
      "You must provide a compliant APP Privacy Policy on your clinic website",
      "Patients have the right to access and correct their information (APP 12 & 13)",
      "Automated decisions (churn risk, call routing) are disclosed and subject to human override",
    ],
  },

  ca: {
    jurisdiction: "ca",
    label: "Canada",
    consentTitle: "Consent for Collection and Use of Personal Health Information",
    consentBody: `StrydeOS collects, uses, and discloses personal health information with your express consent under the Personal Information Protection and Electronic Documents Act (PIPEDA) and applicable provincial health information privacy legislation.

**Express consent** means you have been clearly informed of the purposes for which your information will be used, and you have voluntarily agreed. For sensitive health information, consent must be explicit and cannot be implied.

By proceeding, you expressly consent to StrydeOS:
- Collecting patient health information (names, contact details, appointments, treatment records, clinical notes) on your behalf
- Using this information to provide clinical analytics, performance insights, and patient engagement tools
- Storing and processing this information in secure cloud infrastructure`,
    dataProcessingBasis: "Express consent under PIPEDA Principle 4.3 — Consent, and provincial health information privacy acts where applicable",
    healthDataNote: "Personal health information is processed in accordance with PIPEDA's ten fair information principles, including accountability, identifying purposes, consent, limiting collection, limiting use/disclosure/retention, accuracy, safeguards, openness, individual access, and challenging compliance.",
    crossBorderTransferNote: `### Cross-Border Data Transfer (PIPEDA Principle 4.1.3)

StrydeOS stores Canadian clinic data in Google Cloud Platform's **us-central1** region (Iowa, United States). While PIPEDA does not require data residency within Canada, organizations transferring personal information outside Canada must ensure comparable protection.

**Safeguards in place:**
- Google Cloud Platform is certified under the NIST Cybersecurity Framework and ISO 27001
- Data is encrypted at rest (AES-256) and in transit (TLS 1.3)
- Contractual protections with all cloud service providers documented
- Access restricted to authorized personnel only
- Your clinic retains data ownership and control

Canadian clinics serving Quebec patients should note that Quebec's Law 25 imposes stricter requirements, including mandatory privacy officers and Privacy Impact Assessments for high-risk activities. If you serve Quebec patients, please consult legal counsel regarding additional obligations.`,
    privacyHighlights: [
      "Your clinic is the organization responsible for patient personal health information under PIPEDA",
      "Express consent is required for collecting and using sensitive health data",
      "StrydeOS acts as a contracted service provider on your behalf",
      "Data stored in US region infrastructure with documented contractual protections",
      "You must designate a privacy officer responsible for PIPEDA compliance",
      "Patients have the right to access their information and challenge accuracy (Principles 9 & 10)",
      "Quebec clinics: additional obligations apply under Law 25",
    ],
  },
};

export function getJurisdictionConfig(jurisdiction: Jurisdiction): JurisdictionConsentConfig {
  return JURISDICTION_CONFIGS[jurisdiction];
}

export function deriveJurisdictionFromCountry(countryCode: string): Jurisdiction {
  const normalized = countryCode.toLowerCase();
  
  if (normalized === "us" || normalized === "usa" || normalized === "united states") {
    return "us";
  }
  
  if (normalized === "au" || normalized === "aus" || normalized === "australia") {
    return "au";
  }
  
  if (normalized === "ca" || normalized === "can" || normalized === "canada") {
    return "ca";
  }
  
  return "uk";
}
