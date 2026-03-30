import { useState, useEffect, useRef } from "react";

const T = {
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueGlow: "#4B8BF5",
  teal: "#0891B2", tealBright: "#06B6D4",
  success: "#059669", warning: "#F59E0B", danger: "#EF4444",
};

// ─── Avatar ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#8B5CF6", "#1C54F2", "#0891B2", "#059669", "#F59E0B", "#EF4444", "#6366F1", "#EC4899"];
function Avatar({ name, index }) {
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase();
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: bg, fontSize: 9, fontWeight: 700, color: "white",
      letterSpacing: "0.02em",
    }}>{initials}</div>
  );
}

// ─── Patient Board Panel ─────────────────────────────────────────────────────
function PatientBoardPanel() {
  const patients = [
    { name: "John Doe", sessions: "0/6", last: "34d ago", warn: null },
    { name: "Nina Aslam", sessions: "1/6", last: "37d ago", warn: null },
    { name: "George Kemp", sessions: "3/6", last: "58d ago", warn: "57d" },
    { name: "Helen Corr", sessions: "6/6", last: "47d ago", warn: null },
    { name: "Catherine Bose", sessions: "4/6", last: "38d ago", warn: null },
    { name: "Daniel Marr", sessions: "2/6", last: "51d ago", warn: "50d" },
  ];

  return (
    <div>
      {/* Active count */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: T.success,
          padding: "2px 8px", borderRadius: 50,
          backgroundColor: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.15)",
        }}>Active</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>12 patients</span>
      </div>

      {/* Patient rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {patients.map((p, i) => (
          <div key={p.name} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "7px 8px", borderRadius: 8,
            backgroundColor: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
          }}>
            <Avatar name={p.name} index={i} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "white", filter: "blur(2px)", userSelect: "none" }}>{p.name}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{p.sessions} sessions · Last {p.last}</div>
            </div>
            {p.warn && (
              <span style={{
                fontSize: 8, color: T.warning, whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={T.warning} strokeWidth="1.2"/><path d="M8 5v3.5" stroke={T.warning} strokeWidth="1.2" strokeLinecap="round"/><circle cx="8" cy="11" r="0.5" fill={T.warning}/></svg>
                No rebook {p.warn}
              </span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 600, color: T.teal,
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}>Re-engage →</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Comms Sequences Panel ───────────────────────────────────────────────────
function SequencesPanel() {
  const seqs = [
    { name: "Early Intervention", steps: 2, window: "5d attribution", on: true },
    { name: "Re-booking Prompt", steps: 4, window: "7d attribution", on: true },
    { name: "Post-Session HEP Reminder", steps: 2, window: "7d attribution", on: true },
    { name: "Discharge Review Prompt", steps: 2, window: "14d attribution", on: true },
  ];

  return (
    <div>
      {/* Info banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 8, marginBottom: 8,
        backgroundColor: "rgba(8,145,178,0.06)", border: "1px solid rgba(8,145,178,0.1)",
      }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2l6 12H2L8 2z" stroke={T.teal} strokeWidth="1.2" strokeLinejoin="round" fill="none"/></svg>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", lineHeight: 1.3 }}>
          Each sequence triggers automatically based on patient events from your PMS.
        </span>
      </div>

      {/* Sequence cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {seqs.map((s) => (
          <div key={s.name} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 10px", borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}>
            {/* Icon */}
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.1)",
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="2" stroke={T.teal} strokeWidth="1.2"/>
                <path d="M2 6l6 3.5L14 6" stroke={T.teal} strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "white", marginBottom: 1 }}>{s.name}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)" }}>{s.steps} steps · {s.window}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: T.teal, cursor: "pointer" }}>› View cadence</span>
                <span style={{ fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.25)", cursor: "pointer" }}>◉ Preview</span>
              </div>
            </div>

            {/* Toggle */}
            <div style={{
              width: 34, height: 18, borderRadius: 9,
              backgroundColor: s.on ? T.teal : "rgba(255,255,255,0.08)",
              position: "relative", flexShrink: 0,
              boxShadow: s.on ? `0 0 8px ${T.teal}30` : "none",
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%", backgroundColor: "white",
                position: "absolute", top: 2,
                left: s.on ? 18 : 2,
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function PulseShowcase() {
  const [activePanel, setActivePanel] = useState(0);
  const [direction, setDirection] = useState(1);
  const timerRef = useRef(null);

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setDirection(1);
      setActivePanel(p => (p + 1) % 2);
    }, 3500);
  };

  useEffect(() => { startTimer(); return () => clearInterval(timerRef.current); }, []);

  const tabs = [
    { label: "Patient Board", icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 7a3 3 0 100-6 3 3 0 000 6zM2 14s0-4 4-4 4 4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M11 7a2.5 2.5 0 100-5M14 14s0-3.5-3-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { label: "Comms Sequences", icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 8h8M4 4.5h5M4 11.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  ];
  const panels = [<PatientBoardPanel key="pb" />, <SequencesPanel key="cs" />];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Serif+Display&display=swap');
        .pulse-c * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes slideR { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes slideL { from { opacity:0; transform:translateX(-20px); } to { opacity:1; transform:translateX(0); } }
      `}</style>

      <div className="pulse-c" style={{ fontFamily: "'Outfit', sans-serif", width: "100%", maxWidth: 480 }}>
        <div style={{
          backgroundColor: T.navy, borderRadius: 20, padding: "22px 18px 18px",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 8px 50px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Teal top accent */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.teal}60, ${T.tealBright}, ${T.teal}60)` }} />
          <div style={{ position: "absolute", top: -50, right: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(8,145,178,0.07), transparent 70%)", pointerEvents: "none" }} />

          {/* ─── Header ─── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: T.teal }} />
                <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: "white" }}>Pulse</span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Track patient journeys, manage comms, reduce drop-off</div>
            </div>
            <div style={{
              padding: "4px 10px", borderRadius: 8,
              backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.4)",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              All Clinicians
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2.5 4L5 6.5 7.5 4" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round"/></svg>
            </div>
          </div>

          {/* ─── Mini Stats ─── */}
          <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
            {[
              { l: "Total Sent", v: "147", u: "messages", dot: T.success },
              { l: "Open Rate", v: "72%", u: null, dot: T.success },
              { l: "Click Rate", v: "34%", u: null, dot: T.warning },
              { l: "Rebook Conv.", v: "18%", u: null, dot: T.warning },
            ].map((s) => (
              <div key={s.l} style={{
                flex: 1, padding: "8px 8px 6px", borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                position: "relative",
              }}>
                <div style={{ position: "absolute", top: 7, right: 7, width: 5, height: 5, borderRadius: "50%", backgroundColor: s.dot }} />
                <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.25)", marginBottom: 4 }}>{s.l}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: "white", lineHeight: 1 }}>{s.v}</span>
                  {s.u && <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>{s.u}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* ─── Tab bar ─── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 0,
            marginBottom: 14,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            {tabs.map((t, i) => (
              <button
                key={t.label}
                onClick={() => {
                  setDirection(i > activePanel ? 1 : -1);
                  setActivePanel(i);
                  startTimer();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 11, fontWeight: i === activePanel ? 700 : 500,
                  color: i === activePanel ? "white" : "rgba(255,255,255,0.3)",
                  padding: "6px 14px 8px",
                  borderBottom: i === activePanel ? `2px solid ${T.teal}` : "2px solid transparent",
                  marginBottom: -1,
                  transition: "all 0.25s ease",
                }}
              >
                <span style={{ color: i === activePanel ? T.teal : "rgba(255,255,255,0.2)", transition: "color 0.25s ease" }}>{t.icon}</span>
                {t.label}
              </button>
            ))}

            {/* Spacer + indicator */}
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 3, paddingRight: 4, paddingBottom: 4 }}>
              {tabs.map((_, i) => (
                <div key={i} style={{
                  width: i === activePanel ? 14 : 5, height: 4, borderRadius: 2,
                  backgroundColor: i === activePanel ? T.teal : "rgba(255,255,255,0.1)",
                  transition: "all 0.35s cubic-bezier(0.16,1,0.3,1)",
                }} />
              ))}
            </div>
          </div>

          {/* ─── Carousel ─── */}
          <div style={{ position: "relative", overflow: "hidden" }}>
            <div
              key={activePanel}
              style={{ animation: `${direction > 0 ? "slideR" : "slideL"} 0.35s cubic-bezier(0.16,1,0.3,1) both` }}
            >
              {panels[activePanel]}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
