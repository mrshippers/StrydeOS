import React from "react";
import { CookieBanner } from "./strydeOS-website.jsx";

const C = {
  navy: "#0B2545",
  navyMid: "#132D5E",
  blue: "#1C54F2",
  blueGlow: "#4B8BF5",
  cream: "#FAF9F7",
  cloudLight: "#F9F8F6",
  ink: "#111827",
  muted: "#6B7280",
  border: "#E2DFDA",
  success: "#059669",
};

const pageStyles = `
  @import url("https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap");

  .policy-page * { box-sizing: border-box; }
  .policy-page {
    min-height: 100vh;
    background: linear-gradient(180deg, ${C.cream} 0%, ${C.cloudLight} 100%);
    color: ${C.ink};
    font-family: "Outfit", sans-serif;
  }
  .policy-page .serif { font-family: "DM Serif Display", serif; font-weight: 400; }
  .policy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .compliance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  @media (max-width: 900px) {
    .policy-grid { grid-template-columns: 1fr; }
    .compliance-grid { grid-template-columns: 1fr; }
  }
`;

const MonolithMark = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <defs>
      <linearGradient id="sp-c" x1="0.1" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.58" />
        <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72" />
      </linearGradient>
      <radialGradient id="sp-r" cx="28%" cy="24%" r="60%">
        <stop offset="0%" stopColor="#6AABFF" stopOpacity="0.42" />
        <stop offset="100%" stopColor="#1C54F2" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="sp-t" x1="0.05" y1="1" x2="0.35" y2="0">
        <stop offset="0%" stopColor="white" stopOpacity="0.55" />
        <stop offset="100%" stopColor="white" stopOpacity="0.97" />
      </linearGradient>
      <clipPath id="sp-p">
        <rect x="35" y="20" width="22" height="60" rx="5" />
      </clipPath>
      <clipPath id="sp-a">
        <polygon points="35,52 57,40 57,20 35,20" />
      </clipPath>
    </defs>
    <rect width="100" height="100" rx="24" fill="url(#sp-c)" />
    <rect width="100" height="100" rx="24" fill="url(#sp-r)" />
    <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07" />
    <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.1" />
    <g clipPath="url(#sp-p)">
      <polyline
        points="32,80 46,72 60,80"
        stroke="white"
        strokeOpacity="0.2"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <polyline
        points="32,72 46,64 60,72"
        stroke="white"
        strokeOpacity="0.42"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <polyline
        points="32,64 46,56 60,64"
        stroke="white"
        strokeOpacity="0.72"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>
    <rect x="35" y="20" width="22" height="60" rx="5" fill="url(#sp-t)" clipPath="url(#sp-a)" />
    <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round" />
  </svg>
);

const PolicyCard = ({ title, body }) => (
  <article
    style={{
      background: "white",
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: "22px 22px 20px",
      boxShadow: "0 8px 24px rgba(11,37,69,0.05)",
    }}
  >
    <h2 style={{ color: C.ink, fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{title}</h2>
    <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>{body}</p>
  </article>
);

const complianceItems = [
  { label: "UK-hosted production infrastructure", sub: "Google Cloud eu-west2 (London)" },
  { label: "Encrypted transport + storage", sub: "TLS in transit and AES-256 at rest" },
  { label: "Role-based access controls", sub: "Access limited by account permissions" },
  { label: "Event and access logging", sub: "Accountability and incident review trails" },
];

const policyCards = [
  {
    title: "Data Residency",
    body: "All production data is hosted in UK infrastructure. StrydeOS does not intentionally move patient-identifiable data outside approved UK hosting regions for routine operations.",
  },
  {
    title: "Encryption & Access Control",
    body: "Data in transit is encrypted using modern TLS standards. Data at rest is encrypted using managed cloud controls. Access follows role-based permissions with authentication and auditable events.",
  },
  {
    title: "Audit Logging & Retention",
    body: "Access and critical security events are logged for accountability. Retention and deletion are controlled through policy-based lifecycle controls and contractual obligations.",
  },
  {
    title: "Incident Response",
    body: "Security events are triaged through a documented response process. Where legally required, notifications are made to relevant supervisory authorities and affected parties within required timeframes.",
  },
];

export default function SecurityPolicyPage() {
  return (
    <>
      <style>{pageStyles}</style>
      <main className="policy-page">
        <nav
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            backdropFilter: "blur(16px)",
            background: "rgba(250,249,247,0.92)",
            borderBottom: `1px solid ${C.border}`,
            padding: "0 24px",
          }}
        >
          <div
            style={{
              maxWidth: 980,
              margin: "0 auto",
              height: 68,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <MonolithMark />
              <div style={{ color: C.navy, fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em" }}>
                Stryde<span style={{ color: C.blue }}>OS</span>
              </div>
            </a>
            <span style={{ color: C.muted, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              Security and Compliance
            </span>
          </div>
        </nav>

        <section style={{ maxWidth: 980, margin: "0 auto", padding: "64px 24px 24px" }}>
          <a href="/" style={{ color: C.blue, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
            {"<- Back to StrydeOS"}
          </a>

          <div style={{ marginTop: 18, marginBottom: 30 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 50,
                background: `${C.success}10`,
                border: `1px solid ${C.success}22`,
                color: C.success,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Verified Security Baseline
            </div>
            <h1 className="serif" style={{ color: C.navy, fontSize: 48, lineHeight: 1.05, marginBottom: 12 }}>
              StrydeOS Data Handling and Security Policy
            </h1>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.75, maxWidth: 760 }}>
              Built for clinical precision with data protection as the baseline. This public policy summarizes our
              operational controls for data residency, encryption, access, incident handling, and retention.
            </p>
            <p style={{ marginTop: 12, color: `${C.muted}C0`, fontSize: 12 }}>
              Effective date: March 2026 · Version 1.0 · Last reviewed: March 2026
            </p>
          </div>

          <div className="compliance-grid" style={{ marginBottom: 22 }}>
            {complianceItems.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: "white",
                }}
              >
                <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                <span style={{ color: C.muted, fontSize: 12 }}>{item.sub}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px 28px" }}>
          <div className="policy-grid">
            {policyCards.map((card) => (
              <PolicyCard key={card.title} title={card.title} body={card.body} />
            ))}
          </div>
        </section>

        <section style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px 84px" }}>
          <div
            style={{
              borderRadius: 16,
              background: `linear-gradient(145deg, ${C.navy} 0%, ${C.navyMid} 100%)`,
              padding: "28px 24px",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 16px 36px rgba(11,37,69,0.25)",
            }}
          >
            <h2 style={{ color: "white", fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Contact and Requests</h2>
            <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 14, lineHeight: 1.8, marginBottom: 10 }}>
              For privacy or security requests, data access inquiries, or policy questions, contact{" "}
              <a href="mailto:hello@strydeos.com" style={{ color: C.blueGlow, textDecoration: "none", fontWeight: 600 }}>
                hello@strydeos.com
              </a>
              .
            </p>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
              StrydeOS Ltd · Private practice clinical performance software
            </p>
          </div>
        </section>
      </main>
      <CookieBanner />
    </>
  );
}
