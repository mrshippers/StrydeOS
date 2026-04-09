/**
 * Spires Physiotherapy seed data for the Ava knowledge base.
 *
 * This file contains clinic-specific data for the dogfood clinic (Spires).
 * It is used ONLY by the seed script (scripts/seed-ava-knowledge.ts) and
 * should never be imported at runtime by the application.
 *
 * For other clinics, knowledge is entered via the Settings > Ava > Knowledge UI
 * and stored in Firestore at clinics/{clinicId}.ava.knowledge[].
 */

import type { KnowledgeEntry } from "./ava-knowledge";

export function seedSpiresKnowledge(): KnowledgeEntry[] {
  const now = new Date().toISOString();

  return [
    // Services
    {
      id: "spires-service-physio",
      category: "services",
      title: "Physiotherapy",
      content: "We're a physiotherapy clinic specialising in musculoskeletal conditions. Our physios work with a wide range of issues including back pain, neck pain, sports injuries, post-surgical rehabilitation, and workplace injuries. All appointments are 45 minutes — both initial assessments and follow-ups.",
      updatedAt: now,
    },
    {
      id: "spires-service-online",
      category: "services",
      title: "Online Consultations",
      content: "We offer online video consultations — same length (45 minutes), same price as in-clinic appointments. Ideal for follow-ups or patients who can't easily travel to the clinic.",
      updatedAt: now,
    },

    // Team
    {
      id: "spires-team-max",
      category: "team",
      title: "Max",
      content: "Senior physiotherapist. Available Monday, Tuesday, Thursday, Friday. Morning slots: 9:00, 9:45, 10:30, 11:15. Afternoon slots: 12:00, 12:45, 13:30, 14:15, 15:00, 15:45, 16:30, 17:15.",
      updatedAt: now,
    },
    {
      id: "spires-team-andrew",
      category: "team",
      title: "Andrew",
      content: "Physiotherapist. Available Tuesday evenings and Saturday (1st Saturday of each month only). Tuesday evening slots: 17:15, 18:00, 18:45. Saturday slots (1st of month only): 9:00, 9:45, 10:30, 11:15.",
      updatedAt: now,
    },
    {
      id: "spires-team-jamal",
      category: "team",
      title: "Jamal",
      content: "Managing Director and physiotherapist. Available Wednesdays only. Morning slots: 9:00, 9:45, 10:30. Afternoon slots: 12:45, 13:30, 14:15, 15:00, 16:30, 17:15, 18:00.",
      updatedAt: now,
    },

    // Location
    {
      id: "spires-location-address",
      category: "location",
      title: "Clinic Address",
      content: "45 Mill Lane, West Hampstead, London NW3 1LB.",
      updatedAt: now,
    },
    {
      id: "spires-location-transport",
      category: "location",
      title: "Nearest Station",
      content: "West Hampstead (Jubilee, Thameslink, and Overground — about 10-12 minutes on foot).",
      updatedAt: now,
    },
    {
      id: "spires-location-parking",
      category: "location",
      title: "Parking",
      content: "Paid on-street parking on Mill Lane — no residents permit required on weekday evenings or weekends.",
      updatedAt: now,
    },

    // Pricing
    {
      id: "spires-pricing-ia",
      category: "pricing",
      title: "Initial Assessment",
      content: "£75 for a 45-minute initial assessment. This is the same whether self-funding or through insurance. We can provide invoices for insurance reimbursement if needed.",
      updatedAt: now,
    },
    {
      id: "spires-pricing-fu",
      category: "pricing",
      title: "Follow-up Appointment",
      content: "£75 for a 45-minute follow-up appointment.",
      updatedAt: now,
    },

    // Policies
    {
      id: "spires-policy-cancellation",
      category: "policies",
      title: "Cancellation Policy",
      content: "We have a 24-hour cancellation policy. If cancelling within 24 hours, we'll try to reschedule rather than charge. If a no-show calls back, rebook warmly — no judgement.",
      updatedAt: now,
    },
    {
      id: "spires-policy-insurance",
      category: "policies",
      title: "Insurance",
      content: "We accept all major health insurers including Bupa, AXA Health, Vitality, Aviva, WPA, and Cigna. Pre-authorisation is handled by our back office before the appointment. We don't discuss coverage amounts on the phone.",
      updatedAt: now,
    },
    {
      id: "spires-policy-children",
      category: "policies",
      title: "Under 16s",
      content: "We treat all ages. Under-16s should attend with a parent or guardian. Book under the child's name but take the parent's contact details.",
      updatedAt: now,
    },

    // FAQs
    {
      id: "spires-faq-wear",
      category: "faqs",
      title: "What to Wear",
      content: "Comfortable clothing that lets the physio access the area being treated. Nothing special needed.",
      updatedAt: now,
    },
    {
      id: "spires-faq-bring",
      category: "faqs",
      title: "What to Bring",
      content: "If you've got any scans, X-rays, or letters from your GP, bring those along or email them to info@spiresphysiotherapy.com beforehand. Otherwise, just yourself.",
      updatedAt: now,
    },
    {
      id: "spires-faq-duration",
      category: "faqs",
      title: "How Long Are Appointments",
      content: "All appointments are 45 minutes — whether it's your first visit or a follow-up.",
      updatedAt: now,
    },
    {
      id: "spires-faq-conditions",
      category: "faqs",
      title: "What Conditions Do You Treat",
      content: "Our physiotherapists work with a wide range of musculoskeletal conditions. If you're not sure whether we can help with your specific concern, one of the team can give you a call back to discuss.",
      updatedAt: now,
    },
  ];
}
