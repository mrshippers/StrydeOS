import { useState, useEffect } from "react";

const C = {
  cloudDancer: "#F2F1EE", cloudLight: "#F9F8F6", cloudDark: "#E8E6E0", cream: "#FAF9F7",
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  teal: "#0891B2",
  ink: "#111827", muted: "#6B7280",
  success: "#059669", border: "#E2DFDA",
};

/* ─── Metric Card ────────────────────────────────────────────────────────────── */
const MetricCard = ({ label, before, after, isDown, darkMode }) => {
  const bg = darkMode ? "rgba(255,255,255,0.03)" : "white";
  const bdr = darkMode ? "rgba(255,255,255,0.07)" : C.border;
  const head = darkMode ? "white" : C.navy;
  const muted = darkMode ? "rgba(255,255,255,0.4)" : C.muted;

  return (
    <div style={{
      background: bg, border: `1px solid ${bdr}`, borderRadius: 16,
      padding: "28px 24px", position: "relative", overflow: "hidden",
      transition: "all 0.3s ease",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
        color: muted, marginBottom: 6,
      }}>{label}</div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Before: {before}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="serif" style={{ fontSize: 48, color: C.blue, fontWeight: 400, lineHeight: 1 }}>
          {after}
        </span>
        <span style={{
          fontSize: 16, color: isDown ? C.success : C.success,
          display: "inline-flex", alignItems: "center", gap: 2,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {isDown
              ? <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
              : <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            }
          </svg>
        </span>
      </div>
    </div>
  );
};

/* ─── What Changed Item ──────────────────────────────────────────────────────── */
const ChangeItem = ({ icon, title, desc, darkMode }) => {
  const head = darkMode ? "white" : C.navy;
  const txt = darkMode ? "rgba(255,255,255,0.6)" : C.muted;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${C.blue}12`, border: `1px solid ${C.blue}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: head, marginBottom: 4, fontFamily: "'Outfit',sans-serif" }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: txt, lineHeight: 1.7 }}>{desc}</div>
      </div>
    </div>
  );
};

/* ─── Case Study Page ────────────────────────────────────────────────────────── */
export default function CaseStudiesPage() {
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("strydeos-theme");
    if (saved === "dark") setDarkMode(true);
  }, []);
  useEffect(() => { localStorage.setItem("strydeos-theme", darkMode ? "dark" : "light"); }, [darkMode]);

  const bg = darkMode ? "#060F1E" : C.cloudDancer;
  const bgAlt = darkMode ? C.navy : "white";
  const head = darkMode ? "white" : C.navy;
  const txt = darkMode ? "rgba(255,255,255,0.65)" : C.ink;
  const muted = darkMode ? "rgba(255,255,255,0.4)" : C.muted;
  const bdr = darkMode ? "rgba(255,255,255,0.07)" : C.border;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { font-family: 'Outfit', sans-serif; background: ${bg}; color: ${txt}; overflow-x: hidden; transition: background 0.3s ease; }
        ::selection { background: ${C.blue}33; }
        .serif { font-family: 'DM Serif Display', serif; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 768px) {
          .cs-metric-grid { grid-template-columns: 1fr 1fr !important; }
          .cs-header-grid { grid-template-columns: 1fr !important; }
          .cs-changed-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Top Bar ─────────────────────────────────────────────────────────────── */}
      <header style={{
        background: darkMode ? C.navy : "white",
        borderBottom: `1px solid ${bdr}`,
        padding: "0 24px",
        position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(20px)",
        transition: "all 0.3s ease",
      }}>
        <div style={{
          maxWidth: 960, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 64,
        }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
              <defs>
                <linearGradient id="cs-gc" x1="0.1" y1="0" x2="0.85" y2="1">
                  <stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.58"/>
                  <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72"/>
                </linearGradient>
                <clipPath id="cs-cp"><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
              </defs>
              <rect width="100" height="100" rx="24" fill="url(#cs-gc)"/>
              <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
              <g clipPath="url(#cs-cp)">
                <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </g>
            </svg>
            <span style={{
              fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15,
              color: head, letterSpacing: "-0.02em",
            }}>
              Stryde<span style={{ color: C.blueGlow }}>OS</span>
            </span>
          </a>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Case Study · March 2026
            </span>
            <button
              onClick={() => setDarkMode(d => !d)}
              style={{
                background: darkMode ? "rgba(255,255,255,0.06)" : `${C.blue}08`,
                border: `1.5px solid ${darkMode ? "rgba(255,255,255,0.2)" : C.border}`,
                borderRadius: 10, width: 34, height: 34,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: darkMode ? "rgba(255,255,255,0.75)" : C.ink,
                fontSize: 15, transition: "all 0.2s",
              }}
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────────── */}
      <section style={{
        padding: "80px 24px 60px", background: bg,
        transition: "background 0.3s ease",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", animation: "fadeUp 0.6s ease forwards" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px",
            borderRadius: 50, background: `${C.blue}12`, border: `1px solid ${C.blue}25`,
            color: C.blue, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
            textTransform: "uppercase", marginBottom: 24,
          }}>Case Study</div>

          <h1 className="serif" style={{
            fontSize: 52, color: head, fontWeight: 400, lineHeight: 1.08,
            maxWidth: 720, marginBottom: 28,
          }}>
            How a Notting Hill Physio Clinic Improved Clinician Performance in 6 Weeks
          </h1>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 0 }}>
            {["Notting Hill, London", "3 clinicians", "Connected PMS"].map(tag => (
              <span key={tag} style={{
                fontSize: 13, color: muted, fontWeight: 500,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.blue, opacity: 0.5 }} />
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ height: 1, background: bdr }} />
      </div>

      {/* ── The Problem ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: "64px 24px", background: bg, transition: "background 0.3s ease" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            color: C.blue, marginBottom: 20,
          }}>The Problem</div>

          <div className="cs-header-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
            <div>
              <p style={{ fontSize: 17, color: txt, lineHeight: 1.8 }}>
                The clinic had no per-clinician performance visibility. Follow-up rates, HEP assignment, DNA patterns, and utilisation were invisible at the individual level.
              </p>
              <p style={{ fontSize: 17, color: txt, lineHeight: 1.8, marginTop: 16 }}>
                The clinic was running on instinct — not data. Management conversations were based on impressions rather than evidence, and underperformance went undetected.
              </p>
            </div>

            <div style={{
              background: darkMode ? "rgba(255,255,255,0.03)" : `${C.blue}06`,
              border: `1px solid ${darkMode ? "rgba(255,255,255,0.07)" : `${C.blue}15`}`,
              borderRadius: 16, padding: "28px 28px",
              borderLeft: `3px solid ${C.blue}`,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 10,
                letterSpacing: "0.04em",
              }}>Key finding:</div>
              <p style={{ fontSize: 15, color: txt, lineHeight: 1.7 }}>
                One clinician's follow-up rate was <strong style={{ color: head }}>1.90</strong> — well below the clinic target of <strong style={{ color: head }}>2.9</strong>.
              </p>
              <p style={{ fontSize: 13, color: muted, lineHeight: 1.7, marginTop: 10 }}>
                Without per-clinician tracking, this gap was invisible to clinic management.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Intervention ────────────────────────────────────────────────────── */}
      <section style={{
        padding: "64px 24px", background: bgAlt,
        transition: "background 0.3s ease",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            color: C.blue, marginBottom: 20,
          }}>The Intervention</div>

          <p style={{ fontSize: 17, color: txt, lineHeight: 1.8, maxWidth: 680 }}>
            StrydeOS Intelligence was deployed to surface clinician-level KPIs from the clinic's existing PMS appointment data. Weekly dashboards tracked follow-up rate, HEP compliance, utilisation, and DNA rate per clinician.
          </p>
          <p style={{ fontSize: 17, color: txt, lineHeight: 1.8, maxWidth: 680, marginTop: 16 }}>
            Data was reviewed in weekly team check-ins to support targeted coaching — not blame.
          </p>
        </div>
      </section>

      {/* ── Results ─────────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 24px", background: bg, transition: "background 0.3s ease" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            color: C.blue, marginBottom: 12,
          }}>Results — 6-Week Clinician Trajectory</div>

          <div className="cs-metric-grid" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginTop: 32,
          }}>
            <MetricCard label="Follow-up Rate" before="1.90" after="2.50" isDown={false} darkMode={darkMode} />
            <MetricCard label="HEP Compliance" before="82%" after="91%" isDown={false} darkMode={darkMode} />
            <MetricCard label="DNA Rate" before="12%" after="7%" isDown={true} darkMode={darkMode} />
            <MetricCard label="Utilisation" before="80%" after="88%" isDown={false} darkMode={darkMode} />
          </div>

          {/* Revenue Impact */}
          <div style={{
            marginTop: 32, borderRadius: 20, overflow: "hidden",
            background: `linear-gradient(135deg, ${C.blue} 0%, ${C.navy} 100%)`,
            padding: "40px 48px",
            position: "relative",
          }}>
            <div style={{ position: "absolute", top: 0, right: 0, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.04)", transform: "translate(30%, -30%)" }} />
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: C.blueGlow, marginBottom: 12,
            }}>Projected Revenue Impact</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <span className="serif" style={{ fontSize: 52, color: "white", fontWeight: 400, lineHeight: 1 }}>
                ~£14,000
              </span>
              <span style={{ fontSize: 20, color: "rgba(255,255,255,0.7)", fontWeight: 400 }}>/yr</span>
            </div>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", marginTop: 10, lineHeight: 1.65 }}>
              Additional follow-up revenue across 2 clinicians at £75/session
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8, fontStyle: "italic" }}>
              Projection based on observed trajectory improvement × session rate. Not a guarantee.
            </p>
          </div>
        </div>
      </section>

      {/* ── What Changed ────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 24px", background: bgAlt, transition: "background 0.3s ease" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            color: C.blue, marginBottom: 40,
          }}>What Changed</div>

          <div className="cs-changed-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 40 }}>
            <ChangeItem
              darkMode={darkMode}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              }
              title="Clinician coaching"
              desc="Weekly data reviews replaced annual subjective appraisals. Specific, evidence-based conversations."
            />
            <ChangeItem
              darkMode={darkMode}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 12 15 16 10"/>
                </svg>
              }
              title="Accountability without blame"
              desc="Clinicians could see their own metrics and self-correct before management stepped in."
            />
            <ChangeItem
              darkMode={darkMode}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              }
              title="Operational confidence"
              desc="Clinic owner gained visibility into which clinicians were converting IAs into full courses."
            />
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────────── */}
      <section style={{
        padding: "80px 24px",
        background: darkMode ? "#060F1E" : C.cloudDancer,
        textAlign: "center",
        transition: "background 0.3s ease",
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 className="serif" style={{ fontSize: 36, color: head, fontWeight: 400, lineHeight: 1.15, marginBottom: 16 }}>
            See what your clinic is missing.
          </h2>
          <p style={{ fontSize: 15, color: muted, lineHeight: 1.7, marginBottom: 32 }}>
            Book a free 30-minute Clinical Performance Audit. We'll review your follow-up rate, HEP compliance, utilisation, and DNA rate against benchmarks.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <a href="https://calendly.com/hello-strydeos/30min" target="_blank" rel="noopener"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 32px", background: C.blue, color: "white",
                border: "none", borderRadius: 50,
                fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 600,
                cursor: "pointer", transition: "all 0.3s ease", textDecoration: "none",
              }}
              onMouseEnter={e => { e.target.style.background = C.blueBright; e.target.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.target.style.background = C.blue; e.target.style.transform = "translateY(0)"; }}
            >
              Book a demo
            </a>
            <a href="/"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "13px 28px", background: "transparent",
                color: darkMode ? "rgba(255,255,255,0.7)" : C.blue,
                border: `1.5px solid ${darkMode ? "rgba(255,255,255,0.2)" : C.blue}`,
                borderRadius: 50,
                fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 500,
                cursor: "pointer", transition: "all 0.3s ease", textDecoration: "none",
              }}
              onMouseEnter={e => { e.target.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.target.style.transform = "translateY(0)"; }}
            >
              Back to home
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#060F1E", padding: "40px 24px 24px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 14, color: "white", letterSpacing: "-0.02em" }}>
                Stryde<span style={{ color: C.blueGlow }}>OS</span>
              </span>
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>·</span>
              <a href="mailto:hello@strydeos.com" style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, textDecoration: "none" }}>hello@strydeos.com</a>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              {[
                { label: "Intelligence", href: "/intelligence" },
                { label: "Ava", href: "/ava" },
                { label: "Pulse", href: "/pulse" },
              ].map(({ label, href }) => (
                <a key={label} href={href} style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, textDecoration: "none", transition: "color 0.2s" }}
                  onMouseEnter={e => e.target.style.color = "rgba(255,255,255,0.7)"}
                  onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.25)"}
                >{label}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
