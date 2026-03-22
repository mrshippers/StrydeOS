/**
 * Email templates for Subject Access Request (SAR) workflow
 */

export interface SarEmailTemplate {
  subject: string;
  body: string;
}

export const SAR_ACKNOWLEDGEMENT_TEMPLATE: SarEmailTemplate = {
  subject: "Data Request Received — StrydeOS",
  body: `Hello,

We have received your request regarding your personal data held by StrydeOS.

Request Details:
- Type: {{REQUEST_TYPE}}
- Received: {{RECEIVED_DATE}}
- Reference: {{REQUEST_ID}}

We will respond to your request within 30 days as required by applicable data protection regulations. Our response deadline is {{DEADLINE_DATE}}.

If you have any questions about your request, please contact us at privacy@strydeos.com quoting your reference number.

Thank you,
StrydeOS Privacy Team

---
StrydeOS Limited
privacy@strydeos.com`,
};

export const SAR_COMPLETION_ACCESS_TEMPLATE: SarEmailTemplate = {
  subject: "Data Export Ready — StrydeOS",
  body: `Hello,

Your data access request has been completed.

Request Details:
- Type: Data Access
- Reference: {{REQUEST_ID}}
- Completed: {{COMPLETED_DATE}}

Your personal data export is attached to this email as a JSON file. This export contains all personal information we hold about you in our systems.

The export includes:
- Patient profile information
- Appointment records
- Communication logs
- Clinical outcome scores
- Any other personal data associated with your records

If you have any questions about the data provided or need clarification on any items, please contact us at privacy@strydeos.com.

Thank you,
StrydeOS Privacy Team

---
StrydeOS Limited
privacy@strydeos.com`,
};

export const SAR_COMPLETION_DELETION_TEMPLATE: SarEmailTemplate = {
  subject: "Data Deletion Request Processed — StrydeOS",
  body: `Hello,

Your data deletion request has been processed.

Request Details:
- Type: Data Deletion
- Reference: {{REQUEST_ID}}
- Processed: {{COMPLETED_DATE}}
- Grace Period Ends: {{GRACE_PERIOD_END}}

Your personal data has been marked for deletion from our systems. A 30-day grace period is in effect to allow for account recovery if this was requested in error.

After {{GRACE_PERIOD_END}}, your data will be:
- Permanently deleted from active systems
- Removed from all backups within 90 days
- Unrecoverable

If you wish to cancel this deletion request before the grace period ends, please contact us immediately at privacy@strydeos.com quoting your reference number.

Thank you,
StrydeOS Privacy Team

---
StrydeOS Limited
privacy@strydeos.com`,
};

export const SAR_COMPLETION_CORRECTION_TEMPLATE: SarEmailTemplate = {
  subject: "Data Correction Request Completed — StrydeOS",
  body: `Hello,

Your data correction request has been completed.

Request Details:
- Type: Data Correction
- Reference: {{REQUEST_ID}}
- Completed: {{COMPLETED_DATE}}

The corrections you requested have been applied to your records in our system. The updated information is now reflected across all relevant data points.

If you notice any remaining inaccuracies or have additional corrections to request, please contact us at privacy@strydeos.com.

Thank you,
StrydeOS Privacy Team

---
StrydeOS Limited
privacy@strydeos.com`,
};

export function renderSarEmailTemplate(
  template: SarEmailTemplate,
  data: {
    requestType?: string;
    requestId: string;
    receivedDate?: string;
    deadlineDate?: string;
    completedDate?: string;
    gracePeriodEnd?: string;
  }
): SarEmailTemplate {
  let body = template.body;
  const subject = template.subject;

  if (data.requestType) body = body.replace("{{REQUEST_TYPE}}", data.requestType);
  if (data.requestId) body = body.replace(/{{REQUEST_ID}}/g, data.requestId);
  if (data.receivedDate) body = body.replace("{{RECEIVED_DATE}}", data.receivedDate);
  if (data.deadlineDate) body = body.replace("{{DEADLINE_DATE}}", data.deadlineDate);
  if (data.completedDate) body = body.replace(/{{COMPLETED_DATE}}/g, data.completedDate);
  if (data.gracePeriodEnd) body = body.replace(/{{GRACE_PERIOD_END}}/g, data.gracePeriodEnd);

  return { subject, body };
}
