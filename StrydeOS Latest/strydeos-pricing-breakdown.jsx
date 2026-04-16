import { useState, useEffect } from "react";

const T = {
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  teal: "#0891B2", tealBright: "#06B6D4",
  purple: "#8B5CF6", purpleBright: "#A78BFA",
  success: "#059669", successBright: "#34D399",
  ink: "#111827",
};

const TIERS = [
  { id: "solo", label: "Solo", sub: "1 clinician" },
  { id: "studio", label: "Studio", sub: "2\u20134 clinicians" },
  { id: "clinic", label: "Clinic", sub: "6+ clinicians" },
];

const MODULES = [
  { key: "Intelligence", color: T.purple, bright: T.purpleBright },
  { key: "Ava", color: T.blue, bright: T.blueBright },
  { key: "Pulse", color: T.teal, bright: T.tealBright },
];

const CURRENT = {
  solo:   { Intelligence: 79,  Ava: 129, Pulse: 99,  full: 259 },
  studio: { Intelligence: 129, Ava: 199, Pulse: 149, full: 399 },
  clinic: { Intelligence: 199, Ava: 299, Pulse: 229, full: 599 },
};

const PROPOSED = {
  solo:   { Intelligence: 69,  Ava: 99,  Pulse: 79,  full: 199 },
  studio: { Intelligence: 99,  Ava: 149, Pulse: 99,  full: 299 },
  clinic: { Intelligence: 149, Ava: 199, Pulse: 149, full: 399 },
};

const pct = (old, nw) => ((old - nw) / old * 100).toFixed(1);
const save = (old, nw) => old - nw;

const glass = (o = 0.05) => ({
  background: `rgba(255,255,255,${o})`,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
});

export default function PricingBreakdown() {
  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Serif+Display&display=swap";
    l.rel = "stylesheet";
    document.head.appendChild(l);
  }, []);

  const [expanded, setExpanded] = useState(null);

  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif",
      background: `radial-gradient(ellipse 90% 70% at 25% 15%, ${T.navyMid}, ${T.navy} 65%, #060F1F)`,
      minHeight: "100vh", color: "white", padding: "36px 20px",
    }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>

        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: T.blueBright, marginBottom: 8 }}>StrydeOS \u00b7 Revised Pricing</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, fontWeight: 400, lineHeight: 1.2, marginBottom: 6 }}>
            Full breakdown, every module, every tier.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Setup fee: \u00a3199 one-time (Ava phone provisioning) \u2014 down from \u00a3250.</p>
        </div>

        {TIERS.map(tier => {
          const cur = CURRENT[tier.id];
          const pro = PROPOSED[tier.id];
          const curTotal = cur.Intelligence + cur.Ava + cur.Pulse;
          const proTotal = pro.Intelligence + pro.Ava + pro.Pulse;
          const isOpen = expanded === tier.id || expanded === null;

          return (
            <div key={tier.id} style={{ marginBottom: 20 }}>
              <button
                onClick={() => setExpanded(expanded === tier.id ? null : tier.id)}
                style={{
                  ...glass(0.06), width: "100%", padding: "18px 24px",
                  cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: isOpen ? "none" : undefined,
                  borderBottomLeftRadius: isOpen ? 0 : 16,
                  borderBottomRightRadius: isOpen ? 0 : 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "white" }}>{tier.label}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{tier.sub}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textDecoration: "line-through" }}>\u00a3{cur.full}</span>
                  <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: "white" }}>\u00a3{pro.full}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.successBright }}>/mo</span>
                </div>
              </button>

              {isOpen && (
                <div style={{
                  ...glass(0.04),
                  borderTop: "none", borderTopLeftRadius: 0, borderTopRightRadius: 0,
                  padding: "0 24px 24px",
                }}>
                  {MODULES.map(mod => {
                    const c = cur[mod.key];
                    const p = pro[mod.key];
                    return (
                      <div key={mod.key} style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 70px 70px 60px 80px",
                        alignItems: "center",
                        padding: "14px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: mod.color,
                          }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: mod.bright }}>{mod.key}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "right", textDecoration: "line-through" }}>\u00a3{c}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "white", textAlign: "right" }}>\u00a3{p}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "right" }}>\u2212\u00a3{save(c, p)}</div>
                        <div style={{
                          fontSize: 11, fontWeight: 700, textAlign: "right",
                          color: T.successBright,
                          background: `${T.success}12`,
                          padding: "3px 8px", borderRadius: 6,
                          display: "inline-flex", justifyContent: "flex-end",
                        }}>
                          \u2212{pct(c, p)}%
                        </div>
                      </div>
                    );
                  })}

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 70px 70px 60px 80px",
                    alignItems: "center",
                    padding: "16px 0 0",
                    marginTop: 4,
                    borderTop: "1px solid rgba(255,255,255,0.1)",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Full Stack</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "right", textDecoration: "line-through" }}>\u00a3{cur.full}</div>
                    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, fontWeight: 400, color: "white", textAlign: "right" }}>\u00a3{pro.full}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "right" }}>\u2212\u00a3{save(cur.full, pro.full)}</div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, textAlign: "right",
                      color: T.successBright,
                      background: `${T.success}18`,
                      padding: "4px 10px", borderRadius: 6,
                      display: "inline-flex", justifyContent: "flex-end",
                    }}>
                      \u2212{pct(cur.full, pro.full)}%
                    </div>
                  </div>

                  <div style={{
                    marginTop: 16, padding: "12px 16px", borderRadius: 12,
                    background: `${T.blue}08`, border: `1px solid ${T.blue}15`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>\u00c0 la carte total</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>\u00a3{proTotal}/mo</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Full Stack saves</div>
                      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: T.successBright }}>\u00a3{proTotal - pro.full}/mo</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Bundle discount</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.successBright }}>{pct(proTotal, pro.full)}%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ ...glass(0.06), padding: 24, marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.blueBright, marginBottom: 16 }}>
            Reduction summary
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            {[
              { label: "Intelligence", range: `${pct(CURRENT.solo.Intelligence, PROPOSED.solo.Intelligence)}\u2013${pct(CURRENT.clinic.Intelligence, PROPOSED.clinic.Intelligence)}%`, color: T.purple },
              { label: "Ava", range: `${pct(CURRENT.solo.Ava, PROPOSED.solo.Ava)}\u2013${pct(CURRENT.clinic.Ava, PROPOSED.clinic.Ava)}%`, color: T.blue },
              { label: "Pulse", range: `${pct(CURRENT.solo.Pulse, PROPOSED.solo.Pulse)}\u2013${pct(CURRENT.clinic.Pulse, PROPOSED.clinic.Pulse)}%`, color: T.teal },
              { label: "Full Stack", range: `${pct(CURRENT.solo.full, PROPOSED.solo.full)}\u2013${pct(CURRENT.clinic.full, PROPOSED.clinic.full)}%`, color: "white" },
            ].map((s, i) => (
              <div key={i} style={{
                padding: 14, borderRadius: 12,
                background: `${s.color}08`, border: `1px solid ${s.color}12`,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: s.color === "white" ? "white" : s.color }}>
                  {s.range}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>reduction</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          marginTop: 20, padding: "14px 20px", borderRadius: 14,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7,
        }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Updated:</strong> \u00a3199 one-time Ava setup fee (phone provisioning + voice training), down from \u00a3250.
          Cleaner number, still covers infrastructure cost and acts as a qualification filter.
          No lock-in contracts on any tier.
        </div>

        <div style={{ textAlign: "center", marginTop: 28, fontSize: 10, color: "rgba(255,255,255,0.12)" }}>
          StrydeOS \u00b7 Revised Pricing \u00b7 April 2026
        </div>
      </div>
    </div>
  );
}
