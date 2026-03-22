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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownTimeout = useRef(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const openDropdown = () => {
    clearTimeout(dropdownTimeout.current);
    setDropdownOpen(true);
  };
  const closeDropdown = () => {
    dropdownTimeout.current = setTimeout(() => setDropdownOpen(false), 200);
  };

  const navBg  = scrolled
    ? darkMode ? "rgba(11,37,69,0.95)"    : "rgba(242,241,238,0.94)"
    : "transparent";
  const navBdr = scrolled
    ? darkMode ? "1px solid rgba(255,255,255,0.07)" : `1px solid ${C.border}`
    : "none";
  const linkColor   = darkMode ? "rgba(255,255,255,0.7)" : C.ink;
  const wordColor   = darkMode ? "white"    : C.navy;
  const wordAccent  = darkMode ? C.blueGlow : C.blue;

  const dropdownBg = darkMode ? "rgba(11,37,69,0.97)" : "rgba(255,255,255,0.98)";
  const dropdownBorder = darkMode ? "rgba(255,255,255,0.08)" : C.border;
  const dropdownItemColor = darkMode ? "rgba(255,255,255,0.7)" : C.ink;
  const dropdownItemHover = darkMode ? "rgba(255,255,255,0.06)" : `${C.blue}06`;
  const dropdownLabelColor = darkMode ? "rgba(255,255,255,0.3)" : C.muted;

  const dropdownSections = [
    { label: "Modules", items: [
      { name: "Ava", desc: "AI voice receptionist", href: "/ava", dot: C.blue },
      { name: "Pulse", desc: "Patient retention engine", href: "/pulse", dot: C.teal },
      { name: "Intelligence", desc: "Performance dashboard", href: "/intelligence", dot: "#8B5CF6" },
    ]},
    { label: "Navigate", items: [
      { name: "Products", href: "#products" },
      { name: "How it works", href: "#how-it-works" },
      { name: "Pricing", href: "#pricing" },
      { name: "About", href: "#about" },
    ]},
    { label: "Access", items: [
      { name: "Book a call", href: "https://calendly.com/hello-strydeos/30min", external: true },
      { name: "Log in", href: "https://portal.strydeos.com/login" },
    ]},
  ];

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 24px", transition: "all 0.3s ease",
      background: navBg,
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: navBdr,
    }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>

        {/* ── Logo area: split into Monolith (dropdown) + Wordmark (scroll-to-top) ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

          {/* Monolith mark — hover opens dropdown */}
          <div
            style={{ position: "relative" }}
            onMouseEnter={openDropdown}
            onMouseLeave={closeDropdown}
          >
            <button
              style={{
                background: "none", border: "none", padding: 4, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10,
                transition: "background 0.15s",
              }}
              onFocus={openDropdown}
              onBlur={closeDropdown}
              aria-label="Site navigation menu"
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <MonolithMark size={34} />
            </button>

            {/* Dropdown menu */}
            <div
              style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0,
                minWidth: 260,
                background: dropdownBg,
                backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                border: `1px solid ${dropdownBorder}`,
                borderRadius: 16,
                boxShadow: darkMode
                  ? "0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)"
                  : "0 16px 48px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
                padding: "8px 0",
                opacity: dropdownOpen ? 1 : 0,
                transform: dropdownOpen ? "translateY(0)" : "translateY(-6px)",
                pointerEvents: dropdownOpen ? "auto" : "none",
                transition: "opacity 0.2s ease, transform 0.2s ease",
                zIndex: 200,
              }}
              onMouseEnter={openDropdown}
              onMouseLeave={closeDropdown}
            >
              {dropdownSections.map((section, si) => (
                <div key={section.label}>
                  {si > 0 && <div style={{ height: 1, background: dropdownBorder, margin: "6px 12px" }} />}
                  <div style={{
                    fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: "0.08em", color: dropdownLabelColor,
                    padding: "8px 16px 4px",
                  }}>{section.label}</div>
                  {section.items.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      onClick={() => setDropdownOpen(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 16px", textDecoration: "none",
                        color: dropdownItemColor, fontSize: 13, fontWeight: 500,
                        borderRadius: 8, margin: "0 6px",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = dropdownItemHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {item.dot && (
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: item.dot, flexShrink: 0,
                        }} />
                      )}
                      <span style={{ flex: 1 }}>{item.name}</span>
                      {item.desc && (
                        <span style={{ fontSize: 11, color: dropdownLabelColor, fontWeight: 400 }}>
                          {item.desc}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* StrydeOS wordmark — click scrolls to top */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 17,
              color: wordColor, letterSpacing: "-0.02em",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            aria-label="Scroll to top"
          >
            Stryde<span style={{ color: wordAccent }}>OS</span>
          </button>
        </div>

        <div className="nav-links" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {[["Products","#products"],["How it works","#how-it-works"],["Pricing","#pricing"],["About","#about"]].map(([label, href]) => (
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
              background: darkMode ? "rgba(255,255,255,0.06)" : `${C.blue}08`,
              border: `1.5px solid ${darkMode ? "rgba(255,255,255,0.2)" : C.border}`,
              borderRadius: 10, width: 38, height: 38,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: darkMode ? "rgba(255,255,255,0.75)" : C.ink,
              fontSize: 17, transition: "all 0.2s",
            }}
            aria-label="Toggle dark mode"
          >
            {darkMode ? "☀" : "☾"}
          </button>
          <a href="https://calendly.com/hello-strydeos/30min" className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }} target="_blank" rel="noopener noreferrer">
            Book a call
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
              Now in early access
            </div>

            <h1 className="serif" style={{ fontSize: 60, lineHeight: 1.0, color: head, marginBottom: 10, fontWeight: 400, letterSpacing: "-0.01em" }}>
              The Clinic OS
            </h1>
            <h1 className="serif" style={{ fontSize: 60, lineHeight: 1.0, color: head, marginBottom: 28, fontWeight: 400, letterSpacing: "-0.01em" }}>
              for <span style={{ fontStyle: "italic", color: italic }}>private practice.</span>
            </h1>

            <p style={{ fontSize: 18, lineHeight: 1.7, color: muted, marginBottom: 20, maxWidth: 540 }}>
              Your practice has software. It does not have a system. Your PMS handles bookings, your exercise platform delivers HEPs, your payment processor takes the money, but none of them explain why follow-up rate is dropping or where cancellations are going unrecovered. Built for clinical precision.
            </p>
            <div style={{ height: 20 }} />

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 52 }}>
              <a href="https://portal.strydeos.com/login?mode=signup" className="btn-primary">
                Start free trial
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
                    { label: "Rebooking Rate", value: "80%", bar: 80, status: "ok" },
                    { label: "HEP Compliance", value: "84%", bar: 84, status: "ok" },
                    { label: "Utilisation", value: "76%", bar: 76, status: "ok" },
                    { label: "No-show Rate", value: "5.8%", bar: 42, status: "ok" },
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
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Patient Retention — 90 days</div>
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
              "Appointments, note taking, billing — your PMS owns this layer. StrydeOS sits above that."
            </p>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
              {[
                { icon: "🔗", text: "Connects to leading PMS platforms" },
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
            Visibility drives performance. Performance drives profit.
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: muted, marginBottom: 20 }}>
            Cost per acquisition. Follow-up conversion. DNA recovery rate. Revenue per clinician hour. These are the metrics that drive private-practice growth, and most owners still pull them manually from spreadsheets.
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
            { name: "Ava", desc: "Catches every patient at the door", icon: "📞", color: C.blue, n: "01" },
            { name: "Pulse", desc: "Keeps patients engaged through treatment", icon: "🔄", color: C.teal, n: "02" },
            { name: "Intelligence", desc: "Shows you how it's all performing", icon: "📊", color: "#8B5CF6", n: "03" },
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
          Our pitch isn't "switch to StrydeOS."
        </h2>
        <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: "0 auto", lineHeight: 1.75 }}>
          Appointments, note taking, billing — your PMS owns this layer. StrydeOS sits above that. Whatever you're already running, we simply connect and enrich it, not replace it.
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
                { name: "PMS Platform A", icon: "🗂️", desc: "Appointments · Notes · Billing" },
                { name: "PMS Platform B", icon: "📋", desc: "Appointments · Notes · Billing" },
                { name: "PMS Platform C", icon: "🏥", desc: "Appointments · Notes · Billing" },
                { name: "Other PMS", icon: "⚙️", desc: "Via API or bespoke integration" },
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
                  <div style={{ color: "white", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{name}</div>
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
            a: "No. StrydeOS connects to your existing PMS via API or bespoke integration. Your workflows stay exactly the same.",
            icon: "🔌",
          },
          {
            q: "Will my team need retraining?",
            a: "They keep using the same PMS they always have. StrydeOS runs quietly in the background — your staff only notice the results.",
            icon: "🎓",
          },
          {
            q: "How long does setup take?",
            a: "Most practices are live within 5 days. We handle the integration.",
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
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      if (hash === "#product-ava") setActive(0);
      if (hash === "#product-pulse") setActive(1);
      if (hash === "#product-intelligence") setActive(2);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const products = [
    {
      id: "ava",
      label: "Ava",
      icon: "📞",
      color: C.blue,
      eyebrow: "Ava",
      headline: "Never miss a patient again.",
      body: "Every missed call is a new patient lost to the next clinic on Google. Every cancellation that is not recovered becomes avoidable leakage.\n\nAva handles inbound calls, books into your diary, recovers cancellations before the slot goes empty, and triages new enquiries automatically.",
      proof: "Clinics using it have stopped paying £400–800/month to call-handling services. They've also stopped losing patients at the first point of contact.",
      tagline: "Your front desk. Without the overhead.",
      cta: "Start with Ava",
      howItWorks: ["Captures inbound calls and triages intent", "Books directly into your existing PMS diary", "Triggers confirmations and recovery flows automatically"],
      keyBenefits: ["Fewer missed first contacts", "Higher slot fill from recovered cancels", "Lower admin overhead on front desk"],
      bullets: ["Inbound calls handled 24/7", "Books directly into your calendar", "Cancellation recovery & no-show chasing", "SMS confirmations sent automatically", "Emergency routing to on-call clinician"],
      visual: (
        <div style={{ background: C.navy, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.blue}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
            <div>
              <div style={{ color: "white", fontWeight: 600, fontSize: 13 }}>Ava</div>
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
      id: "pulse",
      label: "Pulse",
      icon: "🔄",
      color: C.teal,
      eyebrow: "Pulse",
      headline: "Keep patients in care, longer.",
      body: "The drop-off between session two and session three is where most clinics leak the most revenue. Patients disengage — not because the treatment isn't working, but because nobody stayed in touch.\n\nPulse automates every touchpoint between sessions.",
      proof: "The clinics getting this right aren't doing it by hand. They've systematised it — and it shows in their completion rates and referral volume.",
      tagline: "Better outcomes. Fewer drop-offs. More referrals.",
      cta: "Start with Pulse",
      howItWorks: ["Monitors treatment journey milestones", "Detects gaps and triggers targeted follow-up", "Re-engages drop-offs with timed nudges"],
      keyBenefits: ["Better treatment completion", "Higher follow-up conversion", "More referral-ready patient outcomes"],
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
      eyebrow: "Intelligence",
      headline: "Know how your clinic actually performs.",
      body: "Revenue tells you what happened, not why. Intelligence surfaces the drivers behind it in real time.\n\nTrack cost per acquisition, follow-up conversion, revenue per clinician hour, DNA recovery rate, and utilisation against rebooking patterns — automatically and per clinician.",
      proof: "Not to manage people. To understand where your clinic is thriving and where it isn't. The best-run clinics already know these numbers.",
      tagline: "Real-time. Actionable. Built for practice owners, not analysts.",
      cta: "Start with Intelligence",
      howItWorks: ["Pulls data from your clinical and ops systems", "Standardises KPIs by clinician and clinic", "Flags drift so issues are acted on early"],
      keyBenefits: ["Clear visibility on profit drivers", "Faster decisions from live metrics", "Coaching-led performance improvement"],
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
    <section id="products" style={{ padding: "100px 24px", background: bg, transition: "background 0.3s ease" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div className="section-chip">Products</div>
          <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400 }}>
            Three products. One platform.
          </h2>
          <p style={{ color: muted, fontSize: 16, marginTop: 14, maxWidth: 480, margin: "14px auto 0" }}>
            Know the metrics that move the needle. Use one or all three.
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
        <div id={`product-${p.id}`} key={active} className="product-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center", animation: "fadeIn 0.4s ease" }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: darkMode ? "rgba(255,255,255,0.04)" : "white", border: `1px solid ${bdr}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: p.color, marginBottom: 8 }}>How It Works</div>
                {p.howItWorks.map((item) => (
                  <div key={item} style={{ fontSize: 12.5, color: muted, lineHeight: 1.55, marginBottom: 6 }}>• {item}</div>
                ))}
              </div>
              <div style={{ background: darkMode ? "rgba(255,255,255,0.04)" : "white", border: `1px solid ${bdr}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: p.color, marginBottom: 8 }}>Benefits</div>
                {p.keyBenefits.map((item) => (
                  <div key={item} style={{ fontSize: 12.5, color: muted, lineHeight: 1.55, marginBottom: 6 }}>• {item}</div>
                ))}
              </div>
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

            <a href={`/${p.id}`} className="btn-primary" style={{ background: p.color }}>
              Learn more about {p.label} →
            </a>
          </div>

          <div>{p.visual}</div>
        </div>
      </div>
    </section>
  );
};

/* ─── Results / Proof ───────────────────────────────────────────────────────── */
const caseStudies = [
  {
    tag: "Case Study · TGT Physio",
    headline: <>Full clinical visibility in{" "}<span style={{ fontStyle: "italic", color: C.blueGlow }}>one week.</span></>,
    quote: "Using the operating system has been an absolute game changer in how we see our clinic.",
    author: "Nicholas, Managing Director, TGT Physio",
    grid: [
      { before: "No performance visibility", after: "Real-time KPI board" },
      { before: "Follow-up rate: unknown", after: "Tracked weekly" },
      { before: "HEP: guesswork", after: "100% compliance" },
      { before: "Revenue: quarterly view", after: "Revenue: live" },
    ],
  },
  {
    tag: "Case Study · Spires MSK",
    headline: <>Follow-up rate from 2.4 to{" "}<span style={{ fontStyle: "italic", color: C.blueGlow }}>3.8 sessions.</span></>,
    quote: "We went from guessing to knowing — per clinician, per week. The coaching conversations are completely different now.",
    author: "Jamal, Clinic Owner, Spires MSK · West Hampstead",
    grid: [
      { before: "Follow-up rate: ~2.4", after: "Follow-up rate: 3.8" },
      { before: "Programme assignment: ~35%", after: "Programme assignment: 82%" },
      { before: "No clinician benchmarks", after: "Per-clinician KPI weekly" },
      { before: "Manual data pulls", after: "Live dashboard from day 1" },
    ],
  },
];

const Results = () => {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % caseStudies.length), 5000);
    return () => clearInterval(t);
  }, []);
  const cs = caseStudies[slide];
  return (
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
          Better conversion from enquiry to booked care. Better continuity through treatment. Better owner visibility on profit drivers.
        </p>
      </div>

      <div className="results-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 48 }}>
        {[
          { stat: "75%", label: "of owners don't know their CAC", note: "Intelligence is the fix" },
          { stat: "+34%", label: "Follow-up rate improvement", note: "Spires MSK pilot data" },
          { stat: "3×", label: "Google review conversion", note: "11% vs 4% industry avg" },
          { stat: "5 weeks", label: "Average payback period", note: "Full Stack · Studio" },
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

      {/* Case Study Carousel */}
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 20, padding: "40px 48px",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div key={slide} className="case-study-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center", animation: "fadeIn 0.4s ease" }}>
          <div>
            <div style={{ fontSize: 11, color: C.blueGlow, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{cs.tag}</div>
            <h3 className="serif" style={{ fontSize: 28, color: "white", fontWeight: 400, lineHeight: 1.2, marginBottom: 20 }}>
              {cs.headline}
            </h3>
            <blockquote style={{ borderLeft: `3px solid ${C.blue}`, paddingLeft: 18, color: "rgba(255,255,255,0.6)", fontStyle: "italic", fontSize: 15, lineHeight: 1.65 }}>
              "{cs.quote}"
              <div style={{ fontStyle: "normal", marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
                — {cs.author}
              </div>
            </blockquote>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {cs.grid.map(({ before, after }) => (
              <div key={before} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, textDecoration: "line-through", marginBottom: 5 }}>{before}</div>
                <div style={{ color: "white", fontSize: 12, fontWeight: 500 }}>{after}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
          {caseStudies.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} style={{
              width: slide === i ? 24 : 8, height: 8, borderRadius: 4, border: "none", cursor: "pointer",
              background: slide === i ? C.blue : "rgba(255,255,255,0.15)",
              transition: "all 0.3s ease",
            }} aria-label={`Case study ${i + 1}`} />
          ))}
        </div>
      </div>
    </div>
  </section>
  );
};

/* ─── ROI Calculator ─────────────────────────────────────────────────────────── */
const ROICalc = ({ darkMode }) => {
  const [sessions, setSessions] = useState(30);
  const [dna, setDna] = useState(8);
  const [fee, setFee] = useState(75);
  const [missedCalls, setMissedCalls] = useState(20);
  const [dropout, setDropout] = useState(25);

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
                    Pays for itself in under 3 weeks
                  </div>
                </div>

                <a href="https://portal.strydeos.com/login?mode=signup" className="btn-primary" style={{ width: "100%", justifyContent: "center", borderRadius: 14 }}>
                  Start free trial →
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
  const [tier, setTier] = useState("studio");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const bg     = darkMode ? C.navyMid  : C.cloudDancer;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head   = darkMode ? "white"    : C.navy;
  const txt    = darkMode ? "rgba(255,255,255,0.75)" : C.ink;

  const tierPrices = {
    solo:   { intelligence: 79,  ava: 149, pulse: 99,  full: 279, savings: 48 },
    studio: { intelligence: 129, ava: 199, pulse: 149, full: 399, savings: 78 },
    clinic: { intelligence: 199, ava: 299, pulse: 229, full: 599, savings: 128 },
  };

  const tierLabels = { solo: "Solo", studio: "Studio", clinic: "Clinic" };
  const tierDescs  = { solo: "1 practitioner", studio: "2–5 practitioners", clinic: "6+ practitioners" };
  const prices = tierPrices[tier];

  const modules = [
    {
      name: "Intelligence", price: prices.intelligence, setup: "No setup fee", color: "#8B5CF6",
      tagline: "Clinical performance engine. See where your clinic wins and where it leaks.",
      features: ["Per-clinician KPI dashboard", "90-day rolling trend charts", "HEP compliance & utilisation", "NPS & Google Review pipeline", "Alert flags on metric drift", "Weekly email digest"],
    },
    {
      name: "Ava", price: prices.ava, setup: "£250 one-time setup", color: C.blue,
      tagline: "AI voice receptionist. Never miss another call — books, confirms, recovers 24/7.",
      features: ["24/7 AI inbound call handling", "Direct calendar booking", "Cancellation & no-show recovery", "Emergency routing", "SMS confirmations (500/mo incl.)", "PMS write-back integration"],
    },
    {
      name: "Pulse", price: prices.pulse, setup: "No setup fee", color: C.teal,
      tagline: "Patient continuity engine. Keep patients in treatment from first session to discharge.",
      features: ["Post-session follow-up sequences", "Dropout prevention triggers", "Outcome tracking per patient", "Post-discharge check-ins", "Referral prompt sequences", "Programme assignment monitoring"],
    },
  ];

  return (
  <section id="pricing" style={{ padding: "100px 24px", background: bg, transition: "background 0.3s ease" }}>
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div className="section-chip">Pricing</div>
        <h2 className="serif" style={{ fontSize: 42, color: head, fontWeight: 400 }}>
          Modular by design. Your clinic, your stack.
        </h2>
        <p style={{ color: muted, marginTop: 14, fontSize: 15, maxWidth: 560, margin: "14px auto 0" }}>
          Three modules. Mix and match. No forced tiers, no wasted features. The full stack costs less than a part-time receptionist.
        </p>
      </div>

      {/* Tier selector */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 44 }}>
        <div style={{
          display: "inline-flex", borderRadius: 50, overflow: "hidden",
          border: `1.5px solid ${bdr}`,
          background: darkMode ? "rgba(255,255,255,0.03)" : C.cloudLight,
        }}>
          {Object.keys(tierLabels).map(k => (
            <button key={k} onClick={() => setTier(k)} style={{
              padding: "11px 28px", border: "none", cursor: "pointer",
              fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 600,
              background: tier === k ? C.blue : "transparent",
              color: tier === k ? "white" : muted,
              transition: "all 0.25s ease",
              borderRadius: 50,
            }}>
              {tierLabels[k]}
              <span style={{ display: "block", fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>{tierDescs[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <button onClick={() => setShowBreakdown(true)} style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.blue, fontSize: 13, fontWeight: 600,
          textDecoration: "underline", textUnderlineOffset: 3,
        }}>View full pricing breakdown →</button>
      </div>

      {showBreakdown && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowBreakdown(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: darkMode ? C.navy : "white", borderRadius: 20, maxWidth: 900, width: "100%", maxHeight: "85vh", overflow: "auto", position: "relative", border: `1px solid ${darkMode ? "rgba(255,255,255,0.1)" : C.border}`, boxShadow: "0 40px 100px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "28px 32px", borderBottom: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: darkMode ? "white" : C.navy }}>Pricing Breakdown</div>
                <div style={{ fontSize: 13, color: darkMode ? "rgba(255,255,255,0.4)" : C.muted, marginTop: 4 }}>Per-module and bundle pricing across all tiers</div>
              </div>
              <button onClick={() => setShowBreakdown(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: darkMode ? "rgba(255,255,255,0.4)" : C.muted, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 32 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Module", "Solo (1)", "Studio (2–5)", "Clinic (6+)"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", borderBottom: `2px solid ${darkMode ? "rgba(255,255,255,0.1)" : C.border}`, color: darkMode ? "rgba(255,255,255,0.5)" : C.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "Intelligence", solo: "£79", studio: "£129", clinic: "£199", color: "#8B5CF6" },
                    { name: "Ava", solo: "£149", studio: "£199", clinic: "£299", color: C.blue },
                    { name: "Pulse", solo: "£99", studio: "£149", clinic: "£229", color: C.teal },
                    { name: "Full Stack", solo: "£279", studio: "£399", clinic: "£599", color: C.blue },
                  ].map(row => (
                    <tr key={row.name}>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${darkMode ? "rgba(255,255,255,0.06)" : C.border}`, fontWeight: 600, color: darkMode ? "white" : C.navy }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: row.color, marginRight: 8 }} />
                        {row.name}
                      </td>
                      {[row.solo, row.studio, row.clinic].map((p, i) => (
                        <td key={i} style={{ padding: "12px 14px", borderBottom: `1px solid ${darkMode ? "rgba(255,255,255,0.06)" : C.border}`, color: darkMode ? "rgba(255,255,255,0.7)" : C.ink }}>{p}/mo</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 20, padding: "14px 18px", borderRadius: 12, background: darkMode ? "rgba(255,255,255,0.04)" : C.cloudLight, fontSize: 12, color: darkMode ? "rgba(255,255,255,0.4)" : C.muted, lineHeight: 1.65 }}>
                Ava includes a one-time £250 setup fee. All plans: no lock-in, cancel anytime. Annual billing saves 20%.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 32 }}>
        {modules.map(({ name, price, setup, color, tagline, features }) => (
          <div key={name} className="card-hover" style={{
            background: bgCard, borderRadius: 22, padding: 34,
            border: `1px solid ${bdr}`,
            transition: "background 0.3s ease",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color, marginBottom: 6 }}>{name}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: head, marginBottom: 4 }}>{name}</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 24, minHeight: 36, lineHeight: 1.5 }}>{tagline}</div>

            <div className="serif" style={{ fontSize: 34, color: head, fontWeight: 400, marginBottom: 4 }}>£{price}<span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 500, color: muted }}>/mo</span></div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 28 }}>{setup}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 28, borderTop: `1px solid ${bdr}`, paddingTop: 20 }}>
              {features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <circle cx="7.5" cy="7.5" r="6.5" fill={`${color}15`}/>
                    <path d="M4.5 7.5l2 2 4-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 13, color: txt }}>{f}</span>
                </div>
              ))}
            </div>

            <a href={`/${name.toLowerCase()}`} className="btn-outline"
              style={{ width: "100%", justifyContent: "center", borderRadius: 14 }}>
              Learn more →
            </a>
          </div>
        ))}
      </div>

      {/* Full Stack bundle */}
      <div className="card-hover" style={{
        background: darkMode
          ? `linear-gradient(135deg, rgba(28,84,242,0.08) 0%, rgba(139,92,246,0.06) 50%, rgba(8,145,178,0.06) 100%)`
          : C.navy,
        borderRadius: 22, padding: "36px 40px", marginBottom: 32,
        border: `1px solid ${darkMode ? "rgba(75,139,245,0.2)" : "rgba(75,139,245,0.15)"}`,
        position: "relative", overflow: "hidden",
      }}>
        <RadialGlow color={C.blue} size={400} opacity={0.12} style={{ top: -100, right: -100 }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
          <div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 6,
              background: "rgba(255,255,255,0.06)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 14,
            }}>★ Best value · {tierLabels[tier]}</div>
            <div className="serif" style={{ fontSize: 28, color: "white", fontWeight: 400, marginBottom: 6 }}>StrydeOS Full Stack</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 20, fontWeight: 300 }}>Moving the benchmark. The full clinical operating system.</div>
            <div style={{ display: "flex", gap: 20 }}>
              {[
                { name: "Intelligence", color: "#8B5CF6" },
                { name: "Ava", color: C.blue },
                { name: "Pulse", color: C.teal },
              ].map(({ name: n, color: c }) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                  {n}
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="serif" style={{ fontSize: 52, color: "white", fontWeight: 400, lineHeight: 1 }}>
              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 24, fontWeight: 600, verticalAlign: "top", position: "relative", top: 8, marginRight: 2, opacity: 0.6 }}>£</span>{prices.full}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>per month · £250 one-time setup</div>
            <div style={{
              display: "inline-block", marginTop: 10, padding: "4px 10px", borderRadius: 6,
              background: "rgba(5,150,105,0.15)", color: C.success, fontSize: 11, fontWeight: 600,
            }}>Save £{prices.savings}/mo vs individual</div>
            <a href="https://portal.strydeos.com/login?mode=signup" className="btn-primary" style={{ marginTop: 16, padding: "10px 24px", fontSize: 13 }}>
              Get Full Stack →
            </a>
          </div>
        </div>
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
      title: "Built from the reality of private practice.",
      color: C.blue,
      body: `StrydeOS comes from the operational side of clinic life, where small gaps in follow-up, utilisation, and continuity become meaningful over time.

That perspective shapes every part of the product.`,
    },
    {
      n: "02",
      title: "We don't hide behind the dashboard.",
      color: C.teal,
      body: `You won't find us selling you a flashy interface full of metrics that don't move your business. Every number in Intelligence is there because it changes a decision — follow-up rate, HEP compliance, DNA rate, revenue per session. Nothing else.

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
      title: "We treat implementation as part of the product.",
      color: C.blue,
      body: `A clinic only gets value from software that fits the way it already works.

So we focus on the practical detail, the setup, and the signals worth acting on.`,
    },
  ];

  return (
    <section id="about" style={{ padding: "110px 24px", background: bgAlt, transition: "background 0.3s ease" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>

        {/* Header */}
        <div className="whyus-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end", marginBottom: 80 }}>
          <div>
            <div className="section-chip">About</div>
            <h2 className="serif" style={{ fontSize: 46, color: head, fontWeight: 400, lineHeight: 1.1, marginTop: 16 }}>
              Your practice has software.
              <br />
              <span style={{ fontStyle: "italic", color: italic }}>It doesn't have a system.</span>
            </h2>
          </div>
          <div>
            <p style={{ fontSize: 16, color: muted, lineHeight: 1.8 }}>
              Your PMS handles bookings, the exercise platform sends HEPs and the processor takes money. None of them identify why cancellations go unrecovered or your latest KPIs. That's because none are built precisely for clinical optimisation.
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
        Early Access
      </div>

      <h2 className="serif" style={{ fontSize: 48, color: "white", fontWeight: 400, lineHeight: 1.05, marginBottom: 20 }}>
        See what your clinic is leaving on the table.
      </h2>

      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, lineHeight: 1.7, marginBottom: 18 }}>
        Book a free 30-minute Clinical Performance Audit. We'll review your follow-up rate, HEP compliance, utilisation, and DNA rate against benchmarks — using your existing systems.
      </p>
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, lineHeight: 1.65, marginBottom: 40, fontStyle: "italic" }}>
        No switching required. StrydeOS connects to your existing PMS stack via API or bespoke integration. Pick the product that solves your biggest problem right now — and build from there.
      </p>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <a href="https://portal.strydeos.com/login?mode=signup" className="btn-primary" style={{ fontSize: 16, padding: "16px 44px" }}>
          Start free trial →
        </a>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="https://calendly.com/hello-strydeos/30min" target="_blank" rel="noopener" className="btn-ghost" style={{ padding: "10px 20px", fontSize: 13 }}>Book a Demo</a>
          <a href="#pricing" className="btn-ghost" style={{ padding: "10px 20px", fontSize: 13 }}>See Pricing</a>
        </div>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 4 }}>
          30 minutes · No obligation · UK private practice · MSK · Allied health
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
            { h: "Products", links: [
              { label: "Ava", href: "#product-ava" },
              { label: "Pulse", href: "#product-pulse" },
              { label: "Intelligence", href: "#product-intelligence" },
            ]},
            { h: "Company", links: [
              { label: "About", href: "#why-strydeos" },
              { label: "Case Studies", href: "#results" },
              { label: "Pricing", href: "#pricing" },
              { label: "Contact", href: "#early-access" },
            ]},
            { h: "Developers", links: [
              { label: "API Reference", href: "/api-docs.html" },
              { label: "Status", href: "https://app.strydeos.com/admin/integration-health" },
            ]},
            { h: "Legal", links: [
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Security & GDPR", href: "/security" },
              { label: "Terms of Service", href: "/terms" },
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

      <div style={{ display: "flex", gap: 24, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {["GDPR Compliant", "UK Hosted", "AES-256 Encrypted", "Audit Logged"].map((badge) => (
          <div key={badge} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {badge}
          </div>
        ))}
      </div>

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

/* ─── Cookie Banner ──────────────────────────────────────────────────────────── */
const COOKIE_KEY = "strydeos_cookie_consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_KEY)) setVisible(true);
    } catch { setVisible(true); }
  }, []);

  function accept() {
    try { localStorage.setItem(COOKIE_KEY, "accepted"); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
      animation: "fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) forwards",
    }}>
      <div style={{
        maxWidth: 680, margin: "0 auto 20px", padding: "18px 24px",
        background: C.navy, borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", gap: 16,
        flexWrap: "wrap",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ shrink: 0 }}>
          <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
          <path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/>
        </svg>
        <p style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, minWidth: 200 }}>
          We use essential cookies to keep the site working and analytics cookies to understand how you use it.{" "}
          <a href="/privacy" style={{ color: C.blueGlow, textDecoration: "underline", textUnderlineOffset: 2 }}>Privacy Policy</a>
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={accept} style={{
            padding: "9px 20px", background: C.blue, color: "white",
            border: "none", borderRadius: 50, fontSize: 13, fontWeight: 600,
            fontFamily: "'Outfit',sans-serif", cursor: "pointer",
            transition: "all 0.2s ease",
          }}
            onMouseEnter={e => { e.target.style.background = C.blueBright; }}
            onMouseLeave={e => { e.target.style.background = C.blue; }}
          >Accept</button>
          <button onClick={accept} style={{
            padding: "9px 16px", background: "transparent",
            color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 50, fontSize: 13, fontWeight: 500,
            fontFamily: "'Outfit',sans-serif", cursor: "pointer",
            transition: "all 0.2s ease",
          }}
            onMouseEnter={e => { e.target.style.color = "rgba(255,255,255,0.8)"; e.target.style.borderColor = "rgba(255,255,255,0.3)"; }}
            onMouseLeave={e => { e.target.style.color = "rgba(255,255,255,0.45)"; e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
          >Decline</button>
        </div>
      </div>
    </div>
  );
}

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
      <Products darkMode={darkMode} />
      <HolisticSection darkMode={darkMode} />
      <Integrations darkMode={darkMode} />
      <Results />
      <ROICalc darkMode={darkMode} />
      <Pricing darkMode={darkMode} />
      <WhyUs darkMode={darkMode} />
      <EarlyAccess />
      <Footer />
      <CookieBanner />
    </>
  );
}
