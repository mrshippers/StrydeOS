import { useState, useEffect, useCallback } from "react";

/* ── Brand Tokens ── */
const C = {
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  teal: "#0891B2",
  cloud: "#F2F1EE", cloudLight: "#F9F8F6", cloudDark: "#E8E6E0", cream: "#FAF9F7",
  ink: "#111827", muted: "#6B7280", border: "#E2DFDA", success: "#059669",
};

/* ── Monolith Mark (canonical) ── */
const MonolithMark = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="mc" x1="0.1" y1="0" x2="0.85" y2="1"><stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.58"/><stop offset="100%" stopColor="#091D3E" stopOpacity="0.72"/></linearGradient>
      <radialGradient id="mr" cx="28%" cy="24%" r="60%"><stop offset="0%" stopColor="#6AABFF" stopOpacity="0.42"/><stop offset="100%" stopColor="#1C54F2" stopOpacity="0"/></radialGradient>
      <linearGradient id="mt" x1="0.05" y1="1" x2="0.35" y2="0"><stop offset="0%" stopColor="white" stopOpacity="0.55"/><stop offset="100%" stopColor="white" stopOpacity="0.97"/></linearGradient>
      <linearGradient id="mm" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="white" stopOpacity="0"/><stop offset="28%" stopColor="white" stopOpacity="0.60"/><stop offset="65%" stopColor="white" stopOpacity="0.12"/><stop offset="100%" stopColor="white" stopOpacity="0"/></linearGradient>
      <linearGradient id="mb" x1="0.1" y1="0" x2="0.4" y2="1"><stop offset="0%" stopColor="#7ABBFF" stopOpacity="0.65"/><stop offset="100%" stopColor="#1C54F2" stopOpacity="0.06"/></linearGradient>
      <clipPath id="mpc"><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
      <clipPath id="mac"><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
    </defs>
    <rect width="100" height="100" rx="24" fill="url(#mc)"/><rect width="100" height="100" rx="24" fill="url(#mr)"/>
    <rect width="100" height="100" rx="24" fill="none" stroke="url(#mb)" strokeWidth="1.2"/>
    <path d="M 17 21 Q 50 12 83 21" stroke="url(#mm)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
    <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10"/>
    <g clipPath="url(#mpc)">
      <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </g>
    <rect x="35" y="20" width="22" height="60" rx="5" fill="url(#mt)" clipPath="url(#mac)"/>
    <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round"/>
  </svg>
);

const Check = ({ color = C.blue, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

/* ═══ TRANSCRIPT CONTENT ═══ */
const msgs = [
  { who: "p", text: "Hi, I'd like to book an appointment for my lower back." },
  { who: "a", text: "Of course — I can help with that. Are mornings or afternoons better for you?" },
  { who: "p", text: "Mornings, ideally Thursday or Friday." },
  { who: "a", text: "I have Thursday at 9:15am with Dr. Reeves. Shall I book that and send you a confirmation text?" },
  { who: "p", text: "Yes please." },
  { who: "a", text: "Done — you're booked in. You'll get a text shortly. Is there anything else I can help with?" },
];

/* ═══ CAROUSEL (stacked absolute positioning — no overflow issues) ═══ */
const HeroCarousel = () => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % 2), 3500);
    return () => clearInterval(t);
  }, [active]);

  const dotBg = active === 0 ? C.navy : C.cream;

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
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Today, 09:12</span>
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
          {/* Premium header */}
          <div style={{
            background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyMid} 60%, #1a3a6e 100%)`,
            padding: "18px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            position: "relative", overflow: "hidden",
          }}>
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
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 0, letterSpacing: "-0.1px", lineHeight: 1.3 }}>17 entries teaching Ava about your clinic</div>
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
            {/* Services */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: C.blue, color: "white", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>S</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Services & Treatments</span>
                <span style={{ fontSize: 11, color: C.muted }}>2</span>
              </div>
              <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  { n: "Physiotherapy", t: "MSK clinic specialising in back pain, neck pain, sports injuries, post-surgical rehab. All appointments 45 minutes." },
                  { n: "Online Consultations", t: "Video consultations — same length (45 min), same price. Ideal for follow-ups or patients who can't travel." },
                ].map((e, i) => (
                  <div key={i} style={{ background: C.cloudLight, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 13px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{e.n}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{e.t}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team */}
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
      <div style={{
        display: "flex", justifyContent: "center",
        padding: "16px 0 0",
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: C.blue,
          boxShadow: `0 0 8px ${C.blueGlow}, 0 0 20px rgba(28,84,242,0.3)`,
          animation: "glow-pulse 2s ease-in-out infinite",
        }}/>
        <style>{`@keyframes glow-pulse { 0%,100% { box-shadow: 0 0 8px ${C.blueGlow}, 0 0 20px rgba(28,84,242,0.3); } 50% { box-shadow: 0 0 12px ${C.blueGlow}, 0 0 32px rgba(28,84,242,0.45); } }`}</style>
      </div>
    </div>
  );
};

/* ═══ MODULE PRICING BANNER (from strydeos-module-pricing-banner.jsx) ═══ */
const MODULE_META = {
  Ava: { color: C.blue, bright: C.blueBright, glow: C.blueGlow, trialUrl: "/onboarding?module=ava", buyUrl: "/pricing#ava" },
  Pulse: { color: C.teal, bright: "#06B6D4", glow: "#22D3EE", trialUrl: "/onboarding?module=pulse", buyUrl: "/pricing#pulse" },
  Intelligence: { color: "#8B5CF6", bright: "#A78BFA", glow: "#C4B5FD", trialUrl: "/onboarding?module=intelligence", buyUrl: "/pricing#intelligence" },
};
const TIERS = [
  { id: "solo", label: "Solo", sub: "(1)" },
  { id: "studio", label: "Studio", sub: "(2–5)" },
  { id: "clinic", label: "Clinic", sub: "(6+)" },
];
const PRICING = {
  solo:   { Ava: "119", Pulse: "89",  Intelligence: "69"  },
  studio: { Ava: "179", Pulse: "129", Intelligence: "109" },
  clinic: { Ava: "259", Pulse: "199", Intelligence: "179" },
};
const SETUP = {
  solo:   { Ava: "£250 one-time setup", Pulse: "No setup fee", Intelligence: "No setup fee" },
  studio: { Ava: "£250 one-time setup", Pulse: "No setup fee", Intelligence: "No setup fee" },
  clinic: { Ava: "£250 one-time setup", Pulse: "No setup fee", Intelligence: "No setup fee" },
};

const ModulePricingBanner = ({ module = "Ava" }) => {
  const [tier, setTier] = useState("studio");
  const [loaded, setLoaded] = useState(false);
  const [primaryHover, setPrimaryHover] = useState(false);
  const [secondaryHover, setSecondaryHover] = useState(false);
  const [priceAnim, setPriceAnim] = useState(false);

  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setLoaded(true))); }, []);

  const handleTierChange = (newTier) => {
    if (newTier === tier) return;
    setPriceAnim(true);
    setTimeout(() => { setTier(newTier); setTimeout(() => setPriceAnim(false), 30); }, 150);
  };

  const tierIndex = TIERS.findIndex(t => t.id === tier);
  const m = MODULE_META[module];
  const price = PRICING[tier][module];
  const setup = SETUP[tier][module];

  return (
    <>
      <style>{`@keyframes driftGlow { 0%,100%{transform:translate(0,0) scale(1);opacity:1} 50%{transform:translate(15px,-10px) scale(1.08);opacity:0.7} }`}</style>
      <div style={{ fontFamily: "'Outfit', sans-serif", width: "100%", maxWidth: 560, margin: "0 auto" }}>
        <div style={{
          position: "relative", overflow: "hidden", borderRadius: 20,
          padding: "30px 32px 28px",
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, #1A3A6E40, ${C.navy} 70%)`,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
          textAlign: "center",
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(12px)",
          transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
        }}>
          {/* Ambient glows */}
          <div style={{ position:"absolute",top:-100,left:"50%",marginLeft:-200,width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${m.color}06,transparent 70%)`,pointerEvents:"none",animation:"driftGlow 8s ease-in-out infinite" }}/>
          <div style={{ position:"absolute",bottom:-80,right:-60,width:300,height:300,borderRadius:"50%",background:`radial-gradient(circle,${m.color}04,transparent 70%)`,pointerEvents:"none",animation:"driftGlow 8s ease-in-out 2s infinite reverse" }}/>
          {/* Glass highlight */}
          <div style={{ position:"absolute",top:0,left:0,right:0,height:60,background:"linear-gradient(180deg,rgba(255,255,255,0.015) 0%,transparent 100%)",borderRadius:"20px 20px 0 0",pointerEvents:"none" }}/>

          {/* Tier toggle */}
          <div style={{
            display:"inline-flex",alignItems:"stretch",padding:4,borderRadius:16,
            backgroundColor:"rgba(0,0,0,0.25)",border:"1px solid rgba(255,255,255,0.06)",
            boxShadow:"inset 0 2px 8px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.03)",
            marginBottom:28,position:"relative",
          }}>
            <div style={{
              position:"absolute",top:4,bottom:4,
              width:`calc(${100/TIERS.length}% - 2px)`,
              left:`calc(${tierIndex*(100/TIERS.length)}% + 2px)`,
              borderRadius:12,
              background:`linear-gradient(135deg,${m.bright},${m.color})`,
              boxShadow:`0 2px 10px ${m.color}30,0 0 0 1px ${m.bright}20,inset 0 1px 0 rgba(255,255,255,0.15)`,
              transition:"left 0.4s cubic-bezier(0.16,1,0.3,1)",zIndex:1,
            }}/>
            {TIERS.map(t => {
              const active = tier === t.id;
              return (
                <button key={t.id} onClick={() => handleTierChange(t.id)} style={{
                  position:"relative",zIndex:2,padding:"10px 28px 8px",borderRadius:12,
                  border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",background:"transparent",
                  transition:"all 0.3s ease",
                }}>
                  <span style={{ fontSize:14,fontWeight:active?700:500,color:active?"white":"rgba(255,255,255,0.3)",transition:"color 0.3s" }}>{t.label}</span>
                  <span style={{ fontSize:12,fontWeight:400,marginLeft:4,color:active?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.18)",transition:"color 0.3s" }}>{t.sub}</span>
                </button>
              );
            })}
          </div>

          {/* Price */}
          <div style={{ marginBottom:6,position:"relative",opacity:priceAnim?0:1,transform:priceAnim?"translateY(6px)":"translateY(0)",transition:"all 0.15s ease" }}>
            <span style={{ fontFamily:"'DM Serif Display',serif",fontSize:16,color:"rgba(255,255,255,0.35)",position:"relative",top:-22 }}>£</span>
            <span style={{ fontFamily:"'DM Serif Display',serif",fontSize:64,color:"white",lineHeight:1,letterSpacing:"-0.02em" }}>{price}</span>
          </div>
          <div style={{ fontSize:14,color:"rgba(255,255,255,0.35)",marginBottom:26,opacity:priceAnim?0:1,transform:priceAnim?"translateY(4px)":"translateY(0)",transition:"all 0.15s ease 0.03s" }}>
            p/m · {setup}
          </div>

          {/* CTAs */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:18 }}>
            <a href={m.trialUrl} onMouseEnter={()=>setPrimaryHover(true)} onMouseLeave={()=>setPrimaryHover(false)} style={{
              display:"inline-flex",alignItems:"center",gap:8,padding:"13px 30px",borderRadius:50,
              fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:700,color:"white",textDecoration:"none",cursor:"pointer",
              background:primaryHover?`linear-gradient(135deg,${m.bright},${m.color})`:`linear-gradient(135deg,${m.color},${m.color}E6)`,
              boxShadow:primaryHover?`0 4px 16px ${m.color}28,0 0 0 1px ${m.bright}18,inset 0 1px 0 rgba(255,255,255,0.15)`:`0 2px 8px ${m.color}18,inset 0 1px 0 rgba(255,255,255,0.08)`,
              transform:primaryHover?"translateY(-1px)":"translateY(0)",transition:"all 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}>Start free trial <span style={{fontSize:16}}>→</span></a>
            <a href={m.buyUrl} onMouseEnter={()=>setSecondaryHover(true)} onMouseLeave={()=>setSecondaryHover(false)} style={{
              display:"inline-flex",alignItems:"center",gap:8,padding:"13px 30px",borderRadius:50,
              fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:700,textDecoration:"none",cursor:"pointer",
              color:secondaryHover?"white":"rgba(255,255,255,0.7)",
              background:secondaryHover?`linear-gradient(135deg,${m.bright}20,${m.color}15)`:"transparent",
              border:secondaryHover?`1.5px solid ${m.bright}50`:"1.5px solid rgba(255,255,255,0.15)",
              transform:secondaryHover?"translateY(-1px)":"translateY(0)",transition:"all 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}>Buy now <span style={{fontSize:16}}>→</span></a>
          </div>
          <a href="/pricing" style={{ fontSize:13,color:"rgba(255,255,255,0.3)",textDecoration:"none",cursor:"pointer" }}
            onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,0.55)"}
            onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.3)"}
          >Compare all plans ↓</a>
        </div>
      </div>
    </>
  );
};

/* ═══ FULL PAGE ═══ */
export default function AvaPage() {
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: C.cloud, color: C.ink, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`html, body { background: ${C.cloud} !important; margin: 0; }`}</style>

      {/* NAV */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 48px", borderBottom: `1px solid ${C.border}`,
        background: C.cloud, position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, userSelect: "none" }}>
          <MonolithMark size={34}/>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", color: C.navy, lineHeight: 1 }}>
            Stryde<span style={{ color: C.blue }}>OS</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <button style={{
            width: 38, height: 38, borderRadius: "50%",
            border: `1px solid ${C.border}`, background: "white",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <a href="/" style={{ fontSize: 14, color: C.muted, textDecoration: "none", fontWeight: 500 }}>← Back to site</a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        maxWidth: 1200, margin: "0 auto", padding: "68px 48px 76px",
        display: "grid", gridTemplateColumns: "1fr 380px", gap: 56, alignItems: "start",
      }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 16px 6px 12px", background: "white",
            border: `1px solid ${C.border}`, borderRadius: 50,
            fontSize: 12, fontWeight: 600, letterSpacing: "0.8px",
            textTransform: "uppercase", color: C.muted, marginBottom: 24,
          }}>
            <span style={{ width: 7, height: 7, background: C.blue, borderRadius: "50%", display: "block" }}/>
            AVA
          </div>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 48, fontWeight: 400, lineHeight: 1.1,
            color: C.navy, letterSpacing: "-0.5px", marginBottom: 28,
          }}>Never miss a patient again.</h1>
          <div style={{ fontSize: 16, lineHeight: 1.7, color: C.muted, maxWidth: 520 }}>
            <p style={{ marginBottom: 16 }}>Every missed call is a new patient lost to the next clinic on Google. Every cancellation that is not recovered becomes avoidable leakage.</p>
            <p style={{ marginBottom: 16 }}>Ava handles inbound calls, books into your diary, recovers cancellations before the slot goes empty, and triages new enquiries automatically.</p>
            <p>Clinics using Ava have stopped paying £400–800/month to call-handling services. They've also stopped losing patients at the first point of contact.</p>
          </div>
        </div>
        <HeroCarousel/>
      </section>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }}><hr style={{ border: "none", height: 1, background: C.border }}/></div>

      {/* HOW IT WORKS + KEY BENEFITS */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "68px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 16, padding: "32px 28px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: C.blue, marginBottom: 22 }}>How it works</div>
            {["Captures inbound calls and triages intent", "Books directly into your existing PMS diary", "Triggers confirmations and recovery flows automatically"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < 2 ? 14 : 0 }}>
                <div style={{ width: 26, height: 26, minWidth: 26, borderRadius: 8, background: "#EEF0FF", color: C.blue, fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{i+1}</div>
                <span style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.5, paddingTop: 3 }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 16, padding: "32px 28px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: "#e74c3c", marginBottom: 22 }}>Key benefits</div>
            {["Fewer missed first contacts", "Higher slot fill from recovered cancellations", "Lower admin overhead on front desk"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i < 2 ? 14 : 0 }}>
                <Check/><span style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }}><hr style={{ border: "none", height: 1, background: C.border }}/></div>

      {/* EVERYTHING INCLUDED */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "68px 48px 76px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: C.ink, marginBottom: 28 }}>Everything included</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 48px" }}>
          {["Inbound calls handled 24/7","Books directly into your calendar","Cancellation recovery & no-show chasing","SMS confirmations sent automatically","Emergency routing to on-call clinician","PMS write-back integration"].map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: C.muted }}>
              <Check/>{t}
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px 80px" }}>
        <ModulePricingBanner module="Ava" />
      </section>
    </div>
  );
}
