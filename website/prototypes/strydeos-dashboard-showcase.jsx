import { useState, useEffect } from "react";

const T = {
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueGlow: "#4B8BF5",
  teal: "#0891B2", purple: "#8B5CF6", success: "#059669",
  danger: "#EF4444", muted: "#8A8780", ink: "#2C2A26",
};

function MonolithMark({ size = 44 }) {
  const id = `m-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id={`${id}-c`} x1=".1" y1="0" x2=".85" y2="1"><stop offset="0%" stopColor="#2E6BFF" stopOpacity=".58"/><stop offset="100%" stopColor="#091D3E" stopOpacity=".72"/></linearGradient>
        <radialGradient id={`${id}-r`} cx="28%" cy="24%" r="60%"><stop offset="0%" stopColor="#6AABFF" stopOpacity=".42"/><stop offset="100%" stopColor="#1C54F2" stopOpacity="0"/></radialGradient>
        <linearGradient id={`${id}-t`} x1=".05" y1="1" x2=".35" y2="0"><stop offset="0%" stopColor="white" stopOpacity=".55"/><stop offset="100%" stopColor="white" stopOpacity=".97"/></linearGradient>
        <clipPath id={`${id}-p`}><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
        <clipPath id={`${id}-a`}><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
      </defs>
      <rect width="100" height="100" rx="50" fill={`url(#${id}-c)`}/>
      <rect width="100" height="100" rx="50" fill={`url(#${id}-r)`}/>
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity=".07"/>
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity=".10"/>
      <g clipPath={`url(#${id}-p)`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity=".20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity=".42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity=".72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${id}-t)`} clipPath={`url(#${id}-a)`}/>
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity=".55" strokeLinecap="round"/>
    </svg>
  );
}

function Spark({ data, color, w = 56, h = 18 }) {
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ModuleCard({ name, color, stat, delay }) {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      flex: 1, padding: "8px 10px", borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
      opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(6px)",
      transition: "all 0.45s cubic-bezier(0.16,1,0.3,1)", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -15, left: -15, width: 50, height: 50, borderRadius: "50%", background: `radial-gradient(circle, ${color}18, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
        <span style={{ fontSize: 8, fontWeight: 700, color: T.success, textTransform: "uppercase", letterSpacing: "0.06em" }}>Active</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", marginBottom: 1 }}>{name}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{stat}</div>
    </div>
  );
}

function KPI({ label, value, unit, delta, dir, status, sparkData, delay }) {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }, [delay]);
  const sc = status === "green" ? T.success : status === "red" ? T.danger : T.muted;
  return (
    <div style={{
      padding: "10px 12px 8px", borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
      opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(8px)",
      transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)" }}>{label}</span>
        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: sc }} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#fff", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{unit}</span>}
        {delta && <span style={{ fontSize: 9, fontWeight: 700, color: dir === "up" ? T.success : T.danger, marginLeft: 2 }}>{dir === "up" ? "↑" : "↓"}{delta}</span>}
      </div>
      {sparkData && <Spark data={sparkData} color={T.blueGlow} />}
    </div>
  );
}

export default function DashboardShowcase() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setLoaded(true))); }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Serif+Display&display=swap');
        .ds-card * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes floatT { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
      `}</style>

      <div className="ds-card" style={{ fontFamily: "'Outfit', sans-serif", width: "100%", maxWidth: 400, margin: "0 auto" }}>

        {/* Floating toast */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px 5px 8px", borderRadius: 50,
          backgroundColor: "rgba(255,255,255,0.95)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          fontSize: 10, fontWeight: 600, color: T.success,
          position: "relative", left: "55%", marginBottom: -8, zIndex: 2,
          animation: "floatT 4s ease-in-out infinite",
          opacity: loaded ? 1 : 0, transition: "opacity 0.5s ease 0.8s",
        }}>
          <span style={{ fontSize: 12 }}>📞</span> Call answered automatically
        </div>

        {/* ─── Card ─── */}
        <div style={{
          backgroundColor: T.navy, borderRadius: 18, padding: "18px 16px 14px",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 8px 50px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Glow */}
          <div style={{ position: "absolute", top: -60, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(28,84,242,0.12), transparent 70%)", pointerEvents: "none" }} />

          {/* Header */}
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12,
            opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(6px)",
            transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
          }}>
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", marginBottom: 4 }}>Spires Physiotherapy · London</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MonolithMark size={18} />
                <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: "#fff" }}>Stryde<span style={{ color: T.blueGlow }}>OS</span> Dashboard</span>
              </div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 7px", borderRadius: 50,
              border: "1px solid rgba(5,150,105,0.2)", backgroundColor: "rgba(5,150,105,0.06)",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: T.success }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: T.success }}>Live</span>
            </div>
          </div>

          {/* Modules */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            <ModuleCard name="Ava" color={T.blue} stat="12 today" delay={150} />
            <ModuleCard name="Pulse" color={T.teal} stat="8 follow-ups" delay={220} />
            <ModuleCard name="Intelligence" color={T.purple} stat="91% util." delay={290} />
          </div>

          {/* KPI 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 5 }}>
            <KPI label="Follow-up Rate" value="3.3" unit="sess/pt" delta="+2%" dir="up" status="green" sparkData={[2.8,2.9,3.0,3.1,3.0,3.2,3.3]} delay={350} />
            <KPI label="HEP Compliance" value="87%" delta="+1%" dir="up" status="green" sparkData={[80,82,83,84,85,86,87]} delay={400} />
            <KPI label="Utilisation" value="74%" delta="+1%" dir="up" status="red" sparkData={[70,71,72,71,73,73,74]} delay={450} />
            <KPI label="DNA Rate" value="3%" delta="-25%" dir="up" status="green" sparkData={[6,5.5,5,4.2,3.8,3.2,3]} delay={500} />
          </div>

          {/* Bottom row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <div style={{
              padding: "8px 12px", borderRadius: 10,
              backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              opacity: loaded ? 1 : 0, transition: "opacity 0.5s ease 0.55s",
            }}>
              <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Appointments</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#fff", lineHeight: 1 }}>73</span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>this week</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.success, marginLeft: 2 }}>↑+4%</span>
              </div>
            </div>
            <div style={{
              padding: "8px 12px", borderRadius: 10,
              backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              opacity: loaded ? 1 : 0, transition: "opacity 0.5s ease 0.6s",
            }}>
              <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Rev / Session</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#fff", lineHeight: 1 }}>£79</span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>avg</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", marginLeft: 2 }}>+0%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
