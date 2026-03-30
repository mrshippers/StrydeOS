import { useState } from "react";

const C = {
  cloudDancer: "#F2F1EE",
  navy: "#0B2545",
  navyMid: "#132D5E",
  blue: "#1C54F2",
  blueBright: "#2E6BFF",
  blueGlow: "#4B8BF5",
  teal: "#0891B2",
  ink: "#111827",
  muted: "#6B7280",
  success: "#059669",
  border: "#E2DFDA",
  purple: "#8B5CF6",
};

/* ─── Thin connector ───────────────────────────────────────────────────── */
const Wire = ({ label, color = C.blueGlow }) => (
  <div style={{
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "6px 0",
  }}>
    <div style={{ width: 1, height: 16, background: `linear-gradient(${color}00, ${color}50)` }} />
    <div style={{
      fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color, opacity: 0.6,
      padding: "3px 0",
    }}>
      {label}
    </div>
    <div style={{ width: 1, height: 16, background: `linear-gradient(${color}50, ${color}00)` }} />
  </div>
);

export default function ArchitecturePyramid() {
  /* Pyramid widths — designed so left/right edges taper in equal steps */
  const tierW = ["100%", "76%", "52%"];

  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif",
      background: C.cloudDancer,
      minHeight: "100vh",
      padding: "40px 24px",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap');
      `}</style>

      <div style={{
        width: "100%",
        maxWidth: 1280,
        background: C.navy,
        borderRadius: 20,
        padding: "36px 56px 30px",
        position: "relative",
        overflow: "hidden",
      }}>

        {/* BG waveforms */}
        <svg viewBox="0 0 1280 380" preserveAspectRatio="none" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          opacity: 0.025, pointerEvents: "none",
        }}>
          <path d="M0,100 C200,80 400,120 600,95 C800,70 1000,110 1280,90" fill="none" stroke="white" strokeWidth="1" />
          <path d="M0,220 C250,200 500,240 750,215 C1000,190 1150,225 1280,210" fill="none" stroke="white" strokeWidth="0.5" />
        </svg>

        <div style={{ position: "relative", zIndex: 2 }}>

          {/* ── TIER 1 — EXISTING TOOLS (full width) ──────────────── */}
          <div style={{ width: tierW[0], margin: "0 auto" }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
              textAlign: "center", marginBottom: 10,
            }}>
              Your existing tools — unchanged
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 14,
              padding: 8,
            }}>
              {[
                { name: "Your PMS", sub: "Appointments · Billing", icon: "🗂️" },
                { name: "Exercise Platform", sub: "HEP · Programmes", icon: "🏋️" },
                { name: "Your Phone Line", sub: "Inbound calls", icon: "📞" },
              ].map(({ name, sub, icon }) => (
                <div key={name} style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{ fontSize: 18 }}>{icon}</div>
                  <div>
                    <div style={{ color: "white", fontWeight: 600, fontSize: 13 }}>{name}</div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── WIRES ─────────────────────────────────────────────── */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            width: tierW[1], margin: "0 auto",
          }}>
            <Wire label="Pulls data" color={C.blueGlow} />
            <Wire label="Syncs programmes" color={C.teal} />
            <Wire label="Routes calls" color={C.blueGlow} />
          </div>

          {/* ── TIER 2 — STRYDEOS (narrower) ──────────────────────── */}
          <div style={{ width: tierW[1], margin: "0 auto" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, marginBottom: 8,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 5,
                background: `${C.blue}22`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 800, color: C.blueGlow,
              }}>S</div>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
                textTransform: "uppercase", color: C.blueGlow,
              }}>
                StrydeOS — sits above your stack
              </span>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              background: `${C.blue}06`,
              border: `1px solid ${C.blue}14`,
              borderRadius: 14,
              padding: 8,
            }}>
              {[
                { name: "Ava", desc: "Answers calls, books patients into your PMS", icon: "📞", color: C.blue },
                { name: "Pulse", desc: "Detects drop-off risk, sends rebooking prompts", icon: "🔄", color: C.teal },
                { name: "Intelligence", desc: "Turns your PMS data into clinician KPIs", icon: "📊", color: C.purple },
              ].map(({ name, desc, icon, color }) => (
                <div key={name} style={{
                  background: `${color}0C`,
                  border: `1px solid ${color}1A`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: `${color}18`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14,
                  }}>{icon}</div>
                  <div>
                    <div style={{ color, fontWeight: 700, fontSize: 13, marginBottom: 1 }}>{name}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, lineHeight: 1.4 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── SINGLE WIRE ───────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Wire label="So nothing slips through" color={C.teal} />
          </div>

          {/* ── TIER 3 — OUTCOMES (narrowest) ─────────────────────── */}
          <div style={{ width: tierW[2], margin: "0 auto" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 14,
              padding: 8,
            }}>
              {[
                { value: "0", label: "missed calls", sub: "every inbound answered", color: C.success },
                { value: "Auto", label: "rebooking prompts", sub: "before patients drop off", color: C.teal },
                { value: "Live", label: "KPI dashboards", sub: "per clinician, per metric", color: C.blueGlow },
              ].map(({ value, label, sub, color }) => (
                <div key={label} style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 10,
                  padding: "12px 10px",
                  textAlign: "center",
                }}>
                  <div style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: 20, color, lineHeight: 1, marginBottom: 2,
                  }}>{value}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>{label}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer ────────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 5, marginTop: 16,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: 4,
              background: `${C.blue}25`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 7, fontWeight: 800, color: C.blueGlow,
            }}>S</div>
            <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.16)" }}>StrydeOS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
