'use client';

import { useState, useEffect } from "react";
import { CookieBanner } from "./strydeOS-website.jsx";
import ModulePricingBanner from "./ModulePricingBanner.jsx";

const C = {
  cloudDancer: "#F2F1EE", cloudLight: "#F9F8F6", cream: "#FAF9F7",
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5", teal: "#0891B2",
  ink: "#111827", muted: "#6B7280", success: "#059669", border: "#E2DFDA",
};

const tierPrices = {
  solo:   { intelligence: 79,  ava: 149, pulse: 99,  full: 279 },
  studio: { intelligence: 129, ava: 199, pulse: 149, full: 399 },
  clinic: { intelligence: 199, ava: 299, pulse: 229, full: 599 },
};
const tierLabels = { solo: "Solo (1)", studio: "Studio (2–5)", clinic: "Clinic (6+)" };

// Feature comparison table data (from canonical pricing breakdown)
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

export default function ModulePage({ id, name, color, headline, body, howItWorks, benefits, features }) {
  const [darkMode, setDarkMode] = useState(false);
  const [tier, setTier] = useState("studio");
  const [showCompare, setShowCompare] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("strydeos-theme");
    if (saved === "dark") setDarkMode(true);
  }, []);

  const bg = darkMode ? C.navy : C.cloudDancer;
  const head = darkMode ? "white" : C.navy;
  const muted = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const txt = darkMode ? "rgba(255,255,255,0.75)" : C.ink;
  const bdr = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Outfit', sans-serif; -webkit-font-smoothing: antialiased; }
        .serif { font-family: 'DM Serif Display', serif; }
        .btn-primary { display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; border-radius: 50px; background: ${C.blue}; color: white; font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 15px; text-decoration: none; transition: all 0.25s; border: none; cursor: pointer; }
        .btn-primary:hover { filter: brightness(1.12); }
        .btn-outline { display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; border-radius: 50px; background: transparent; color: ${C.blue}; font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 15px; text-decoration: none; border: 1.5px solid ${C.border}; transition: all 0.25s; cursor: pointer; }
      `}</style>
      <div style={{ minHeight: "100vh", background: bg, transition: "background 0.3s" }}>
        {/* Sticky nav */}
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 24px", background: darkMode ? "rgba(11,37,69,0.95)" : "rgba(242,241,238,0.94)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${bdr}` }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 17, color: head, letterSpacing: "-0.02em" }}>
                Stryde<span style={{ color: darkMode ? C.blueGlow : C.blue }}>OS</span>
              </div>
            </a>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setDarkMode(d => !d)} style={{ background: "none", border: `1.5px solid ${bdr}`, borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: head, fontSize: 17 }}>
                {darkMode ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )}
              </button>
              <a href="/" style={{ padding: "10px 22px", fontSize: 14, color: head, textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center" }}>← Back to site</a>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ padding: "140px 24px 80px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 50, background: `${color}15`, border: `1px solid ${color}25`, color, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
            {name}
          </div>
          <h1 className="serif" style={{ fontSize: 52, color: head, fontWeight: 400, lineHeight: 1.1, marginBottom: 24 }}>{headline}</h1>
          {body.split("\n\n").map((para, i) => (
            <p key={i} style={{ fontSize: 17, color: muted, lineHeight: 1.75, marginBottom: 16, maxWidth: 700 }}>{para}</p>
          ))}
        </section>

        {/* How it works + Benefits */}
        <section style={{ padding: "60px 24px 80px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div style={{ background: bgCard, border: `1px solid ${bdr}`, borderRadius: 16, padding: "28px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color, marginBottom: 16 }}>How It Works</div>
              {howItWorks.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: 14, color: txt, lineHeight: 1.55 }}>{item}</div>
                </div>
              ))}
            </div>
            <div style={{ background: bgCard, border: `1px solid ${bdr}`, borderRadius: 16, padding: "28px 24px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color, marginBottom: 16 }}>Key Benefits</div>
              {benefits.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6.5" fill={`${color}15`}/><path d="M4.5 7.5l2 2 4-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: 14, color: txt }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features list */}
        <section style={{ padding: "0 24px 80px", maxWidth: 900, margin: "0 auto" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: head, marginBottom: 24 }}>Everything included</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3 3 5-5" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: 14, color: txt }}>{f}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing banner */}
        <section style={{ padding: "0 24px 100px", maxWidth: 900, margin: "0 auto" }}>
          <ModulePricingBanner module={id} onCompare={() => setShowCompare(true)} />
        </section>

        {/* Compare plans modal */}
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
                  <div style={{ fontSize: 18, fontWeight: 600, color: head }}>What's included in each module</div>
                </div>
                <button
                  onClick={() => setShowCompare(false)}
                  style={{
                    background: "none", border: "none", fontSize: 24, color: muted,
                    cursor: "pointer", padding: 4, lineHeight: 1,
                  }}
                >×</button>
              </div>

              {/* Tier prices row */}
              <div style={{ display: "grid", gridTemplateColumns: "40% 1fr 1fr 1fr 1fr", gap: 0, marginBottom: 16, padding: "12px 0", borderBottom: `1px solid ${bdr}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {tierLabels[tier]} pricing
                </div>
                {[
                  { label: "Intelligence", c: "#8B5CF6", p: tierPrices[tier].intelligence },
                  { label: "Ava", c: C.blue, p: tierPrices[tier].ava },
                  { label: "Pulse", c: C.teal, p: tierPrices[tier].pulse },
                  { label: "Full Stack", c: C.blue, p: tierPrices[tier].full },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: m.c, marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: head }}>£{m.p}<span style={{ fontSize: 10, fontWeight: 400, color: muted }}>/mo</span></div>
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
                        : <span style={{ color: darkMode ? "rgba(255,255,255,0.15)" : "#d0cdc7" }}>—</span>
                      }
                    </div>
                  ))}
                </div>
              ))}

              <div style={{ marginTop: 20, textAlign: "center" }}>
                <a href="/#pricing" style={{ fontSize: 12, color: C.blue, textDecoration: "none", fontWeight: 500 }}>View full pricing page →</a>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{ padding: "32px 24px", borderTop: `1px solid ${bdr}`, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: muted }}>© {new Date().getFullYear()} StrydeOS Ltd. All rights reserved.</div>
        </footer>
      </div>
      <CookieBanner />
    </>
  );
}
