'use client';

import { useState, useEffect, useRef } from "react";
import AvaConversationCard from "./AvaConversationCard";

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
  purple:      "#8B5CF6",      // Intelligence module accent

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
  @keyframes scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @keyframes waveform { 0% { transform: scaleY(0.4); } 100% { transform: scaleY(1); } }
  @keyframes slideR { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
  @keyframes slideL { from { opacity:0; transform:translateX(-20px); } to { opacity:1; transform:translateX(0); } }
  @keyframes pulse-fade {
    0%, 100% { opacity: 0.1; transform: scale(0.8); }
    50% { opacity: 0.6; transform: scale(1.2); }
  }
  @keyframes ava-pulse-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.2); opacity: 0; } }
  @keyframes ava-btn-glow {
    0%,100% { box-shadow: 0 0 16px rgba(28,84,242,0.35), 0 0 40px rgba(28,84,242,0.15), inset 0 0 12px rgba(75,139,245,0.25); }
    50% { box-shadow: 0 0 24px rgba(28,84,242,0.55), 0 0 60px rgba(28,84,242,0.25), inset 0 0 18px rgba(75,139,245,0.4); }
  }
  @keyframes ava-ring-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  @keyframes flowDot {
    0%, 100% { opacity: 0.2; transform: translateY(0); }
    50% { opacity: 0.8; transform: translateY(-2px); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(28,84,242,0.15); }
    50% { box-shadow: 0 0 20px 4px rgba(28,84,242,0.08); }
  }

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
    .wavecard-grid    { grid-template-columns: 1fr 1fr !important; }
    .footer-top       { flex-direction: column !important; gap: 32px !important; }
    .nav-links        { display: none !important; }
    .arch-grid        { grid-template-columns: 1fr !important; }
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

const AnimIn = ({ delay = 0, children, threshold = 0.15 }) => {
  const [vis, setVis] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVis(true), delay);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay, threshold]);
  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(18px)",
      transition: "opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)",
      transitionDelay: vis ? `${delay}ms` : "0ms",
    }}>
      {children}
    </div>
  );
};


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

/* ─── MonolithVariant (module-coloured icon) ─────────────────────────────── */
const MonolithVariant = ({ size = 48, accentFrom, accentTo, glowColor }) => {
  const id = _uid("mv");
  return (
    <div style={{ filter: `drop-shadow(0 0 12px ${glowColor}30)` }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id={`${id}-g`} x1="0.1" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor={accentFrom} stopOpacity="0.6"/>
            <stop offset="100%" stopColor={accentTo} stopOpacity="0.75"/>
          </linearGradient>
          <radialGradient id={`${id}-r`} cx="28%" cy="24%" r="60%">
            <stop offset="0%" stopColor={accentFrom} stopOpacity="0.35"/>
            <stop offset="100%" stopColor={accentTo} stopOpacity="0"/>
          </radialGradient>
          <linearGradient id={`${id}-b`} x1="0.1" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={accentFrom} stopOpacity="0.5"/>
            <stop offset="100%" stopColor={accentTo} stopOpacity="0.06"/>
          </linearGradient>
          <clipPath id={`${id}-cp`}><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
          <clipPath id={`${id}-ca`}><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
        </defs>
        <rect width="100" height="100" rx="24" fill={`url(#${id}-g)`}/>
        <rect width="100" height="100" rx="24" fill={`url(#${id}-r)`}/>
        <rect width="100" height="100" rx="24" fill="none" stroke={`url(#${id}-b)`} strokeWidth="1.2"/>
        <path d="M 17 21 Q 50 12 83 21" stroke="white" strokeOpacity="0.15" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
        <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10"/>
        <g clipPath={`url(#${id}-cp)`}>
          <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </g>
        <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.25" clipPath={`url(#${id}-ca)`}/>
        <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.45" strokeLinecap="round"/>
      </svg>
    </div>
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
              <div style={{ filter: `drop-shadow(0 0 8px ${C.blue}40)`, transition: "filter 0.3s ease" }}
                onMouseEnter={e => e.currentTarget.style.filter = `drop-shadow(0 0 14px ${C.blue}70)`}
                onMouseLeave={e => e.currentTarget.style.filter = `drop-shadow(0 0 8px ${C.blue}40)`}>
                <MonolithMark size={34} />
              </div>
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
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <a href="https://portal.strydeos.com/login" className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }}>
            Log In
          </a>
        </div>
      </div>
    </nav>
  );
};

/* ─── WaveCard ─────────────────────────────────────────────────────────────── */
const WaveCard = ({ without, withLabel, beforePath, afterPath, glowColor, idx }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered
          ? `linear-gradient(160deg, rgba(255,255,255,0.06) 0%, ${glowColor}08 100%)`
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${hovered ? `${glowColor}30` : "rgba(255,255,255,0.05)"}`,
        borderRadius: 16,
        padding: "22px 18px 18px",
        cursor: "default",
        transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        overflow: "hidden",
      }}
    >
      {/* Bloom glow on hover */}
      <div style={{
        position: "absolute",
        top: -40, left: "50%", transform: "translateX(-50%)",
        width: 200, height: 120,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${glowColor}${hovered ? "20" : "00"} 0%, transparent 70%)`,
        transition: "all 0.6s ease",
        pointerEvents: "none",
      }} />

      {/* Waveform SVG */}
      <div style={{ position: "relative", height: 56, marginBottom: 14 }}>
        {/* Before waveform — chaotic/flat */}
        <svg
          viewBox="0 0 120 50"
          style={{
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "100%",
            opacity: hovered ? 0 : 0.5,
            transition: "opacity 0.5s ease",
          }}
        >
          <path d={beforePath} fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          {[15, 30, 45, 60, 75, 90, 105].map((x, i) => (
            <circle
              key={i}
              cx={x}
              cy={20 + ((i * 7 + idx * 13) % 15)}
              r="1"
              fill="#EF4444"
              opacity="0.3"
            />
          ))}
        </svg>

        {/* After waveform — clean, ascending */}
        <svg
          viewBox="0 0 120 50"
          style={{
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "100%",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.5s ease",
          }}
        >
          <defs>
            <linearGradient id={`wave-grad-${idx}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="1" />
            </linearGradient>
            <filter id={`wave-bloom-${idx}`}>
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>
          </defs>
          {/* Glow trail */}
          <path d={afterPath} fill="none" stroke={glowColor} strokeWidth="4" strokeLinecap="round" opacity="0.2" filter={`url(#wave-bloom-${idx})`} />
          {/* Main line */}
          <path d={afterPath} fill="none" stroke={`url(#wave-grad-${idx})`} strokeWidth="2" strokeLinecap="round" />
          {/* Endpoint pulse */}
          <circle cx="115" cy={afterPath.match(/(\d+)$/)?.[0] || 15} r="3" fill={glowColor} opacity="0.9" />
          <circle cx="115" cy={afterPath.match(/(\d+)$/)?.[0] || 15} r="6" fill={glowColor} opacity="0.2" />
        </svg>
      </div>

      {/* Labels */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.4s ease",
      }}>
        <div style={{
          width: 6, height: 6,
          borderRadius: "50%",
          background: hovered ? glowColor : "#EF4444",
          boxShadow: hovered ? `0 0 8px ${glowColor}80` : "none",
          transition: "all 0.4s ease",
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 13,
          fontWeight: 600,
          color: hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
          transition: "color 0.4s ease",
          lineHeight: 1.3,
        }}>
          {hovered ? withLabel : without}
        </span>
      </div>
    </div>
  );
};

/* ─── BeforeAfterStrip ─────────────────────────────────────────────────────── */
const BeforeAfterStrip = () => {
  const purple = "#8B5CF6";
  const cards = [
    {
      without: "Patients vanish after session 3",
      withLabel: "See exactly where they disengage",
      glowColor: C.blueGlow,
      beforePath: "M5,25 L15,24 L25,26 L35,25 L45,25 L55,26 L65,24 L75,25 L85,25 L95,38 L105,42 L115,45",
      afterPath: "M5,38 C20,34 35,30 50,26 C65,22 80,18 95,14 L115,10",
    },
    {
      without: "Guessing which clinician needs support",
      withLabel: "Clinician-level KPIs that drive coaching",
      glowColor: C.teal,
      beforePath: "M5,20 L15,32 L25,12 L35,38 L45,15 L55,35 L65,18 L75,30 L85,22 L95,28 L105,25 L115,26",
      afterPath: "M5,35 C15,33 25,28 40,24 C55,20 70,18 85,15 C100,12 110,10 115,8",
    },
    {
      without: "Chasing reviews manually",
      withLabel: "Automated nudges after every session",
      glowColor: C.success,
      beforePath: "M5,30 L25,30 L35,28 L45,30 L65,30 L75,31 L95,30 L115,30",
      afterPath: "M5,40 C15,38 25,32 40,28 C55,24 70,18 85,14 C100,10 110,8 115,6",
    },
    {
      without: "Revenue leaks you can't see",
      withLabel: "Revenue per session, per clinician, per week",
      glowColor: purple,
      beforePath: "M5,18 L15,28 L25,15 L35,32 L45,22 L55,30 L65,20 L75,35 L85,16 L95,28 L105,24 L115,26",
      afterPath: "M5,36 C20,32 35,26 50,22 C65,18 80,14 95,10 L115,5",
    },
  ];

  return (
    <div style={{
      marginTop: 80,
      padding: "36px 36px 32px",
      background: C.navy,
      borderRadius: 20,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Deep background waveform traces */}
      <svg
        viewBox="0 0 800 120"
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%", height: "100%",
          opacity: 0.04,
          pointerEvents: "none",
        }}
      >
        <path d="M0,60 C50,20 100,90 150,50 C200,10 250,80 300,60 C350,40 400,90 450,50 C500,10 550,70 600,55 C650,40 700,80 750,45 C800,10 850,60 900,50" fill="none" stroke="white" strokeWidth="1" />
        <path d="M0,70 C60,100 120,30 180,70 C240,110 300,40 360,70 C420,100 480,30 540,70 C600,110 660,40 720,70 C780,100 840,40 900,70" fill="none" stroke="white" strokeWidth="0.5" />
      </svg>

      <div style={{ position: "relative", zIndex: 2 }}>
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          padding: "0 4px",
        }}>
          <p style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.25)",
          }}>
            Hover to reveal what changes
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#EF4444", opacity: 0.5 }} />
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Without</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.blueGlow }} />
              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>With StrydeOS</span>
            </div>
          </div>
        </div>

        {/* Card strip */}
        <div className="wavecard-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}>
          {cards.map((card, i) => (
            <WaveCard key={i} idx={i} {...card} />
          ))}
        </div>

        {/* Badges */}
        <div style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap", marginTop: 24 }}>
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
  );
};

/* ─── Hero ─────────────────────────────────────────────────────────────────── */
/* ─── Hero Dashboard Showcase ──────────────────────────────────────────────── */
const HeroDashSpark = ({ data, color, w = 56, h = 18 }) => {
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const HeroDashModuleCard = ({ name, color, stat, delay }) => {
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
        <span style={{ fontSize: 8, fontWeight: 700, color: C.success, textTransform: "uppercase", letterSpacing: "0.06em" }}>Active</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", marginBottom: 1 }}>{name}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{stat}</div>
    </div>
  );
};

const HeroDashKPI = ({ label, value, unit, delta, dir, status, sparkData, delay }) => {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }, [delay]);
  const sc = status === "green" ? C.success : status === "red" ? "#EF4444" : C.muted;
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
        <span className="serif" style={{ fontSize: 22, color: "#fff", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{unit}</span>}
        {delta && <span style={{ fontSize: 9, fontWeight: 700, color: dir === "up" ? C.success : "#EF4444", marginLeft: 2 }}>{dir === "up" ? "\u2191" : "\u2193"}{delta}</span>}
      </div>
      {sparkData && <HeroDashSpark data={sparkData} color={C.blueGlow} />}
    </div>
  );
};

const HeroDashboard = () => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setLoaded(true))); }, []);
  return (
    <div style={{ width: "100%", maxWidth: 400, margin: "0 auto" }}>
      {/* Floating toast */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 12px 5px 8px", borderRadius: 50,
        backgroundColor: "rgba(255,255,255,0.95)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        fontSize: 10, fontWeight: 600, color: C.success,
        position: "relative", left: "55%", marginBottom: -8, zIndex: 2,
        animation: "float 4s ease-in-out infinite",
        opacity: loaded ? 1 : 0, transition: "opacity 0.5s ease 0.8s",
      }}>
        <span style={{ fontSize: 12 }}>\uD83D\uDCDE</span> Call answered automatically
      </div>

      <div style={{
        backgroundColor: C.navy, borderRadius: 18, padding: "18px 16px 14px",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 8px 50px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -60, right: -40, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${C.blue}14, transparent 70%)`, pointerEvents: "none" }} />

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
              <span className="serif" style={{ fontSize: 15, color: "#fff" }}>Stryde<span style={{ color: C.blueGlow }}>OS</span> Dashboard</span>
            </div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 5, padding: "4px 10px 4px 7px", borderRadius: 50,
            border: "1px solid rgba(5,150,105,0.2)", backgroundColor: "rgba(5,150,105,0.06)",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: C.success }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.success }}>Live</span>
          </div>
        </div>

        {/* Modules */}
        <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
          <HeroDashModuleCard name="Ava" color={C.blue} stat="12 today" delay={150} />
          <HeroDashModuleCard name="Pulse" color={C.teal} stat="8 follow-ups" delay={220} />
          <HeroDashModuleCard name="Intelligence" color={C.purple} stat="91% util." delay={290} />
        </div>

        {/* KPI 2x2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 5 }}>
          <HeroDashKPI label="Follow-up Rate" value="3.3" unit="sess/pt" delta="+2%" dir="up" status="green" sparkData={[2.8,2.9,3.0,3.1,3.0,3.2,3.3]} delay={350} />
          <HeroDashKPI label="HEP Compliance" value="87%" delta="+1%" dir="up" status="green" sparkData={[80,82,83,84,85,86,87]} delay={400} />
          <HeroDashKPI label="Utilisation" value="74%" delta="+1%" dir="up" status="red" sparkData={[70,71,72,71,73,73,74]} delay={450} />
          <HeroDashKPI label="DNA Rate" value="3%" delta="-25%" dir="up" status="green" sparkData={[6,5.5,5,4.2,3.8,3.2,3]} delay={500} />
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
              <span className="serif" style={{ fontSize: 20, color: "#fff", lineHeight: 1 }}>73</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>this week</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.success, marginLeft: 2 }}>\u2191+4%</span>
            </div>
          </div>
          <div style={{
            padding: "8px 12px", borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            opacity: loaded ? 1 : 0, transition: "opacity 0.5s ease 0.6s",
          }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Rev / Session</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span className="serif" style={{ fontSize: 20, color: "#fff", lineHeight: 1 }}>\u00A379</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>avg</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", marginLeft: 2 }}>+0%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
        <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 80, alignItems: "start" }}>

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
              Higher conversion from first touchpoint. Improved treatment continuity. Better visibility on profit drivers. Precision where it counts.
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
                { label: "GDPR · HIPAA-aligned · UK/EU Hosted" },
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

          {/* Right — Ava conversation card showcase */}
          <div style={{ animation: "fadeUp 0.8s 0.2s ease both" }}>
            <AvaConversationCard />
          </div>
        </div>

        {/* Before / After waveform strip */}
        <BeforeAfterStrip />
      </div>
    </section>
  );
};

/* ─── Holistic Section ──────────────────────────────────────────────────────── */
/* ─── Module-tinted Monolith mark ────────────────────────────────────────── */
const ModuleMonolith = ({ color = C.blue, size = 48 }) => {
  const id = _uid("mm");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id={`${id}-c`} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.58"/>
          <stop offset="100%" stopColor={C.navy} stopOpacity="0.72"/>
        </linearGradient>
        <radialGradient id={`${id}-r`} cx="28%" cy="24%" r="60%">
          <stop offset="0%" stopColor={color} stopOpacity="0.42"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={`${id}-t`} x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="white" stopOpacity="0.97"/>
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0.1" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.65"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.06"/>
        </linearGradient>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0"/>
          <stop offset="28%" stopColor="white" stopOpacity="0.60"/>
          <stop offset="65%" stopColor="white" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <clipPath id={`${id}-p`}><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
        <clipPath id={`${id}-a`}><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${id}-c)`}/>
      <rect width="100" height="100" rx="24" fill={`url(#${id}-r)`}/>
      <rect width="100" height="100" rx="24" fill="none" stroke={`url(#${id}-b)`} strokeWidth="1.2"/>
      <path d="M 17 21 Q 50 12 83 21" stroke={`url(#${id}-m)`} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10"/>
      <g clipPath={`url(#${id}-p)`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${id}-t)`} clipPath={`url(#${id}-a)`}/>
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"/>
    </svg>
  );
};

const OneOSModuleCard = ({ name, desc, color, n, bgCard, bdr, head, muted, darkMode }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 20,
        background: bgCard, borderRadius: 16, padding: "20px 24px",
        border: `1px solid ${bdr}`,
        boxShadow: hovered
          ? "0 20px 48px rgba(28,84,242,0.11)"
          : darkMode ? "none" : "0 2px 12px rgba(11,37,69,0.04)",
        transform: hovered ? "translateY(-5px)" : "translateY(0)",
        transition: "all 0.3s ease",
        cursor: "default",
      }}
    >
      <ModuleMonolith color={color} size={48} />
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
  );
};

const oneOSModules = [
  { name: "Ava",          desc: "Catches every call your team can\u2019t get to",                       color: C.blue,    n: "01" },
  { name: "Pulse",        desc: "Keeps patients on course without anyone having to chase",            color: C.teal,    n: "02" },
  { name: "Intelligence", desc: "See exactly where revenue is made, lost, and left on the table",     color: C.purple,  n: "03" },
];

const HolisticSection = ({ darkMode }) => {
  const bgAlt  = darkMode ? C.navyMid : C.cream;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const txt    = darkMode ? "rgba(255,255,255,0.85)" : C.ink;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head   = darkMode ? "white" : C.navy;
  const italic = darkMode ? C.blueGlow : C.blue;
  return (
  <section id="how-it-works" style={{ padding: "100px 24px 60px", background: bgAlt, transition: "background 0.3s ease" }}>
    <div style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div className="holistic-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
        <AnimIn>
        <div>
          <div className="section-chip">One Operating System</div>
          <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400, lineHeight: 1.1, marginBottom: 24 }}>
            The gap between a good clinic and a great one isn't clinical.{" "}
            <span style={{ fontStyle: "italic", color: italic }}>It's operational.</span>
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: muted, marginBottom: 20 }}>
            The highest-revenue private practices don't guess at follow-up rates. They don't lose patients between sessions. They don't miss calls during treatment hours. They built the systems to catch what falls through the cracks — without adding headcount.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: muted, marginBottom: 32 }}>
            Most physios are brilliant clinicians. But nobody taught them how to build the operational layer that turns good clinical work into a growing business. That's the gap.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: txt, fontWeight: 500 }}>
            StrydeOS closes it — so you can focus on the clinical side, knowing the business side is handled.
          </p>
        </div>
        </AnimIn>

        <AnimIn delay={200}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {oneOSModules.map(({ name, desc, color, n }) => (
            <OneOSModuleCard key={name} name={name} desc={desc} color={color} n={n}
              bgCard={bgCard} bdr={bdr} head={head} muted={muted} darkMode={darkMode} />
          ))}
        </div>
        </AnimIn>
      </div>
    </div>
  </section>
  );
};

/* ─── Architecture diagram helpers ──────────────────────────────────────── */

const ArchPulseDots = ({ color = C.blueGlow, count = 3 }) => (
  <div style={{
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 5, padding: "6px 0",
  }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{
        width: 4, height: 4, borderRadius: "50%",
        background: color,
        opacity: 0.15 + (i * 0.25),
        animation: `pulse-fade 1.8s ease-in-out ${i * 0.3}s infinite`,
      }} />
    ))}
  </div>
);

const ArchDiagonalDots = ({ direction = "right", color = C.blueGlow }) => {
  const offsetX = direction === "right" ? 8 : -8;
  return (
    <div style={{ position: "relative", height: 30, padding: "4px 0" }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{
          width: 4, height: 4, borderRadius: "50%",
          background: color,
          position: "absolute",
          top: 3 + (i * 9),
          left: `calc(50% + ${(i - 1) * offsetX}px - 2px)`,
          opacity: 0.15 + (i * 0.25),
          animation: `pulse-fade 1.8s ease-in-out ${i * 0.3}s infinite`,
        }} />
      ))}
    </div>
  );
};

const ArchMonolithBall = ({ size = 44 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%",
    background: `linear-gradient(135deg, ${C.blue}30, ${C.blueGlow}18)`,
    border: `1.5px solid ${C.blue}40`,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 0 24px ${C.blue}18, inset 0 1px 0 ${C.blueGlow}20`,
    flexShrink: 0, overflow: "hidden",
  }}>
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="amb-t" x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="white" stopOpacity="0.97"/>
        </linearGradient>
        <clipPath id="amb-p"><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
        <clipPath id="amb-a"><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
      </defs>
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10"/>
      <g clipPath="url(#amb-p)">
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill="url(#amb-t)" clipPath="url(#amb-a)"/>
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"/>
    </svg>
  </div>
);

const ArchAvaIcon = ({ color = C.blue, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <path d="M3,4 L15,4 C16,4 17,5 17,6 L17,12 C17,13 16,14 15,14 L8,14 L5,17 L5,14 L4,14 C3,14 2,13 2,12 L2,6 C2,5 3,4 3,4 Z"
      stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.08" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
    <rect x="5.5" y="8" width="1.2" height="4" rx="0.6" fill={color} opacity="0.5">
      <animate attributeName="height" values="4;2;4" dur="0.8s" repeatCount="indefinite"/>
      <animate attributeName="y" values="8;9;8" dur="0.8s" repeatCount="indefinite"/>
    </rect>
    <rect x="8" y="6.5" width="1.2" height="7" rx="0.6" fill={color} opacity="0.75">
      <animate attributeName="height" values="7;3;7" dur="0.8s" begin="0.15s" repeatCount="indefinite"/>
      <animate attributeName="y" values="6.5;8.5;6.5" dur="0.8s" begin="0.15s" repeatCount="indefinite"/>
    </rect>
    <rect x="10.5" y="7" width="1.2" height="6" rx="0.6" fill={color} opacity="0.9">
      <animate attributeName="height" values="6;2;6" dur="0.8s" begin="0.3s" repeatCount="indefinite"/>
      <animate attributeName="y" values="7;9;7" dur="0.8s" begin="0.3s" repeatCount="indefinite"/>
    </rect>
    <rect x="13" y="8.5" width="1.2" height="3" rx="0.6" fill={color} opacity="0.5">
      <animate attributeName="height" values="3;5;3" dur="0.8s" begin="0.45s" repeatCount="indefinite"/>
      <animate attributeName="y" values="8.5;7.5;8.5" dur="0.8s" begin="0.45s" repeatCount="indefinite"/>
    </rect>
  </svg>
);

const ArchPulseIcon = ({ color = C.teal, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <path d="M1,10 L4,10 L6,4 L8,16 L10,6 L12,12 L13,10 L19,10"
      stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.85"
      strokeDasharray="40" strokeDashoffset="40">
      <animate attributeName="stroke-dashoffset" values="40;0" dur="1.5s" fill="freeze" repeatCount="indefinite"/>
    </path>
    <path d="M1,10 L4,10 L6,4 L8,16 L10,6 L12,12 L13,10 L19,10"
      stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.15"
      strokeDasharray="40" strokeDashoffset="40">
      <animate attributeName="stroke-dashoffset" values="40;0" dur="1.5s" fill="freeze" repeatCount="indefinite"/>
    </path>
    <circle r="1.5" fill={color} opacity="0.9">
      <animateMotion path="M1,10 L4,10 L6,4 L8,16 L10,6 L12,12 L13,10 L19,10" dur="1.5s" repeatCount="indefinite"/>
    </circle>
  </svg>
);

const ArchIntelIcon = ({ color = C.purple, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <path d="M2,10 C4,5 8,3 10,3 C12,3 16,5 18,10 C16,15 12,17 10,17 C8,17 4,15 2,10 Z"
      stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.06" strokeLinecap="round" opacity="0.7"/>
    <circle cx="10" cy="10" r="3.5" stroke={color} strokeWidth="1" fill={color} fillOpacity="0.12" opacity="0.8"/>
    <circle cx="10" cy="10" r="1.5" fill={color} opacity="0.9">
      <animate attributeName="r" values="1.5;2;1.5" dur="2s" repeatCount="indefinite"/>
    </circle>
    <line x1="4" y1="10" x2="16" y2="10" stroke={color} strokeWidth="0.5" opacity="0.3">
      <animate attributeName="y1" values="10;7;13;10" dur="3s" repeatCount="indefinite"/>
      <animate attributeName="y2" values="10;7;13;10" dur="3s" repeatCount="indefinite"/>
    </line>
    <circle cx="5" cy="10" r="0.7" fill={color} opacity="0.4">
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <circle cx="15" cy="10" r="0.7" fill={color} opacity="0.4">
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="1.5s" begin="0.5s" repeatCount="indefinite"/>
    </circle>
  </svg>
);

const ArchZeroMissed = ({ color = C.success, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ display: "block", margin: "0 auto" }}>
    <path d="M7,11 C7,9 8,8 10,8 L12,8 C12.5,8 13,8.5 13,9 L13,12 C13,12.5 12.5,13 12,13 L11,13 C10.5,13 10,13.5 10,14 L10,16 C10,16.5 10.5,17 11,17 L13,17 C13.5,17 14,17.5 14,18 L14,21 C14,21.5 13.5,22 13,22 L10,22 C8,22 7,21 7,19 Z"
      fill={color} opacity="0.85"/>
    <path d="M16,12 C18,10 18,8 16,6" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.7">
      <animate attributeName="opacity" values="0.7;0.2;0.7" dur="2s" repeatCount="indefinite"/>
    </path>
    <path d="M19,14 C22,11 22,7 19,4" stroke={color} strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.45">
      <animate attributeName="opacity" values="0.45;0.1;0.45" dur="2s" begin="0.4s" repeatCount="indefinite"/>
    </path>
    <path d="M22,16 C26,12 26,6 22,2" stroke={color} strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.25">
      <animate attributeName="opacity" values="0.25;0.05;0.25" dur="2s" begin="0.8s" repeatCount="indefinite"/>
    </path>
    <circle cx="10" cy="15" r="1.2" fill={color}>
      <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite"/>
    </circle>
  </svg>
);

const ArchRetentionLoop = ({ color = C.teal, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ display: "block", margin: "0 auto" }}>
    <defs>
      <linearGradient id="arl-g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
        <stop offset="50%" stopColor={color} stopOpacity="0.8"/>
        <stop offset="100%" stopColor={color} stopOpacity="0.2"/>
      </linearGradient>
    </defs>
    <path d="M6,14 C6,10 9,7 14,14 C19,21 22,18 22,14 C22,10 19,7 14,14 C9,21 6,18 6,14 Z"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3"/>
    <path d="M6,14 C6,10 9,7 14,14 C19,21 22,18 22,14 C22,10 19,7 14,14 C9,21 6,18 6,14 Z"
      stroke="url(#arl-g)" strokeWidth="2" strokeLinecap="round" fill="none" strokeDasharray="8 40" strokeDashoffset="0">
      <animate attributeName="stroke-dashoffset" values="0;-48" dur="3s" repeatCount="indefinite"/>
    </path>
    <circle r="2" fill={color} opacity="0.9">
      <animateMotion path="M6,14 C6,10 9,7 14,14 C19,21 22,18 22,14 C22,10 19,7 14,14 C9,21 6,18 6,14 Z" dur="3s" repeatCount="indefinite"/>
    </circle>
    <circle r="1.3" fill={color} opacity="0.5">
      <animateMotion path="M6,14 C6,10 9,7 14,14 C19,21 22,18 22,14 C22,10 19,7 14,14 C9,21 6,18 6,14 Z" dur="3s" begin="1.5s" repeatCount="indefinite"/>
    </circle>
  </svg>
);

const ArchLivePulse = ({ color = C.blueGlow, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ display: "block", margin: "0 auto" }}>
    <rect x="5" y="21" width="4" height="7" rx="1" fill={color} opacity="0.3"/>
    <rect x="11" y="16" width="4" height="12" rx="1" fill={color} opacity="0.5"/>
    <rect x="17" y="11" width="4" height="17" rx="1" fill={color} opacity="0.75"/>
    <rect x="23" y="6" width="4" height="22" rx="1" fill={color} opacity="1"/>
    <path d="M28,5 C29.5,3.5 29.5,1 28,1" stroke={color} strokeWidth="0.9" strokeLinecap="round" fill="none" opacity="0.4"/>
    <path d="M28.5,7 C31,4.5 31,0 28.5,0" stroke={color} strokeWidth="0.7" strokeLinecap="round" fill="none" opacity="0.25"/>
    <circle cx="25" cy="5" r="1.5" fill={color}>
      <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite"/>
    </circle>
  </svg>
);

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
      <AnimIn>
      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <div className="section-chip">Works With Your Stack</div>
        <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400, lineHeight: 1.1, marginBottom: 16 }}>
          Our pitch isn't "switch to StrydeOS."
        </h2>
        <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>
          Appointments, note taking, billing — your PMS owns this layer. StrydeOS sits above that. Whatever you're already running, we simply connect and enrich it, not replace it.
        </p>
      </div>
      </AnimIn>

      {/* Editorial architecture */}
      <AnimIn delay={100}>
      <div style={{
        background: C.navy, borderRadius: 20, overflow: "hidden",
        position: "relative", marginBottom: 20,
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", top: -100, right: -60,
          width: 420, height: 420, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.blue}0D 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        <div className="arch-grid" style={{
          display: "grid", gridTemplateColumns: "38% 62%",
          position: "relative", zIndex: 2,
        }}>

          {/* LEFT — Editorial */}
          <div style={{
            padding: "48px 44px 44px",
            borderRight: "1px solid rgba(255,255,255,0.05)",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
                marginBottom: 16,
              }}>
                Architecture
              </div>
              <h3 className="serif" style={{
                fontSize: 30, color: "rgba(255,255,255,0.9)",
                fontWeight: 400, lineHeight: 1.2, marginBottom: 16,
              }}>
                Nothing changes.
                <br />
                <span style={{ fontStyle: "italic", color: C.blueGlow }}>Everything improves.</span>
              </h3>
              <p style={{
                fontSize: 14, color: "rgba(255,255,255,0.35)",
                lineHeight: 1.7, maxWidth: 320,
              }}>
                Your PMS stays. Your HEP platform stays. Your phone number stays. StrydeOS connects to all of it and adds the layer your practice is missing.
              </p>
            </div>

            {/* Stat strip */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 22, marginTop: 32,
            }}>
              {[
                { val: "0", label: "missed calls", color: C.success },
                { val: "Auto", label: "rebooking", color: C.teal },
                { val: "Live", label: "KPIs", color: C.blueGlow },
              ].map(({ val, label, color }) => (
                <div key={label}>
                  <div className="serif" style={{ fontSize: 28, color, lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4, fontWeight: 500 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — Flow diagram */}
          <div style={{
            padding: "40px 44px",
            display: "flex", flexDirection: "column", justifyContent: "center",
          }}>

            {/* TIER 1 — Your tools */}
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.18)",
                marginBottom: 8,
              }}>
                Your existing tools
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { name: "Your PMS", icon: "\uD83D\uDDC2\uFE0F" },
                  { name: "HEP Platform", icon: "\uD83C\uDFCB\uFE0F" },
                  { name: "Phone Service", icon: "\uD83D\uDCDE" },
                ].map(({ name, icon }) => (
                  <div key={name} style={{
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>
                    <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 600 }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CONNECTOR — diagonal dots converging */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <ArchDiagonalDots direction="right" color={C.blueGlow} />
              <ArchPulseDots color={C.teal} count={3} />
              <ArchDiagonalDots direction="left" color={C.blueGlow} />
            </div>

            {/* MONOLITH BALL — centred */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 12, padding: "2px 0",
            }}>
              <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${C.blue}18)` }} />
              <ArchMonolithBall size={44} />
              <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.blue}18, transparent)` }} />
            </div>

            {/* CONNECTOR — single stream down */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ArchPulseDots color={C.blueGlow} count={2} />
            </div>

            {/* TIER 2 — StrydeOS modules */}
            <div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
                background: `${C.blue}06`,
                border: `1px solid ${C.blue}14`,
                borderRadius: 12, padding: 8,
              }}>
                {[
                  { name: "Ava", IconComp: ArchAvaIcon, color: C.blue, desc: "Calls \u2192 bookings" },
                  { name: "Pulse", IconComp: ArchPulseIcon, color: C.teal, desc: "Risk \u2192 re-engage" },
                  { name: "Intelligence", IconComp: ArchIntelIcon, color: C.purple, desc: "Data \u2192 KPIs" },
                ].map(({ name, IconComp, color, desc }) => (
                  <div key={name} style={{
                    background: `${color}0C`,
                    border: `1px solid ${color}1C`,
                    borderRadius: 8, padding: "12px 10px", textAlign: "center",
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7,
                      background: `${color}18`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 6px",
                    }}>
                      <IconComp color={color} size={16} />
                    </div>
                    <div style={{ color, fontWeight: 700, fontSize: 13, textShadow: `0 0 10px ${color}40` }}>{name}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2, textShadow: `0 0 8px ${color}20` }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* CONNECTOR — fan out */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <ArchPulseDots color={C.success} />
              <ArchPulseDots color={C.teal} />
              <ArchPulseDots color={C.blueGlow} />
            </div>

            {/* TIER 3 — Outcomes */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10, padding: "14px 14px", textAlign: "center",
              }}>
                <div style={{ marginBottom: 4 }}><ArchZeroMissed color={C.success} size={28} /></div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 2, textShadow: `0 0 10px ${C.success}30` }}>
                  zero missed calls
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>24/7 availability</div>
              </div>

              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10, padding: "14px 14px", textAlign: "center",
              }}>
                <div style={{ marginBottom: 4 }}><ArchRetentionLoop color={C.teal} size={28} /></div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 2, textShadow: `0 0 10px ${C.teal}30` }}>
                  retention cycles
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>automated re-engagement</div>
              </div>

              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10, padding: "14px 14px", textAlign: "center",
              }}>
                <div style={{ marginBottom: 4 }}><ArchLivePulse color={C.blueGlow} size={28} /></div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 2, textShadow: `0 0 10px ${C.blueGlow}30` }}>
                  live dashboards
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>per clinician, per metric</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </AnimIn>

      {/* Integration logos scroll */}
      <IntegrationCarousel darkMode={darkMode} />

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

/* ─── Pulse Showcase ────────────────────────────────────────────────────────── */
const PULSE_AVATAR_COLORS = ["#8B5CF6", "#1C54F2", "#0891B2", "#059669", "#F59E0B", "#EF4444", "#6366F1", "#EC4899"];
const PulseAvatar = ({ name, index }) => {
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase();
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: PULSE_AVATAR_COLORS[index % PULSE_AVATAR_COLORS.length],
      fontSize: 9, fontWeight: 700, color: "white", letterSpacing: "0.02em",
    }}>{initials}</div>
  );
};

const PulsePatientBoard = () => {
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.success, padding: "2px 8px", borderRadius: 50, backgroundColor: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.15)" }}>Active</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>12 patients</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {patients.map((p, i) => (
          <div key={p.name} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "7px 8px", borderRadius: 8,
            backgroundColor: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
          }}>
            <PulseAvatar name={p.name} index={i} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "white", filter: "blur(2px)", userSelect: "none" }}>{p.name}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{p.sessions} sessions · Last {p.last}</div>
            </div>
            {p.warn && (
              <span style={{ fontSize: 8, color: "#F59E0B", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#F59E0B" strokeWidth="1.2"/><path d="M8 5v3.5" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round"/><circle cx="8" cy="11" r="0.5" fill="#F59E0B"/></svg>
                No rebook {p.warn}
              </span>
            )}
            <span style={{ fontSize: 10, fontWeight: 600, color: C.teal, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>Re-engage →</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PulseSequencesPanel = () => {
  const seqs = [
    { name: "Early Intervention", steps: 2, window: "5d attribution", on: true },
    { name: "Re-booking Prompt", steps: 4, window: "7d attribution", on: true },
    { name: "Post-Session HEP Reminder", steps: 2, window: "7d attribution", on: true },
    { name: "Discharge Review Prompt", steps: 2, window: "14d attribution", on: true },
  ];
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 8, marginBottom: 8,
        backgroundColor: "rgba(8,145,178,0.06)", border: "1px solid rgba(8,145,178,0.1)",
      }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2l6 12H2L8 2z" stroke={C.teal} strokeWidth="1.2" strokeLinejoin="round" fill="none"/></svg>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", lineHeight: 1.3 }}>
          Each sequence triggers automatically based on patient events from your PMS.
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {seqs.map((s) => (
          <div key={s.name} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 10px", borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.1)",
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="2" stroke={C.teal} strokeWidth="1.2"/>
                <path d="M2 6l6 3.5L14 6" stroke={C.teal} strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "white", marginBottom: 1 }}>{s.name}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)" }}>{s.steps} steps · {s.window}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: C.teal, cursor: "pointer" }}>▸ View cadence</span>
                <span style={{ fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.25)", cursor: "pointer" }}>⧉ Preview</span>
              </div>
            </div>
            <div style={{
              width: 34, height: 18, borderRadius: 9,
              backgroundColor: s.on ? C.teal : "rgba(255,255,255,0.08)",
              position: "relative", flexShrink: 0,
              boxShadow: s.on ? `0 0 8px ${C.teal}30` : "none",
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%", backgroundColor: "white",
                position: "absolute", top: 2, left: s.on ? 18 : 2,
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PulseShowcase = () => {
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
  const panels = [<PulsePatientBoard key="pb" />, <PulseSequencesPanel key="cs" />];

  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <div style={{
        backgroundColor: C.navy, borderRadius: 20, padding: "22px 18px 18px",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 8px 50px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.teal}60, #06B6D4, ${C.teal}60)` }} />
        <div style={{ position: "absolute", top: -50, right: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(8,145,178,0.07), transparent 70%)", pointerEvents: "none" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: C.teal }} />
              <span className="serif" style={{ fontSize: 18, color: "white" }}>Pulse</span>
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

        {/* Mini Stats */}
        <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
          {[
            { l: "Total Sent", v: "147", u: "messages", dot: C.success },
            { l: "Open Rate", v: "72%", u: null, dot: C.success },
            { l: "Click Rate", v: "34%", u: null, dot: "#F59E0B" },
            { l: "Rebook Conv.", v: "18%", u: null, dot: "#F59E0B" },
          ].map((s) => (
            <div key={s.l} style={{
              flex: 1, padding: "8px 8px 6px", borderRadius: 10,
              backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              position: "relative",
            }}>
              <div style={{ position: "absolute", top: 7, right: 7, width: 5, height: 5, borderRadius: "50%", backgroundColor: s.dot }} />
              <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.25)", marginBottom: 4 }}>{s.l}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span className="serif" style={{ fontSize: 18, color: "white", lineHeight: 1 }}>{s.v}</span>
                {s.u && <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>{s.u}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          marginBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {tabs.map((t, i) => (
            <button key={t.label} onClick={() => {
              setDirection(i > activePanel ? 1 : -1);
              setActivePanel(i);
              startTimer();
            }} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif",
              fontSize: 11, fontWeight: i === activePanel ? 700 : 500,
              color: i === activePanel ? "white" : "rgba(255,255,255,0.3)",
              padding: "6px 14px 8px",
              borderBottom: i === activePanel ? `2px solid ${C.teal}` : "2px solid transparent",
              marginBottom: -1, transition: "all 0.25s ease",
            }}>
              <span style={{ color: i === activePanel ? C.teal : "rgba(255,255,255,0.2)", transition: "color 0.25s ease" }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 3, paddingRight: 4, paddingBottom: 4 }}>
            {tabs.map((_, i) => (
              <div key={i} style={{
                width: i === activePanel ? 14 : 5, height: 4, borderRadius: 2,
                backgroundColor: i === activePanel ? C.teal : "rgba(255,255,255,0.1)",
                transition: "all 0.35s cubic-bezier(0.16,1,0.3,1)",
              }} />
            ))}
          </div>
        </div>

        {/* Carousel */}
        <div style={{ position: "relative", overflow: "hidden" }}>
          <div key={activePanel} style={{ animation: `${direction > 0 ? "slideR" : "slideL"} 0.35s cubic-bezier(0.16,1,0.3,1) both` }}>
            {panels[activePanel]}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Products ──────────────────────────────────────────────────────────────── */
const Products = ({ darkMode }) => {
  const [active, setActive] = useState(0);
  const [avaPlaying, setAvaPlaying] = useState(false);
  const avaAudioRef = useRef(null);
  const toggleAva = () => {
    const audio = avaAudioRef.current;
    if (!audio) return;
    if (avaPlaying) { audio.pause(); } else { audio.play(); }
    setAvaPlaying(!avaPlaying);
  };
  useEffect(() => {
    const audio = avaAudioRef.current;
    if (!audio) return;
    const onEnd = () => setAvaPlaying(false);
    audio.addEventListener("ended", onEnd);
    return () => audio.removeEventListener("ended", onEnd);
  }, []);
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
      visual: (() => {
        const dk = darkMode;
        const headerBg = dk ? "rgba(255,255,255,0.04)" : "white";
        const headerBorder = dk ? "rgba(255,255,255,0.08)" : C.border;
        const nameColor = dk ? "white" : C.navy;
        const subtitleColor = dk ? "rgba(255,255,255,0.45)" : C.muted;
        const pillBg = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)";
        const pillBorder = dk ? "rgba(255,255,255,0.08)" : C.border;
        const pillColor = dk ? "rgba(255,255,255,0.5)" : C.muted;
        const waveBg = dk ? "rgba(255,255,255,0.04)" : C.cloudLight;
        const waveBorder = dk ? "rgba(255,255,255,0.06)" : C.border;
        const callCountColor = dk ? "white" : C.navy;
        const callLabelColor = dk ? "rgba(255,255,255,0.35)" : C.muted;

        const avaMsgs = [
          { from: "caller", text: "Hi, I'd like to book an appointment for my lower back." },
          { from: "ai", text: "Of course — I can help with that. Are mornings or afternoons better for you?" },
          { from: "caller", text: "Mornings, ideally Thursday or Friday." },
          { from: "ai", text: "I have Thursday at 9:15am with Dr. Reeves. Shall I book that and send you a confirmation text?" },
          { from: "caller", text: "Yes please." },
          { from: "ai", text: "Done — you're booked in. You'll get a text shortly. Is there anything else I can help with?" },
        ];

        return (
          <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
            {/* ── Profile header (ElevenLabs-inspired) ── */}
            <div style={{
              backgroundColor: headerBg,
              borderRadius: "20px 20px 4px 4px",
              border: `1px solid ${headerBorder}`,
              padding: "28px 28px 24px",
              marginBottom: 2,
            }}>
              {/* Avatar + name row */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                    boxShadow: `0 4px 20px rgba(28,84,242,0.15), 0 0 0 1px rgba(28,84,242,0.08)`,
                  }}>
                    <MonolithMark size={64} />
                  </div>
                  {/* Live pulse dot */}
                  <div style={{
                    position: "absolute", bottom: -2, right: -2,
                    width: 16, height: 16, borderRadius: "50%",
                    backgroundColor: C.success,
                    border: dk ? "2.5px solid rgba(11,37,69,0.9)" : "2.5px solid white",
                    boxShadow: "0 1px 4px rgba(5,150,105,0.3)",
                  }}>
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "50%",
                      backgroundColor: C.success,
                      animation: "ava-pulse-ring 2s ease-out infinite",
                    }} />
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <h3 className="serif" style={{
                    fontSize: 28, fontWeight: 400, color: nameColor,
                    lineHeight: 1.1, marginBottom: 4,
                  }}>Ava</h3>
                  <p style={{ fontSize: 13, color: subtitleColor, fontWeight: 500, letterSpacing: "0.01em" }}>
                    AI Receptionist · StrydeOS
                  </p>
                </div>

                {/* Call count */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="serif" style={{ fontSize: 26, color: callCountColor, lineHeight: 1, marginBottom: 2 }}>12</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: callLabelColor, textTransform: "uppercase", letterSpacing: "0.08em" }}>Calls today</div>
                </div>
              </div>

              {/* Metadata pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 50,
                  fontSize: 12, fontWeight: 600, lineHeight: 1,
                  color: C.success, backgroundColor: "rgba(5,150,105,0.08)",
                  border: "1px solid rgba(5,150,105,0.15)",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: C.success, display: "inline-block" }} />
                  Live
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 50,
                  fontSize: 12, fontWeight: 600, lineHeight: 1,
                  color: C.blue, backgroundColor: "rgba(28,84,242,0.06)",
                  border: "1px solid rgba(28,84,242,0.12)",
                }}>ElevenAgents</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 50,
                  fontSize: 12, fontWeight: 600, lineHeight: 1,
                  color: pillColor, backgroundColor: pillBg,
                  border: `1px solid ${pillBorder}`,
                }}>PMS: Connected</span>
              </div>

              {/* Waveform bar */}
              <div
                onClick={toggleAva}
                style={{
                  padding: "14px 16px", borderRadius: 12,
                  backgroundColor: waveBg, border: `1px solid ${waveBorder}`,
                  display: "flex", alignItems: "center", gap: 14,
                  cursor: "pointer", transition: "border-color 0.2s ease",
                }}
              >
                {/* Radial play/pause button */}
                <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
                  {/* Outer spinning ring (visible when playing) */}
                  <div style={{
                    position: "absolute", inset: -3, borderRadius: "50%",
                    border: "2px solid transparent",
                    borderTopColor: C.blueGlow,
                    borderRightColor: "rgba(28,84,242,0.15)",
                    opacity: avaPlaying ? 1 : 0,
                    animation: avaPlaying ? "ava-ring-spin 1.8s linear infinite" : "none",
                    transition: "opacity 0.3s ease",
                  }} />
                  {/* Core button */}
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: `radial-gradient(circle at 35% 30%, ${C.blueGlow}, ${C.blue} 60%, ${C.navy} 120%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    animation: avaPlaying ? "ava-btn-glow 2s ease-in-out infinite" : "none",
                    boxShadow: avaPlaying
                      ? `0 0 20px rgba(28,84,242,0.5), 0 0 50px rgba(28,84,242,0.2)`
                      : `0 2px 12px rgba(28,84,242,0.3)`,
                    transition: "box-shadow 0.4s ease",
                  }}>
                    {avaPlaying ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="3.5" y="2.5" width="3.5" height="11" rx="1" fill="white"/>
                        <rect x="9" y="2.5" width="3.5" height="11" rx="1" fill="white"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4.5 2L13 8L4.5 14V2Z" fill="white"/>
                      </svg>
                    )}
                  </div>
                </div>

                {/* Waveform bars */}
                <div style={{ display: "flex", alignItems: "center", gap: 2, height: 24, flex: 1 }}>
                  {[0.6, 1, 0.7, 0.9, 0.5, 0.8, 1, 0.6, 0.4, 0.8, 0.7, 0.9, 0.5, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.7].map((h, i) => (
                    <div key={i} style={{
                      width: 3, flex: 1, maxWidth: 4, height: `${h * 100}%`, borderRadius: 2,
                      backgroundColor: avaPlaying ? C.blue : (dk ? "rgba(28,84,242,0.35)" : "rgba(28,84,242,0.25)"),
                      animation: avaPlaying ? `waveform 1.2s ease-in-out ${i * 0.08}s infinite alternate` : "none",
                      transition: "background-color 0.3s ease",
                    }} />
                  ))}
                </div>
              </div>
            </div>

            {/* ── Conversation transcript ── */}
            <div style={{
              backgroundColor: C.navy,
              borderRadius: "4px 4px 20px 20px",
              padding: "24px 20px 28px",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 20, paddingBottom: 14,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 3h12M2 6.5h8M2 10h10M2 13.5h6" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}>Transcript</span>
                <span style={{
                  marginLeft: "auto", fontSize: 11,
                  color: "rgba(255,255,255,0.2)", fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                }}>Today, 09:12</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {avaMsgs.map((msg, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: msg.from === "ai" ? "flex-end" : "flex-start",
                  }}>
                    <div style={{
                      maxWidth: "82%", padding: "12px 16px",
                      borderRadius: msg.from === "ai" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      backgroundColor: msg.from === "ai" ? C.blue : "rgba(255,255,255,0.06)",
                      color: msg.from === "ai" ? "white" : "rgba(255,255,255,0.75)",
                      fontSize: 14, fontWeight: 400, lineHeight: 1.55,
                      border: msg.from === "ai" ? "none" : "1px solid rgba(255,255,255,0.08)",
                    }}>{msg.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })(),
    },
    {
      id: "pulse",
      label: "Pulse",
      icon: "🔄",
      color: C.teal,
      eyebrow: "Pulse",
      headline: "Keep patients in care, longer.",
      body: "The drop-off between session two and session three is where most clinics leak the most revenue. Patients disengage — not because the treatment isn't working, but because nobody stayed in touch.\n\nPulse automates every touchpoint between sessions — and adapts based on clinical context. When a patient has psychosocial flags or complex multi-region presentations, Pulse adjusts its tone and timing automatically. No manual triage. No one-size-fits-all sequences.",
      proof: "The clinics getting this right aren't doing it by hand. They've systematised it — and it shows in their completion rates and referral volume.",
      tagline: "Clinically aware. Automatically adaptive. Built for retention.",
      cta: "Start with Pulse",
      howItWorks: ["Monitors treatment journey milestones", "Reads clinical complexity signals from session notes", "Adapts follow-up timing and tone to each patient", "Suppresses prompts when patients are nearing discharge"],
      keyBenefits: ["Better treatment completion", "Higher follow-up conversion", "Fewer wasted messages on discharge-ready patients"],
      bullets: ["Automated post-session reminders", "Complexity-aware rebooking prompts", "Psychosocial flag detection — gentler outreach for anxious patients", "Discharge-aware sequences that know when to stop", "Post-discharge check-ins", "Clinical enrichment from Heidi session notes"],
      visual: <PulseShowcase />,
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
      visual: (() => {
        const kpiTh = {
          bg: C.navy, text: "#FFFFFF", textSecondary: "rgba(255,255,255,0.55)",
          textTertiary: "rgba(255,255,255,0.3)", borderAccent: "rgba(255,255,255,0.12)",
          rowBg: "rgba(255,255,255,0.03)", rowBorder: "rgba(255,255,255,0.06)",
        };
        const kpiColor = (c) => ({ green: "#059669", blue: "#4B8BF5", red: "#EF4444" }[c] || kpiTh.textSecondary);
        const Spark = ({ data, color, w = 48, h = 16 }) => {
          const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
          const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rng) * (h - 3) - 1.5}`).join(" ");
          const last = pts.split(" ").pop().split(",");
          return (<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", flexShrink: 0 }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
          </svg>);
        };
        const Av = ({ name }) => (<div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", fontSize: 10, fontWeight: 700, color: kpiTh.textSecondary, letterSpacing: "0.03em" }}>{name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>);
        const rows = [
          { name: "Dr. A. Reeves", followUp: "3.2x", fuC: "green", fuS: [2.8,2.9,3.0,3.1,3.0,3.2], util: "89%", utC: "blue", utS: [85,86,87,88,88,89], dna: "6%", dC: "red", dS: [8,7.5,7,6.8,6.2,6], pts: 14, alert: true },
          { name: "S. Okoye", followUp: "3.5x", fuC: "green", fuS: [3.1,3.2,3.3,3.4,3.4,3.5], util: "93%", utC: "blue", utS: [89,90,91,92,92,93], dna: "3%", dC: "green", dS: [5,4.5,4,3.5,3.2,3], pts: 18, alert: false },
          { name: "J. Perkins", followUp: "3.5x", fuC: "green", fuS: [3.0,3.1,3.2,3.3,3.4,3.5], util: "93%", utC: "blue", utS: [90,91,91,92,93,93], dna: "3%", dC: "green", dS: [4,3.8,3.5,3.3,3.1,3], pts: 16, alert: false },
        ];
        return (
          <div style={{ position: "relative", backgroundColor: kpiTh.bg, borderRadius: 20, padding: "22px 18px 18px", border: `1px solid ${kpiTh.borderAccent}`, boxShadow: "0 8px 60px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -60, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.07), transparent 70%)", pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: kpiTh.textTertiary, marginBottom: 5 }}>Clinician Performance</div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, fontWeight: 400, color: kpiTh.text, lineHeight: 1 }}>90-day rolling trends</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 50, backgroundColor: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#8B5CF6" }}>Week 12</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px 72px 40px", gap: 6, padding: "0 10px 8px" }}>
              {["Clinician", "Follow-up", "Utilisation", "DNA Rate", "Pts"].map(h => (
                <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: kpiTh.textTertiary, textAlign: h === "Clinician" ? "left" : "center" }}>{h}</span>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {rows.map(c => (
                <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr 72px 72px 72px 40px", gap: 6, alignItems: "center", padding: "10px 10px", borderRadius: 12, backgroundColor: kpiTh.rowBg, border: `1px solid ${kpiTh.rowBorder}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {c.alert && <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#F59E0B", flexShrink: 0 }} />}
                    <Av name={c.name} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: kpiTh.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: kpiColor(c.fuC), fontVariantNumeric: "tabular-nums" }}>{c.followUp}</span>
                    <Spark data={c.fuS} color={kpiColor(c.fuC)} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: kpiColor(c.utC), fontVariantNumeric: "tabular-nums" }}>{c.util}</span>
                    <Spark data={c.utS} color={kpiColor(c.utC)} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: kpiColor(c.dC), fontVariantNumeric: "tabular-nums" }}>{c.dna}</span>
                    <Spark data={c.dS} color={kpiColor(c.dC)} />
                  </div>
                  <div style={{ textAlign: "center" }}><span style={{ fontSize: 14, fontWeight: 700, color: kpiTh.text, fontVariantNumeric: "tabular-nums" }}>{c.pts}</span></div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 14, opacity: 0.3 }}>
              <MonolithMark size={12} />
              <span style={{ fontSize: 10, fontWeight: 600, color: kpiTh.textTertiary, letterSpacing: "0.03em" }}>Stryde<span style={{ color: "#4B8BF5" }}>OS</span></span>
            </div>
          </div>
        );
      })(),
    },
  ];

  const p = products[active];

  return (
    <section id="products" style={{ padding: "60px 24px 100px", background: bg, transition: "background 0.3s ease" }}>
      <audio ref={avaAudioRef} src="/ava-demo.mp3" preload="metadata" />
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <AnimIn>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div className="section-chip">Products</div>
          <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400, lineHeight: 1.1 }}>
            Three products. One platform.
          </h2>
          <p style={{ color: muted, fontSize: 16, marginTop: 14, maxWidth: 480, margin: "14px auto 0", lineHeight: 1.7 }}>
            Know the metrics that move the needle. Use one or all three.
          </p>
        </div>
        </AnimIn>

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
              fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
              border: `1px solid ${p.color}25`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
              {p.eyebrow}
            </div>

            <h3 className="serif" style={{ fontSize: 36, color: head, fontWeight: 400, lineHeight: 1.15, marginBottom: 20 }}>
              {p.headline}
            </h3>

            {p.body.split("\n\n").map((para, i) => (
              <p key={i} style={{ color: muted, lineHeight: 1.7, marginBottom: 14, fontSize: 16 }}>{para}</p>
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
    tag: "Case Study · Riverside Physiotherapy",
    headline: <>Rebooking streamlined and revenue improved{" "}<span style={{ fontStyle: "italic", color: C.blueGlow }}>within a month.</span></>,
    quote: "We didn't realise how many patients were slipping through until Intelligence showed us the numbers. Two months in and our rebooking rate is noticeably better.",
    author: "Sarah Mitchell, Practice Owner, Riverside Physiotherapy",
    grid: [
      { before: "Follow-up rate: untracked", after: "2.4 → 3.8 sessions/patient" },
      { before: "No-show response: nothing", after: "Same-day recovery SMS" },
      { before: "HEP compliance: no idea", after: "Tracked per clinician" },
      { before: "Owner dashboard: none", after: "Weekly KPI digest" },
    ],
  },
  {
    tag: "Case Study · TBSport Therapy",
    headline: <>Solo clinician.{" "}<span style={{ fontStyle: "italic", color: C.blueGlow }}>Every call answered.</span></>,
    quote: "I was losing enquiries every time I was in session. Ava means I never miss a new patient call now — and the patients actually prefer it.",
    author: "Tammy, Solo Clinician, TBSport Therapy",
    grid: [
      { before: "Missed calls in session: ~40%", after: "Zero missed — Ava handles all" },
      { before: "Patient satisfaction: unknown", after: "NPS 72 (first 8 weeks)" },
      { before: "Admin time per day: 90 min", after: "Under 20 min" },
      { before: "New patient conversion: ~50%", after: "Estimated 65%+ from first touchpoint" },
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
      <AnimIn>
      <div style={{ textAlign: "center", marginBottom: 60 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 50, background: `${C.blue}25`, border: `1px solid ${C.blue}40`, color: C.blueGlow, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
          Results
        </div>
        <h2 className="serif" style={{ fontSize: 44, color: "white", fontWeight: 400, lineHeight: 1.1 }}>
          Measured improvements that are more than theory.
        </h2>
      </div>
      </AnimIn>

      <AnimIn delay={150}>
      <div className="results-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 48 }}>
        {[
          { stat: "34%→8%", label: "Missed call rate", note: "Pilot clinic data" },
          { stat: "74%", label: "Course completion rate", note: "vs ~55% typical" },
          { stat: "£480/mo", label: "Saved on call-handling", note: "vs outsourced reception" },
          { stat: "28 days", label: "Average payback period", note: "Intelligence module" },
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
      </AnimIn>

      {/* Case Study Carousel */}
      <AnimIn delay={300}>
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
      </AnimIn>
    </div>
  </section>
  );
};

/* ─── ROI Calculator ─────────────────────────────────────────────────────────── */
const ROICalc = ({ darkMode }) => {
  const [sessions, setSessions] = useState(40);
  const [dna, setDna] = useState(10);
  const [fee, setFee] = useState(60);
  const [missedCalls, setMissedCalls] = useState(15);
  const [dropout, setDropout] = useState(18);

  const dnaLoss = Math.round(sessions * (dna / 100) * fee * 52);
  const callLoss = Math.round(sessions * (missedCalls / 100) * fee * 0.4 * 52);
  const dropLoss = Math.round(sessions * (dropout / 100) * fee * 1.2 * 52);
  const total = dnaLoss + callLoss + dropLoss;

  const bgAlt  = darkMode ? C.navy    : C.cream;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head   = darkMode ? "white"   : C.navy;

  return (
    <section style={{ padding: "100px 24px", background: bgAlt, transition: "background 0.3s ease" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <AnimIn>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div className="section-chip">ROI Calculator</div>
          <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400, lineHeight: 1.1 }}>
            What's inefficiency actually costing you?
          </h2>
          <p style={{ color: muted, marginTop: 14, fontSize: 16, lineHeight: 1.7 }}>
            Dial in your clinic's numbers. The losses are probably larger than you think.
          </p>
        </div>
        </AnimIn>

        <AnimIn delay={150}>
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
        </AnimIn>
      </div>
    </section>
  );
};

/* ─── Pricing ────────────────────────────────────────────────────────────────── */
const PRICING_DATA_MONTHLY = {
  solo:   { Intelligence: 79,  Ava: 149, Pulse: 99,  full: 279, fullSetup: "£250" },
  studio: { Intelligence: 129, Ava: 199, Pulse: 149, full: 399, fullSetup: "£250" },
  clinic: { Intelligence: 199, Ava: 299, Pulse: 229, full: 599, fullSetup: "£250" },
};
const getPricing = (tier, billing) => {
  const m = PRICING_DATA_MONTHLY[tier];
  const discount = billing === "annual" ? 0.8 : 1;
  return {
    Intelligence: `£${Math.round(m.Intelligence * discount)}`,
    Ava: `£${Math.round(m.Ava * discount)}`,
    Pulse: `£${Math.round(m.Pulse * discount)}`,
    full: `£${Math.round(m.full * discount)}`,
    fullSetup: m.fullSetup,
  };
};
const TIER_OPTIONS = [
  { id: "solo", label: "Solo", sub: "1 clinician" },
  { id: "studio", label: "Studio", sub: "2\u20134 clinicians" },
  { id: "clinic", label: "Clinic", sub: "6+ clinicians" },
];
const PRICING_MODULES = [
  {
    name: "Intelligence", color: C.purple, bright: "#A78BFA",
    tagline: "Know your numbers, finally",
    setup: "No setup fee",
    features: ["Per-clinician KPI board", "6-week trend charts", "Metric drift alerts", "WriteUpp & Cliniko integration", "Weekly email digest"],
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 5-10"/></svg>,
  },
  {
    name: "Ava", color: C.blue, bright: C.blueBright, popular: true,
    tagline: "Never miss another call",
    setup: "\u00A3250 one-time setup",
    features: ["24/7 inbound call handling", "Live calendar booking", "No-show recovery", "SMS confirmations", "Emergency routing"],
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
  },
  {
    name: "Pulse", color: C.teal, bright: "#06B6D4",
    tagline: "Clinically adaptive patient retention",
    setup: "No setup fee",
    features: ["Complexity-aware follow-up sequences", "Psychosocial flag detection", "Discharge-aware suppression", "Post-discharge check-ins", "Referral prompt flows"],
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>,
  },
];

const GLOSS = {
  Intelligence: `radial-gradient(ellipse 120% 80% at 30% 20%, #A78BFAE6, ${C.purple}F2 45%, #6D28D9 100%)`,
  Ava:          `radial-gradient(ellipse 120% 80% at 30% 20%, ${C.blueBright}E6, ${C.blue}F2 45%, #1740C4 100%)`,
  Pulse:        `radial-gradient(ellipse 120% 80% at 30% 20%, #06B6D4E6, ${C.teal}F2 45%, #0E7490 100%)`,
};
const EDGE_GLOW = {
  Intelligence: `0 0 0 1px #A78BFA60, 0 0 30px ${C.purple}40, 0 8px 40px ${C.purple}25`,
  Ava:          `0 0 0 1px ${C.blueBright}60, 0 0 30px ${C.blue}40, 0 8px 40px ${C.blue}25`,
  Pulse:        `0 0 0 1px #06B6D460, 0 0 30px ${C.teal}40, 0 8px 40px ${C.teal}25`,
};

const PricingCheck = ({ color }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
    <circle cx="8" cy="8" r="7" fill={color} fillOpacity="0.15"/>
    <path d="M5.5 8l2 2 3.5-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const PricingTierToggle = ({ tier, setTier, darkMode }) => (
  <div style={{
    display: "inline-flex", alignItems: "stretch",
    padding: 4, borderRadius: 16,
    backgroundColor: C.navy,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.03)",
  }}>
    {TIER_OPTIONS.map((t) => {
      const active = tier === t.id;
      return (
        <button key={t.id} onClick={() => setTier(t.id)} style={{
          position: "relative", zIndex: active ? 2 : 1,
          padding: "10px 28px 8px", borderRadius: 12, border: "none", cursor: "pointer",
          fontFamily: "'Outfit', sans-serif",
          background: active ? `linear-gradient(135deg, ${C.blueBright}, ${C.blue})` : "transparent",
          boxShadow: active ? `0 2px 12px ${C.blue}50, 0 0 0 1px ${C.blueBright}40, inset 0 1px 0 rgba(255,255,255,0.2)` : "none",
          transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          <div style={{
            fontSize: 14, fontWeight: active ? 700 : 500,
            color: active ? "white" : "rgba(255,255,255,0.35)",
            transition: "color 0.3s ease", lineHeight: 1.2,
          }}>{t.label}</div>
          <div style={{
            fontSize: 10, fontWeight: 500,
            color: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
            transition: "color 0.3s ease", marginTop: 1,
          }}>{t.sub}</div>
        </button>
      );
    })}
  </div>
);

const PricingCard = ({ mod, price, billing, tier, darkMode }) => {
  const [hovered, setHovered] = useState(false);
  const h = hovered;
  const c = mod.color;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative", borderRadius: 24, padding: "34px 28px 28px",
        cursor: "pointer", overflow: "hidden",
        background: h ? GLOSS[mod.name] : (darkMode ? "rgba(255,255,255,0.04)" : "white"),
        border: h ? `1px solid ${mod.bright}50` : `1px solid ${darkMode ? "rgba(255,255,255,0.07)" : C.border}`,
        boxShadow: h ? EDGE_GLOW[mod.name] : (darkMode ? "none" : "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)"),
        transform: h ? "translateY(-6px) scale(1.015)" : "translateY(0) scale(1)",
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform, box-shadow",
      }}
    >
      {/* Glass highlight */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 120,
        background: h ? "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)" : "none",
        borderRadius: "24px 24px 0 0", pointerEvents: "none", transition: "all 0.4s ease",
      }} />
      <div style={{
        position: "absolute", top: -60, left: -30, width: 200, height: 200, borderRadius: "50%",
        background: h ? "radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%)" : "none",
        pointerEvents: "none", transition: "all 0.5s ease",
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
        background: h ? `linear-gradient(90deg, transparent, ${mod.bright}40, transparent)` : "transparent",
        transition: "all 0.4s ease",
      }} />

      {mod.popular && (
        <div style={{
          position: "absolute", top: 18, right: 18,
          padding: "4px 10px", borderRadius: 50,
          background: h ? "rgba(255,255,255,0.15)" : `linear-gradient(135deg, ${c}12, ${c}06)`,
          border: `1px solid ${h ? "rgba(255,255,255,0.25)" : `${c}20`}`,
          backdropFilter: h ? "blur(8px)" : "none",
          fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
          color: h ? "white" : c, transition: "all 0.4s ease",
        }}>Most popular</div>
      )}

      <div style={{
        width: 46, height: 46, borderRadius: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: h ? "rgba(255,255,255,0.15)" : `linear-gradient(135deg, ${c}0A, ${c}05)`,
        border: `1px solid ${h ? "rgba(255,255,255,0.2)" : `${c}15`}`,
        boxShadow: h ? "inset 0 1px 0 rgba(255,255,255,0.15)" : "none",
        color: h ? "white" : c, marginBottom: 20, transition: "all 0.4s ease", position: "relative",
      }}>{mod.icon}</div>

      <div style={{
        fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em",
        color: h ? "rgba(255,255,255,0.65)" : c, marginBottom: 5, transition: "color 0.4s ease", position: "relative",
      }}>{mod.name}</div>

      <div style={{
        fontSize: 15, fontWeight: 500, lineHeight: 1.4,
        color: h ? "rgba(255,255,255,0.9)" : (darkMode ? "rgba(255,255,255,0.85)" : C.ink),
        marginBottom: 26, transition: "color 0.4s ease", position: "relative",
      }}>{mod.tagline}</div>

      <div style={{ marginBottom: 4, position: "relative" }}>
        <span className="serif" style={{
          fontSize: 42, lineHeight: 1,
          color: h ? "white" : (darkMode ? "white" : C.navy),
          transition: "color 0.35s ease",
        }}>{price}</span>
        <span style={{
          fontSize: 16, fontWeight: 400,
          color: h ? "rgba(255,255,255,0.45)" : C.muted,
          transition: "color 0.35s ease",
        }}>/mo</span>
      </div>
      <div style={{
        fontSize: 12, color: h ? "rgba(255,255,255,0.4)" : C.muted,
        marginBottom: 26, transition: "color 0.35s ease", position: "relative",
      }}>{mod.setup}</div>

      <div style={{
        height: 1, marginBottom: 22,
        background: h ? "linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.15), rgba(255,255,255,0.06))" : (darkMode ? "rgba(255,255,255,0.07)" : C.border),
        transition: "all 0.4s ease", position: "relative",
      }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 30, position: "relative" }}>
        {mod.features.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <PricingCheck color={h ? "rgba(255,255,255,0.85)" : c} />
            <span style={{
              fontSize: 13, lineHeight: 1.45,
              color: h ? "rgba(255,255,255,0.88)" : (darkMode ? "rgba(255,255,255,0.75)" : C.ink),
              transition: "color 0.35s ease",
            }}>{f}</span>
          </div>
        ))}
      </div>

      <a
        href={`https://portal.strydeos.com/checkout?plan=${mod.name.toLowerCase()}-${tier}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
        display: "block", width: "100%", padding: "14px 0", borderRadius: 14,
        fontSize: 14, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
        cursor: "pointer", position: "relative", letterSpacing: "0.02em",
        textAlign: "center", textDecoration: "none",
        background: h ? "rgba(255,255,255,0.95)" : "transparent",
        color: h ? c : C.blue,
        border: h ? "none" : `1.5px solid ${C.blue}30`,
        boxShadow: h ? "0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)" : "none",
        transition: "all 0.35s ease",
      }}>Get started</a>
    </div>
  );
};

const FullStackBanner = ({ tier, billing, darkMode }) => {
  const [h, setH] = useState(false);
  const p = getPricing(tier, billing);
  return (
    <a
      href={`https://portal.strydeos.com/checkout?plan=fullstack-${tier}`}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: "relative", borderRadius: 22, overflow: "hidden",
        padding: "30px 36px", textDecoration: "none",
        background: h ? `radial-gradient(ellipse 100% 100% at 20% 40%, #1A3A6E, ${C.navy} 70%)` : C.navy,
        border: `1px solid ${h ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 24,
        boxShadow: h
          ? `0 0 0 1px ${C.blueBright}25, 0 0 40px ${C.blue}18, 0 8px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`
          : "0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
        transform: h ? "translateY(-2px)" : "translateY(0)",
        cursor: "pointer", transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, display: "flex" }}>
        <div style={{ flex: 1, background: `linear-gradient(90deg, ${C.purple}, #A78BFA)`, opacity: h ? 0.9 : 0.4, transition: "opacity 0.4s ease" }} />
        <div style={{ flex: 1, background: `linear-gradient(90deg, ${C.blue}, ${C.blueBright})`, opacity: h ? 0.9 : 0.4, transition: "opacity 0.4s ease" }} />
        <div style={{ flex: 1, background: `linear-gradient(90deg, ${C.teal}, #06B6D4)`, opacity: h ? 0.9 : 0.4, transition: "opacity 0.4s ease" }} />
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
          fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.55)", transition: "all 0.3s ease",
        }}>\u2605 Best value</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 4 }}>
          Stryde<span style={{ color: C.blueGlow }}>OS</span> Full Stack
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>All three modules. One system.</div>
      </div>
      <div style={{ textAlign: "right", position: "relative" }}>
        <span className="serif" style={{ fontSize: 38, color: "white", lineHeight: 1 }}>{p.full}</span>
        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.35)" }}>/mo{billing === "annual" ? " (billed annually)" : ""}</span>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>{p.fullSetup} one-time setup</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#34D399", marginTop: 4 }}>Save vs individual</div>
      </div>
    </a>
  );
};

const Pricing = ({ darkMode }) => {
  const [tier, setTier] = useState("studio");
  const [billing, setBilling] = useState("monthly");
  const bg    = darkMode ? C.navyMid : C.cloudDancer;
  const muted = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const head  = darkMode ? "white" : C.navy;
  const prices = getPricing(tier, billing);

  return (
  <section id="pricing" style={{ padding: "100px 24px", background: bg, transition: "background 0.3s ease" }}>
    <div style={{ maxWidth: 1060, margin: "0 auto" }}>

      <AnimIn>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div className="section-chip">Pricing</div>
        <h2 className="serif" style={{ fontSize: 42, color: head, fontWeight: 400, lineHeight: 1.12, marginBottom: 14 }}>
          Modular by design.<br/>Your clinic, your stack.
        </h2>
        <p style={{ fontSize: 15, color: muted, maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}>
          Three modules. Mix and match. No forced tiers, no wasted features.
          The full stack costs less than a part-time receptionist.
        </p>
      </div>
      </AnimIn>

      {/* Tier toggle */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <PricingTierToggle tier={tier} setTier={setTier} darkMode={darkMode} />
      </div>

      {/* Billing toggle */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 12, marginBottom: 40,
      }}>
        <span style={{ fontSize: 13, fontWeight: billing === "monthly" ? 700 : 500, color: billing === "monthly" ? head : muted, transition: "all 0.3s ease" }}>Monthly</span>
        <div onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")} style={{
          width: 44, height: 24, borderRadius: 12, cursor: "pointer",
          backgroundColor: billing === "annual" ? C.blue : (darkMode ? "rgba(255,255,255,0.12)" : C.border),
          position: "relative", transition: "background-color 0.3s ease",
          boxShadow: billing === "annual" ? `0 0 12px ${C.blue}40` : "none",
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%", backgroundColor: "white",
            position: "absolute", top: 3,
            left: billing === "annual" ? 23 : 3,
            transition: "left 0.3s cubic-bezier(0.16,1,0.3,1)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: billing === "annual" ? 700 : 500, color: billing === "annual" ? head : muted, transition: "all 0.3s ease" }}>Annual</span>
        {billing === "annual" && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: C.success,
            padding: "3px 10px", borderRadius: 50,
            backgroundColor: "rgba(5,150,105,0.08)",
            border: "1px solid rgba(5,150,105,0.15)",
          }}>Save 20%</span>
        )}
      </div>

      {/* Cards */}
      <AnimIn delay={150}>
      <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 28 }}>
        {PRICING_MODULES.map((mod) => (
          <PricingCard key={mod.name} mod={mod} price={prices[mod.name]} billing={billing} tier={tier} darkMode={darkMode} />
        ))}
      </div>
      </AnimIn>

      {/* Full Stack */}
      <AnimIn delay={300}>
        <FullStackBanner tier={tier} billing={billing} darkMode={darkMode} />
      </AnimIn>

      <p style={{ textAlign: "center", fontSize: 13, color: muted, fontStyle: "italic", marginTop: 32 }}>
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
      title: "Patient outcomes are the only thing that actually counts.",
      color: "#8B5CF6",
      body: `Every product we've built traces back to the same question: does this help patients complete their course of treatment?

Ava answers the phone so the patient gets booked. Pulse sends the reminder so they come back. Intelligence flags the clinician whose follow-up rate is slipping — before it becomes a pattern. The patient never sees StrydeOS. But they feel it.

We're not a marketing tool. We're not a retention gimmick. We're infrastructure for better clinical outcomes.`,
    },
    {
      n: "03",
      title: "We don't hide behind the dashboard.",
      color: C.teal,
      body: `You won't find us selling you a flashy interface full of metrics that don't move your business. Every number in Intelligence is there because it changes a decision — follow-up rate, HEP compliance, DNA rate, revenue per session. Nothing else.

If a feature doesn't make your practice run better, we won't build it. If a metric doesn't help you act, it doesn't make the cut. We'd rather show you four numbers that matter than forty that don't.`,
    },
    {
      n: "04",
      title: "We're in this with you, not just in your invoice.",
      color: C.blue,
      body: `A clinic only gets value from software that fits the way it already works — so we focus on the practical detail, the setup, and the signals worth acting on.`,
    },
  ];

  return (
    <section id="about" style={{ padding: "110px 24px", background: bgAlt, transition: "background 0.3s ease" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>

        {/* Header */}
        <AnimIn>
        <div className="whyus-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end", marginBottom: 80 }}>
          <div>
            <div className="section-chip">About</div>
            <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400, lineHeight: 1.1, marginTop: 16 }}>
              Your practice has software.
              <br />
              <span style={{ fontStyle: "italic", color: italic }}>It doesn't have a system.</span>
            </h2>
          </div>
          <div>
            <p style={{ fontSize: 16, color: muted, lineHeight: 1.7 }}>
              Your PMS handles bookings, the exercise platform sends HEPs and the processor takes money. None of them identify why cancellations go unrecovered or your latest KPIs. That's because none are built precisely for clinical optimisation.
            </p>
          </div>
        </div>
        </AnimIn>

        {/* Four pillar grid */}
        <AnimIn delay={200}>
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
                  fontSize: 14, color: muted, lineHeight: 1.7,
                  marginBottom: pi < body.split("\n\n").length - 1 ? 16 : 0,
                }}>
                  {para}
                </p>
              ))}
            </div>
          ))}
        </div>
        </AnimIn>

        {/* Bottom proof bar */}
        <AnimIn delay={350}>
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
        </AnimIn>

      </div>
    </section>
  );
};

/* ─── Integration Carousel ──────────────────────────────────────────────────── */
const IntegrationCarousel = ({ darkMode }) => {
  const bg = darkMode ? C.navy : C.cloudDancer;
  const bdr = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const muted = darkMode ? "rgba(255,255,255,0.3)" : C.muted;

  const logos = [
    { name: "Cliniko", svg: (
      <svg width="90" height="24" viewBox="0 0 90 24" fill="none"><text x="0" y="18" fontFamily="Outfit, sans-serif" fontSize="16" fontWeight="600" fill="currentColor">Cliniko</text></svg>
    )},
    { name: "WriteUpp", svg: (
      <svg width="90" height="24" viewBox="0 0 90 24" fill="none"><text x="0" y="18" fontFamily="Outfit, sans-serif" fontSize="16" fontWeight="600" fill="currentColor">WriteUpp</text></svg>
    )},
    { name: "Physitrack", svg: (
      <svg width="100" height="24" viewBox="0 0 100 24" fill="none"><text x="0" y="18" fontFamily="Outfit, sans-serif" fontSize="16" fontWeight="600" fill="currentColor">Physitrack</text></svg>
    )},
    { name: "Heidi Health", svg: (
      <svg width="110" height="24" viewBox="0 0 110 24" fill="none"><text x="0" y="18" fontFamily="Outfit, sans-serif" fontSize="16" fontWeight="600" fill="currentColor">Heidi Health</text></svg>
    )},
    { name: "Stripe", svg: (
      <svg width="60" height="24" viewBox="0 0 60 24" fill="none"><text x="0" y="18" fontFamily="Outfit, sans-serif" fontSize="16" fontWeight="700" fill="currentColor">Stripe</text></svg>
    )},
    { name: "Rehab My Patient", svg: (
      <svg width="140" height="24" viewBox="0 0 140 24" fill="none"><text x="0" y="18" fontFamily="Outfit, sans-serif" fontSize="14" fontWeight="600" fill="currentColor">Rehab My Patient</text></svg>
    )},
  ];

  return (
    <div style={{ padding: "16px 0 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 500, fontStyle: "italic", color: muted, letterSpacing: "0.03em" }}>
          Currently integrated with:
        </span>
      </div>
      <div style={{
        maxWidth: 640, margin: "0 auto", overflow: "hidden",
        position: "relative",
        maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
      }}>
        <div style={{ display: "flex", animation: "scroll 18s linear infinite", width: "max-content" }}>
          {[...logos, ...logos].map(({ name, svg }, i) => (
            <div key={`${name}-${i}`} style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: "6px 16px", margin: "0 6px",
              borderRadius: 8,
              color: darkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)",
              filter: "grayscale(100%)",
              opacity: 0.7,
              transition: "all 0.35s cubic-bezier(0.16,1,0.3,1)",
              cursor: "default", whiteSpace: "nowrap",
            }}
              onMouseEnter={e => {
                e.currentTarget.style.filter = "grayscale(0%)";
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.color = darkMode ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)";
                e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)";
                e.currentTarget.style.boxShadow = darkMode
                  ? "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)"
                  : "0 4px 16px rgba(11,37,69,0.08), inset 0 1px 0 rgba(255,255,255,0.8)";
                e.currentTarget.style.backdropFilter = "blur(8px)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.filter = "grayscale(100%)";
                e.currentTarget.style.opacity = "0.7";
                e.currentTarget.style.color = darkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.backdropFilter = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {svg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── FAQ ───────────────────────────────────────────────────────────────────── */
const FAQ = ({ darkMode }) => {
  const [openIdx, setOpenIdx] = useState(null);
  const bg     = darkMode ? C.navy : C.cloudDancer;
  const muted  = darkMode ? "rgba(255,255,255,0.4)" : C.muted;
  const head   = darkMode ? "white" : C.navy;
  const txt    = darkMode ? "rgba(255,255,255,0.6)" : C.ink;
  const divider = darkMode ? "rgba(255,255,255,0.06)" : C.border;

  const groups = [
    { label: "For Clinic Owners", items: [
      { q: "What data does StrydeOS actually need from my PMS?", a: "Read-only access to appointment, patient, and session data. We never modify your PMS records. Currently live with Cliniko and WriteUpp — more integrations on the roadmap." },
      { q: "Will this replace my practice management system?", a: "No. StrydeOS sits above your PMS, not instead of it. Think of it as the performance layer — your PMS handles bookings and notes, we handle insight and automation." },
      { q: "What's the onboarding process like?", a: "Most clinics are live within 5 working days. We handle the integration, configure your KPI targets, and walk you through the dashboard before you go live." },
      { q: "Is there a contract or lock-in?", a: "No. Monthly billing, cancel anytime. We'd rather earn your business each month than lock you in." },
      { q: "How is my data protected?", a: "All data is encrypted in transit and at rest. UK-hosted infrastructure. GDPR compliant. We hold a DPA (Data Processing Agreement) with every client." },
    ]},
    { label: "For Clinicians", items: [
      { q: "Can I see my own performance data?", a: "Yes. Each clinician gets their own dashboard view showing follow-up rate, course completion, utilisation, and HEP compliance — framed as coaching data, not surveillance." },
      { q: "Does Ava sound robotic to patients?", a: "No. Ava uses natural language processing to hold natural-sounding conversations. Patients frequently don't realise they're speaking with an AI receptionist." },
      { q: "What if a patient needs to speak to a real person?", a: "Ava detects urgent or complex requests and routes them to your nominated on-call clinician or reception team immediately." },
    ]},
    { label: "Technical & B2B", items: [
      { q: "Which PMS platforms do you integrate with?", a: "Cliniko and WriteUpp are live today. TM3, Jane App, and other major platforms are on the integration roadmap. If your PMS has an API, we can likely connect." },
      { q: "Can I trial one module before committing to the full stack?", a: "Absolutely. Most clinics start with Intelligence or Ava and add modules as they see results. No pressure to take everything at once." },
      { q: "Do you offer multi-site pricing?", a: "Yes. Contact us at hello@strydeos.com for Clinic tier pricing (5+ clinicians or multiple locations)." },
      { q: "What compliance standards does StrydeOS meet?", a: "GDPR (UK + EU), HIPAA-aligned data handling, SOC 2 Type II on roadmap. Data hosted on UK/EU infrastructure with encryption at rest and in transit." },
    ]},
  ];

  let globalIndex = 0;

  return (
    <section id="faq" style={{ padding: "100px 24px", background: bg, transition: "background 0.3s ease" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <AnimIn>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div className="section-chip">FAQ</div>
          <h2 className="serif" style={{ fontSize: 44, color: head, fontWeight: 400, lineHeight: 1.1 }}>
            Frequently asked questions
          </h2>
          <p style={{ fontSize: 16, color: muted, marginTop: 14, lineHeight: 1.7 }}>
            Everything you need to know before getting started.
          </p>
        </div>
        </AnimIn>

        {groups.map((group) => (
          <div key={group.label} style={{ marginBottom: 44 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
              color: C.blue, marginBottom: 8, paddingLeft: 2,
            }}>
              {group.label}
            </div>
            <div style={{ borderTop: `1px solid ${divider}` }}>
              {group.items.map((item) => {
                const idx = globalIndex++;
                const isOpen = openIdx === idx;
                return (
                  <div key={idx} style={{ borderBottom: `1px solid ${divider}` }}>
                    <button onClick={() => setOpenIdx(isOpen ? null : idx)} style={{
                      width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "20px 4px", background: "none", border: "none", cursor: "pointer",
                      fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 500,
                      color: isOpen ? (darkMode ? C.blueGlow : C.blue) : head,
                      textAlign: "left", transition: "color 0.25s ease",
                    }}>
                      <span style={{ paddingRight: 24 }}>{item.q}</span>
                      <svg
                        width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke={isOpen ? C.blue : muted} strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        style={{
                          flexShrink: 0,
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1), stroke 0.25s ease",
                        }}
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    <div style={{
                      maxHeight: isOpen ? 240 : 0, overflow: "hidden",
                      transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
                      opacity: isOpen ? 1 : 0,
                    }}>
                      <p style={{
                        fontSize: 14.5, color: txt, lineHeight: 1.75,
                        padding: "0 4px 22px",
                      }}>{item.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

/* ─── Changelog ─────────────────────────────────────────────────────────────── */
const Changelog = ({ darkMode }) => {
  const moduleColors = { Platform: C.navy, Ava: C.blue, Intelligence: "#8B5CF6", Pulse: C.teal };
  const entries = [
    { version: "v1.2.0", date: "18 Mar", module: "Platform", title: "Terms of Service updated", desc: "Tightened data handling clauses, added multi-region compliance language, and made the legal team slightly less nervous." },
    { version: "v1.1.4", date: "14 Mar", module: "Ava", title: "Three-way call transfers", desc: "If Ava can't help, she knows who can. Warm transfers to your nominated clinician or front desk." },
    { version: "v1.1.3", date: "10 Mar", module: "Intelligence", title: "Weekly digest redesigned", desc: "Less noise, more signal. Your Monday morning just got 30 seconds shorter." },
    { version: "v1.1.2", date: "28 Feb", module: "Pulse", title: "Communication preferences respected", desc: "Pulse sequences now honour patient opt-outs. Opt-out means opt-out." },
    { version: "v1.1.1", date: "21 Feb", module: "Platform", title: "Dark mode", desc: "Because you asked. And because we were tired of burning our retinas at 11pm." },
    { version: "v1.1.0", date: "14 Feb", module: "Platform", title: "Multi-PMS import pipeline", desc: "Cliniko, WriteUpp, CSV — we'll eat whatever you feed us." },
    { version: "v1.0.3", date: "7 Feb", module: "Platform", title: "ROI calculator recalibrated", desc: "Fixed a bug where the calculator was being too generous. We prefer conservative." },
    { version: "v1.0.2", date: "1 Feb", module: "Ava", title: "Voice settings tuned", desc: "More human, less call-centre. Stability 67%, Similarity 85%." },
    { version: "v1.0.1", date: "24 Jan", module: "Platform", title: "Onboarding wizard live", desc: "PMS connection → Ava config → Pulse setup → Go live. Five steps, five days." },
    { version: "v1.0.0", date: "17 Jan", module: "Platform", title: "StrydeOS ships", desc: "Intelligence, Ava, and Pulse available as individual modules or Full Stack. Built at the clinic. Validated at the clinic. Now available to yours." },
    { version: "v0.9.2", date: "10 Jan", module: "Platform", title: "Final security audit", desc: "42 edge cases across 15 domains. Nine critical issues identified and resolved before launch." },
    { version: "v0.9.1", date: "6 Jan", module: "Platform", title: "Stripe billing integration", desc: "Monthly billing, no lock-in, cancel anytime." },
    { version: "v0.9.0", date: "2 Jan", module: "Platform", title: "Beta programme closes", desc: "Three pilot clinics onboarded. Data flowing. Metrics tracking. Time to ship." },
  ];

  return (
    <section id="changelog" style={{
      padding: "100px 24px",
      background: C.navy,
      position: "relative", overflow: "hidden",
    }}>
      <RadialGlow color={C.blue} size={600} opacity={0.08} style={{ top: -200, right: -100 }} />
      <RadialGlow color="#8B5CF6" size={400} opacity={0.06} style={{ bottom: -100, left: -100 }} />

      <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 2 }}>
        <AnimIn>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px",
            borderRadius: 50, background: `${C.blue}25`, border: `1px solid ${C.blue}40`,
            color: C.blueGlow, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
            textTransform: "uppercase", marginBottom: 16,
          }}>Changelog</div>
          <h2 className="serif" style={{ fontSize: 44, color: "white", fontWeight: 400, lineHeight: 1.1 }}>
            What we've shipped
          </h2>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 12 }}>
            Jan–Mar 2026
          </p>
        </div>
        </AnimIn>

        <div style={{ position: "relative", paddingLeft: 40 }}>
          {/* Vertical line */}
          <div style={{
            position: "absolute", left: 11, top: 8, bottom: 8, width: 2,
            background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 100%)",
            borderRadius: 1,
          }} />

          {entries.map((entry, i) => {
            const modColor = moduleColors[entry.module] || C.blue;
            return (
              <div key={i} style={{ position: "relative", marginBottom: 28, paddingLeft: 0 }}>
                {/* Dot */}
                <div style={{
                  position: "absolute", left: -34, top: 6,
                  width: 12, height: 12, borderRadius: "50%",
                  background: entry.module === "Platform" ? "rgba(255,255,255,0.15)" : `${modColor}50`,
                  border: `2px solid ${entry.module === "Platform" ? "rgba(255,255,255,0.25)" : modColor}`,
                }} />

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", fontFamily: "'Outfit',sans-serif" }}>{entry.version}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{entry.date} 2026</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                    padding: "2px 8px", borderRadius: 4,
                    background: entry.module === "Platform" ? "rgba(255,255,255,0.06)" : `${modColor}20`,
                    color: entry.module === "Platform" ? "rgba(255,255,255,0.4)" : modColor,
                  }}>{entry.module}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "white", marginBottom: 4 }}>{entry.title}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.65 }}>{entry.desc}</div>
              </div>
            );
          })}
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

    <AnimIn>
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

      {/* Compliance carousel */}
      <div style={{ overflow: "hidden", marginTop: 56, paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", gap: 48, animation: "scroll 20s linear infinite", width: "max-content" }}>
          {[...["GDPR", "HIPAA-aligned", "UK/EU Hosted", "AES-256 Encrypted", "Australian Privacy Act", "Audit Logged", "SOC 2 (roadmap)"], ...["GDPR", "HIPAA-aligned", "UK/EU Hosted", "AES-256 Encrypted", "Australian Privacy Act", "Audit Logged", "SOC 2 (roadmap)"]].map((badge, i) => (
            <div key={`${badge}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{badge}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    </AnimIn>
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
              { label: "About", href: "#about" },
              { label: "Case Studies", href: "/case-studies" },
              { label: "Pricing", href: "#pricing" },
              { label: "FAQ", href: "/faq" },
              { label: "Contact", href: "/contact" },
            ]},
            { h: "Developers", links: [
              { label: "Full API Reference", href: "/api-docs.html" },
              { label: "System Status", href: "/status.html" },
              { label: "Changelog", href: "/changelog" },
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
        {["GDPR · HIPAA-aligned", "UK/EU Hosted", "AES-256 Encrypted", "Australian Privacy Act", "Audit Logged"].map((badge) => (
          <div key={badge} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {badge}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
  function decline() {
    try { localStorage.setItem(COOKIE_KEY, "declined"); } catch {}
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
          <button onClick={decline} style={{
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

/* ─── FAQ Page (standalone route) ────────────────────────────────────────────── */
export function FAQPage() {
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("strydeos-theme");
    if (saved === "dark") setDarkMode(true);
  }, []);
  useEffect(() => { localStorage.setItem("strydeos-theme", darkMode ? "dark" : "light"); }, [darkMode]);
  return (
    <>
      <style>{globalStyles}</style>
      <Nav darkMode={darkMode} setDarkMode={setDarkMode} />
      <div style={{ paddingTop: 70 }}>
        <FAQ darkMode={darkMode} />
      </div>
      <Footer />
    </>
  );
}

/* ─── Changelog Page (standalone route) ─────────────────────────────────────── */
export function ChangelogPage() {
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("strydeos-theme");
    if (saved === "dark") setDarkMode(true);
  }, []);
  useEffect(() => { localStorage.setItem("strydeos-theme", darkMode ? "dark" : "light"); }, [darkMode]);
  return (
    <>
      <style>{globalStyles}</style>
      <Nav darkMode={darkMode} setDarkMode={setDarkMode} />
      <div style={{ paddingTop: 70 }}>
        <Changelog darkMode={darkMode} />
      </div>
      <Footer />
    </>
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
      <HolisticSection darkMode={darkMode} />
      <Integrations darkMode={darkMode} />
      <Products darkMode={darkMode} />
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
