'use client';

import { useState, useEffect } from "react";
import { CookieBanner } from "./strydeOS-website.jsx";
import HeroCarousel from "./HeroCarousel.jsx";
import ModulePricingBanner from "./ModulePricingBanner.jsx";
import AvaConversationCard from "./AvaConversationCard.jsx";

/* ── Brand Tokens ── */
const C = {
  cloudDancer: "#F2F1EE", cloudLight: "#F9F8F6", cream: "#FAF9F7",
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5", teal: "#0891B2",
  ink: "#111827", muted: "#6B7280", success: "#059669", border: "#E2DFDA",
};

/* ── Monolith Mark (canonical — unique IDs per instance) ── */
let _mmId = 0;
const _uid = (p) => `${p}-${++_mmId}`;

const MonolithMark = ({ size = 44 }) => {
  const id       = _uid("m");
  const gCont    = `${id}-c`;
  const gRad     = `${id}-r`;
  const gTopface = `${id}-t`;
  const gRim     = `${id}-m`;
  const gBorder  = `${id}-b`;
  const cPillar  = `${id}-p`;
  const cAbove   = `${id}-a`;
  const small    = size <= 24;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label="StrydeOS">
      <defs>
        <linearGradient id={gCont} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.58"/>
          <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72"/>
        </linearGradient>
        <radialGradient id={gRad} cx="28%" cy="24%" r="60%">
          <stop offset="0%" stopColor="#6AABFF" stopOpacity="0.42"/>
          <stop offset="100%" stopColor="#1C54F2" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={gTopface} x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="white" stopOpacity="0.97"/>
        </linearGradient>
        <linearGradient id={gRim} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0"/>
          <stop offset="28%" stopColor="white" stopOpacity="0.60"/>
          <stop offset="65%" stopColor="white" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={gBorder} x1="0.1" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#7ABBFF" stopOpacity="0.65"/>
          <stop offset="100%" stopColor="#1C54F2" stopOpacity="0.06"/>
        </linearGradient>
        <clipPath id={cPillar}><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
        <clipPath id={cAbove}><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${gCont})`}/>
      <rect width="100" height="100" rx="24" fill={`url(#${gRad})`}/>
      <rect width="100" height="100" rx="24" fill="none" stroke={`url(#${gBorder})`} strokeWidth="1.2"/>
      {!small && (
        <path d="M 17 21 Q 50 12 83 21" stroke={`url(#${gRim})`} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      )}
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10"/>
      <g clipPath={`url(#${cPillar})`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${gTopface})`} clipPath={`url(#${cAbove})`}/>
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"/>
    </svg>
  );
};

/* ── Compare modal data (canonical pricing from module-page) ── */
const tierPrices = {
  solo:   { intelligence: 79,  ava: 149, pulse: 99,  full: 279 },
  studio: { intelligence: 129, ava: 199, pulse: 149, full: 399 },
  clinic: { intelligence: 199, ava: 299, pulse: 229, full: 599 },
};
const tierLabels = { solo: "Solo (1)", studio: "Studio (2\u20135)", clinic: "Clinic (6+)" };

const compareFeatures = [
  { name: "Per-clinician KPI dashboard",      intelligence: true,  ava: false, pulse: false, full: true },
  { name: "90-day rolling trends & alerts",   intelligence: true,  ava: false, pulse: false, full: true },
  { name: "NPS & Google Review pipeline",     intelligence: true,  ava: false, pulse: false, full: true },
  { name: "HEP compliance monitoring",        intelligence: true,  ava: false, pulse: false, full: true },
  { name: "Weekly email digest",              intelligence: true,  ava: false, pulse: false, full: true },
  { name: "24/7 AI inbound call handling",    intelligence: false, ava: true,  pulse: false, full: true },
  { name: "Direct calendar booking",          intelligence: false, ava: true,  pulse: false, full: true },
  { name: "No-show & cancellation recovery",  intelligence: false, ava: true,  pulse: false, full: true },
  { name: "SMS confirmations (500/mo)",       intelligence: false, ava: true,  pulse: false, full: true },
  { name: "Post-session follow-up sequences", intelligence: false, ava: false, pulse: true,  full: true },
  { name: "Dropout prevention triggers",      intelligence: false, ava: false, pulse: true,  full: true },
  { name: "Outcome tracking per patient",     intelligence: false, ava: false, pulse: true,  full: true },
  { name: "Post-discharge check-ins",         intelligence: false, ava: false, pulse: true,  full: true },
  { name: "Referral prompt sequences",        intelligence: false, ava: false, pulse: true,  full: true },
  { name: "PMS integration (read)",           intelligence: true,  ava: true,  pulse: true,  full: true },
  { name: "PMS write-back",                   intelligence: false, ava: true,  pulse: false, full: true },
];

/* ── Hero content ── */
const heroBody = [
  "Every missed call is a new patient lost to the next clinic on Google. Every cancellation that is not recovered becomes avoidable leakage.",
  "Ava handles inbound calls, books into your diary, recovers cancellations before the slot goes empty, and triages new enquiries automatically.",
  "Clinics using Ava have stopped paying \u00A3400\u2013800/month to call-handling services. They\u2019ve also stopped losing patients at the first point of contact.",
];

const howItWorks = [
  "Captures inbound calls and triages intent",
  "Books directly into your existing PMS diary",
  "Triggers confirmations and recovery flows automatically",
];

const benefits = [
  "Fewer missed first contacts",
  "Higher slot fill from recovered cancellations",
  "Lower admin overhead on front desk",
];

const features = [
  "Inbound calls handled 24/7",
  "Books directly into your calendar",
  "Cancellation recovery & no-show chasing",
  "SMS confirmations sent automatically",
  "Emergency routing to on-call clinician",
  "PMS write-back integration",
];

/* ── Check icon ── */
const Check = ({ color = C.blue, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

/* ══════════════════════════════════════════════════════════════════════════ */
/* FULL PAGE                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function AvaPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareTier, setCompareTier] = useState("studio");

  useEffect(() => {
    const saved = localStorage.getItem("strydeos-theme");
    if (saved === "dark") setDarkMode(true);
  }, []);

  const bg     = darkMode ? C.navy : C.cloudDancer;
  const head   = darkMode ? "white" : C.navy;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const txt    = darkMode ? "rgba(255,255,255,0.75)" : C.ink;
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Outfit', sans-serif; -webkit-font-smoothing: antialiased; background: ${C.cloudDancer} !important; }
        .serif { font-family: 'DM Serif Display', serif; }

        /* Glowing orb pulse */
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 8px ${C.blueGlow}, 0 0 20px rgba(28,84,242,0.3); }
          50% { box-shadow: 0 0 12px ${C.blueGlow}, 0 0 32px rgba(28,84,242,0.45); }
        }
        .ava-orb { animation: glow-pulse 2s ease-in-out infinite; }

        /* Hero grid responsive */
        .ava-hero-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 56px;
          align-items: start;
        }
        .ava-carousel-wrap { }
        .ava-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .ava-feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        @media (max-width: 960px) {
          .ava-hero-grid {
            grid-template-columns: 1fr;
            gap: 40px;
          }
          .ava-carousel-wrap {
            max-width: 440px;
            margin: 0 auto;
          }
          .ava-two-col { grid-template-columns: 1fr; }
          .ava-feature-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: bg, transition: "background 0.3s" }}>
        {/* ── NAV ── */}
        <nav style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 24px",
          background: darkMode ? "rgba(11,37,69,0.95)" : "rgba(242,241,238,0.94)",
          backdropFilter: "blur(20px)", borderBottom: `1px solid ${bdr}`,
        }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <MonolithMark size={34} />
              <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 17, color: head, letterSpacing: "-0.02em" }}>
                Stryde<span style={{ color: darkMode ? C.blueGlow : C.blue }}>OS</span>
              </div>
            </a>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => {
                const next = !darkMode;
                setDarkMode(next);
                localStorage.setItem("strydeos-theme", next ? "dark" : "light");
              }} style={{
                background: "none", border: `1.5px solid ${bdr}`, borderRadius: 10,
                width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: head, fontSize: 17,
              }}>
                {darkMode ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>
              <a href="/" style={{ padding: "10px 22px", fontSize: 14, color: head, textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center" }}>&larr; Back to site</a>
            </div>
          </div>
        </nav>

        {/* ── HERO (two-column) ── */}
        <section style={{ padding: "140px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
          <div className="ava-hero-grid">
            {/* Left: text */}
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 14px", borderRadius: 50,
                background: `${C.blue}15`, border: `1px solid ${C.blue}25`,
                color: C.blue, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blue }} />
                AVA
              </div>
              <h1 className="serif" style={{
                fontSize: 52, color: head, fontWeight: 400,
                lineHeight: 1.1, marginBottom: 24, letterSpacing: "-0.5px",
              }}>Never miss a patient again.</h1>
              {heroBody.map((para, i) => (
                <p key={i} style={{ fontSize: 17, color: muted, lineHeight: 1.75, marginBottom: 16, maxWidth: 700 }}>{para}</p>
              ))}
            </div>

            {/* Right: carousel */}
            <div className="ava-carousel-wrap">
              <HeroCarousel />
            </div>
          </div>
        </section>

        {/* ── Ava Conversation Card Demo ── */}
        <section style={{ padding: "80px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: 24, fontWeight: 600, color: head, marginBottom: 12, letterSpacing: "-0.01em" }}>Hear Ava in action</h3>
            <p style={{ fontSize: 14, color: txt, maxWidth: 600 }}>
              Click the monolith to hear a snippet of Ava's voice. She operates 24/7 to handle inbound calls, book appointments, and recover cancelled sessions.
            </p>
          </div>
          <AvaConversationCard />
        </section>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}><hr style={{ border: "none", height: 1, background: bdr }} /></div>

        {/* ── HOW IT WORKS + KEY BENEFITS ── */}
        <section style={{ padding: "60px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
          <div className="ava-two-col">
            <div style={{ background: bgCard, border: `1px solid ${bdr}`, borderRadius: 16, padding: "28px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>How It Works</div>
              {howItWorks.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${C.blue}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.blue, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: 14, color: txt, lineHeight: 1.55 }}>{item}</div>
                </div>
              ))}
            </div>
            <div style={{ background: bgCard, border: `1px solid ${bdr}`, borderRadius: 16, padding: "28px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>Key Benefits</div>
              {benefits.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <Check />
                  <span style={{ fontSize: 14, color: txt }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}><hr style={{ border: "none", height: 1, background: bdr }} /></div>

        {/* ── EVERYTHING INCLUDED ── */}
        <section style={{ padding: "60px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: head, marginBottom: 24 }}>Everything included</h3>
          <div className="ava-feature-grid">
            {features.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
                <Check color={C.success} size={16} />
                <span style={{ fontSize: 14, color: txt }}>{f}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── PRICING ── */}
        <section style={{ padding: "0 24px 100px", maxWidth: 1200, margin: "0 auto" }}>
          <ModulePricingBanner module="ava" onCompare={() => setShowCompare(true)} />
        </section>

        {/* ── COMPARE PLANS MODAL ── */}
        {showCompare && (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 500,
              background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 24,
            }}
            onClick={() => setShowCompare(false)}
          >
            <div
              style={{
                background: darkMode ? C.navy : "white",
                borderRadius: 20, padding: "32px 28px", maxWidth: 720, width: "100%",
                maxHeight: "80vh", overflowY: "auto",
                border: `1px solid ${bdr}`,
                boxShadow: "0 32px 80px rgba(0,0,0,0.3)",
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.blue, marginBottom: 4 }}>Feature Comparison</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: head }}>What&apos;s included in each module</div>
                </div>
                <button
                  onClick={() => setShowCompare(false)}
                  style={{ background: "none", border: "none", fontSize: 24, color: muted, cursor: "pointer", padding: 4, lineHeight: 1 }}
                >&times;</button>
              </div>

              {/* Tier selector for compare */}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
                {Object.keys(tierLabels).map(k => (
                  <button key={k} onClick={() => setCompareTier(k)} style={{
                    padding: "8px 20px", border: "none", cursor: "pointer", borderRadius: 50,
                    fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600,
                    background: compareTier === k ? C.blue : (darkMode ? "rgba(255,255,255,0.06)" : `${C.blue}08`),
                    color: compareTier === k ? "white" : muted,
                    transition: "all 0.25s",
                  }}>{tierLabels[k]}</button>
                ))}
              </div>

              {/* Tier prices row */}
              <div style={{ display: "grid", gridTemplateColumns: "40% 1fr 1fr 1fr 1fr", gap: 0, marginBottom: 16, padding: "12px 0", borderBottom: `1px solid ${bdr}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {tierLabels[compareTier]} pricing
                </div>
                {[
                  { label: "Intelligence", c: "#8B5CF6", p: tierPrices[compareTier].intelligence },
                  { label: "Ava", c: C.blue, p: tierPrices[compareTier].ava },
                  { label: "Pulse", c: C.teal, p: tierPrices[compareTier].pulse },
                  { label: "Full Stack", c: C.blue, p: tierPrices[compareTier].full },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: m.c, marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: head }}>&pound;{m.p}<span style={{ fontSize: 10, fontWeight: 400, color: muted }}>/mo</span></div>
                  </div>
                ))}
              </div>

              {/* Feature rows */}
              {compareFeatures.map((f, i) => (
                <div key={f.name} style={{
                  display: "grid", gridTemplateColumns: "40% 1fr 1fr 1fr 1fr", gap: 0,
                  padding: "8px 0",
                  borderBottom: i < compareFeatures.length - 1 ? `1px solid ${darkMode ? "rgba(255,255,255,0.04)" : "#f0eeea"}` : "none",
                }}>
                  <div style={{ fontSize: 13, color: txt }}>{f.name}</div>
                  {["intelligence", "ava", "pulse", "full"].map(mod => (
                    <div key={mod} style={{ textAlign: "center", fontSize: 14 }}>
                      {f[mod]
                        ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 5-5" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <span style={{ color: darkMode ? "rgba(255,255,255,0.15)" : "#d0cdc7" }}>&mdash;</span>
                      }
                    </div>
                  ))}
                </div>
              ))}

              <div style={{ marginTop: 20, textAlign: "center" }}>
                <a href="/#pricing" style={{ fontSize: 12, color: C.blue, textDecoration: "none", fontWeight: 500 }}>View full pricing page &rarr;</a>
              </div>
            </div>
          </div>
        )}

        {/* ── FOOTER ── */}
        <footer style={{ padding: "32px 24px", borderTop: `1px solid ${bdr}`, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: muted }}>&copy; {new Date().getFullYear()} StrydeOS Ltd. All rights reserved.</div>
        </footer>
      </div>
      <CookieBanner />
    </>
  );
}
