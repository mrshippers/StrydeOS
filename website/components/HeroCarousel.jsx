'use client';

import { useState, useEffect } from "react";

const C = {
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueGlow: "#4B8BF5",
  teal: "#0891B2",
  cream: "#FAF9F7", cloudLight: "#F9F8F6",
  ink: "#111827", muted: "#6B7280",
  border: "#E2DFDA", success: "#059669",
};

const msgs = [
  { who: "p", text: "Hi, I\u2019d like to book an appointment for my lower back." },
  { who: "a", text: "Of course \u2014 I can help with that. Are mornings or afternoons better for you?" },
  { who: "p", text: "Mornings, ideally Thursday or Friday." },
  { who: "a", text: "I have Thursday at 9:15am with Dr. Reeves. Shall I book that and send you a confirmation text?" },
  { who: "p", text: "Yes please." },
  { who: "a", text: "Done \u2014 you\u2019re booked in. You\u2019ll get a text shortly. Is there anything else I can help with?" },
];

export default function HeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % 2), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ width: "100%", maxWidth: 400 }}>
      {/* Card container — fixed aspect */}
      <div style={{
        position: "relative",
        width: "100%",
        paddingBottom: "135%",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(11,37,69,0.14), 0 8px 24px rgba(11,37,69,0.07)",
      }}>
        {/* SLIDE 0: Transcript */}
        <div style={{
          position: "absolute", inset: 0,
          background: C.navy,
          opacity: active === 0 ? 1 : 0,
          transition: "opacity 0.6s ease",
          display: "flex", flexDirection: "column",
          zIndex: active === 0 ? 2 : 1,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "18px 22px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Transcript</span>
            </div>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Today, 09:12</span>
          </div>

          {/* Messages */}
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{
                maxWidth: "85%",
                alignSelf: m.who === "a" ? "flex-end" : "flex-start",
                padding: "10px 14px",
                borderRadius: 14,
                borderBottomLeftRadius: m.who === "p" ? 4 : 14,
                borderBottomRightRadius: m.who === "a" ? 4 : 14,
                background: m.who === "a" ? C.blue : "rgba(255,255,255,0.08)",
                color: m.who === "a" ? "white" : "rgba(255,255,255,0.75)",
                fontSize: 13, lineHeight: 1.45,
              }}>{m.text}</div>
            ))}
          </div>
        </div>

        {/* SLIDE 1: Knowledge Base */}
        <div style={{
          position: "absolute", inset: 0,
          background: C.cream,
          opacity: active === 1 ? 1 : 0,
          transition: "opacity 0.6s ease",
          display: "flex", flexDirection: "column",
          zIndex: active === 1 ? 2 : 1,
        }}>
          {/* Premium gradient header */}
          <div style={{
            background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyMid} 60%, #1a3a6e 100%)`,
            padding: "18px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            position: "relative", overflow: "hidden",
          }}>
            {/* Glass sheen overlay */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)", pointerEvents: "none" }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              </div>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, fontWeight: 400, color: "white", letterSpacing: "-0.3px" }}>Clinic Knowledge Base</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 0, letterSpacing: "-0.1px", lineHeight: 1.3 }}>17 entries teaching Ava about your clinic</div>
              </div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: C.success,
              background: "rgba(5,150,105,0.12)", padding: "4px 10px", borderRadius: 50,
              display: "flex", alignItems: "center", gap: 5, position: "relative",
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.success }}/>
              Draft
            </div>
          </div>

          {/* KB Body */}
          <div style={{ padding: "14px 16px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {/* Services & Treatments */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: C.blue, color: "white", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>S</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Services & Treatments</span>
                <span style={{ fontSize: 11, color: C.muted }}>2</span>
              </div>
              <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  { n: "Physiotherapy", t: "MSK clinic specialising in back pain, neck pain, sports injuries, post-surgical rehab. All appointments 45 minutes." },
                  { n: "Online Consultations", t: "Video consultations \u2014 same length (45 min), same price. Ideal for follow-ups or patients who can\u2019t travel." },
                ].map((e, i) => (
                  <div key={i} style={{ background: C.cloudLight, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 13px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{e.n}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{e.t}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team & Clinicians */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: C.teal, color: "white", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>T</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Team & Clinicians</span>
                <span style={{ fontSize: 11, color: C.muted }}>3</span>
              </div>
              <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  { n: "Sarah Reeves", t: "Senior physiotherapist. Available Mon, Tue, Thu, Fri. Morning and afternoon slots." },
                  { n: "James Patel", t: "Physiotherapist. Available Tuesday evenings and Saturday (1st of each month)." },
                ].map((e, i) => (
                  <div key={i} style={{ background: C.cloudLight, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 13px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{e.n}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{e.t}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Glowing orb indicator */}
      <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 0" }}>
        <div className="ava-orb" style={{
          width: 8, height: 8, borderRadius: "50%",
          background: C.blue,
          boxShadow: `0 0 8px ${C.blueGlow}, 0 0 20px rgba(28,84,242,0.3)`,
        }}/>
      </div>
    </div>
  );
}
