import FAQPage from "../../components/faq";

export const metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about StrydeOS: pricing, integrations, setup, and how it works for private practice clinics.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ | StrydeOS",
    description:
      "Frequently asked questions about StrydeOS: pricing, integrations, setup, and how it works for private practice clinics.",
    url: "https://strydeos.com/faq",
    images: ["/brand/og-card.png"],
  },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What data does StrydeOS actually need from my PMS?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We pull appointment data, clinician schedules, and patient contact preferences — nothing clinical. Your PMS stays your system of record. StrydeOS reads from it; we never write back or modify anything. Most integrations take under 10 minutes to connect."
      }
    },
    {
      "@type": "Question",
      "name": "Will this replace my practice management system?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No — and that’s by design. StrydeOS sits above your PMS, the same way macOS sits above your apps. We connect to your existing tools (Cliniko, WriteUpp, and more) and surface the performance insights they can’t. You keep everything you already use."
      }
    },
    {
      "@type": "Question",
      "name": "What’s the onboarding process like?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We start with a free Clinical Performance Audit — a 20-minute call where we review your follow-up rate, HEP compliance, utilisation, and DNA rate against benchmarks using your existing PMS data. If there’s a fit, onboarding takes less than a day. Most clinics are live within hours of connecting their PMS."
      }
    },
    {
      "@type": "Question",
      "name": "Is there a contract or lock-in?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No lock-in. Monthly rolling billing, cancel any time. We’d rather earn your continued use than trap you into it. Your data stays yours — if you leave, we delete everything."
      }
    },
    {
      "@type": "Question",
      "name": "How is my data protected?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "All data is encrypted in transit and at rest on UK-hosted infrastructure. We’re GDPR-compliant, and we’ll sign a Data Processing Agreement before any patient-adjacent data flows through the platform. No data is sold or shared — ever."
      }
    },
    {
      "@type": "Question",
      "name": "Can I see my own performance data?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Every clinician gets a personal dashboard showing their follow-up rate, HEP compliance, programme assignment rate, and patient feedback scores. It’s designed to help you improve — not to micromanage. Think of it as a mirror, not a report card."
      }
    },
    {
      "@type": "Question",
      "name": "Does Ava sound robotic to patients?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Ava uses cloned voice technology trained on real human speech patterns. She handles greetings, bookings, and triage with natural conversation flow. Patients regularly don’t realise they’re speaking with an AI receptionist — that’s the benchmark we hold ourselves to."
      }
    },
    {
      "@type": "Question",
      "name": "What if a patient needs to speak to a real person?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Ava detects when a patient needs human support — clinical queries, distressed callers, or complex requests — and routes them to your team immediately. She’s a first responder, not a gatekeeper. Emergency calls are always escalated instantly."
      }
    },
    {
      "@type": "Question",
      "name": "Which PMS platforms do you integrate with?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We currently have live integrations with major PMS platforms including self-serve connections. For platforms without a public API, we support secure CSV import with automatic schema detection and duplicate prevention. New integrations are being added based on customer demand."
      }
    },
    {
      "@type": "Question",
      "name": "Can I white-label StrydeOS for my clinic group?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Not yet — but it’s on the roadmap. Multi-site clinic groups are a natural fit for StrydeOS. If you’re running 3+ locations and want to explore this, reach out and we’ll scope it together."
      }
    },
    {
      "@type": "Question",
      "name": "How does pricing work for larger teams?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each module — Intelligence, Ava, and Pulse — prices independently, so you only pay for what you use. The Full Stack bundle saves roughly 20% versus buying separately. Volume pricing for clinic groups is available on request."
      }
    },
    {
      "@type": "Question",
      "name": "Is there an API I can build on?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Not yet publicly. We’re building StrydeOS as a platform, and API access for integration partners is part of the roadmap. If you’re a PMS vendor or complementary tool looking to integrate, we’d love to hear from you."
      }
    }
  ]
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <FAQPage />
    </>
  );
}
