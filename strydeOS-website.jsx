import { useState, useEffect, useRef } from "react";

/* ─── Brand Tokens ─────────────────────────────────────────────────────────── */
const C = {
  cloudDancer: "#F2F1EE",
  cloudLight:  "#F9F8F6",
  cloudDark:   "#E8E6E0",
  navy:        "#0B2545",
  navyMid:     "#132D5E",
  blue:        "#1A5CDB",
  blueBright:  "#2E7DF0",
  blueGlow:    "#3B90FF",
  teal:        "#0891B2",
  cream:       "#FAF9F7",
  ink:         "#111827",
  muted:       "#6B7280",
  success:     "#059669",
  border:      "#E2DFDA",
};

/* ─── Global Styles ─────────────────────────────────────────────────────────── */
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'Outfit', sans-serif;
    background: ${C.cloudDancer};
    color: ${C.ink};
    overflow-x: hidden;
  }
  ::selection { background: ${C.blue}33; }
  .serif { font-family: 'DM Serif Display', serif; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes float {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(-8px); }
  }
  @keyframes glow-pulse {
    0%,100% { box-shadow: 0 0 40px ${C.blue}40, 0 0 80px ${C.blue}20; }
    50%     { box-shadow: 0 0 60px ${C.blue}60, 0 0 120px ${C.blue}30; }
  }

  .animate-float { animation: float 4s ease-in-out infinite; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 32px; background: ${C.blue}; color: white;
    border: none; border-radius: 50px;
    font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all 0.3s ease; text-decoration: none;
    letter-spacing: 0.01em;
  }
  .btn-primary:hover { background: ${C.blueBright}; transform: translateY(-2px); box-shadow: 0 16px 40px ${C.blue}40; }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 28px; background: transparent; color: rgba(255,255,255,0.7);
    border: 1.5px solid rgba(255,255,255,0.2); border-radius: 50px;
    font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 500;
    cursor: pointer; transition: all 0.3s ease; text-decoration: none;
  }
  .btn-ghost:hover { border-color: rgba(255,255,255,0.5); color: white; transform: translateY(-2px); }

  .btn-outline {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 28px; background: transparent;
    color: ${C.blue}; border: 1.5px solid ${C.blue}; border-radius: 50px;
    font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 500;
    cursor: pointer; transition: all 0.3s ease; text-decoration: none;
  }
  .btn-outline:hover { background: ${C.blue}10; transform: translateY(-2px); }

  .section-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 14px; background: ${C.blue}12; border: 1px solid ${C.blue}25;
    border-radius: 50px; font-size: 11px; font-weight: 600;
    color: ${C.blue}; letter-spacing: 0.1em; text-transform: uppercase;
    margin-bottom: 16px;
  }

  .card-hover { transition: transform 0.3s ease, box-shadow 0.3s ease; }
  .card-hover:hover { transform: translateY(-5px); box-shadow: 0 20px 48px rgba(26,92,219,0.11); }

  input[type="range"] {
    -webkit-appearance: none; width: 100%; height: 5px;
    border-radius: 3px; background: ${C.border}; outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 20px; height: 20px;
    border-radius: 50%; background: ${C.blue}; cursor: pointer;
    box-shadow: 0 0 0 4px ${C.blue}20;
  }

  @media (max-width: 768px) {
    .policy-grid { grid-template-columns: 1fr !important; }
    .compliance-bar { grid-template-columns: 1fr 1fr !important; }
  }
`;

/* ─── RadialGlow ─────────────────────────────────────────────────────────────── */
const RadialGlow = ({ color = C.blue, size = 600, opacity = 0.12, style = {} }) => (
  <div style={{
    position: "absolute", width: size, height: size, borderRadius: "50%",
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    opacity, pointerEvents: "none", ...style,
  }} />
);

/* ─── MonolithMark — glass container, unique IDs per instance ──────────────── */
let _mmCount = 0;
const MonolithMark = ({ size = 34 }) => {
  const idRef = useRef(null);
  if (!idRef.current) idRef.current = `mm${++_mmCount}`;
  const id = idRef.current;
  const gCont = `${id}c`, gRad = `${id}r`, gTopface = `${id}t`;
  const gRim = `${id}m`, gBorder = `${id}b`;
  const cPillar = `${id}p`, cAbove = `${id}a`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label="StrydeOS"
      style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={gCont} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={C.blueBright} stopOpacity="0.58"/>
          <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72"/>
        </linearGradient>
        <radialGradient id={gRad} cx="28%" cy="24%" r="60%">
          <stop offset="0%" stopColor={C.blueGlow} stopOpacity="0.42"/>
          <stop offset="100%" stopColor={C.blue} stopOpacity="0"/>
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
          <stop offset="0%" stopColor={C.blueGlow} stopOpacity="0.65"/>
          <stop offset="100%" stopColor={C.blue} stopOpacity="0.06"/>
        </linearGradient>
        <clipPath id={cPillar}><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
        <clipPath id={cAbove}><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${gCont})`}/>
      <rect width="100" height="100" rx="24" fill={`url(#${gRad})`}/>
      <rect width="100" height="100" rx="24" fill="none" stroke={`url(#${gBorder})`} strokeWidth="1.2"/>
      <path d="M 17 21 Q 50 12 83 21" stroke={`url(#${gRim})`} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10"/>
      <g clipPath={`url(#${cPillar})`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${gTopface})`} clipPath={`url(#${cAbove})`}/>
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"/>
      <polygon points="52,20 57,20 57,29" fill="white" fillOpacity="0.18"/>
    </svg>
  );
};

/* ─── Security page icons ───────────────────────────────────────────────────── */
const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const ServerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
    <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);
const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const ClipboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1"/>
  </svg>
);
const CheckIcon = ({ color = C.success, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

/* ─── Nav ────────────────────────────────────────────────────────────────────── */
const Nav = () => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 24px", transition: "all 0.3s ease",
      background: scrolled ? "rgba(242,241,238,0.94)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? `1px solid ${C.border}` : "none",
    }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <MonolithMark size={36} />
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 17, color: C.navy, letterSpacing: "-0.02em" }}>
            Stryde<span style={{ color: C.blue }}>OS</span>
          </div>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {[["Products","#products"],["How it works","#how-it-works"],["Results","#results"],["Pricing","#pricing"]].map(([label, href]) => (
            <a key={label} href={href} style={{
              color: C.ink, fontSize: 14, fontWeight: 500,
              textDecoration: "none", opacity: 0.65, transition: "opacity 0.2s",
            }}
              onMouseEnter={e => e.target.style.opacity = 1}
              onMouseLeave={e => e.target.style.opacity = 0.65}
            >{label}</a>
          ))}
        </div>
        <a href="#early-access" className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }}>
          Get Early Access
        </a>
      </div>
    </nav>
  );
};

/* ─── Hero ───────────────────────────────────────────────────────────────────── */
const Hero = () => {
  const [count1, setCount1] = useState(0);
  const [count2, setCount2] = useState(0);
  const [count3, setCount3] = useState(0);
  useEffect(() => {
    const go = (target, setter, delay = 0, duration = 1600) => {
      setTimeout(() => {
        let start = null;
        const step = ts => {
          if (!start) start = ts;
          const p = Math.min((ts - start) / duration, 1);
          setter(Math.floor(p * target));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, delay);
    };
    go(67, setCount1, 400);
    go(43, setCount2, 600);
    go(3, setCount3, 800);
  }, []);

  return (
    <section style={{
      position: "relative", overflow: "hidden", minHeight: "100vh",
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: "120px 24px 80px",
      background: `linear-gradient(160deg, ${C.cloudLight} 0%, ${C.cloudDancer} 50%, ${C.cloudDark} 100%)`,
    }}>
      <RadialGlow color={C.blue} size={900} opacity={0.07} style={{ top: -250, right: -200 }} />
      <RadialGlow color={C.teal} size={600} opacity={0.06} style={{ bottom: -100, left: -150 }} />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `radial-gradient(circle, ${C.blue}15 1px, transparent 1px)`,
        backgroundSize: "44px 44px", opacity: 0.45,
      }} />

      <div style={{ maxWidth: 1160, margin: "0 auto", width: "100%", position: "relative", zIndex: 2 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>

          {/* Left */}
          <div style={{ animation: "fadeUp 0.8s ease forwards" }}>
            <div className="section-chip" style={{ marginBottom: 24 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.success, display: "inline-block" }} />
              Now in early access · Private practice
            </div>
            <h1 className="serif" style={{ fontSize: 60, lineHeight: 1.0, color: C.navy, marginBottom: 10, fontWeight: 400, letterSpacing: "-0.01em" }}>
              The Clinic OS
            </h1>
            <h1 className="serif" style={{ fontSize: 60, lineHeight: 1.0, color: C.navy, marginBottom: 28, fontWeight: 400, letterSpacing: "-0.01em" }}>
              for <span style={{ fontStyle: "italic", color: C.blue }}>private practice.</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.7, color: C.muted, marginBottom: 20, maxWidth: 500 }}>
              The operational layer private clinics are missing. Fewer gaps in the diary. More patients completing their course of treatment. Clinical performance that shows up in your revenue.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: C.muted, marginBottom: 40, maxWidth: 480, fontStyle: "italic", borderLeft: `3px solid ${C.blue}40`, paddingLeft: 16 }}>
              StrydeOS is what well-run private clinics have built for themselves — packaged for everyone else.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 52 }}>
              <a href="#early-access" className="btn-primary">
                Get Early Access
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
              <a href="#products" className="btn-outline">See how it works</a>
            </div>
            <div style={{ display: "flex", gap: 28 }}>
              {["GDPR Compliant", "UK-hosted · Secure", "No lock-in"].map(label => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, fontWeight: 500 }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 6.5l3 3 5-5" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right — OS mockup */}
          <div style={{ animation: "fadeUp 0.8s 0.2s ease both" }}>
            <div className="animate-float" style={{ position: "relative" }}>
              <div style={{
                background: C.navy, borderRadius: 24, padding: 28,
                boxShadow: `0 48px 80px ${C.navy}50, 0 0 0 1px rgba(255,255,255,0.06)`,
                animation: "glow-pulse 4s ease-in-out infinite",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>Spires MSK · London</div>
                    <div style={{ color: "white", fontSize: 15, fontWeight: 600 }}>StrydeOS Dashboard</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${C.success}20`, padding: "5px 12px", borderRadius: 20 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#34D399" }} />
                    <span style={{ color: "#34D399", fontSize: 11, fontWeight: 600 }}>Live</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
                  {[
                    { name: "Receptionist", status: "Active", calls: "12 today", color: C.blue },
                    { name: "Continuity", status: "Active", calls: "8 follow-ups", color: C.teal },
                    { name: "Intelligence", status: "Active", calls: "91% util.", color: "#8B5CF6" },
                  ].map(({ name, status, calls, color }) => (
                    <div key={name} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 14px", border: `1px solid ${color}30` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
                        <div style={{ fontSize: 9, color: color, fontWeight: 600 }}>{status}</div>
                      </div>
                      <div style={{ color: "white", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{calls}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Follow-up Rate", value: "78%", bar: 78, status: "warn" },
                    { label: "Course Completion", value: "84%", bar: 84, status: "ok" },
                    { label: "Utilisation", value: "91%", bar: 91, status: "ok" },
                    { label: "No-show Rate", value: "4.2%", bar: 42, status: "ok" },
                  ].map(({ label, value, bar, status }) => (
                    <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: status === "ok" ? "#10B981" : "#F59E0B", boxShadow: `0 0 6px ${status === "ok" ? "#10B981" : "#F59E0B"}` }} />
                      </div>
                      <div style={{ color: "white", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{value}</div>
                      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 3 }}>
                        <div style={{ width: `${bar}%`, height: "100%", borderRadius: 4, background: status === "ok" ? `linear-gradient(90deg,${C.teal},${C.blueGlow})` : "linear-gradient(90deg,#F59E0B,#FCD34D)" }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Patient Retention — 90 days</div>
                  <svg viewBox="0 0 280 50" style={{ width: "100%", overflow: "visible" }}>
                    <defs>
                      <linearGradient id="heroG1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.blueGlow} stopOpacity="0.25"/>
                        <stop offset="100%" stopColor={C.blueGlow} stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <path d="M0,38 C30,32 60,40 90,34 C120,28 150,30 180,20 C210,10 240,14 280,8" fill="none" stroke={C.blueGlow} strokeWidth="2" strokeLinecap="round"/>
                    <path d="M0,38 C30,32 60,40 90,34 C120,28 150,30 180,20 C210,10 240,14 280,8 L280,50 L0,50 Z" fill="url(#heroG1)"/>
                    {[[0,38],[90,34],[180,20],[280,8]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="3" fill={C.blueGlow}/>)}
                  </svg>
                </div>
              </div>
              <div style={{
                position: "absolute", top: -14, right: -18,
                background: "white", borderRadius: 12, padding: "9px 14px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, fontWeight: 600, color: C.success,
                border: `1px solid ${C.success}20`,
              }}>
                <span>📞</span> Call answered automatically
              </div>
              <div style={{
                position: "absolute", bottom: -14, left: -18,
                background: "white", borderRadius: 12, padding: "9px 14px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, fontWeight: 600, color: C.blue,
                border: `1px solid ${C.blue}15`,
              }}>
                <span>💬</span> Re-booking prompt sent
              </div>
            </div>
          </div>
        </div>

        {/* Positioning statement */}
        <div style={{
          marginTop: 80, padding: "36px 48px", background: C.navy,
          borderRadius: 20, position: "relative", overflow: "hidden",
        }}>
          <RadialGlow color={C.blue} size={400} opacity={0.12} style={{ top: -100, right: -50 }} />
          <div style={{ position: "relative", zIndex: 2, maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <p className="serif" style={{ fontSize: 20, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, fontStyle: "italic" }}>
              "Most private practices are a few operational changes away from running significantly better. The gap isn't clinical ability — it's visibility. When clinicians can see how they're performing, and patients stay engaged through treatment, the revenue follows."
            </p>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
              {[
                { icon: "🔗", text: "Connects to Cliniko & WriteUpp" },
                { icon: "🚫", text: "Not a PMS replacement" },
                { icon: "⚡", text: "Live above your existing stack" },
              ].map(({ icon, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                  <span>{icon}</span><span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─── HolisticSection ────────────────────────────────────────────────────────── */
const HolisticSection = () => (
  <section id="how-it-works" style={{ padding: "100px 24px", background: C.cream }}>
    <div style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <div className="section-chip">One Operating System</div>
          <h2 className="serif" style={{ fontSize: 44, color: C.navy, fontWeight: 400, lineHeight: 1.1, marginBottom: 24 }}>
            Every gap closed.
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: C.muted, marginBottom: 20 }}>
            The clinics running at consistent capacity aren't doing anything clinically exceptional. They answer every call. They follow up after every session. They know, week by week, where performance is strong and where it's slipping.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: C.muted, marginBottom: 32 }}>
            That visibility is what turns good clinical outcomes into sustainable revenue. StrydeOS makes it possible without adding headcount.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: C.ink, fontWeight: 500 }}>
            Clinical performance and business performance aren't in tension — they're the same thing, measured properly.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { name: "StrydeOS Receptionist", desc: "No missed calls. Every patient that reaches you, booked.", icon: "📞", color: C.blue, n: "01" },
            { name: "StrydeOS Continuity", desc: "Patients who complete treatment. Fewer drop-offs, more referrals.", icon: "📈", color: C.teal, n: "02" },
            { name: "StrydeOS Intelligence", desc: "Clinician-level KPIs that connect performance to revenue.", icon: "📊", color: "#8B5CF6", n: "03" },
          ].map(({ name, desc, icon, color, n }) => (
            <div key={name} className="card-hover" style={{
              display: "flex", alignItems: "center", gap: 20,
              background: "white", borderRadius: 16, padding: "20px 24px",
              border: `1px solid ${C.border}`,
              boxShadow: "0 2px 12px rgba(11,37,69,0.04)",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${color}15`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              }}>{icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.navy, marginBottom: 3 }}>{name}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{desc}</div>
              </div>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: `${color}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color, flexShrink: 0,
              }}>{n}</div>
            </div>
          ))}
          <div style={{
            padding: "14px 24px", borderRadius: 12,
            background: `${C.blue}08`, border: `1px dashed ${C.blue}30`, textAlign: "center",
          }}>
            <span style={{ fontSize: 13, color: C.blue, fontWeight: 500 }}>Better alone. Unstoppable together.</span>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ─── Integrations ───────────────────────────────────────────────────────────── */
const Integrations = () => (
  <section style={{ padding: "80px 24px", background: C.cloudDancer, borderTop: `1px solid ${C.border}` }}>
    <div style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <div className="section-chip">Works With Your Stack</div>
        <h2 className="serif" style={{ fontSize: 40, color: C.navy, fontWeight: 400, marginBottom: 16 }}>
          The pitch isn't "switch to StrydeOS."
        </h2>
        <p style={{ fontSize: 16, color: C.muted, maxWidth: 560, margin: "0 auto", lineHeight: 1.75 }}>
          Cliniko and WriteUpp own the PMS layer — appointments, notes, billing. StrydeOS sits <em>above</em> that. It connects to whatever you're already running and extends it, not replaces it.
        </p>
      </div>

      <div style={{
        background: C.navy, borderRadius: 24, padding: "48px 40px",
        position: "relative", overflow: "hidden", marginBottom: 40,
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: `radial-gradient(circle, ${C.blue}18 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 14 }}>Your existing PMS — unchanged</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
              {[
                { name: "Cliniko", icon: "🗓️", desc: "Appointments · Notes · Billing" },
                { name: "WriteUpp", icon: "📝", desc: "Appointments · Notes · Billing" },
                { name: "Jane App", icon: "🏥", desc: "Appointments · Notes · Billing" },
                { name: "Other PMS", icon: "⚙️", desc: "Via API or webhook" },
              ].map(({ name, icon, desc }) => (
                <div key={name} style={{
                  background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 22px",
                  border: "1px solid rgba(255,255,255,0.08)", textAlign: "center", minWidth: 160,
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                  <div style={{ color: "white", fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{name}</div>
                  <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 10 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 80, margin: "16px 0", padding: "0 40px" }}>
            {["Pulls appointment data", "Pushes bookings in", "Reads patient history"].map(label => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 1.5, height: 28, background: `linear-gradient(${C.blue}, ${C.teal})` }} />
                <div style={{ fontSize: 9, color: C.teal, fontWeight: 600, textAlign: "center", maxWidth: 80 }}>{label}</div>
                <div style={{ width: 1.5, height: 28, background: `linear-gradient(${C.teal}, ${C.blue})` }} />
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.blue, marginBottom: 14 }}>StrydeOS — sits above your stack</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
              {[
                { name: "Receptionist", icon: "📞", color: C.blue, desc: "Answers calls — books into your PMS" },
                { name: "Continuity", icon: "📈", color: C.teal, desc: "Reads appointment data — triggers follow-up" },
                { name: "Intelligence", icon: "📊", color: "#8B5CF6", desc: "Pulls KPI data — builds live dashboard" },
              ].map(({ name, icon, color, desc }) => (
                <div key={name} style={{
                  background: `${color}18`, borderRadius: 14, padding: "16px 24px",
                  border: `1px solid ${color}35`, textAlign: "center", minWidth: 200,
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                  <div style={{ color: "white", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>StrydeOS {name}</div>
                  <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 10, lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          { q: "Do I need to switch systems?", a: "No. StrydeOS connects to Cliniko, WriteUpp, and most other PMS via API. Your workflows stay exactly as they are.", icon: "🔗" },
          { q: "Will my team need retraining?", a: "They keep using the same PMS they always have. StrydeOS runs quietly in the background — your staff only notice the results.", icon: "👥" },
          { q: "How long does setup take?", a: "Most practices are live within 5 days. API connections to major PMS are pre-built. We handle the integration.", icon: "⚡" },
        ].map(({ q, a, icon }) => (
          <div key={q} className="card-hover" style={{
            background: "white", borderRadius: 16, padding: "24px 26px",
            border: `1px solid ${C.border}`,
            boxShadow: "0 2px 12px rgba(11,37,69,0.04)",
          }}>
            <div style={{ fontSize: 26, marginBottom: 12 }}>{icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 10 }}>{q}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{a}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ─── Products ───────────────────────────────────────────────────────────────── */
const Products = () => {
  const [active, setActive] = useState(0);

  const products = [
    {
      id: "receptionist", label: "Receptionist", icon: "📞", color: C.blue,
      eyebrow: "StrydeOS Receptionist",
      headline: "Never miss a patient again.",
      body: "Every unanswered call is a patient who books somewhere else. Every cancellation that doesn't get followed up is revenue that disappears quietly.\n\nStrydeOS Receptionist handles inbound calls, books appointments, recovers cancellations and chases no-shows — automatically, around the clock.",
      proof: "Clinics using it have stopped paying £400–800/month to call-handling services. They've also stopped losing patients at the first point of contact.",
      tagline: "Your front desk. Without the overhead.",
      cta: "Start with Receptionist",
      bullets: ["Inbound calls handled 24/7", "Books directly into your calendar", "Cancellation recovery & no-show chasing", "SMS confirmations sent automatically", "Emergency routing to on-call clinician"],
      visual: (
        <div style={{ background: C.navy, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.blue}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
            <div>
              <div style={{ color: "white", fontWeight: 600, fontSize: 13 }}>StrydeOS Receptionist</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399" }} />
                <span style={{ color: "#34D399" }}>Live · Spires MSK</span>
              </div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Today: 12 calls handled</div>
          </div>
          <div style={{ padding: 20 }}>
            {[
              { from: "caller", text: "Hi, I'd like to book an appointment for my lower back." },
              { from: "ai", text: "Of course — I can help with that. Are mornings or afternoons better for you?" },
              { from: "caller", text: "Mornings, ideally Thursday or Friday." },
              { from: "ai", text: "I have Thursday at 9:15am with Dr. Reeves. Shall I book that and send you a confirmation text?" },
              { from: "caller", text: "Yes please." },
              { from: "ai", text: "Done — you're booked in. You'll get a text shortly. Is there anything else I can help with?" },
            ].map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.from === "caller" ? "flex-start" : "flex-end", marginBottom: 8 }}>
                <div style={{
                  maxWidth: "76%", padding: "9px 13px", borderRadius: 12,
                  background: msg.from === "caller" ? "rgba(255,255,255,0.07)" : `${C.blue}45`,
                  color: msg.from === "caller" ? "rgba(255,255,255,0.65)" : "white",
                  fontSize: 11, lineHeight: 1.55,
                }}>{msg.text}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "continuity", label: "Continuity", icon: "📈", color: C.teal,
      eyebrow: "StrydeOS Continuity",
      headline: "Keep patients in care, longer.",
      body: "The drop-off between session two and session three is where most clinics leak the most revenue. Patients disengage — not because the treatment isn't working, but because nobody stayed in touch.\n\nStrydeOS Continuity automates every touchpoint between sessions.",
      proof: "The clinics getting this right aren't doing it by hand. They've systematised it — and it shows in their completion rates and referral volume.",
      tagline: "Better outcomes. Fewer drop-offs. More referrals.",
      cta: "Start with Continuity",
      bullets: ["Automated post-session reminders", "Rebooking prompts at the right moment", "Post-discharge check-ins", "Outcome tracking per patient", "Referral prompts when patients are engaged"],
      visual: (
        <div style={{ background: C.navy, borderRadius: 18, padding: 20 }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Patient Journey — Automated</div>
          {[
            { session: "Session 1", action: "Welcome + exercise plan sent", status: "done", delay: "Same day" },
            { session: "Session 2", action: "Progress check-in SMS", status: "done", delay: "Day 3" },
            { session: "Session 3", action: "Rebooking prompt triggered", status: "done", delay: "Day 6" },
            { session: "Gap detected", action: "Re-engagement message sent", status: "active", delay: "Day 9" },
            { session: "Post-discharge", action: "Outcome & referral ask", status: "pending", delay: "Week 6" },
          ].map(({ session, action, status, delay }) => (
            <div key={session} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: status === "done" ? `${C.success}25` : status === "active" ? `${C.teal}25` : "rgba(255,255,255,0.06)",
                border: `1.5px solid ${status === "done" ? C.success : status === "active" ? C.teal : "rgba(255,255,255,0.1)"}`,
              }}>
                {status === "done" ? <span style={{ fontSize: 12, color: "#34D399" }}>✓</span>
                  : status === "active" ? <span style={{ fontSize: 8, color: C.teal, fontWeight: 700 }}>▶</span>
                  : <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>○</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: status === "pending" ? "rgba(255,255,255,0.3)" : "white", fontSize: 11, fontWeight: 600 }}>{session}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{action}</div>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>{delay}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "intelligence", label: "Intelligence", icon: "📊", color: "#8B5CF6",
      eyebrow: "StrydeOS Intelligence",
      headline: "Know how your clinic actually performs.",
      body: "Revenue tells you something went right or wrong. It doesn't tell you why, or where, or who.\n\nStrydeOS Intelligence gives you the metrics that actually matter — follow-up rates, patient retention, programme completion, clinician performance by outcome.",
      proof: "Not to manage people. To understand where your clinic is thriving and where it isn't. The best-run clinics already know these numbers.",
      tagline: "Real-time. Actionable. Built for practice owners, not analysts.",
      cta: "Start with Intelligence",
      bullets: ["Per-clinician KPI views", "Patient retention & completion rates", "Utilisation and DNA tracking", "90-day rolling trend charts", "Automatic alert flags when metrics drift"],
      visual: (
        <div style={{ background: C.navy, borderRadius: 18, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Live KPI Board</div>
            <div style={{ background: "#8B5CF625", color: "#A78BFA", fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>Week 24</div>
          </div>
          {[
            { name: "Dr. A. Reeves", fu: "78%", comp: "84%", util: "91%", warn: true },
            { name: "S. Okoye",      fu: "92%", comp: "90%", util: "84%", warn: false },
            { name: "J. Perkins",    fu: "88%", comp: "95%", util: "96%", warn: false },
          ].map(row => (
            <div key={row.name} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, alignItems: "center", padding: "10px 12px", marginBottom: 6, background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {row.warn && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />}
                <div style={{ color: "white", fontWeight: 500, fontSize: 12 }}>{row.name}</div>
              </div>
              {[row.fu, row.comp, row.util].map((v, i) => {
                const ok = parseFloat(v) >= 80;
                return (
                  <div key={i} style={{ textAlign: "center", padding: "3px 0", borderRadius: 6, background: ok ? "#10B98118" : "#F59E0B18", color: ok ? "#34D399" : "#FBBF24", fontWeight: 700, fontSize: 12 }}>{v}</div>
                );
              })}
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "6px 12px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}></div>
            {["Follow-up", "Completion", "Utilisation"].map(l => <div key={l} style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>{l}</div>)}
          </div>
        </div>
      ),
    },
  ];

  const p = products[active];

  return (
    <section id="products" style={{ padding: "100px 24px", background: C.cloudDancer }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div className="section-chip">Products</div>
          <h2 className="serif" style={{ fontSize: 44, color: C.navy, fontWeight: 400 }}>
            Three products. One platform.
          </h2>
          <p style={{ color: C.muted, fontSize: 16, marginTop: 14, maxWidth: 480, margin: "14px auto 0" }}>
            Each solves a specific, expensive problem. Use one or all three.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 52 }}>
          {products.map((pr, i) => (
            <button key={pr.id} onClick={() => setActive(i)} style={{
              padding: "11px 22px", borderRadius: 50, cursor: "pointer",
              background: active === i ? pr.color : "transparent",
              color: active === i ? "white" : C.muted,
              fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 500,
              border: `1.5px solid ${active === i ? pr.color : C.border}`,
              transition: "all 0.3s",
            }}>
              {pr.icon} {pr.label}
            </button>
          ))}
        </div>

        <div key={active} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center", animation: "fadeIn 0.4s ease" }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 50, marginBottom: 18,
              background: `${p.color}15`, color: p.color,
              fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
              border: `1px solid ${p.color}25`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
              {p.eyebrow}
            </div>
            <h3 className="serif" style={{ fontSize: 36, color: C.navy, fontWeight: 400, lineHeight: 1.15, marginBottom: 20 }}>
              {p.headline}
            </h3>
            {p.body.split("\n\n").map((para, i) => (
              <p key={i} style={{ color: C.muted, lineHeight: 1.75, marginBottom: 14, fontSize: 15 }}>{para}</p>
            ))}
            <div style={{ padding: "14px 18px", borderLeft: `3px solid ${p.color}`, marginBottom: 24, marginTop: 8 }}>
              <p style={{ color: C.ink, fontSize: 13.5, lineHeight: 1.65 }}>{p.proof}</p>
            </div>
            <p style={{ fontSize: 14, color: p.color, fontWeight: 600, fontStyle: "italic", marginBottom: 24 }}>"{p.tagline}"</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
              {p.bullets.map(b => (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${p.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke={p.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ fontSize: 14, color: C.ink }}>{b}</span>
                </div>
              ))}
            </div>
            <a href="#early-access" className="btn-primary" style={{ background: p.color }}>
              {p.cta} →
            </a>
          </div>
          <div>{p.visual}</div>
        </div>
      </div>
    </section>
  );
};

/* ─── Results ────────────────────────────────────────────────────────────────── */
const Results = () => (
  <section id="results" style={{
    padding: "100px 24px", background: C.navy, position: "relative", overflow: "hidden",
  }}>
    <RadialGlow color={C.blue} size={700} opacity={0.12} style={{ top: -200, right: -100 }} />
    <RadialGlow color={C.teal} size={500} opacity={0.08} style={{ bottom: -100, left: -100 }} />

    <div style={{ maxWidth: 1160, margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ textAlign: "center", marginBottom: 60 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 50, background: `${C.blue}25`, border: `1px solid ${C.blue}40`, color: C.blueGlow, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
          Results
        </div>
        <h2 className="serif" style={{ fontSize: 44, color: "white", fontWeight: 400 }}>
          These aren't theoretical improvements.
        </h2>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, marginTop: 14, fontStyle: "italic" }}>
          Better clinical outcomes. Higher completion rates. Revenue that reflects the quality of care being delivered.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 48 }}>
        {[
          { stat: "67%→4%", label: "Missed call rate", note: "Solo MSK practice, 6 months post-launch" },
          { stat: "84%", label: "Course completion rate", note: "vs 61% industry average" },
          { stat: "£800/mo", label: "Saved on call-handling", note: "vs Moneypenny & live agent costs" },
          { stat: "< 3 months", label: "Typical payback period", note: "Conservative estimate, all tiers" },
        ].map(({ stat, label, note }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.05)", borderRadius: 18, padding: "28px 24px",
            border: "1px solid rgba(255,255,255,0.07)", textAlign: "center",
          }}>
            <div className="serif" style={{ fontSize: 38, color: "white", fontWeight: 400, marginBottom: 8 }}>{stat}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{note}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 20, padding: "40px 48px",
        border: "1px solid rgba(255,255,255,0.07)",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 11, color: C.blueGlow, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Case Study — Spires MSK, London</div>
          <h3 className="serif" style={{ fontSize: 28, color: "white", fontWeight: 400, lineHeight: 1.2, marginBottom: 20 }}>
            Full clinical visibility in{" "}
            <span style={{ fontStyle: "italic", color: C.blueGlow }}>one week.</span>
          </h3>
          <blockquote style={{ borderLeft: `3px solid ${C.blue}`, paddingLeft: 18, color: "rgba(255,255,255,0.6)", fontStyle: "italic", fontSize: 15, lineHeight: 1.65 }}>
            "I finally have a single view across all my clinicians. The follow-up flag alone has changed how I run my Monday morning meetings."
            <div style={{ fontStyle: "normal", marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
              — Andrew, Clinical Director, Spires MSK Physiotherapy
            </div>
          </blockquote>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { before: "No performance visibility", after: "Real-time KPI board" },
            { before: "Follow-up rate: unknown", after: "Tracked weekly" },
            { before: "Physitrack: guesswork", after: "100% compliance" },
            { before: "Revenue: quarterly view", after: "Revenue: live" },
          ].map(({ before, after }) => (
            <div key={before} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, textDecoration: "line-through", marginBottom: 5 }}>{before}</div>
              <div style={{ color: "white", fontSize: 12, fontWeight: 500 }}>{after}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

/* ─── ROI Calculator ─────────────────────────────────────────────────────────── */
const ROICalc = () => {
  const [sessions, setSessions] = useState(150);
  const [dna, setDna] = useState(10);
  const [fee, setFee] = useState(65);
  const [missedCalls, setMissedCalls] = useState(30);
  const [dropout, setDropout] = useState(22);

  const dnaLoss  = Math.round(sessions * (dna / 100) * fee * 12);
  const callLoss = Math.round(sessions * (missedCalls / 100) * fee * 0.25 * 12);
  const dropLoss = Math.round(sessions * (dropout / 100) * fee * 1.2 * 12);
  const total = dnaLoss + callLoss + dropLoss;

  return (
    <section style={{ padding: "100px 24px", background: C.cream }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div className="section-chip">ROI Calculator</div>
          <h2 className="serif" style={{ fontSize: 42, color: C.navy, fontWeight: 400 }}>
            What's operational leakage costing you?
          </h2>
          <p style={{ color: C.muted, marginTop: 14, fontSize: 15 }}>
            Conservative estimates. Real numbers. Dial in your clinic and see where revenue is leaving through the gaps.
          </p>
        </div>

        <div style={{ background: "white", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 60px rgba(11,37,69,0.07)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: 40, borderRight: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: C.navy, marginBottom: 30 }}>Your clinic</h3>
              {[
                { label: "Monthly patient sessions", val: sessions, set: setSessions, min: 50, max: 600, step: 10, disp: `${sessions}` },
                { label: "DNA / no-show rate", val: dna, set: setDna, min: 2, max: 25, step: 1, disp: `${dna}%` },
                { label: "Average fee per session", val: fee, set: setFee, min: 40, max: 180, step: 5, disp: `£${fee}` },
                { label: "Missed inbound call rate", val: missedCalls, set: setMissedCalls, min: 5, max: 65, step: 1, disp: `${missedCalls}%` },
                { label: "Patient drop-off rate (pre-discharge)", val: dropout, set: setDropout, min: 5, max: 50, step: 1, disp: `${dropout}%` },
              ].map(({ label, val, set, min, max, step, disp }) => (
                <div key={label} style={{ marginBottom: 26 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <label style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>{label}</label>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.blue, background: `${C.blue}10`, padding: "2px 12px", borderRadius: 8 }}>{disp}</div>
                  </div>
                  <input type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))} />
                </div>
              ))}
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, marginTop: 8, fontStyle: "italic" }}>
                Estimates use conservative conversion rates — not every missed call converts, not every dropout loses a full course of treatment.
              </p>
            </div>

            <div style={{ padding: 40, background: `linear-gradient(145deg, ${C.navy}, ${C.navyMid})`, position: "relative", overflow: "hidden" }}>
              <RadialGlow color={C.blue} size={400} opacity={0.18} style={{ top: -100, right: -100 }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 28 }}>Estimated annual revenue leakage</h3>
                {[
                  { label: "No-shows & late cancellations", val: dnaLoss },
                  { label: "Missed inbound bookings", val: callLoss },
                  { label: "Premature patient dropout", val: dropLoss },
                ].map(({ label, val }) => (
                  <div key={label} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 4 }}>{label}</div>
                    <div className="serif" style={{ fontSize: 30, color: "white" }}>£{val.toLocaleString()}</div>
                  </div>
                ))}
                <div style={{ background: `${C.blue}25`, borderRadius: 16, padding: 20, border: `1px solid ${C.blue}40`, marginTop: 8, marginBottom: 24 }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 6 }}>Conservative annual estimate</div>
                  <div className="serif" style={{ fontSize: 46, color: "white", lineHeight: 1 }}>£{total.toLocaleString()}</div>
                  <div style={{ marginTop: 10, color: "#34D399", fontSize: 12, fontWeight: 600 }}>
                    Most practices recover their StrydeOS cost within 90 days
                  </div>
                </div>
                <a href="#early-access" className="btn-primary" style={{ width: "100%", justifyContent: "center", borderRadius: 14 }}>
                  Book a free audit →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─── Pricing ────────────────────────────────────────────────────────────────── */
const Pricing = () => {
  const [activeTier, setActiveTier] = useState("studio");
  const [billing, setBilling] = useState("monthly");

  const tiers = [
    { id: "solo",   label: "Solo",   sub: "1 clinician" },
    { id: "studio", label: "Studio", sub: "2–4 clinicians" },
    { id: "clinic", label: "Clinic", sub: "6+ clinicians" },
  ];

  const products = [
    {
      id: "intelligence",
      name: "Intelligence",
      tagline: "Know your numbers, finally.",
      color: "#8B5CF6",
      icon: "📊",
      setup: 0,
      prices: { solo: 149, studio: 249, clinic: 399 },
      features: [
        "Per-clinician KPI dashboard (follow-up rate, HEP compliance, utilisation, DNA rate, revenue per session)",
        "Clinic-wide rollup view",
        "90-day rolling trend charts",
        "Alert flags when metrics drift below target",
        "NPS tracking and Google Review pipeline",
        "WriteUpp / Cliniko integration (read)",
        "Weekly email digest",
      ],
      cta: "Start free trial",
      highlight: false,
    },
    {
      id: "perform",
      name: "Perform",
      tagline: "Stop losing patients at the door.",
      color: C.blue,
      icon: "📞",
      setup: 500,
      prices: { solo: 349, studio: 549, clinic: 849 },
      features: [
        "Everything in Intelligence",
        "24/7 AI Voice Receptionist",
        "Live inbound call handling — books directly into your calendar",
        "Cancellation recovery and no-show chasing",
        "Emergency routing to on-call clinician",
        "SMS confirmations sent automatically",
        "500 SMS/month included",
        "Cliniko and WriteUpp write-back integration",
      ],
      cta: "Get Early Access",
      highlight: true,
    },
    {
      id: "growth",
      name: "Growth OS",
      tagline: "Better outcomes. Fewer drop-offs.",
      color: C.teal,
      icon: "📈",
      setup: 750,
      prices: { solo: 599, studio: 899, clinic: 1299 },
      features: [
        "Everything in Perform",
        "Patient Continuity flows",
        "Automated post-session follow-up sequences",
        "Dropout prevention triggers (gap detection, re-engagement messaging)",
        "Outcome tracking per patient",
        "Post-discharge check-ins",
        "Referral prompt sequences when patient engagement is high",
        "Advanced reporting pack included",
      ],
      cta: "Get Early Access",
      highlight: false,
    },
  ];

  const annualDiscount = 0.20;
  const displayPrice = (base) => {
    const p = billing === "annual" ? Math.round(base * (1 - annualDiscount)) : base;
    return `£${p}`;
  };

  return (
    <section id="pricing" style={{ padding: "100px 24px", background: C.cloudDancer }}>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="section-chip">Pricing</div>
          <h2 className="serif" style={{ fontSize: 44, color: C.navy, fontWeight: 400, marginBottom: 14 }}>
            Start with one. Scale to all three.
          </h2>
          <p style={{ color: C.muted, fontSize: 15, maxWidth: 460, margin: "0 auto 32px" }}>
            Every product works standalone or together. Pick the problem you want to solve first.
          </p>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, background: C.cloudDark, borderRadius: 50, padding: 4, marginBottom: 32 }}>
            {[{ id: "monthly", label: "Monthly" }, { id: "annual", label: "Annual  (save 20%)" }].map(b => (
              <button key={b.id} onClick={() => setBilling(b.id)} style={{
                padding: "8px 22px", borderRadius: 50, border: "none", cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600,
                background: billing === b.id ? "white" : "transparent",
                color: billing === b.id ? C.navy : C.muted,
                boxShadow: billing === b.id ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.2s",
              }}>{b.label}</button>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Your practice size</div>
            <div style={{ display: "inline-flex", gap: 10 }}>
              {tiers.map(t => (
                <button key={t.id} onClick={() => setActiveTier(t.id)} style={{
                  padding: "10px 24px", borderRadius: 50,
                  border: `1.5px solid ${activeTier === t.id ? C.blue : C.border}`,
                  background: activeTier === t.id ? `${C.blue}12` : "white",
                  color: activeTier === t.id ? C.blue : C.muted,
                  fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.2s",
                }}>
                  {t.label}
                  <span style={{ fontWeight: 400, fontSize: 11, display: "block", marginTop: 1 }}>{t.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 32 }}>
          {products.map(p => {
            const price = p.prices[activeTier];
            const isHighlight = p.highlight;
            return (
              <div key={p.id} className="card-hover" style={{
                background: isHighlight ? C.navy : "white",
                borderRadius: 22, padding: "32px 28px",
                border: isHighlight ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                position: "relative",
                boxShadow: isHighlight ? `0 32px 64px ${C.navy}25` : "0 2px 12px rgba(11,37,69,0.04)",
              }}>
                {isHighlight && (
                  <div style={{
                    position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                    background: C.blue, color: "white", fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    padding: "5px 20px", borderRadius: 50, whiteSpace: "nowrap",
                  }}>Most Popular</div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: `${p.color}${isHighlight ? "30" : "15"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  }}>{p.icon}</div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: p.color, marginBottom: 1 }}>StrydeOS</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: isHighlight ? "white" : C.navy }}>{p.name}</div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: isHighlight ? "rgba(255,255,255,0.45)" : C.muted, marginBottom: 20, fontStyle: "italic" }}>{p.tagline}</div>

                <div style={{ marginBottom: 6 }}>
                  <span className="serif" style={{ fontSize: 42, color: isHighlight ? "white" : C.navy, fontWeight: 400, lineHeight: 1 }}>
                    {displayPrice(price)}
                  </span>
                  <span style={{ fontSize: 13, color: isHighlight ? "rgba(255,255,255,0.35)" : C.muted, marginLeft: 4 }}>/mo</span>
                </div>
                {billing === "annual" && (
                  <div style={{ fontSize: 11, color: isHighlight ? "rgba(255,255,255,0.3)" : C.muted, marginBottom: 4 }}>
                    <span style={{ textDecoration: "line-through" }}>£{price}</span> billed monthly
                  </div>
                )}
                <div style={{ fontSize: 12, color: isHighlight ? "rgba(255,255,255,0.25)" : C.muted, marginBottom: 24 }}>
                  {p.setup === 0 ? "No setup fee" : `£${p.setup} one-time setup`}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                  {p.features.map((f, i) => (
                    <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                        background: `${p.color}${isHighlight ? "25" : "12"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {i === 0 && p.id !== "intelligence"
                          ? <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M4.5 1v7M1 4.5h7" stroke={p.color} strokeWidth="1.5" strokeLinecap="round"/></svg>
                          : <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2 2 4-4" stroke={isHighlight ? "#60A5FA" : p.color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        }
                      </div>
                      <span style={{ fontSize: 13, color: isHighlight ? "rgba(255,255,255,0.72)" : C.ink, lineHeight: 1.5 }}>
                        {i === 0 && p.id !== "intelligence" ? <strong style={{ fontWeight: 600 }}>{f}</strong> : f}
                      </span>
                    </div>
                  ))}
                </div>

                <a href="#early-access" style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "100%", padding: "13px 0", borderRadius: 14,
                  background: isHighlight ? C.blue : "transparent",
                  color: isHighlight ? "white" : p.color,
                  border: isHighlight ? "none" : `1.5px solid ${p.color}`,
                  fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600,
                  textDecoration: "none", cursor: "pointer", transition: "all 0.25s",
                }}>
                  {p.cta} →
                </a>
              </div>
            );
          })}
        </div>

        <div style={{
          background: "white", borderRadius: 18, padding: "24px 32px",
          border: `1px solid ${C.border}`, marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 16 }}>Add-ons</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
            {[
              { label: "Extra location", price: "+£99/mo", desc: "Per additional clinic site" },
              { label: "Over-tier clinicians", price: "+£49/mo", desc: "Per clinician above your tier cap" },
              { label: "Advanced reporting", price: "+£49/mo", desc: "Custom exports, insurer-ready PDF reports" },
              { label: "SMS top-up", price: "£0.06/msg", desc: "Beyond 500 messages/month" },
            ].map(({ label, price, desc }) => (
              <div key={label} style={{ padding: "14px 16px", background: C.cloudDancer, borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.blue, marginBottom: 3 }}>{price}</div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 13, color: C.muted, fontStyle: "italic" }}>
          Early access · No lock-in contracts · Onboarding & integration included
        </p>
      </div>
    </section>
  );
};

/* ─── WhyUs ──────────────────────────────────────────────────────────────────── */
const WhyUs = () => {
  const pillars = [
    {
      n: "01",
      title: "Built from inside the clinic.",
      color: C.blue,
      body: `Most software is built by people who've never worked a clinical day in their life. StrydeOS wasn't.\n\nWe know what a Monday morning handover looks like. We know the difference between a DNA and a late cancel. We know that "utilisation" means something very specific to a physio practice owner, and that Physitrack compliance isn't a vanity metric — it's a proxy for clinical outcomes.\n\nThat knowledge is baked into every feature. You won't spend three calls explaining your workflow to us. We already know it.`,
    },
    {
      n: "02",
      title: "We don't hide behind the dashboard.",
      color: C.teal,
      body: `You won't find us selling you a flashy interface full of metrics that don't move your business. Every number in StrydeOS Intelligence is there because it changes a decision — follow-up rate, course completion, DNA rate, revenue per session. Nothing else.\n\nIf a feature doesn't make your practice run better, we won't build it. If a metric doesn't help you act, it doesn't make the cut. We'd rather show you four numbers that matter than forty that don't.`,
    },
    {
      n: "03",
      title: "Patient outcomes are the only thing that actually counts.",
      color: "#8B5CF6",
      body: `Every product we've built traces back to the same question: does this help patients complete their course of treatment?\n\nReceptionist answers the phone so the patient gets booked. Continuity sends the reminder so they come back. Intelligence flags the clinician whose follow-up rate is slipping — before it becomes a pattern. The patient never sees StrydeOS. But they feel it.\n\nWe're not a marketing tool. We're not a retention gimmick. We're infrastructure for better clinical outcomes.`,
    },
    {
      n: "04",
      title: "We're in this with you, not just in your invoice.",
      color: C.blue,
      body: `To do this properly, we need to know more than your PMS. We need to know what kind of practice you're building, who your patients are, what your clinicians are good at, and where you're losing ground. That's how we set up StrydeOS in a way that actually fits — not a generic template with your logo on it.\n\nWe have clients who call us before they hire. We intend to keep it that way. If that sounds like the kind of relationship you want with a software partner, we should talk.`,
    },
  ];

  return (
    <section style={{ padding: "110px 24px", background: C.cream }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end", marginBottom: 80 }}>
          <div>
            <div className="section-chip">Why StrydeOS</div>
            <h2 className="serif" style={{ fontSize: 50, color: C.navy, fontWeight: 400, lineHeight: 1.0, marginTop: 16 }}>
              Clinical software,
              <br />
              <span style={{ fontStyle: "italic", color: C.blue }}>built by clinicians.</span>
            </h2>
          </div>
          <div>
            <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.8 }}>
              There's no shortage of software that promises to transform your practice. Most of it is built by people who've never set foot in a clinic. StrydeOS is the exception — and we think that matters.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          {pillars.map(({ n, title, color, body }, i) => (
            <div key={n} style={{
              background: i % 2 === 0 ? "white" : C.cloudDancer,
              padding: "52px 56px", position: "relative", transition: "background 0.3s ease",
            }}
              onMouseEnter={e => e.currentTarget.style.background = `${color}08`}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "white" : C.cloudDancer}
            >
              <div style={{
                position: "absolute", top: 44, right: 52,
                fontFamily: "'DM Serif Display', serif",
                fontSize: 72, fontWeight: 400, lineHeight: 1,
                color: `${color}12`, userSelect: "none",
              }}>{n}</div>
              <div style={{ width: 36, height: 3, background: color, borderRadius: 2, marginBottom: 28 }} />
              <h3 className="serif" style={{ fontSize: 24, color: C.navy, fontWeight: 400, lineHeight: 1.25, marginBottom: 24, maxWidth: 380 }}>
                {title}
              </h3>
              {body.split("\n\n").map((para, pi) => (
                <p key={pi} style={{
                  fontSize: 14.5, color: C.muted, lineHeight: 1.85,
                  marginBottom: pi < body.split("\n\n").length - 1 ? 16 : 0,
                }}>
                  {para}
                </p>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderTop: `1px solid ${C.border}`, marginTop: 60 }}>
          {[
            { stat: "100%", label: "of features built on real clinical workflows" },
            { stat: "5 days", label: "average from signed to live" },
            { stat: "Zero", label: "metrics included unless they drive decisions" },
            { stat: "Always", label: "a human on the other end — not a ticket system" },
          ].map(({ stat, label }) => (
            <div key={label} style={{ padding: "36px 0 0", paddingRight: 32 }}>
              <div className="serif" style={{ fontSize: 36, color: C.navy, marginBottom: 8 }}>{stat}</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 180 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── EarlyAccess ────────────────────────────────────────────────────────────── */
const EarlyAccess = () => (
  <section id="early-access" style={{
    padding: "100px 24px", background: C.navy, position: "relative", overflow: "hidden", textAlign: "center",
  }}>
    <RadialGlow color={C.blue} size={800} opacity={0.16} style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
    <div style={{ maxWidth: 620, margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ display: "inline-flex", gap: 4, padding: "4px 14px", borderRadius: 50, background: `${C.blue}30`, border: `1px solid ${C.blue}50`, color: C.blueGlow, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 }}>
        Early Access · Limited Spots
      </div>
      <h2 className="serif" style={{ fontSize: 48, color: "white", fontWeight: 400, lineHeight: 1.05, marginBottom: 20 }}>
        Find out what your clinic is leaving on the table.
      </h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, lineHeight: 1.7, marginBottom: 18 }}>
        Book a free 20-minute Clinical Performance Audit. We'll look at your existing systems, estimate where revenue is leaking — missed calls, early drop-off, admin overhead — and show you exactly where StrydeOS plugs the gaps.
      </p>
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, lineHeight: 1.65, marginBottom: 40, fontStyle: "italic" }}>
        No switching required. StrydeOS connects to Cliniko, WriteUpp, and most major PMS. Start with one product, add the rest when you're ready.
      </p>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <a href="https://calendly.com/hello-strydeos" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ fontSize: 16, padding: "16px 44px" }}>
          Book your free audit →
        </a>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="#" className="btn-ghost" style={{ padding: "10px 20px", fontSize: 13 }}>Book a Demo</a>
          <a href="#pricing" className="btn-ghost" style={{ padding: "10px 20px", fontSize: 13 }}>See Pricing</a>
        </div>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 4 }}>
          20 minutes · No obligation · UK private practices
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 40, marginTop: 56, paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        {[
          { v: "5 days", l: "Average from signed to live" },
          { v: "GDPR", l: "Compliant · UK-hosted" },
          { v: "< 3 months", l: "Typical cost payback" },
        ].map(({ v, l }) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 26, color: "white" }}>{v}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ─── Security Policy Page ───────────────────────────────────────────────────── */
const PolicyBlock = ({ icon, number, title, children }) => (
  <div style={{
    background: "white", border: `1px solid ${C.border}`, borderRadius: 16,
    padding: "32px 28px", position: "relative",
    boxShadow: "0 2px 12px rgba(11,37,69,0.04)",
  }}>
    <div style={{
      position: "absolute", top: 20, right: 24,
      fontFamily: "'DM Serif Display', serif",
      fontSize: 56, fontWeight: 400, lineHeight: 1,
      color: `${C.blue}08`, userSelect: "none",
    }}>{number}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: `${C.blue}0A`, border: `1px solid ${C.blue}15`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 600, color: C.ink }}>
        {title}
      </h3>
    </div>
    <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.85 }}>{children}</div>
  </div>
);

const SecurityPolicyPage = () => {
  const rights = [
    { right: "Access", desc: "Request a copy of all personal data held" },
    { right: "Rectification", desc: "Correct inaccurate or incomplete data" },
    { right: "Erasure", desc: "Request deletion of personal data ('right to be forgotten')" },
    { right: "Portability", desc: "Receive data in a structured, machine-readable format" },
    { right: "Restriction", desc: "Limit how personal data is processed" },
    { right: "Objection", desc: "Object to processing based on legitimate interest" },
  ];

  return (
    <>
      <style>{globalStyles}</style>

      {/* Minimal nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(250,249,247,0.92)", backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${C.border}`, padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 64 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <MonolithMark size={32} />
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 16, color: C.navy, letterSpacing: "-0.02em" }}>
              Stryde<span style={{ color: C.blue }}>OS</span>
            </div>
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldIcon />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Security & Compliance</span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "80px 24px 48px", maxWidth: 880, margin: "0 auto" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 14px", background: `${C.success}10`, border: `1px solid ${C.success}20`,
          borderRadius: 50, fontSize: 11, fontWeight: 600,
          color: C.success, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20,
        }}>
          <CheckIcon color={C.success} size={13} /> Verified Compliant
        </div>
        <h1 className="serif" style={{ fontSize: 44, fontWeight: 400, color: C.navy, lineHeight: 1.1, marginBottom: 16 }}>
          Data Handling &<br/>Security Policy
        </h1>
        <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.7, maxWidth: 640, marginBottom: 8 }}>
          StrydeOS is built for healthcare. Every architecture decision — from hosting region to encryption standard — is made with clinical data protection as the non-negotiable baseline.
        </p>
        <p style={{ fontSize: 13, color: `${C.muted}99`, marginBottom: 48 }}>
          Effective: 1 March 2026 · Version 1.0 · Last reviewed: March 2026
        </p>

        {/* Compliance badges */}
        <div className="compliance-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 64 }}>
          {[
            { label: "UK GDPR Compliant", sub: "DPA 2018" },
            { label: "Data UK Hosted", sub: "Google Cloud eu-west2" },
            { label: "Encrypted", sub: "AES-256 at rest · TLS 1.3 in transit" },
            { label: "Audit Logged", sub: "Immutable event trail" },
          ].map(({ label, sub }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "16px 20px", background: "white",
              border: `1px solid ${C.border}`, borderRadius: 12,
              boxShadow: "0 2px 12px rgba(11,37,69,0.04)",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${C.success}12`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <CheckIcon color={C.success} size={14} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{label}</div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.3 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Policy grid */}
      <section style={{ padding: "0 24px 64px", maxWidth: 880, margin: "0 auto" }}>
        <div className="policy-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 48 }}>
          <PolicyBlock icon={<ShieldIcon />} number="01" title="Scope & Data Controller">
            <p style={{ marginBottom: 12 }}>
              StrydeOS Ltd (registered in England & Wales) is the Data Controller for all personal data processed through the StrydeOS platform. This policy applies to all clinical data, patient information, clinician performance metrics, and practice management data processed by StrydeOS on behalf of subscribing physiotherapy and allied health practices.
            </p>
            <p>
              <strong style={{ color: C.ink }}>Lawful basis:</strong> Legitimate interests (performance analytics for practice improvement) and contractual necessity (service delivery). Where applicable, explicit consent is obtained for special category health data.
            </p>
          </PolicyBlock>

          <PolicyBlock icon={<LockIcon />} number="02" title="Encryption & Transport Security">
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: C.ink }}>In transit:</strong> All data transmitted between client applications and StrydeOS servers is encrypted using TLS 1.3. API connections to third-party PMS integrations (WriteUpp, Cliniko, Physitrack) enforce TLS 1.2 minimum with certificate pinning.
            </p>
            <p>
              <strong style={{ color: C.ink }}>At rest:</strong> All data stored in Google Cloud Firestore and Cloud Storage is encrypted using AES-256 with Google-managed encryption keys. Database backups are encrypted with the same standard and stored in the same UK region.
            </p>
          </PolicyBlock>

          <PolicyBlock icon={<ServerIcon />} number="03" title="Data Residency & Hosting">
            <p style={{ marginBottom: 12 }}>
              All StrydeOS production data is hosted exclusively within Google Cloud Platform's <strong style={{ color: C.ink }}>europe-west2 (London)</strong> region. No patient data, clinical metrics, or personally identifiable information is transferred outside the United Kingdom.
            </p>
            <p>
              Infrastructure is managed via Firebase (Google Cloud) with automatic failover, 99.95% uptime SLA, and geographic redundancy within the UK. All sub-processors are contractually bound to maintain UK data residency.
            </p>
          </PolicyBlock>

          <PolicyBlock icon={<TrashIcon />} number="04" title="Data Retention & Deletion">
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: C.ink }}>Active subscriptions:</strong> Data is retained for the duration of the service agreement plus 90 days to allow for reactivation and data export.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: C.ink }}>Cancelled accounts:</strong> All personal data and clinical metrics are permanently deleted within 90 days of account termination. Practices may request immediate deletion at any time via written request to hello@strydeos.com.
            </p>
            <p>
              <strong style={{ color: C.ink }}>Automated purge:</strong> System logs containing PII are automatically rotated and purged after 12 months. Anonymised aggregate analytics (no PII) may be retained indefinitely for product improvement.
            </p>
          </PolicyBlock>

          <PolicyBlock icon={<EyeIcon />} number="05" title="Access Controls & Authentication">
            <p style={{ marginBottom: 12 }}>
              StrydeOS implements role-based access control (RBAC) with three tiers: Practice Owner (full access), Clinician (own metrics + assigned patients), and Support (read-only, time-limited). All access is authenticated via Firebase Auth with email/password and optional MFA.
            </p>
            <p>
              Internal StrydeOS staff access to production data requires MFA, VPN, and is restricted to senior engineering and the DPO. All internal access is logged and reviewed quarterly.
            </p>
          </PolicyBlock>

          <PolicyBlock icon={<ClipboardIcon />} number="06" title="Audit Logging & Breach Response">
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: C.ink }}>Audit trail:</strong> Every data access, modification, export, and deletion event is logged with timestamp, user identity, IP address, and action type. Audit logs are immutable, stored separately from application data, and retained for 24 months.
            </p>
            <p>
              <strong style={{ color: C.ink }}>Breach protocol:</strong> In the event of a personal data breach, StrydeOS will notify the ICO within 72 hours and affected data subjects without undue delay, in accordance with Articles 33 and 34 of UK GDPR. All incidents are documented in a formal breach register.
            </p>
          </PolicyBlock>
        </div>

        {/* Data subject rights */}
        <div style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 48, boxShadow: "0 2px 12px rgba(11,37,69,0.04)" }}>
          <div style={{ padding: "20px 28px", borderBottom: `1px solid ${C.border}`, background: `${C.blue}05` }}>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 600, color: C.ink }}>Your Data Subject Rights</h3>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              Under UK GDPR, every individual whose data we process has the following rights. Requests are fulfilled within 30 calendar days.
            </p>
          </div>
          {rights.map(({ right, desc }, i) => (
            <div key={right} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 28px",
              borderBottom: i < rights.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <CheckIcon color={C.blue} size={16} />
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{right}</span>
                <span style={{ fontSize: 13, color: C.muted }}> — {desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Sub-processors */}
        <div style={{ background: C.navy, borderRadius: 16, padding: "32px 28px", marginBottom: 48 }}>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 600, color: "white", marginBottom: 16 }}>
            Sub-Processors & Third-Party Integrations
          </h3>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.85, marginBottom: 20 }}>
            StrydeOS only shares data with sub-processors that are contractually bound to UK GDPR-equivalent data protection standards. We maintain a current register of all sub-processors, available on request.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { name: "Google Cloud (Firebase)", purpose: "Hosting, auth, database", region: "UK (eu-west2)" },
              { name: "Retell AI", purpose: "Voice reception (Receptionist)", region: "EU/UK processing" },
              { name: "ElevenLabs", purpose: "Voice synthesis", region: "EU processing" },
              { name: "PMS Providers", purpose: "WriteUpp, Cliniko API sync", region: "UK hosted" },
            ].map(({ name, purpose, region }) => (
              <div key={name} style={{
                padding: "14px 16px",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{name}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{purpose} · {region}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div style={{
          padding: "28px", background: `${C.blue}06`, border: `1px solid ${C.blue}15`,
          borderRadius: 16, textAlign: "center",
        }}>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
            For data subject access requests, privacy concerns, or to request our full sub-processor register, contact our Data Protection Officer at{" "}
            <a href="mailto:hello@strydeos.com" style={{ color: C.blue, textDecoration: "none", fontWeight: 600 }}>hello@strydeos.com</a>.
          </p>
          <p style={{ fontSize: 12, color: `${C.muted}88`, marginTop: 8 }}>
            {/* TODO: Update ICO registration number once received */}
            StrydeOS Ltd · Registered in England & Wales · ICO Registration: [Pending]
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
};

/* ─── Footer ─────────────────────────────────────────────────────────────────── */
const Footer = () => (
  <footer style={{ background: "#060F1E", padding: "52px 24px 28px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
    <div style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 44 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <MonolithMark size={32} />
            <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 16, color: "white", letterSpacing: "-0.02em" }}>
              Stryde<span style={{ color: C.blueGlow }}>OS</span>
            </div>
          </div>
          <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 13, maxWidth: 240, lineHeight: 1.65 }}>
            The Clinic OS for private practice.
          </p>
        </div>
        <div style={{ display: "flex", gap: 52 }}>
          {[
            { h: "Products", links: [
              { label: "Ava", href: "#products" },
              { label: "Pulse", href: "#products" },
              { label: "Intelligence", href: "#products" },
              { label: "Growth OS", href: "#products" },
            ]},
            { h: "Company", links: [
              { label: "About", href: "#" },
              { label: "Case Studies", href: "#" },
              { label: "Pricing", href: "#pricing" },
              { label: "Contact", href: "#early-access" },
            ]},
            { h: "Legal", links: [
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Security & GDPR", href: "/security" },
              { label: "Terms of Service", href: "/terms" },
              { label: "Data Policy", href: "/security#data-policy" },
            ]},
          ].map(({ h, links }) => (
            <div key={h}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>{h}</div>
              {links.map(({ label, href }) => (
                <div key={label} style={{ marginBottom: 9 }}>
                  <a href={href} style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textDecoration: "none", transition: "color 0.2s" }}
                    onMouseEnter={e => e.target.style.color = "rgba(255,255,255,0.75)"}
                    onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.3)"}>{label}</a>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Compliance strip */}
      <div style={{ display: "flex", gap: 24, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {["GDPR Compliant", "UK Hosted", "AES-256 Encrypted", "Audit Logged"].map(badge => (
          <div key={badge} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {badge}
          </div>
        ))}
      </div>

      {/* Copyright */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 20, display: "flex", justifyContent: "space-between" }}>
        <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 12 }}>© 2026 StrydeOS Ltd. All rights reserved.</div>
        <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 12 }}>
          <a href="mailto:hello@strydeos.com" style={{ color: "rgba(255,255,255,0.18)", textDecoration: "none" }}>hello@strydeos.com</a>
          {" · "}Built by clinicians, for clinicians.
        </div>
      </div>
    </div>
  </footer>
);

/* ─── Main Site ───────────────────────────────────────────────────────────────── */
const MainSite = () => (
  <>
    <style>{globalStyles}</style>
    <Nav />
    <Hero />
    <HolisticSection />
    <Integrations />
    <Products />
    <Results />
    <ROICalc />
    <Pricing />
    <WhyUs />
    <EarlyAccess />
    <Footer />
  </>
);

/* ─── App — simple pathname router ──────────────────────────────────────────── */
export default function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  if (path === "/security") return <SecurityPolicyPage />;
  return <MainSite />;
}

export { SecurityPolicyPage };
