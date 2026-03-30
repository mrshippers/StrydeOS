import { useState, useEffect, useRef } from "react";

/* ── Brand tokens (canonical) ── */
const C = {
  cloudDancer: "#F2F1EE",
  cloudLight: "#F9F8F6",
  cream: "#FAF9F7",
  navy: "#0B2545",
  navyMid: "#132D5E",
  blue: "#1C54F2",
  blueBright: "#2E6BFF",
  blueGlow: "#4B8BF5",
  teal: "#0891B2",
  purple: "#8B5CF6",
  ink: "#111827",
  muted: "#6B7280",
  success: "#059669",
  border: "#E2DFDA",
};

/* ── Module accent map ── */
const MODULE_COLORS = {
  owners: C.blue,
  clinicians: C.purple,
  technical: C.teal,
};

/* ── FAQ Data ── */
const FAQ_CATEGORIES = [
  {
    id: "owners",
    label: "For Clinic Owners",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    items: [
      {
        q: "What data does StrydeOS actually need from my PMS?",
        a: "We pull appointment data, clinician schedules, and patient contact preferences — nothing clinical. Your PMS stays your system of record. StrydeOS reads from it; we never write back or modify anything. Most integrations take under 10 minutes to connect.",
      },
      {
        q: "Will this replace my practice management system?",
        a: "No — and that's by design. StrydeOS sits above your PMS, the same way macOS sits above your apps. We connect to your existing tools (Cliniko, WriteUpp, and more) and surface the performance insights they can't. You keep everything you already use.",
      },
      {
        q: "What's the onboarding process like?",
        a: "We start with a free Clinical Performance Audit — a 30-minute call where we review your follow-up rate, HEP compliance, utilisation, and DNA rate against benchmarks using your existing PMS data. If there's a fit, onboarding takes less than a day. Most clinics are live within hours of connecting their PMS.",
      },
      {
        q: "Is there a contract or lock-in?",
        a: "No lock-in. Monthly rolling billing, cancel any time. We'd rather earn your continued use than trap you into it. Your data stays yours — if you leave, we delete everything.",
      },
      {
        q: "How is my data protected?",
        a: "All data is encrypted in transit and at rest on UK-hosted infrastructure. We're GDPR-compliant, and we'll sign a Data Processing Agreement before any patient-adjacent data flows through the platform. No data is sold or shared — ever.",
      },
    ],
  },
  {
    id: "clinicians",
    label: "For Clinicians",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    items: [
      {
        q: "Can I see my own performance data?",
        a: "Yes. Every clinician gets a personal dashboard showing their follow-up rate, HEP compliance, programme assignment rate, and patient feedback scores. It's designed to help you improve — not to micromanage. Think of it as a mirror, not a report card.",
      },
      {
        q: "Does Ava sound robotic to patients?",
        a: "No. Ava uses cloned voice technology trained on real human speech patterns. She handles greetings, bookings, and triage with natural conversation flow. Patients regularly don't realise they're speaking with an AI receptionist — that's the benchmark we hold ourselves to.",
      },
      {
        q: "What if a patient needs to speak to a real person?",
        a: "Ava detects when a patient needs human support — clinical queries, distressed callers, or complex requests — and routes them to your team immediately. She's a first responder, not a gatekeeper. Emergency calls are always escalated instantly.",
      },
    ],
  },
  {
    id: "technical",
    label: "Technical & B2B",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    items: [
      {
        q: "Which PMS platforms do you integrate with?",
        a: "We currently have live integrations with major PMS platforms including self-serve connections. For platforms without a public API, we support secure CSV import with automatic schema detection and duplicate prevention. New integrations are being added based on customer demand.",
      },
      {
        q: "Can I white-label StrydeOS for my clinic group?",
        a: "Not yet — but it's on the roadmap. Multi-site clinic groups are a natural fit for StrydeOS. If you're running 3+ locations and want to explore this, reach out and we'll scope it together.",
      },
      {
        q: "How does pricing work for larger teams?",
        a: "Each module — Intelligence, Ava, and Pulse — prices independently, so you only pay for what you use. The Full Stack bundle saves roughly 20% versus buying separately. Volume pricing for clinic groups is available on request.",
      },
      {
        q: "Is there an API I can build on?",
        a: "Not yet publicly. We're building StrydeOS as a platform, and API access for integration partners is part of the roadmap. If you're a PMS vendor or complementary tool looking to integrate, we'd love to hear from you.",
      },
    ],
  },
];

/* ── Monolith Logo (inline, simplified) ── */
const MonolithMini = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <defs>
      <linearGradient id="faq-mg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#1C54F2" stopOpacity="0.55" />
      </linearGradient>
      <clipPath id="faq-mc">
        <rect x="6" y="4" width="28" height="32" rx="4" />
      </clipPath>
    </defs>
    <rect x="6" y="4" width="28" height="32" rx="4" fill="url(#faq-mg)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
    <g clipPath="url(#faq-mc)" opacity="0.9">
      <rect x="11" y="20" width="18" height="18" rx="1" fill="rgba(255,255,255,0.08)" />
      <path d="M15 28l5-4 5 4" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 24l3-2.5 3 2.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 20.5l1-0.8 1 0.8" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

/* ── Accordion Item ── */
const AccordionItem = ({ question, answer, isOpen, onClick, accentColor, index }) => {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isOpen ? contentRef.current.scrollHeight : 0);
    }
  }, [isOpen]);

  return (
    <div
      style={{
        borderBottom: `1px solid ${C.border}`,
        transition: "background 0.25s ease",
        background: isOpen ? `${accentColor}04` : "transparent",
      }}
    >
      <button
        onClick={onClick}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "22px 0",
          border: "none",
          background: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: isOpen ? accentColor : C.ink,
            transition: "color 0.25s ease",
            lineHeight: 1.5,
            flex: 1,
          }}
        >
          {question}
        </span>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isOpen ? accentColor : `${C.border}`,
            transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
            flexShrink: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
              transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            <path
              d="M7 1v12M1 7h12"
              stroke={isOpen ? "white" : C.muted}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      <div
        style={{
          height,
          overflow: "hidden",
          transition: "height 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div ref={contentRef} style={{ paddingBottom: 24 }}>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.7,
              color: C.muted,
              maxWidth: 640,
              fontWeight: 400,
            }}
          >
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
};

/* ── Search Bar ── */
const SearchBar = ({ value, onChange }) => (
  <div
    style={{
      position: "relative",
      maxWidth: 480,
      margin: "0 auto",
      animation: "fadeUp 0.7s ease 0.4s both",
    }}
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={C.muted}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
    <input
      type="text"
      placeholder="Search questions…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "15px 20px 15px 48px",
        borderRadius: 50,
        border: `1.5px solid rgba(255,255,255,0.15)`,
        background: "rgba(255,255,255,0.06)",
        color: "white",
        fontSize: 15,
        fontFamily: "'Outfit', sans-serif",
        outline: "none",
        transition: "border-color 0.2s ease, background 0.2s ease",
        backdropFilter: "blur(8px)",
      }}
      onFocus={(e) => {
        e.target.style.borderColor = `${C.blueGlow}60`;
        e.target.style.background = "rgba(255,255,255,0.1)";
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "rgba(255,255,255,0.15)";
        e.target.style.background = "rgba(255,255,255,0.06)";
      }}
    />
  </div>
);

/* ── Category Tab ── */
const CategoryTab = ({ label, icon, isActive, onClick, color }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 24px",
      borderRadius: 50,
      border: isActive ? `1.5px solid ${color}` : `1.5px solid ${C.border}`,
      background: isActive ? `${color}0C` : "white",
      color: isActive ? color : C.muted,
      fontFamily: "'Outfit', sans-serif",
      fontSize: 14,
      fontWeight: isActive ? 600 : 500,
      cursor: "pointer",
      transition: "all 0.3s ease",
      whiteSpace: "nowrap",
    }}
  >
    {icon}
    {label}
  </button>
);

/* ── Quick Stat Pill ── */
const StatPill = ({ icon, text, delay }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 16px",
      borderRadius: 50,
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      color: "rgba(255,255,255,0.7)",
      fontSize: 13,
      fontWeight: 500,
      animation: `fadeUp 0.6s ease ${delay}s both`,
      backdropFilter: "blur(4px)",
    }}
  >
    {icon}
    {text}
  </div>
);

/* ── Main Page ── */
export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState("owners");
  const [openIndex, setOpenIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const activeData = FAQ_CATEGORIES.find((c) => c.id === activeCategory);
  const accentColor = MODULE_COLORS[activeCategory];

  // Filter items by search
  const filteredCategories = searchQuery.trim()
    ? FAQ_CATEGORIES.map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.a.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((cat) => cat.items.length > 0)
    : [activeData];

  const isSearching = searchQuery.trim().length > 0;
  const totalResults = filteredCategories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { font-family: 'Outfit', sans-serif; background: ${C.cloudDancer}; color: ${C.ink}; overflow-x: hidden; }
        ::selection { background: ${C.blue}33; }
        .serif { font-family: 'DM Serif Display', serif; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-6px); }
        }
        @keyframes subtle-drift {
          0%,100% { transform: translate(0,0) rotate(0deg); }
          33% { transform: translate(6px,-4px) rotate(0.5deg); }
          66% { transform: translate(-4px,3px) rotate(-0.3deg); }
        }

        input::placeholder { color: rgba(255,255,255,0.35); }
        button:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; }

        @media (max-width: 640px) {
          .hero-content h1 { font-size: 36px !important; }
          .tab-row { flex-wrap: wrap !important; }
          .faq-body { padding: 0 20px !important; }
        }
      `}</style>

      {/* ─── HERO ─── */}
      <section
        style={{
          background: `linear-gradient(170deg, ${C.navy} 0%, ${C.navyMid} 50%, ${C.navy} 100%)`,
          padding: "100px 24px 72px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient glow orbs */}
        <div style={{
          position: "absolute", top: -120, right: -80, width: 400, height: 400,
          borderRadius: "50%", background: `radial-gradient(circle, ${C.blue}15 0%, transparent 70%)`,
          animation: "subtle-drift 12s ease-in-out infinite", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -60, left: -100, width: 300, height: 300,
          borderRadius: "50%", background: `radial-gradient(circle, ${C.purple}10 0%, transparent 70%)`,
          animation: "subtle-drift 15s ease-in-out infinite 3s", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: "40%", left: "60%", width: 200, height: 200,
          borderRadius: "50%", background: `radial-gradient(circle, ${C.teal}08 0%, transparent 70%)`,
          animation: "subtle-drift 10s ease-in-out infinite 6s", pointerEvents: "none",
        }} />

        <div className="hero-content" style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          {/* Chip */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 16px", borderRadius: 50,
            background: `${C.blue}15`, border: `1px solid ${C.blue}30`,
            fontSize: 11, fontWeight: 600, color: C.blueGlow,
            letterSpacing: "0.12em", textTransform: "uppercase",
            marginBottom: 24, animation: "fadeUp 0.6s ease 0.1s both",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 28" fill="none">
              {/* Monolith body */}
              <rect x="6" y="8" width="12" height="18" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              {/* Eureka glow rays */}
              <line x1="12" y1="1" x2="12" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="6" y1="3" x2="8" y2="5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
              <line x1="18" y1="3" x2="16" y2="5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
              {/* Inner chevron — knowledge mark */}
              <path d="M9.5 18l2.5-2 2.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            </svg>
            FAQ
          </div>

          <h1
            className="serif"
            style={{
              fontSize: 52,
              color: "white",
              fontWeight: 400,
              lineHeight: 1.15,
              marginBottom: 16,
              animation: "fadeUp 0.6s ease 0.2s both",
            }}
          >
            Got questions?{" "}
            <span style={{ fontStyle: "italic", color: C.blueGlow }}>Good.</span>
          </h1>

          <p style={{
            fontSize: 17, color: "rgba(255,255,255,0.55)", lineHeight: 1.6,
            maxWidth: 480, margin: "0 auto 36px",
            animation: "fadeUp 0.6s ease 0.3s both",
          }}>
            Everything you need to know about Intelligence, Ava, and Pulse — from data and integrations to getting started.
          </p>

          <SearchBar value={searchQuery} onChange={setSearchQuery} />

          {/* Trust pills */}
          <div style={{
            display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12,
            marginTop: 36,
          }}>
            <StatPill delay={0.55} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} text="GDPR compliant" />
            <StatPill delay={0.65} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>} text="UK hosted" />
            <StatPill delay={0.75} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>} text="Encrypted" />
            <StatPill delay={0.85} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>} text="No lock-in" />
          </div>
        </div>
      </section>

      {/* ─── BODY ─── */}
      <section className="faq-body" style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
        {/* Category Tabs */}
        {!isSearching && (
          <div
            className="tab-row"
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              padding: "40px 0 8px",
              position: "sticky",
              top: 0,
              zIndex: 10,
              background: `linear-gradient(180deg, ${C.cloudDancer} 70%, ${C.cloudDancer}00 100%)`,
              paddingBottom: 24,
            }}
          >
            {FAQ_CATEGORIES.map((cat) => (
              <CategoryTab
                key={cat.id}
                label={cat.label}
                icon={cat.icon}
                isActive={activeCategory === cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setOpenIndex(null);
                }}
                color={MODULE_COLORS[cat.id]}
              />
            ))}
          </div>
        )}

        {/* Search Results Count */}
        {isSearching && (
          <div style={{
            padding: "40px 0 16px", fontSize: 14, color: C.muted, fontWeight: 500,
          }}>
            {totalResults} result{totalResults !== 1 ? "s" : ""} for "{searchQuery}"
          </div>
        )}

        {/* FAQ Items */}
        <div style={{ paddingTop: isSearching ? 0 : 8, paddingBottom: 80 }}>
          {filteredCategories.map((cat) => (
            <div key={cat.id}>
              {isSearching && (
                <div style={{
                  fontSize: 12, fontWeight: 600, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: MODULE_COLORS[cat.id],
                  padding: "20px 0 8px", borderBottom: `2px solid ${MODULE_COLORS[cat.id]}15`,
                  marginBottom: 4,
                }}>
                  {cat.label}
                </div>
              )}
              {cat.items.map((item, idx) => {
                const globalKey = `${cat.id}-${idx}`;
                return (
                  <AccordionItem
                    key={globalKey}
                    question={item.q}
                    answer={item.a}
                    isOpen={openIndex === globalKey}
                    onClick={() => setOpenIndex(openIndex === globalKey ? null : globalKey)}
                    accentColor={MODULE_COLORS[cat.id]}
                    index={idx}
                  />
                );
              })}
            </div>
          ))}

          {isSearching && totalResults === 0 && (
            <div style={{
              textAlign: "center", padding: "60px 0", color: C.muted,
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1.5" style={{ marginBottom: 16 }}>
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 4, color: C.ink }}>No matches found</p>
              <p style={{ fontSize: 14 }}>Try a different search term, or browse by category above.</p>
            </div>
          )}
        </div>
      </section>

      {/* ─── BOTTOM CTA ─── */}
      <section
        style={{
          background: C.navy,
          padding: "72px 24px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle orb */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 500, height: 500, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.blue}10 0%, transparent 60%)`,
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 520, margin: "0 auto" }}>
          <h2
            className="serif"
            style={{ fontSize: 36, color: "white", fontWeight: 400, lineHeight: 1.25, marginBottom: 14 }}
          >
            Still have questions?
          </h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 32 }}>
            Book a free Clinical Performance Audit. We'll review your numbers, answer everything, and show you exactly what StrydeOS surfaces from your data.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="mailto:hello@strydeos.com"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 32px", background: C.blue, color: "white",
                border: "none", borderRadius: 50, fontSize: 15, fontWeight: 600,
                cursor: "pointer", transition: "all 0.3s ease", textDecoration: "none",
                fontFamily: "'Outfit', sans-serif",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = C.blueBright;
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = `0 16px 40px ${C.blue}40`;
              }}
              onMouseLeave={(e) => {
                e.target.style.background = C.blue;
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "none";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Get in touch
            </a>
            <a
              href="#"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "13px 28px", background: "transparent",
                color: "rgba(255,255,255,0.7)",
                border: "1.5px solid rgba(255,255,255,0.2)", borderRadius: 50,
                fontSize: 15, fontWeight: 500, cursor: "pointer",
                transition: "all 0.3s ease", textDecoration: "none",
                fontFamily: "'Outfit', sans-serif",
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = "rgba(255,255,255,0.5)";
                e.target.style.color = "white";
                e.target.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = "rgba(255,255,255,0.2)";
                e.target.style.color = "rgba(255,255,255,0.7)";
                e.target.style.transform = "translateY(0)";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Book a demo
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
