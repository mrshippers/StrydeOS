import { useState } from "react";

/* ─── Tokens ─────────────────────────────────────────────────────────────── */
const C = {
  cloudDancer: "#F2F1EE",
  cloudLight:  "#F9F8F6",
  navy:        "#0B2545",
  navyMid:     "#132D5E",
  blue:        "#1C54F2",
  blueBright:  "#2E6BFF",
  blueGlow:    "#4B8BF5",
  teal:        "#0891B2",
  ink:         "#111827",
  muted:       "#6B7280",
  border:      "#E2DFDA",
};

/* ─── Module-tinted Monolith mark (exact brand SVG, colour-shifted) ──────── */
let _mid = 0;
const ModuleMonolith = ({ color = C.blue, size = 48 }) => {
  const id = `mm-${++_mid}`;
  // Derive lighter/darker shades from the module colour
  const darkBg = C.navy;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}-c`} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.58" />
          <stop offset="100%" stopColor={darkBg} stopOpacity="0.72" />
        </linearGradient>
        <radialGradient id={`${id}-r`} cx="28%" cy="24%" r="60%">
          <stop offset="0%" stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-t`} x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0.97" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0.1" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.65" />
          <stop offset="100%" stopColor={color} stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="28%" stopColor="white" stopOpacity="0.60" />
          <stop offset="65%" stopColor="white" stopOpacity="0.12" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-p`}><rect x="35" y="20" width="22" height="60" rx="5" /></clipPath>
        <clipPath id={`${id}-a`}><polygon points="35,52 57,40 57,20 35,20" /></clipPath>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${id}-c)`} />
      <rect width="100" height="100" rx="24" fill={`url(#${id}-r)`} />
      <rect width="100" height="100" rx="24" fill="none" stroke={`url(#${id}-b)`} strokeWidth="1.2" />
      <path d="M 17 21 Q 50 12 83 21" stroke={`url(#${id}-m)`} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07" />
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10" />
      <g clipPath={`url(#${id}-p)`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${id}-t)`} clipPath={`url(#${id}-a)`} />
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round" />
    </svg>
  );
};

/* ─── Data ───────────────────────────────────────────────────────────────── */
const modules = [
  { name: "Ava",          desc: "Catches every call your team can't get to",                          color: C.blue,    n: "01" },
  { name: "Pulse",        desc: "Keeps patients on course without anyone having to chase",            color: C.teal,    n: "02" },
  { name: "Intelligence", desc: "See exactly where revenue is made, lost, and left on the table",     color: "#8B5CF6", n: "03" },
];

/* ─── Hoverable card ─────────────────────────────────────────────────────── */
const ModuleCard = ({ name, desc, color, n, bgCard, bdr, head, muted, darkMode }) => {
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

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function OneOSSection() {
  const [darkMode, setDarkMode] = useState(false);

  const bgAlt  = darkMode ? C.navyMid : C.cloudLight;
  const bgCard = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const bdr    = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const head   = darkMode ? "white"   : C.navy;
  const txt    = darkMode ? "rgba(255,255,255,0.85)" : C.ink;
  const muted  = darkMode ? "rgba(255,255,255,0.45)" : C.muted;
  const italic = darkMode ? C.blueGlow : C.blue;

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: darkMode ? C.navy : C.cloudDancer, minHeight: "100vh", transition: "background 0.3s ease" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 24px" }}>
        <button onClick={() => setDarkMode(!darkMode)} style={{
          padding: "6px 16px", borderRadius: 50, border: `1px solid ${bdr}`,
          background: bgCard, color: head, fontSize: 12, fontWeight: 500,
          fontFamily: "'Outfit', sans-serif", cursor: "pointer", transition: "all 0.3s",
        }}>
          {darkMode ? "☀ Light" : "● Dark"}
        </button>
      </div>

      {/* Section */}
      <section style={{ padding: "60px 24px 100px", background: bgAlt, transition: "background 0.3s ease" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>

            {/* Left — Copy */}
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 14px", background: `${C.blue}10`,
                border: `1px solid ${C.blue}20`, borderRadius: 50,
                fontSize: 11, fontWeight: 600, color: C.blue,
                letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
              }}>
                One Operating System
              </div>

              <h2 style={{
                fontFamily: "'DM Serif Display', serif", fontSize: 44,
                color: head, fontWeight: 400, lineHeight: 1.1, marginBottom: 24,
              }}>
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

            {/* Right — Module cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {modules.map(({ name, desc, color, n }) => (
                <ModuleCard key={name} name={name} desc={desc} color={color} n={n}
                  bgCard={bgCard} bdr={bdr} head={head} muted={muted} darkMode={darkMode} />
              ))}
            </div>

          </div>
        </div>
      </section>
    </div>
  );
}
