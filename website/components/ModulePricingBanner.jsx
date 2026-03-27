'use client';

import { useState, useEffect } from "react";

const C = {
  navy: "#0B2545", navyMid: "#132D5E", navyLight: "#1A3A6E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  teal: "#0891B2",
};

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const MODULE_META = {
  ava:          { color: C.blue,    bright: C.blueBright, glow: C.blueGlow },
  pulse:        { color: C.teal,    bright: "#06B6D4",    glow: "#22D3EE"  },
  intelligence: { color: "#8B5CF6", bright: "#A78BFA",    glow: "#C4B5FD"  },
};

const TIERS = [
  { id: "solo",   label: "Solo",   sub: "(1)"   },
  { id: "studio", label: "Studio", sub: "(2\u20135)" },
  { id: "clinic", label: "Clinic", sub: "(6+)"  },
];

const PRICING = {
  solo:   { ava: 149, pulse: 99,  intelligence: 79  },
  studio: { ava: 199, pulse: 149, intelligence: 129 },
  clinic: { ava: 299, pulse: 229, intelligence: 199 },
};

const SETUP = {
  solo:   { ava: null,                    pulse: null, intelligence: null },
  studio: { ava: "\u00A3250 one-time setup", pulse: null, intelligence: null },
  clinic: { ava: "\u00A3250 one-time setup", pulse: null, intelligence: null },
};

export default function ModulePricingBanner({ module = "ava", onCompare }) {
  const [tier, setTier] = useState("studio");
  const [loaded, setLoaded] = useState(false);
  const [primaryHover, setPrimaryHover] = useState(false);
  const [secondaryHover, setSecondaryHover] = useState(false);
  const [priceAnim, setPriceAnim] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setLoaded(true)));
  }, []);

  const handleTierChange = (newTier) => {
    if (newTier === tier) return;
    setPriceAnim(true);
    setTimeout(() => {
      setTier(newTier);
      setTimeout(() => setPriceAnim(false), 30);
    }, 150);
  };

  const tierIndex = TIERS.findIndex(t => t.id === tier);
  const m = MODULE_META[module] || MODULE_META.ava;
  const price = PRICING[tier][module];
  const setup = SETUP[tier][module];
  const trialUrl = `https://portal.strydeos.com/trial`;
  const checkoutBase = `https://portal.strydeos.com/checkout?plan=${module}-${tier}`;

  return (
    <>
      <div style={{ fontFamily: "'Outfit', sans-serif", width: "100%", maxWidth: 560, margin: "0 auto" }}>
        <div style={{
          position: "relative", overflow: "hidden", borderRadius: 20,
          padding: "30px 32px 28px",
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${hexToRgba(C.navyLight, 0.25)}, ${C.navy} 70%)`,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
          textAlign: "center",
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(12px)",
          transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
        }}>
          {/* Ambient glows */}
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle, ${hexToRgba(m.color, 0.045)}, transparent 65%)`, pointerEvents: "none" }}/>
          {/* Glass highlight */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, background: "linear-gradient(180deg,rgba(255,255,255,0.015) 0%,transparent 100%)", borderRadius: "20px 20px 0 0", pointerEvents: "none" }}/>

          {/* Tier toggle */}
          <div style={{
            display: "inline-flex", alignItems: "stretch", padding: 4, borderRadius: 16,
            backgroundColor: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.03)",
            marginBottom: 28, position: "relative",
          }}>
            {/* Sliding indicator pill */}
            <div style={{
              position: "absolute", top: 4, bottom: 4,
              width: `calc(${100 / TIERS.length}% - 2px)`,
              left: `calc(${tierIndex * (100 / TIERS.length)}% + 2px)`,
              borderRadius: 12,
              background: `linear-gradient(135deg,${m.bright},${m.color})`,
              boxShadow: `0 2px 10px ${hexToRgba(m.color, 0.19)},0 0 0 1px ${hexToRgba(m.bright, 0.12)},inset 0 1px 0 rgba(255,255,255,0.15)`,
              transition: "left 0.4s cubic-bezier(0.16,1,0.3,1)",
              zIndex: 1,
            }}/>
            {TIERS.map(t => {
              const active = tier === t.id;
              return (
                <button key={t.id} onClick={() => handleTierChange(t.id)} style={{
                  position: "relative", zIndex: 2, padding: "10px 28px 8px", borderRadius: 12,
                  border: "none", cursor: "pointer", fontFamily: "'Outfit',sans-serif", background: "transparent",
                  transition: "all 0.3s ease",
                }}>
                  <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? "white" : "rgba(255,255,255,0.6)", transition: "color 0.3s" }}>{t.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4, color: active ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.18)", transition: "color 0.3s" }}>{t.sub}</span>
                </button>
              );
            })}
          </div>

          {/* Price */}
          <div style={{ marginBottom: 6, position: "relative", opacity: priceAnim ? 0 : 1, transform: priceAnim ? "translateY(6px)" : "translateY(0)", transition: "all 0.15s ease" }}>
            <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: "rgba(255,255,255,0.6)", position: "relative", top: -22 }}>{'£'}</span>
            <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 64, color: "white", lineHeight: 1, letterSpacing: "-0.02em" }}>{price}</span>
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 26, opacity: priceAnim ? 0 : 1, transform: priceAnim ? "translateY(4px)" : "translateY(0)", transition: "all 0.15s ease 0.03s" }}>
            p/m {'·'} {setup || "no setup fee"}
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            <a href={trialUrl} target="_blank" rel="noopener"
              onMouseEnter={() => setPrimaryHover(true)} onMouseLeave={() => setPrimaryHover(false)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 30px", borderRadius: 50,
                fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 700, color: "white", textDecoration: "none", cursor: "pointer",
                background: primaryHover ? `linear-gradient(135deg,${m.bright},${m.color})` : `linear-gradient(135deg,${m.color},${hexToRgba(m.color, 0.9)})`,
                boxShadow: primaryHover ? `0 4px 16px ${hexToRgba(m.color, 0.16)},0 0 0 1px ${hexToRgba(m.bright, 0.09)},inset 0 1px 0 rgba(255,255,255,0.15)` : `0 2px 8px ${hexToRgba(m.color, 0.09)},inset 0 1px 0 rgba(255,255,255,0.08)`,
                transform: primaryHover ? "translateY(-1px)" : "translateY(0)", transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
              }}
            >Start free trial <span style={{ fontSize: 16 }}>{'→'}</span></a>
            <a href={`${checkoutBase}&billing=now`} target="_blank" rel="noopener"
              onMouseEnter={() => setSecondaryHover(true)} onMouseLeave={() => setSecondaryHover(false)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 30px", borderRadius: 50,
                fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 700, textDecoration: "none", cursor: "pointer",
                color: secondaryHover ? "white" : "rgba(255,255,255,0.7)",
                background: secondaryHover ? `linear-gradient(135deg,${hexToRgba(m.bright, 0.12)},${hexToRgba(m.color, 0.08)})` : "transparent",
                border: secondaryHover ? `1.5px solid ${hexToRgba(m.bright, 0.31)}` : "1.5px solid rgba(255,255,255,0.15)",
                transform: secondaryHover ? "translateY(-1px)" : "translateY(0)", transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
              }}
            >Buy now <span style={{ fontSize: 16 }}>{'→'}</span></a>
          </div>

          {/* Compare link */}
          {onCompare ? (
            <button onClick={onCompare} style={{
              fontSize: 13, color: "rgba(255,255,255,0.6)", background: "none", border: "none",
              cursor: "pointer", fontFamily: "'Outfit',sans-serif", transition: "color 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
              onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
            >Compare all plans {'↓'}</button>
          ) : (
            <a href="/pricing" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textDecoration: "none", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.75)"}
              onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
            >Compare all plans {'↓'}</a>
          )}
        </div>
      </div>
    </>
  );
}
