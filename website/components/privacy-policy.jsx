'use client';

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
};

const pageStyles = `
  @import url("https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap");

  .privacy-page * { box-sizing: border-box; }
  .privacy-page {
    min-height: 100vh;
    background: linear-gradient(180deg, ${C.cream} 0%, ${C.cloudLight} 100%);
    color: ${C.ink};
    font-family: "Outfit", sans-serif;
  }
  .privacy-page .serif { font-family: "DM Serif Display", serif; font-weight: 400; }
  .privacy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  @media (max-width: 900px) {
    .privacy-grid { grid-template-columns: 1fr; }
  }
`;

const MonolithMark = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <defs>
      <linearGradient id="pp-c" x1="0.1" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.58" />
        <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72" />
      </linearGradient>
      <radialGradient id="pp-r" cx="28%" cy="24%" r="60%">
        <stop offset="0%" stopColor="#6AABFF" stopOpacity="0.42" />
        <stop offset="100%" stopColor="#1C54F2" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="pp-t" x1="0.05" y1="1" x2="0.35" y2="0">
        <stop offset="0%" stopColor="white" stopOpacity="0.55" />
        <stop offset="100%" stopColor="white" stopOpacity="0.97" />
      </linearGradient>
      <clipPath id="pp-p">
        <rect x="35" y="20" width="22" height="60" rx="5" />
      </clipPath>
      <clipPath id="pp-a">
        <polygon points="35,52 57,40 57,20 35,20" />
      </clipPath>
    </defs>
    <rect width="100" height="100" rx="24" fill="url(#pp-c)" />
    <rect width="100" height="100" rx="24" fill="url(#pp-r)" />
    <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07" />
    <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.1" />
    <g clipPath="url(#pp-p)">
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
    <rect x="35" y="20" width="22" height="60" rx="5" fill="url(#pp-t)" clipPath="url(#pp-a)" />
    <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round" />
  </svg>
);

const PrincipleCard = ({ title, body }) => (
  <article
    style={{
      background: "white",
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: "20px 20px 18px",
      boxShadow: "0 8px 24px rgba(11,37,69,0.05)",
    }}
  >
    <h2 style={{ color: C.ink, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{title}</h2>
    <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>{body}</p>
  </article>
);

const principles = [
  {
    title: "Purpose limitation",
    body: "We process personal data only for service delivery, analytics to improve care operations, and platform security. We do not collect data that is unnecessary for these purposes.",
  },
  {
    title: "Data minimization",
    body: "StrydeOS is designed to collect the minimum dataset needed to operate clinical performance workflows and reporting. Access to sensitive fields is role-restricted.",
  },
  {
    title: "Security safeguards",
    body: "Personal data is protected by encrypted transport, managed storage encryption, role-based controls, and audit logging to support accountability and incident investigation.",
  },
  {
    title: "Retention and rights",
    body: "Data retention and deletion are governed by policy and contractual requirements. Individuals can request access, correction, portability, or deletion through our contact channel.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <style>{pageStyles}</style>
      <main className="privacy-page">
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
              Privacy Policy
            </span>
          </div>
        </nav>

        <section style={{ maxWidth: 980, margin: "0 auto", padding: "64px 24px 20px" }}>
          <a href="/" style={{ color: C.blue, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
            {"<- Back to StrydeOS"}
          </a>
          <div style={{ marginTop: 18, marginBottom: 24 }}>
            <div
              style={{
                display: "inline-flex",
                padding: "5px 12px",
                borderRadius: 50,
                background: `${C.blue}10`,
                border: `1px solid ${C.blue}22`,
                color: C.blue,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Data Protection
            </div>
            <h1 className="serif" style={{ color: C.navy, fontSize: 48, lineHeight: 1.05, marginBottom: 12 }}>
              Privacy Policy
            </h1>
            <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.75, maxWidth: 760 }}>
              StrydeOS processes personal data to deliver and improve services for private practice clinics. This page
              outlines our principles for collection, use, retention, and individual rights.
            </p>
            <p style={{ marginTop: 12, color: `${C.muted}C0`, fontSize: 12 }}>
              Version 1.0 · Last reviewed March 2026
            </p>
          </div>
        </section>

        <section style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px 24px" }}>
          <div className="privacy-grid">
            {principles.map((item) => (
              <PrincipleCard key={item.title} title={item.title} body={item.body} />
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
            <h2 style={{ color: "white", fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Data Requests</h2>
            <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 14, lineHeight: 1.8, marginBottom: 10 }}>
              If you need access, correction, portability, or deletion support, contact{" "}
              <a href="mailto:hello@strydeos.com" style={{ color: C.blueGlow, textDecoration: "none", fontWeight: 600 }}>
                hello@strydeos.com
              </a>
              .
            </p>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
              Requests are handled in line with applicable UK GDPR obligations.
            </p>
          </div>
        </section>
      </main>
      <CookieBanner />
    </>
  );
}
