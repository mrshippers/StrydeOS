import { useState, useEffect } from "react";
import { CookieBanner } from "./strydeOS-website.jsx";

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

export default function ModulePage({ id, name, color, headline, body, howItWorks, benefits, features, setup }) {
  const [darkMode, setDarkMode] = useState(false);
  const [tier, setTier] = useState("studio");
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
  const price = tierPrices[tier][id];

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
              <button onClick={() => setDarkMode(d => !d)} style={{ background: "none", border: `1.5px solid ${bdr}`, borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: head, fontSize: 17 }}>{darkMode ? "☀" : "☾"}</button>
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

        {/* Pricing card */}
        <section style={{ padding: "0 24px 100px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ background: darkMode ? `linear-gradient(145deg, ${C.navy}, ${C.navyMid})` : C.navy, borderRadius: 20, padding: "40px 44px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 28 }}>
                {Object.keys(tierLabels).map(k => (
                  <button key={k} onClick={() => setTier(k)} style={{
                    padding: "8px 20px", border: "none", cursor: "pointer", borderRadius: 50,
                    fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600,
                    background: tier === k ? C.blue : "rgba(255,255,255,0.06)",
                    color: tier === k ? "white" : "rgba(255,255,255,0.45)",
                    transition: "all 0.25s",
                  }}>{tierLabels[k]}</button>
                ))}
              </div>
              <div style={{ textAlign: "center" }}>
                <div className="serif" style={{ fontSize: 52, color: "white", fontWeight: 400, lineHeight: 1 }}>
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 24, fontWeight: 600, verticalAlign: "top", position: "relative", top: 8, marginRight: 2, opacity: 0.6 }}>£</span>{price}
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>per month{setup ? ` · ${setup}` : ""}</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
                  <a href={`https://portal.strydeos.com/login?mode=signup&module=${id}`} className="btn-primary" style={{ background: color }}>
                    Start free trial →
                  </a>
                  <a href={`https://portal.strydeos.com/billing?module=${id}`} className="btn-outline" style={{ color: "white", borderColor: "rgba(255,255,255,0.2)" }}>
                    Buy now →
                  </a>
                </div>
                <a href="/#pricing" style={{ display: "inline-block", marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>← Compare all plans</a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ padding: "32px 24px", borderTop: `1px solid ${bdr}`, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: muted }}>© {new Date().getFullYear()} StrydeOS Ltd. All rights reserved.</div>
        </footer>
      </div>
      <CookieBanner />
    </>
  );
}
