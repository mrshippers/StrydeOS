import { useState, useEffect } from "react";

const T = {
  navy: "#0B2545", navyMid: "#132D5E", navyLight: "#1A3A6E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  teal: "#0891B2", tealBright: "#06B6D4", tealGlow: "#22D3EE",
  purple: "#8B5CF6", purpleBright: "#A78BFA", purpleGlow: "#C4B5FD",
  success: "#059669", successBright: "#34D399",
  cloud: "#F2F1EE", cloudLight: "#F9F8F6",
  border: "#E2DFDA", muted: "#8A8780", ink: "#2C2A26",
};

const GLOSS = {
  Intelligence: `radial-gradient(ellipse 120% 80% at 30% 20%, ${T.purpleBright}E6, ${T.purple}F2 45%, #6D28D9 100%)`,
  Ava: `radial-gradient(ellipse 120% 80% at 30% 20%, ${T.blueBright}E6, ${T.blue}F2 45%, #1740C4 100%)`,
  Pulse: `radial-gradient(ellipse 120% 80% at 30% 20%, ${T.tealBright}E6, ${T.teal}F2 45%, #0E7490 100%)`,
};

const EDGE_GLOW = {
  Intelligence: `0 0 0 1px ${T.purpleBright}60, 0 0 30px ${T.purple}40, 0 8px 40px ${T.purple}25`,
  Ava: `0 0 0 1px ${T.blueBright}60, 0 0 30px ${T.blue}40, 0 8px 40px ${T.blue}25`,
  Pulse: `0 0 0 1px ${T.tealBright}60, 0 0 30px ${T.teal}40, 0 8px 40px ${T.teal}25`,
};

const TIERS = [
  { id: "solo", label: "Solo", sub: "1 clinician" },
  { id: "studio", label: "Studio", sub: "2\u20134 clinicians" },
  { id: "clinic", label: "Clinic", sub: "6+ clinicians" },
];

const PRICING = {
  solo:   { Intelligence: "\u00a369",  Ava: "\u00a399",  Pulse: "\u00a379",  full: "\u00a3199", fullSetup: "\u00a3199" },
  studio: { Intelligence: "\u00a399",  Ava: "\u00a3149", Pulse: "\u00a399",  full: "\u00a3299", fullSetup: "\u00a3199" },
  clinic: { Intelligence: "\u00a3149", Ava: "\u00a3199", Pulse: "\u00a3149", full: "\u00a3399", fullSetup: "\u00a3199" },
};

const SAVINGS = {
  solo:   { individual: 247, full: 199, save: 48 },
  studio: { individual: 347, full: 299, save: 48 },
  clinic: { individual: 497, full: 399, save: 98 },
};

const MODULES = [
  {
    name: "Intelligence", color: T.purple, bright: T.purpleBright,
    tagline: "Know your numbers, finally",
    setup: "No setup fee",
    features: ["Per-clinician KPI board", "6-week trend charts", "Metric drift alerts", "WriteUpp & Cliniko integration", "Weekly email digest"],
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 5-10"/>
      </svg>
    ),
  },
  {
    name: "Ava", color: T.blue, bright: T.blueBright, popular: true,
    tagline: "Never miss another call",
    setup: "\u00a3195 one-time setup",
    features: ["24/7 inbound call handling", "Live calendar booking", "No-show recovery", "SMS confirmations", "Emergency routing"],
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
      </svg>
    ),
  },
  {
    name: "Pulse", color: T.teal, bright: T.tealBright,
    tagline: "Clinically adaptive patient retention",
    setup: "No setup fee",
    features: ["Complexity-aware follow-up sequences", "Psychosocial flag detection", "Discharge-aware suppression", "Post-discharge check-ins", "Referral prompt flows"],
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
  },
];

function Check({ color }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="8" cy="8" r="7" fill={color} fillOpacity="0.15" />
      <path d="M5.5 8l2 2 3.5-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TierToggle({ tier, setTier }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "stretch",
      padding: 4, borderRadius: 16,
      backgroundColor: T.navy,
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.03)",
    }}>
      {TIERS.map((t) => {
        const active = tier === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTier(t.id)}
            style={{
              position: "relative", zIndex: active ? 2 : 1,
              padding: "10px 28px 8px",
              borderRadius: 12, border: "none", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif",
              background: active
                ? `linear-gradient(135deg, ${T.blueBright}, ${T.blue})`
                : "transparent",
              boxShadow: active
                ? `0 2px 12px ${T.blue}50, 0 0 0 1px ${T.blueBright}40, inset 0 1px 0 rgba(255,255,255,0.2)`
                : "none",
              transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div style={{
              fontSize: 14, fontWeight: active ? 700 : 500,
              color: active ? "white" : "rgba(255,255,255,0.35)",
              transition: "color 0.3s ease", lineHeight: 1.2,
            }}>
              {t.label}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 500,
              color: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
              transition: "color 0.3s ease", marginTop: 1,
            }}>
              {t.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PricingCard({ mod, price, tier, delay }) {
  const [hovered, setHovered] = useState(false);
  const [vis, setVis] = useState(false);
  useEffect(() => { setVis(false); const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay, tier]);

  const h = hovered;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 24,
        padding: "34px 28px 28px",
        cursor: "pointer",
        overflow: "hidden",
        background: h ? GLOSS[mod.name] : "white",
        border: h ? `1px solid ${mod.bright}50` : `1px solid ${T.border}`,
        boxShadow: h
          ? EDGE_GLOW[mod.name]
          : "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)",
        transform: h
          ? "translateY(-6px) scale(1.015)"
          : vis ? "translateY(0) scale(1)" : "translateY(16px) scale(0.98)",
        opacity: vis ? 1 : 0,
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform, box-shadow",
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 120,
        background: h
          ? "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)"
          : "none",
        borderRadius: "24px 24px 0 0",
        pointerEvents: "none",
        transition: "all 0.4s ease",
      }} />

      <div style={{
        position: "absolute", top: -60, left: -30,
        width: 200, height: 200, borderRadius: "50%",
        background: h
          ? `radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%)`
          : "none",
        pointerEvents: "none", transition: "all 0.5s ease",
      }} />

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
        background: h
          ? `linear-gradient(90deg, transparent, ${mod.bright}40, transparent)`
          : "transparent",
        transition: "all 0.4s ease",
      }} />

      {mod.popular && (
        <div style={{
          position: "absolute", top: 16, right: 16,
          padding: "4px 12px", borderRadius: 50,
          background: h ? "rgba(255,255,255,0.18)" : `rgba(28,84,242,0.08)`,
          border: h ? "1px solid rgba(255,255,255,0.25)" : `1px solid ${T.blue}20`,
          fontSize: 9, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: h ? "white" : T.blue,
          transition: "all 0.35s ease",
        }}>
          Most popular
        </div>
      )}

      <div style={{
        width: 44, height: 44, borderRadius: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 18,
        background: h
          ? "rgba(255,255,255,0.15)"
          : `linear-gradient(135deg, ${mod.color}12, ${mod.bright}08)`,
        border: h
          ? "1px solid rgba(255,255,255,0.2)"
          : `1px solid ${mod.color}15`,
        color: h ? "white" : mod.color,
        transition: "all 0.35s ease",
      }}>
        {mod.icon}
      </div>

      <div style={{
        fontSize: 20, fontWeight: 700,
        color: h ? "white" : T.ink,
        marginBottom: 4, transition: "color 0.3s ease",
      }}>
        {mod.name}
      </div>
      <div style={{
        fontSize: 13,
        color: h ? "rgba(255,255,255,0.65)" : T.muted,
        marginBottom: 20, transition: "color 0.3s ease",
      }}>
        {mod.tagline}
      </div>

      <div style={{ marginBottom: 4 }}>
        <span style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 36, fontWeight: 400,
          color: h ? "white" : T.ink,
          transition: "color 0.3s ease",
        }}>
          {price}
        </span>
        <span style={{
          fontSize: 15,
          color: h ? "rgba(255,255,255,0.4)" : T.muted,
          transition: "color 0.3s ease",
        }}>
          /mo
        </span>
      </div>
      <div style={{
        fontSize: 11,
        color: h ? "rgba(255,255,255,0.4)" : T.muted,
        marginBottom: 24,
        transition: "color 0.3s ease",
      }}>
        {mod.setup}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {mod.features.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Check color={h ? "rgba(255,255,255,0.8)" : mod.color} />
            <span style={{
              fontSize: 13, lineHeight: 1.4,
              color: h ? "rgba(255,255,255,0.85)" : T.ink,
              transition: "color 0.3s ease",
            }}>
              {f}
            </span>
          </div>
        ))}
      </div>

      <button style={{
        width: "100%", padding: "13px 0",
        borderRadius: 14, fontSize: 14, fontWeight: 700,
        fontFamily: "'Outfit', sans-serif",
        cursor: "pointer",
        background: h
          ? "rgba(255,255,255,0.95)"
          : "transparent",
        color: h ? mod.color : T.blue,
        border: h ? "none" : `1.5px solid ${T.blue}30`,
        boxShadow: h
          ? `0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)`
          : "none",
        transition: "all 0.35s ease",
      }}>
        Get started
      </button>
    </div>
  );
}

function FullStackBanner({ tier, loaded }) {
  const [h, setH] = useState(false);
  const p = PRICING[tier];
  const s = SAVINGS[tier];

  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: "relative", borderRadius: 22, overflow: "hidden",
        padding: "30px 36px",
        background: h
          ? `radial-gradient(ellipse 100% 100% at 20% 40%, ${T.navyLight}, ${T.navy} 70%)`
          : T.navy,
        border: `1px solid ${h ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 20,
        boxShadow: h
          ? `0 0 0 1px ${T.blueBright}25, 0 0 40px ${T.blue}18, 0 8px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`
          : "0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
        transform: h ? "translateY(-2px)" : "translateY(0)",
        cursor: "pointer",
        transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
        opacity: loaded ? 1 : 0,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, display: "flex" }}>
        <div style={{ flex: 1, background: `linear-gradient(90deg, ${T.purple}, ${T.purpleBright})`, opacity: h ? 0.9 : 0.4, transition: "opacity 0.4s ease" }} />
        <div style={{ flex: 1, background: `linear-gradient(90deg, ${T.blue}, ${T.blueBright})`, opacity: h ? 0.9 : 0.4, transition: "opacity 0.4s ease" }} />
        <div style={{ flex: 1, background: `linear-gradient(90deg, ${T.teal}, ${T.tealBright})`, opacity: h ? 0.9 : 0.4, transition: "opacity 0.4s ease" }} />
      </div>

      <div style={{
        position: "absolute", top: -80, right: -20, width: 280, height: 280, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(28,84,242,${h ? "0.16" : "0.06"}), transparent 70%)`,
        pointerEvents: "none", transition: "all 0.5s ease",
      }} />

      <div style={{ position: "relative" }}>
        <div style={{
          display: "inline-block", padding: "4px 12px", borderRadius: 50, marginBottom: 10,
          background: h ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${h ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)"}`,
          fontSize: 9, fontWeight: 800, textTransform: "uppercase",
          letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)",
          transition: "all 0.3s ease",
        }}>
          \u2605 Best value
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 4 }}>
          Stryde<span style={{ color: T.blueGlow }}>OS</span> Full Stack
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>All three modules. One system.</div>
      </div>

      <div style={{ textAlign: "right", position: "relative" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, color: "white", lineHeight: 1 }}>
          {p.full}
        </span>
        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.35)" }}>/mo</span>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>{p.fullSetup} one-time setup</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.successBright, marginTop: 4 }}>
          Save \u00a3{s.save}/mo vs individual
        </div>
      </div>
    </div>
  );
}

export default function PricingSection() {
  const [tier, setTier] = useState("studio");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setLoaded(true))); }, []);

  const prices = PRICING[tier];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Serif+Display&display=swap');
        .ps-sec * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div className="ps-sec" style={{ fontFamily: "'Outfit', sans-serif", padding: "90px 24px", backgroundColor: T.cloud }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>

          <div style={{
            textAlign: "center", marginBottom: 40,
            opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(12px)",
            transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
          }}>
            <div style={{
              display: "inline-block", padding: "6px 18px", borderRadius: 50,
              border: `1px solid ${T.border}`, marginBottom: 22,
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: T.blue,
            }}>Pricing</div>
            <h2 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 42, fontWeight: 400,
              color: T.navy, lineHeight: 1.12, marginBottom: 14,
            }}>
              Modular by design.<br/>Your clinic, your stack.
            </h2>
            <p style={{ fontSize: 15, color: T.muted, maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}>
              Three modules. Mix and match. No forced tiers, no wasted features.
              The full stack costs less than a part-time receptionist.
            </p>
          </div>

          <div style={{
            display: "flex", justifyContent: "center", marginBottom: 40,
            opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease 0.15s",
          }}>
            <TierToggle tier={tier} setTier={setTier} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 28 }}>
            {MODULES.map((mod, i) => (
              <PricingCard key={mod.name} mod={mod} price={prices[mod.name]} tier={tier} delay={200 + i * 100} />
            ))}
          </div>

          <FullStackBanner tier={tier} loaded={loaded} />

          <div style={{
            textAlign: "center", marginTop: 28,
            fontSize: 12, color: T.muted,
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.5s ease 0.5s",
          }}>
            No lock-in contracts \u00b7 Cancel anytime \u00b7 GDPR & HIPAA compliant \u00b7 UK-hosted data
          </div>

          <div style={{
            marginTop: 48, borderRadius: 20, overflow: "hidden",
            background: T.navy,
            border: "1px solid rgba(255,255,255,0.08)",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.5s ease 0.6s",
          }}>
            <div style={{ padding: "24px 28px 8px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.blueBright, marginBottom: 4 }}>
                All tiers at a glance
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Outfit', sans-serif" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["", "Intelligence", "Ava", "Pulse", "Full Stack"].map(h => (
                      <th key={h} style={{
                        padding: "12px 20px", textAlign: h ? "right" : "left",
                        color: "rgba(255,255,255,0.35)", fontWeight: 600, fontSize: 11,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIERS.map(row => {
                    const rp = PRICING[row.id];
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ fontWeight: 700, color: "rgba(255,255,255,0.8)", fontSize: 14 }}>{row.label}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{row.sub}</div>
                        </td>
                        <td style={{ padding: "14px 20px", textAlign: "right", color: T.purpleBright, fontWeight: 600, fontSize: 14 }}>{rp.Intelligence}</td>
                        <td style={{ padding: "14px 20px", textAlign: "right", color: T.blueBright, fontWeight: 600, fontSize: 14 }}>{rp.Ava}</td>
                        <td style={{ padding: "14px 20px", textAlign: "right", color: T.tealBright, fontWeight: 600, fontSize: 14 }}>{rp.Pulse}</td>
                        <td style={{ padding: "14px 20px", textAlign: "right", fontWeight: 800, color: "white", fontSize: 15 }}>{rp.full}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 20px 20px", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
              Ava setup: \u00a3195 one-time (phone provisioning + voice training). Same \u00a3195 applies on Full Stack. All other modules: no setup fee.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
