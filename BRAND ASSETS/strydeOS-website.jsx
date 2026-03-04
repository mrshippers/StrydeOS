import { useState, useEffect, useRef } from "react";

const C = {
  // Backgrounds
  cloudDancer: "#F2F1EE",
  cloudLight:  "#F9F8F6",
  cloudDark:   "#E8E6E0",
  cream:       "#FAF9F7",

  // Brand blues — canonical values
  navy:        "#0B2545",
  navyMid:     "#132D5E",
  blue:        "#1C54F2",      // Royal Blue — PRIMARY
  blueBright:  "#2E6BFF",
  blueGlow:    "#4B8BF5",
  teal:        "#0891B2",      // Pulse module accent

  // Typography
  ink:         "#111827",
  muted:       "#6B7280",

  // Utility
  success:     "#059669",
  border:      "#E2DFDA",
};

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
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes slide-in { from{transform:translateX(12px);opacity:0} to{transform:translateX(0);opacity:1} }

  .animate-float { animation: float 4s ease-in-out infinite; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 32px;
    background: ${C.blue}; color: white;
    border: none; border-radius: 50px;
    font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all 0.3s ease; text-decoration: none;
    letter-spacing: 0.01em;
  }
  .btn-primary:hover { background: ${C.blueBright}; transform: translateY(-2px); box-shadow: 0 16px 40px ${C.blue}40; }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 28px; background: transparent;
    color: rgba(255,255,255,0.7);
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
    padding: 4px 14px;
    background: ${C.blue}10; border: 1px solid ${C.blue}20;
    border-radius: 50px; font-size: 11px; font-weight: 600;
    color: ${C.blue}; letter-spacing: 0.1em; text-transform: uppercase;
    margin-bottom: 16px;
  }

  .card-hover { transition: transform 0.3s ease, box-shadow 0.3s ease; }
  .card-hover:hover { transform: translateY(-5px); box-shadow: 0 20px 48px rgba(28,84,242,0.11); }

  input[type="range"] {
    -webkit-appearance: none; width: 100%; height: 5px;
    border-radius: 3px; background: ${C.border}; outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 20px; height: 20px;
    border-radius: 50%; background: ${C.blue}; cursor: pointer;
    box-shadow: 0 0 0 4px ${C.blue}20;
  }

  body { transition: background 0.3s ease, color 0.2s ease; }

  @media (max-width: 768px) {
    .hero-grid        { grid-template-columns: 1fr !important; }
    .product-grid     { grid-template-columns: 1fr !important; }
    .pricing-grid     { grid-template-columns: 1fr !important; }
    .results-grid     { grid-template-columns: 1fr 1fr !important; }
    .holistic-grid    { grid-template-columns: 1fr !important; }
    .roi-grid         { grid-template-columns: 1fr !important; }
    .whyus-grid       { grid-template-columns: 1fr !important; }
    .footer-top       { flex-direction: column !important; gap: 32px !important; }
    .nav-links        { display: none !important; }
  }
`;

const RadialGlow = ({ color = C.blue, size = 600, opacity = 0.12, style = {} }) => (
  <div style={{
    position: "absolute", width: size, height: size,
    borderRadius: "50%",
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    opacity, pointerEvents: "none", ...style,
  }} />
);

/* ─── MonolithMark ───────────────────────────────────────────────────────── */
let _mmId = 0;
const _uid = (p) => `${p}-${++_mmId}`;

const MonolithMark = ({ size = 44 }) => {
  const id       = _uid("m");
  const gCont    = `${id}-c`;
  const gRad     = `${id}-r`;
  const gTopface = `${id}-t`;
  const gRim     = `${id}-m`;
  const gBorder  = `${id}-b`;
  const cPillar  = `${id}-p`;
  const cAbove   = `${id}-a`;
  const small    = size <= 24;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label="StrydeOS">
      <defs>
        <linearGradient id={gCont} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%"    stopColor="#2E6BFF" stopOpacity="0.58"/>
          <stop offset="100%"  stopColor="#091D3E" stopOpacity="0.72"/>
        </linearGradient>
        <radialGradient id={gRad} cx="28%" cy="24%" r="60%">
          <stop offset="0%"    stopColor="#6AABFF" stopOpacity="0.42"/>
          <stop offset="100%"  stopColor="#1C54F2" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={gTopface} x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%"    stopColor="white" stopOpacity="0.55"/>
          <stop offset="100%"  stopColor="white" stopOpacity="0.97"/>
        </linearGradient>
        <linearGradient id={gRim} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"    stopColor="white" stopOpacity="0"/>
          <stop offset="28%"   stopColor="white" stopOpacity="0.60"/>
          <stop offset="65%"   stopColor="white" stopOpacity="0.12"/>
          <stop offset="100%"  stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={gBorder} x1="0.1" y1="0" x2="0.4" y2="1">
          <stop offset="0%"    stopColor="#7ABBFF" stopOpacity="0.65"/>
          <stop offset="100%"  stopColor="#1C54F2" stopOpacity="0.06"/>
        </linearGradient>
        <clipPath id={cPillar}><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
        <clipPath id={cAbove}><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${gCont})`}/>
      <rect width="100" height="100" rx="24" fill={`url(#${gRad})`}/>
      <rect width="100" height="100" rx="24" fill="none" stroke={`url(#${gBorder})`} strokeWidth="1.2"/>
      {!small && (
        <path d="M 17 21 Q 50 12 83 21" stroke={`url(#${gRim})`} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      )}
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10"/>
      <g clipPath={`url(#${cPillar})`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth={small ? 3.0 : 2.0} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth={small ? 3.5 : 2.5} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth={small ? 4.2 : 3.2} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${gTopface})`} clipPath={`url(#${cAbove})`}/>
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"/>
    </svg>
  );
};

/* ─── Nav ─────────────────────────────────────────────────────────────────── */
const Nav = ({ darkMode, setDarkMode }) => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const navBg  = scrolled
    ? darkMode ? "rgba(11,37,69,0.95)"    : "rgba(242,241,238,0.94)"
    : "transparent";
  const navBdr = scrolled
    ? darkMode ? "1px solid rgba(255,255,255,0.07)" : `1px solid ${C.border}`
    : "none";
  const linkColor   = darkMode ? "rgba(255,255,255,0.7)" : C.ink;
  const wordColor   = darkMode ? "white"    : C.navy;
  const wordAccent  = darkMode ? C.blueGlow : C.blue;

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 24px", transition: "all 0.3s ease",
      background: navBg,
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: navBdr,
    }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MonolithMark size={34} />
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 17, color: wordColor, letterSpacing: "-0.02em" }}>
            Stryde<span style={{ color: wordAccent }}>OS</span>
          </div>
        </div>

        <div className="nav-links" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {[["Products","#products"],["How it works","#how-it-works"],["Results","#results"],["Pricing","#pricing"]].map(([label, href]) => (
            <a key={label} href={href} style={{
              color: linkColor, fontSize: 14, fontWeight: 500,
              textDecoration: "none", opacity: 0.65, transition: "opacity 0.2s",
            }}
              onMouseEnter={e => e.target.style.opacity = 1}
              onMouseLeave={e => e.target.style.opacity = 0.65}
            >{label}</a>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setDarkMode(d => !d)}
            style={{
              background: "transparent",
              border: `1px solid ${darkMode ? "rgba(255,255,255,0.15)" : C.border}`,
              borderRadius: 8, width: 34, height: 34,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: darkMode ? "rgba(255,255,255,0.6)" : C.muted,
              fontSize: 15, transition: "all 0.2s",
            }}
            aria-label="Toggle dark mode"
          >
            {darkMode ? "☀" : "☾"}
          </button>
          <a href="#early-access" className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }}>
            Get Early Access
          </a>
        </div>
      </div>
    </nav>
  );
};

/* ─── Hero ─────────────────────────────────────────────────────────────────── */
const Hero = ({ darkMode }) => {
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

  const head   = darkMode ? "white"   : C.navy;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const italic = darkMode ? C.blueGlow : C.blue;
  const heroBg = darkMode
    ? `linear-gradient(160deg, ${C.navy} 0%, ${C.navyMid} 60%, ${C.navy} 100%)`
    : `linear-gradient(160deg, ${C.cloudLight} 0%, ${C.cloudDancer} 50%, ${C.cloudDark} 100%)`;

  return (
    <section style={{
      position: "relative", overflow: "hidden",
      minHeight: "100vh",
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: "120px 24px 80px",
      background: heroBg,
      transition: "background 0.3s ease",
    }}>
      <RadialGlow color={C.blue} size={900} opacity={0.07} style={{ top: -250, right: -200 }} />
      <RadialGlow color={C.teal} size={600} opacity={0.06} style={{ bottom: -100, left: -150 }} />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `radial-gradient(circle, ${C.blue}15 1px, transparent 1px)`,
        backgroundSize: "44px 44px", opacity: 0.45,
      }} />

      <div style={{ maxWidth: 1160, margin: "0 auto", width: "100%", position: "relative", zIndex: 2 }}>
        <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>

          {/* Left */}
          <div style={{ animation: "fadeUp 0.8s ease forwards" }}>
            <div className="section-chip" style={{ marginBottom: 24 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.success, display: "inline-block" }} />
              Now in early access · Private practice
            </div>

            <h1 className="serif" style={{ fontSize: 60, lineHeight: 1.0, color: head, marginBottom: 10, fontWeight: 400, letterSpacing: "-0.01em" }}>
              The Clinic OS
            </h1>
            <h1 className="serif" style={{ fontSize: 60, lineHeight: 1.0, color: head, marginBottom: 28, fontWeight: 400, letterSpacing: "-0.01em" }}>
              for <span style={{ fontStyle: "italic", color: italic }}>private practice.</span>
            </h1>

            <p style={{ fontSize: 18, lineHeight: 1.7, color: muted, marginBottom: 20, maxWidth: 500 }}>
              Solo clinics and partnerships running at full capacity. Fewer gaps. More completed courses of treatment. No extra headcount.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: muted, marginBottom: 40, maxWidth: 480, fontStyle: "italic", borderLeft: `3px solid ${C.blue}40`, paddingLeft: 16 }}>
              StrydeOS is how the best-run private clinics operate now.
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 52 }}>
              <a href="#early-access" className="btn-primary">
                Get Early Access
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </a>
              <a href="#products" className="btn-outline">See how it works</a>
            </div>

            <div style={{ display: "flex", gap: 28 }}>
              {[
                { label: "GDPR Compliant" },
                { label: "UK Secure Hosting" },
                { label: "No lock-in contracts" },
              ].map(({ label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: muted, fontWeight: 500 }}>
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
                background: C.navy,
                borderRadius: 24, padding: 28,
                boxShadow: `0 48px 80px ${C.navy}50, 0 0 0 1px rgba(255,255,255,0.06)`,
                animation: "glow-pulse 4s ease-in-out infinite",
              }}>
                {/* Header */}
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

                {/* Three product indicators */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
                  {[
                    { name: "Ava", status: "Active", calls: "12 today", color: C.blue },
                    { name: "Pulse", status: "Active", calls: "8 follow-ups", color: C.teal },
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

                {/* KPI row */}
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

                {/* Trend */}
                <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Patient Retention — 6 weeks</div>
                  <svg viewBox="0 0 280 50" style={{ width: "100%", overflow: "visible" }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.blueGlow} stopOpacity="0.25"/>
                        <stop offset="100%" stopColor={C.blueGlow} stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <path d="M0,38 C30,32 60,40 90,34 C120,28 150,30 180,20 C210,10 240,14 280,8" fill="none" stroke={C.blueGlow} strokeWidth="2" strokeLinecap="round"/>
                    <path d="M0,38 C30,32 60,40 90,34 C120,28 150,30 180,20 C210,10 240,14 280,8 L280,50 L0,50 Z" fill="url(#g1)"/>
                    {[[0,38],[90,34],[180,20],[280,8]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="3" fill={C.blueGlow}/>)}
                  </svg>
                </div>
              </div>

              {/* Floating badges */}
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
          marginTop: 80,
          padding: "36px 48px",
          background: C.navy,
          borderRadius: 20,
          position: "relative", overflow: "hidden",
        }}>
          <RadialGlow color={C.blue} size={400} opacity={0.12} style={{ top: -100, right: -50 }} />
          <div style={{ position: "relative", zIndex: 2, maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <p className="serif" style={{ fontSize: 20, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, fontStyle: "italic" }}>
              "Most private practices are one or two steps away from running significantly better. The problem isn't clinical — it's operational. The right systems, put in the right places, change everything."
            </p>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
              {[
                { icon: "🔗", text: "Connects to Cliniko & WriteUpp" },
                { icon: "🚫", text: "Not a PMS replacement" },
                { icon: "⚡", text: "Sits above your existing stack" },
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

/* ─── Holistic Section ──────────────────────────────────────────────────────── */
const HolisticSection = ({ darkMode }) => {
  const bgAlt  = darkMode ? C.navyMid : C.cream;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const txt    = darkMode ? "rgba(255,255,255,0.85)" : C.ink;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head   = darkMode ? "white" : C.navy;
  return (
  <section id="how-it-works" style={{ padding: "100px 24px", background: bgAlt, transition: "background 0.3s ease" }}>
    <div style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div className="holistic-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <div className="section-chip">One Operating System</div>
          <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400, lineHeight: 1.1, marginBottom: 24 }}>
            Every gap closed.
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: muted, marginBottom: 20 }}>
            The clinics consistently running at capacity aren't doing anything extraordinary. They answer every call. They follow up after every session. They know their numbers.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: muted, marginBottom: 32 }}>
            They've just built the infrastructure to make it happen — without hiring more people to do it.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: txt, fontWeight: 500 }}>
            StrydeOS packages that infrastructure for any private clinic, from day one.
          </p>
        </div>

        {/* Three pillars visual */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { name: "StrydeOS Ava", desc: "Catches every patient at the door", icon: "📞", color: C.blue, n: "01" },
            { name: "StrydeOS Pulse", desc: "Keeps patients engaged through treatment", icon: "🔄", color: C.teal, n: "02" },
            { name: "StrydeOS Intelligence", desc: "Shows you how it's all performing", icon: "📊", color: "#8B5CF6", n: "03" },
          ].map(({ name, desc, icon, color, n }, i) => (
            <div key={name} className="card-hover" style={{
              display: "flex", alignItems: "center", gap: 20,
              background: bgCard, borderRadius: 16, padding: "20px 24px",
              border: `1px solid ${bdr}`,
              boxShadow: darkMode ? "none" : "0 2px 12px rgba(11,37,69,0.04)",
              transition: "background 0.3s ease",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${color}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22,
              }}>{icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: head, marginBottom: 3 }}>{name}</div>
                <div style={{ fontSize: 13, color: muted }}>{desc}</div>
              </div>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: `${color}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color, flexShrink: 0,
              }}>{n}</div>
            </div>
          ))}
          <div style={{
            padding: "14px 24px", borderRadius: 12,
            background: `${C.blue}08`, border: `1px dashed ${C.blue}30`,
            textAlign: "center",
          }}>
            <span style={{ fontSize: 13, color: C.blue, fontWeight: 500 }}>Better alone. Unstoppable together.</span>
          </div>
        </div>
      </div>
    </div>
  </section>
  );
};

/* ─── Integrations ──────────────────────────────────────────────────────────── */
const Integrations = ({ darkMode }) => {
  const bg     = darkMode ? C.navy    : C.cloudDancer;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head   = darkMode ? "white" : C.navy;
  return (
  <section style={{ padding: "80px 24px", background: bg, borderTop: `1px solid ${bdr}`, transition: "background 0.3s ease" }}>
    <div style={{ maxWidth: 1160, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <div className="section-chip">Works With Your Stack</div>
        <h2 className="serif" style={{ fontSize: 40, color: head, fontWeight: 400, marginBottom: 16 }}>
          The pitch isn't "switch to StrydeOS."
        </h2>
        <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: "0 auto", lineHeight: 1.75 }}>
          Cliniko and WriteUpp own the PMS layer — appointments, notes, billing. StrydeOS sits <em>above</em> that. It connects to whatever you're already running and extends it, not replaces it.
        </p>
      </div>

      {/* Integration architecture diagram */}
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

          {/* Layer 1 — PMS */}
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 14 }}>Your existing PMS — unchanged</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
              {[
                { name: "Cliniko", icon: "🗂️", desc: "Appointments · Notes · Billing" },
                { name: "WriteUpp", icon: "📋", desc: "Appointments · Notes · Billing" },
                { name: "Jane App", icon: "🏥", desc: "Appointments · Notes · Billing" },
                { name: "Other PMS", icon: "⚙️", desc: "Via API — speak to us" },
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

          {/* Arrows */}
          <div style={{ display: "flex", justifyContent: "center", gap: 80, margin: "16px 0", padding: "0 40px" }}>
            {["Pulls appointment data", "Pushes bookings in", "Reads patient history"].map((label) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 1.5, height: 28, background: `linear-gradient(${C.blue}, ${C.teal})` }} />
                <div style={{ fontSize: 9, color: C.teal, fontWeight: 600, textAlign: "center", maxWidth: 80 }}>{label}</div>
                <div style={{ width: 1.5, height: 28, background: `linear-gradient(${C.teal}, ${C.blue})` }} />
              </div>
            ))}
          </div>

          {/* Layer 2 — StrydeOS */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.blue, marginBottom: 14 }}>StrydeOS — sits above your stack</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
              {[
                { name: "Ava", icon: "📞", color: C.blue, desc: "Answers calls → books into your PMS" },
                { name: "Pulse", icon: "🔄", color: C.teal, desc: "Reads appointment data → triggers follow-up" },
                { name: "Intelligence", icon: "📊", color: "#8B5CF6", desc: "Pulls KPI data → builds live dashboard" },
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

      {/* Objection handler cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          {
            q: "Do I need to switch systems?",
            a: "No. StrydeOS connects to Cliniko, WriteUpp, and most other PMS via API. Your workflows stay exactly as they are.",
            icon: "🔌",
          },
          {
            q: "Will my team need retraining?",
            a: "They keep using the same PMS they always have. StrydeOS runs quietly in the background — your staff only notice the results.",
            icon: "🎓",
          },
          {
            q: "How long does setup take?",
            a: "Most practices are live within 5 days. API connections to major PMS are pre-built. We handle the integration.",
            icon: "⚡",
          },
        ].map(({ q, a, icon }) => (
          <div key={q} className="card-hover" style={{
            background: bgCard, borderRadius: 16, padding: "24px 26px",
            border: `1px solid ${bdr}`,
            boxShadow: darkMode ? "none" : "0 2px 12px rgba(11,37,69,0.04)",
            transition: "background 0.3s ease",
          }}>
            <div style={{ fontSize: 26, marginBottom: 12 }}>{icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: head, marginBottom: 10 }}>{q}</div>
            <div style={{ fontSize: 13, color: muted, lineHeight: 1.65 }}>{a}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
  );
};

/* ─── Products ──────────────────────────────────────────────────────────────── */
const Products = ({ darkMode }) => {
  const [active, setActive] = useState(0);
  const bg    = darkMode ? C.navy    : C.cloudDancer;
  const muted = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head  = darkMode ? "white"   : C.navy;
  const txt   = darkMode ? "rgba(255,255,255,0.85)" : C.ink;
  const bdr   = darkMode ? "rgba(255,255,255,0.12)" : C.border;
  const tabInactiveBg = darkMode ? "rgba(255,255,255,0.04)" : "transparent";

  const products = [
    {
      id: "receptionist",
      label: "Ava",
      icon: "📞",
      color: C.blue,
      eyebrow: "StrydeOS Ava",
      headline: "Never miss a patient again.",
      body: "Every unanswered call is a patient who books somewhere else. Every cancellation that doesn't get followed up is revenue that disappears quietly.\n\nStrydeOS Ava handles inbound calls, books appointments, recovers cancellations and chases no-shows — automatically, around the clock.",
      proof: "Clinics using it have stopped paying £400–800/month to call-handling services. They've also stopped losing patients at the first point of contact.",
      tagline: "Your front desk. Without the overhead.",
      cta: "Start with Ava",
      bullets: ["Inbound calls handled 24/7", "Books directly into your calendar", "Cancellation recovery & no-show chasing", "SMS confirmations sent automatically", "Emergency routing to on-call clinician"],
      visual: (
        <div style={{ background: C.navy, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.blue}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
            <div>
              <div style={{ color: "white", fontWeight: 600, fontSize: 13 }}>StrydeOS Ava</div>
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
      id: "continuity",
      label: "Pulse",
      icon: "🔄",
      color: C.teal,
      eyebrow: "StrydeOS Pulse",
      headline: "Keep patients in care, longer.",
      body: "The drop-off between session two and session three is where most clinics leak the most revenue. Patients disengage — not because the treatment isn't working, but because nobody stayed in touch.\n\nStrydeOS Pulse automates every touchpoint between sessions.",
      proof: "The clinics getting this right aren't doing it by hand. They've systematised it — and it shows in their completion rates and referral volume.",
      tagline: "Better outcomes. Fewer drop-offs. More referrals.",
      cta: "Start with Pulse",
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
              <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
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
      id: "intelligence",
      label: "Intelligence",
      icon: "📊",
      color: "#8B5CF6",
      eyebrow: "StrydeOS Intelligence",
      headline: "Know how your clinic actually performs.",
      body: "Revenue tells you something went right or wrong. It doesn't tell you why, or where, or who.\n\nStrydeOS Intelligence gives you the metrics that actually matter — follow-up rates, patient retention, programme completion, clinician performance by outcome.",
      proof: "Not to manage people. To understand where your clinic is thriving and where it isn't. The best-run clinics already know these numbers.",
      tagline: "Real-time. Actionable. Built for practice owners, not analysts.",
      cta: "Start with Intelligence",
      bullets: ["Per-clinician KPI views", "Patient retention & completion rates", "Utilisation and DNA tracking", "6-week rolling trend charts", "Automatic alert flags when metrics drift"],
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
    <section id="products" style={{ padding: "100px 24px", background: bg, transition: "background 0.3s ease" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div className="section-chip">Products</div>
          <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400 }}>
            Three products. One platform.
          </h2>
          <p style={{ color: muted, fontSize: 16, marginTop: 14, maxWidth: 480, margin: "14px auto 0" }}>
            Each solves a specific, expensive problem. Use one or all three.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 52 }}>
          {products.map((pr, i) => (
            <button key={pr.id} onClick={() => setActive(i)} style={{
              padding: "11px 22px", borderRadius: 50, cursor: "pointer",
              background: active === i ? pr.color : tabInactiveBg,
              color: active === i ? "white" : muted,
              fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 500,
              border: `1.5px solid ${active === i ? pr.color : bdr}`,
              transition: "all 0.3s",
            }}>
              {pr.icon} {pr.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div key={active} className="product-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center", animation: "fadeIn 0.4s ease" }}>
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

            <h3 className="serif" style={{ fontSize: 36, color: head, fontWeight: 400, lineHeight: 1.15, marginBottom: 20 }}>
              {p.headline}
            </h3>

            {p.body.split("\n\n").map((para, i) => (
              <p key={i} style={{ color: muted, lineHeight: 1.75, marginBottom: 14, fontSize: 15 }}>{para}</p>
            ))}

            <div style={{ padding: "14px 18px", borderLeft: `3px solid ${p.color}`, marginBottom: 24, marginTop: 8 }}>
              <p style={{ color: txt, fontSize: 13.5, lineHeight: 1.65 }}>{p.proof}</p>
            </div>

            <p style={{ fontSize: 14, color: p.color, fontWeight: 600, fontStyle: "italic", marginBottom: 24 }}>"{p.tagline}"</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
              {p.bullets.map(b => (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${p.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke={p.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <span style={{ fontSize: 14, color: txt }}>{b}</span>
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

/* ─── Results / Proof ───────────────────────────────────────────────────────── */
const Results = () => (
  <section id="results" style={{
    padding: "100px 24px",
    background: C.navy,
    position: "relative", overflow: "hidden",
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
          Reduced no-shows. Higher course completion rates. Reception costs cut in half.
        </p>
      </div>

      <div className="results-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 48 }}>
        {[
          { stat: "67%→4%", label: "Missed call rate", note: "Solo MSK practice" },
          { stat: "84%", label: "Course completion rate", note: "vs 61% industry avg" },
          { stat: "£800/mo", label: "Saved on call-handling", note: "vs Moneypenny/live agents" },
          { stat: "18 days", label: "Average payback period", note: "Across all tiers" },
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

      {/* Case Study */}
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
const ROICalc = ({ darkMode }) => {
  const [sessions, setSessions] = useState(80);
  const [dna, setDna] = useState(12);
  const [fee, setFee] = useState(75);
  const [missedCalls, setMissedCalls] = useState(35);
  const [dropout, setDropout] = useState(28);

  const dnaLoss = Math.round(sessions * (dna / 100) * fee * 52);
  const callLoss = Math.round(sessions * (missedCalls / 100) * fee * 0.4 * 52);
  const dropLoss = Math.round(sessions * (dropout / 100) * fee * 1.8 * 52);
  const total = dnaLoss + callLoss + dropLoss;

  const bgAlt  = darkMode ? C.navy    : C.cream;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head   = darkMode ? "white"   : C.navy;

  return (
    <section style={{ padding: "100px 24px", background: bgAlt, transition: "background 0.3s ease" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div className="section-chip">ROI Calculator</div>
          <h2 className="serif" style={{ fontSize: 42, color: head, fontWeight: 400 }}>
            What's inefficiency actually costing you?
          </h2>
          <p style={{ color: muted, marginTop: 14, fontSize: 15 }}>
            Dial in your clinic's numbers. The losses are probably larger than you think.
          </p>
        </div>

        <div style={{ background: bgCard, borderRadius: 24, overflow: "hidden", boxShadow: darkMode ? `0 24px 60px ${C.navy}60` : "0 24px 60px rgba(11,37,69,0.07)", border: darkMode ? `1px solid ${bdr}` : "none", transition: "background 0.3s ease" }}>
          <div className="roi-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {/* Controls */}
            <div style={{ padding: 40, borderRight: `1px solid ${bdr}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: head, marginBottom: 30 }}>Your clinic</h3>
              {[
                { label: "Weekly patient sessions", val: sessions, set: setSessions, min: 20, max: 200, step: 5, disp: `${sessions}` },
                { label: "DNA / no-show rate", val: dna, set: setDna, min: 2, max: 30, step: 1, disp: `${dna}%` },
                { label: "Average fee per session", val: fee, set: setFee, min: 40, max: 200, step: 5, disp: `£${fee}` },
                { label: "Missed inbound call rate", val: missedCalls, set: setMissedCalls, min: 5, max: 70, step: 1, disp: `${missedCalls}%` },
                { label: "Patient drop-off rate (pre-discharge)", val: dropout, set: setDropout, min: 5, max: 60, step: 1, disp: `${dropout}%` },
              ].map(({ label, val, set, min, max, step, disp }) => (
                <div key={label} style={{ marginBottom: 26 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <label style={{ fontSize: 13, color: muted, fontWeight: 500 }}>{label}</label>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.blue, background: `${C.blue}10`, padding: "2px 12px", borderRadius: 8 }}>{disp}</div>
                  </div>
                  <input type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))} />
                </div>
              ))}
            </div>

            {/* Results */}
            <div style={{ padding: 40, background: `linear-gradient(145deg, ${C.navy}, ${C.navyMid})`, position: "relative", overflow: "hidden" }}>
              <RadialGlow color={C.blue} size={400} opacity={0.18} style={{ top: -100, right: -100 }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 28 }}>Annual revenue at risk</h3>

                {[
                  { label: "No-shows & cancellations", val: dnaLoss },
                  { label: "Missed booking calls", val: callLoss },
                  { label: "Early patient drop-off", val: dropLoss },
                ].map(({ label, val }) => (
                  <div key={label} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 4 }}>{label}</div>
                    <div className="serif" style={{ fontSize: 30, color: "white" }}>£{val.toLocaleString()}</div>
                  </div>
                ))}

                <div style={{ background: `${C.blue}25`, borderRadius: 16, padding: 20, border: `1px solid ${C.blue}40`, marginTop: 8, marginBottom: 24 }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 6 }}>Total annual revenue at risk</div>
                  <div className="serif" style={{ fontSize: 46, color: "white", lineHeight: 1 }}>£{total.toLocaleString()}</div>
                  <div style={{ marginTop: 10, color: "#34D399", fontSize: 12, fontWeight: 600 }}>
                    StrydeOS Growth pays for itself in under 3 weeks
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
const Pricing = ({ darkMode }) => {
  const bg     = darkMode ? C.navyMid  : C.cloudDancer;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head   = darkMode ? "white"    : C.navy;
  const txt    = darkMode ? "rgba(255,255,255,0.75)" : C.ink;
  return (
  <section id="pricing" style={{ padding: "100px 24px", background: bg, transition: "background 0.3s ease" }}>
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <div className="section-chip">Pricing</div>
        <h2 className="serif" style={{ fontSize: 42, color: head, fontWeight: 400 }}>
          Start with one. Scale to all three.
        </h2>
        <p style={{ color: muted, marginTop: 14, fontSize: 15, maxWidth: 440, margin: "14px auto 0" }}>
          No pressure to take the whole platform on day one. Pick the product that solves your biggest problem right now.
        </p>
      </div>

      <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 32 }}>
        {[
          {
            name: "Ava", monthly: "£500/mo", setup: "from £1,500", highlight: false, color: C.blue,
            tagline: "Stop losing patients at the door",
            features: ["24/7 inbound call handling", "Live calendar booking", "No-show recovery", "SMS confirmations", "Emergency routing"],
          },
          {
            name: "Growth OS", monthly: "£1,200/mo", setup: "from £3,500", highlight: true, color: C.blue,
            tagline: "The full front-of-house stack",
            features: ["Ava (24/7)", "Pulse follow-up flows", "Intelligence dashboard", "Insurance pre-auth (Bupa/AXA/Vitality)", "Priority support"],
          },
          {
            name: "Intelligence", monthly: "£400/mo", setup: "from £1,000", highlight: false, color: "#8B5CF6",
            tagline: "Know your numbers, finally",
            features: ["Per-clinician KPI board", "6-week trend charts", "Alert flags", "WriteUpp integration", "Weekly email digest"],
          },
        ].map(({ name, monthly, setup, highlight, color, tagline, features }) => (
          <div key={name} className="card-hover" style={{
            background: highlight ? C.navy : bgCard,
            borderRadius: 22, padding: 34,
            border: highlight ? `2px solid ${C.blue}` : `1px solid ${bdr}`,
            position: "relative",
            boxShadow: highlight ? `0 32px 64px ${C.navy}25` : "none",
            transition: "background 0.3s ease",
          }}>
            {highlight && (
              <div style={{
                position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                background: C.blue, color: "white",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "4px 18px", borderRadius: 50,
              }}>Most Popular</div>
            )}

            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color, marginBottom: 6 }}>StrydeOS</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? "white" : head, marginBottom: 4 }}>{name}</div>
            <div style={{ fontSize: 13, color: highlight ? "rgba(255,255,255,0.45)" : muted, marginBottom: 24 }}>{tagline}</div>

            <div className="serif" style={{ fontSize: 34, color: highlight ? "white" : head, fontWeight: 400, marginBottom: 4 }}>{monthly}</div>
            <div style={{ fontSize: 12, color: highlight ? "rgba(255,255,255,0.35)" : muted, marginBottom: 28 }}>Setup {setup}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 28 }}>
              {features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <circle cx="7.5" cy="7.5" r="6.5" fill={highlight ? `${color}35` : `${color}15`}/>
                    <path d="M4.5 7.5l2 2 4-4" stroke={highlight ? "#60A5FA" : color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 13, color: highlight ? "rgba(255,255,255,0.75)" : txt }}>{f}</span>
                </div>
              ))}
            </div>

            <a href="#early-access" className={highlight ? "btn-primary" : "btn-outline"}
              style={{ width: "100%", justifyContent: "center", borderRadius: 14 }}>
              Get Early Access
            </a>
          </div>
        ))}
      </div>

      <p style={{ textAlign: "center", fontSize: 13, color: muted, fontStyle: "italic" }}>
        Currently in early access · No lock-in contracts · Onboarding & training included
      </p>
    </div>
  </section>
  );
};

/* ─── Why StrydeOS ───────────────────────────────────────────────────────────── */
const WhyUs = ({ darkMode }) => {
  const bgAlt    = darkMode ? C.navy    : C.cream;
  const bgCard0  = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bgCard1  = darkMode ? "rgba(255,255,255,0.02)" : C.cloudDancer;
  const bdr      = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const muted    = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head     = darkMode ? "white"   : C.navy;
  const italic   = darkMode ? C.blueGlow : C.blue;
  const pillars = [
    {
      n: "01",
      title: "Built from inside the clinic.",
      color: C.blue,
      body: `Most software is built by people who've never worked a clinical day in their life. StrydeOS wasn't.

We know what a Monday morning handover looks like. We know the difference between a DNA and a late cancel. We know that "utilisation" means something very specific to a physio practice owner, and that Physitrack compliance isn't a vanity metric — it's a proxy for clinical outcomes.

That knowledge is baked into every feature. You won't spend three calls explaining your workflow to us. We already know it.`,
    },
    {
      n: "02",
      title: "We don't hide behind the dashboard.",
      color: C.teal,
      body: `You won't find us selling you a flashy interface full of metrics that don't move your business. Every number in StrydeOS Intelligence is there because it changes a decision — follow-up rate, course completion, DNA rate, revenue per session. Nothing else.

If a feature doesn't make your practice run better, we won't build it. If a metric doesn't help you act, it doesn't make the cut. We'd rather show you four numbers that matter than forty that don't.`,
    },
    {
      n: "03",
      title: "Patient outcomes are the only thing that actually counts.",
      color: "#8B5CF6",
      body: `Every product we've built traces back to the same question: does this help patients complete their course of treatment?

Ava answers the phone so the patient gets booked. Pulse sends the reminder so they come back. Intelligence flags the clinician whose follow-up rate is slipping — before it becomes a pattern. The patient never sees StrydeOS. But they feel it.

We're not a marketing tool. We're not a retention gimmick. We're infrastructure for better clinical outcomes.`,
    },
    {
      n: "04",
      title: "We're in this with you, not just in your invoice.",
      color: C.blue,
      body: `To do this properly, we need to know more than your PMS. We need to know what kind of practice you're building, who your patients are, what your clinicians are good at, and where you're losing ground. That's how we set up StrydeOS in a way that actually fits — not a generic template with your logo on it.

We have clients who call us before they hire. We intend to keep it that way. If that sounds like the kind of relationship you want with a software partner, we should talk.`,
    },
  ];

  return (
    <section style={{ padding: "110px 24px", background: bgAlt, transition: "background 0.3s ease" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>

        {/* Header */}
        <div className="whyus-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end", marginBottom: 80 }}>
          <div>
            <div className="section-chip">Why StrydeOS</div>
            <h2 className="serif" style={{ fontSize: 50, color: head, fontWeight: 400, lineHeight: 1.0, marginTop: 16 }}>
              Clinical software,
              <br />
              <span style={{ fontStyle: "italic", color: italic }}>built by clinicians.</span>
            </h2>
          </div>
          <div>
            <p style={{ fontSize: 16, color: muted, lineHeight: 1.8 }}>
              There's no shortage of software that promises to transform your practice. Most of it is built by people who've never set foot in a clinic. StrydeOS is the exception — and we think that matters.
            </p>
          </div>
        </div>

        {/* Four pillar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          {pillars.map(({ n, title, color, body }, i) => (
            <div key={n} style={{
              background: i % 2 === 0 ? bgCard0 : bgCard1,
              padding: "52px 56px",
              position: "relative",
              transition: "background 0.3s ease",
            }}
              onMouseEnter={e => e.currentTarget.style.background = `${color}08`}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? bgCard0 : bgCard1}
            >
              {/* Number */}
              <div style={{
                position: "absolute", top: 44, right: 52,
                fontFamily: "'DM Serif Display', serif",
                fontSize: 72, fontWeight: 400, lineHeight: 1,
                color: `${color}12`,
                userSelect: "none",
              }}>{n}</div>

              {/* Accent bar */}
              <div style={{ width: 36, height: 3, background: color, borderRadius: 2, marginBottom: 28 }} />

              <h3 className="serif" style={{
                fontSize: 24, color: head, fontWeight: 400, lineHeight: 1.25,
                marginBottom: 24, maxWidth: 380,
              }}>
                {title}
              </h3>

              {body.split("\n\n").map((para, pi) => (
                <p key={pi} style={{
                  fontSize: 14.5, color: muted, lineHeight: 1.85,
                  marginBottom: pi < body.split("\n\n").length - 1 ? 16 : 0,
                }}>
                  {para}
                </p>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom proof bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
          borderTop: `1px solid ${bdr}`,
          marginTop: 60,
        }}>
          {[
            { stat: "100%", label: "of features built on real clinical workflows" },
            { stat: "5 days", label: "average from signed to live" },
            { stat: "Zero", label: "metrics included unless they drive decisions" },
            { stat: "Always", label: "a human on the other end — not a ticket system" },
          ].map(({ stat, label }) => (
            <div key={label} style={{ padding: "36px 0 0", paddingRight: 32 }}>
              <div className="serif" style={{ fontSize: 36, color: head, marginBottom: 8 }}>{stat}</div>
              <div style={{ fontSize: 13, color: muted, lineHeight: 1.65, maxWidth: 180 }}>{label}</div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};

/* ─── Early Access CTA ──────────────────────────────────────────────────────── */
const EarlyAccess = () => (
  <section id="early-access" style={{
    padding: "100px 24px",
    background: C.navy,
    position: "relative", overflow: "hidden",
    textAlign: "center",
  }}>
    <RadialGlow color={C.blue} size={800} opacity={0.16} style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />

    <div style={{ maxWidth: 620, margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ display: "inline-flex", gap: 4, padding: "4px 14px", borderRadius: 50, background: `${C.blue}30`, border: `1px solid ${C.blue}50`, color: C.blueGlow, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 }}>
        Early Access · Limited Spots
      </div>

      <h2 className="serif" style={{ fontSize: 48, color: "white", fontWeight: 400, lineHeight: 1.05, marginBottom: 20 }}>
        See what your clinic is leaving on the table.
      </h2>

      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, lineHeight: 1.7, marginBottom: 18 }}>
        Book a free 15-minute Missed Call & Admin Audit. We'll use your public clinic data to estimate missed call volume, drop-off losses, and admin burden — based on your existing systems.
      </p>
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, lineHeight: 1.65, marginBottom: 40, fontStyle: "italic" }}>
        No switching required. StrydeOS connects to Cliniko, WriteUpp, and most major PMS out of the box. Pick the product that solves your biggest problem right now — and build from there.
      </p>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <a href="https://calendly.com" target="_blank" rel="noopener" className="btn-primary" style={{ fontSize: 16, padding: "16px 44px" }}>
          Book your free audit →
        </a>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="#" className="btn-ghost" style={{ padding: "10px 20px", fontSize: 13 }}>Book a Demo</a>
          <a href="#pricing" className="btn-ghost" style={{ padding: "10px 20px", fontSize: 13 }}>See Pricing</a>
        </div>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 4 }}>
          15 minutes · No obligation · UK private practice · MSK · Allied health
        </div>
      </div>

      {/* Social proof strip */}
      <div style={{ display: "flex", justifyContent: "center", gap: 40, marginTop: 56, paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        {[
          { v: "5 days", l: "Average setup time" },
          { v: "GDPR", l: "Compliant · UK secure hosting" },
          { v: "3 clinics", l: "Active UK early-access practices" },
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

/* ─── Footer ─────────────────────────────────────────────────────────────────── */
const Footer = () => (
  <footer style={{ background: "#060F1E", padding: "52px 24px 28px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
    <div style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div className="footer-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 44 }}>
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
            { h: "Products", links: ["Ava","Pulse","Intelligence","Growth OS"] },
            { h: "Company", links: ["About","Case Studies","Pricing","Contact"] },
            { h: "Legal", links: ["Privacy","GDPR","Terms"] },
          ].map(({ h, links }) => (
            <div key={h}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>{h}</div>
              {links.map(l => (
                <div key={l} style={{ marginBottom: 9 }}>
                  <a href="#" style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textDecoration: "none", transition: "color 0.2s" }}
                    onMouseEnter={e => e.target.style.color = "rgba(255,255,255,0.75)"}
                    onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.3)"}>{l}</a>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 20, display: "flex", justifyContent: "space-between" }}>
        <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 12 }}>© 2026 StrydeOS Ltd. All rights reserved.</div>
        <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 12 }}>Built by clinicians, for clinicians.</div>
      </div>
    </div>
  </footer>
);

/* ─── App ────────────────────────────────────────────────────────────────────── */
export default function App() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("strydeos-theme");
    if (saved === "dark") setDarkMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("strydeos-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <>
      <style>{globalStyles}</style>
      <Nav darkMode={darkMode} setDarkMode={setDarkMode} />
      <Hero darkMode={darkMode} />
      <HolisticSection darkMode={darkMode} />
      <Integrations darkMode={darkMode} />
      <Products darkMode={darkMode} />
      <Results />
      <ROICalc darkMode={darkMode} />
      <Pricing darkMode={darkMode} />
      <WhyUs darkMode={darkMode} />
      <EarlyAccess />
      <Footer />
    </>
  );
}
