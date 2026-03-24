'use client';

import { useState, useEffect, useRef } from "react";
import BrightnessStackToggle from "./BrightnessStackToggle";

const C = {
  cloudDancer: "#F2F1EE", cloudLight: "#F9F8F6", cloudDark: "#E8E6E0", cream: "#FAF9F7",
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  teal: "#0891B2", purple: "#8B5CF6",
  ink: "#111827", muted: "#6B7280",
  success: "#059669", border: "#E2DFDA",
};

/* ─── Monolith variations ────────────────────────────────────────────────────── */
const MonolithVariant = ({ size = 64, accentFrom, accentTo, glowColor, label }) => {
  const id = useRef(`mv-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{
        filter: `drop-shadow(0 0 20px ${glowColor}40)`,
        transition: "filter 0.4s ease, transform 0.4s ease",
        cursor: "default",
      }}
        onMouseEnter={e => { e.currentTarget.style.filter = `drop-shadow(0 0 32px ${glowColor}60)`; e.currentTarget.style.transform = "translateY(-4px) scale(1.05)"; }}
        onMouseLeave={e => { e.currentTarget.style.filter = `drop-shadow(0 0 20px ${glowColor}40)`; e.currentTarget.style.transform = "translateY(0) scale(1)"; }}
      >
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      {label && (
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {label}
        </span>
      )}
    </div>
  );
};

/* ─── Contact Page ───────────────────────────────────────────────────────────── */
export default function ContactPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [formState, setFormState] = useState({ name: "", email: "", clinic: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

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
  const inputBg = darkMode ? "rgba(255,255,255,0.04)" : "white";
  const inputBdr = darkMode ? "rgba(255,255,255,0.12)" : C.border;
  const inputFocus = C.blue;

  const handleSubmit = (e) => {
    e.preventDefault();
    // Opens mailto as fallback — no backend needed
    const subject = encodeURIComponent(`Contact from ${formState.name} — ${formState.clinic || "Clinic enquiry"}`);
    const body = encodeURIComponent(`Name: ${formState.name}\nEmail: ${formState.email}\nClinic: ${formState.clinic}\n\n${formState.message}`);
    window.location.href = `mailto:hello@strydeos.com?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

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
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes glow-shift {
          0%,100% { opacity: 0.08; transform: translate(-50%,-50%) scale(1); }
          50% { opacity: 0.14; transform: translate(-50%,-50%) scale(1.1); }
        }
        input:focus, textarea:focus { outline: none; border-color: ${inputFocus} !important; box-shadow: 0 0 0 3px ${inputFocus}20 !important; }
        @media (max-width: 768px) {
          .contact-grid { grid-template-columns: 1fr !important; }
          .monolith-row { gap: 24px !important; }
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
          maxWidth: 1060, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 64,
        }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ct-gc" x1="0.1" y1="0" x2="0.85" y2="1">
                  <stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.58"/>
                  <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72"/>
                </linearGradient>
                <clipPath id="ct-cp"><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
              </defs>
              <rect width="100" height="100" rx="24" fill="url(#ct-gc)"/>
              <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07"/>
              <g clipPath="url(#ct-cp)">
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
            <BrightnessStackToggle
              size={16}
              isDark={darkMode}
              onToggle={(dark) => setDarkMode(dark)}
            />
          </div>
        </div>
      </header>

      {/* ── Hero: Monolith Showcase ─────────────────────────────────────────────── */}
      <section style={{
        padding: "80px 24px 40px",
        background: C.navy,
        position: "relative", overflow: "hidden",
        textAlign: "center",
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", width: 700, height: 700, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.blue} 0%, transparent 70%)`,
          opacity: 0.1, top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          animation: "glow-shift 6s ease-in-out infinite",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 2, animation: "fadeUp 0.6s ease forwards" }}>
          {/* Module Monoliths */}
          <div className="monolith-row" style={{
            display: "flex", justifyContent: "center", gap: 48, marginBottom: 48,
          }}>
            <MonolithVariant size={72} accentFrom="#2E6BFF" accentTo="#091D3E" glowColor={C.blue} label="Ava" />
            <MonolithVariant size={72} accentFrom="#0891B2" accentTo="#064E5C" glowColor={C.teal} label="Pulse" />
            <MonolithVariant size={72} accentFrom="#8B5CF6" accentTo="#3B1D8E" glowColor={C.purple} label="Intelligence" />
          </div>

          <h1 className="serif" style={{
            fontSize: 52, color: "white", fontWeight: 400, lineHeight: 1.08,
            marginBottom: 16, maxWidth: 600, margin: "0 auto 16px",
          }}>
            Let's talk about your clinic.
          </h1>

          <p style={{
            fontSize: 16, color: "rgba(255,255,255,0.45)", lineHeight: 1.7,
            maxWidth: 480, margin: "0 auto",
          }}>
            Whether you're exploring Intelligence, Ava, or the full stack — we start with your numbers and work from there.
          </p>
        </div>
      </section>

      {/* ── Contact Grid ────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 24px", background: bg, transition: "background 0.3s ease" }}>
        <div className="contact-grid" style={{
          maxWidth: 1060, margin: "0 auto",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start",
        }}>
          {/* Left: Info */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: C.blue, marginBottom: 20,
            }}>Get in touch</div>

            <h2 className="serif" style={{ fontSize: 36, color: head, fontWeight: 400, lineHeight: 1.15, marginBottom: 20 }}>
              30 minutes. No obligation.{" "}
              <span style={{ fontStyle: "italic", color: darkMode ? C.blueGlow : C.blue }}>Real numbers.</span>
            </h2>

            <p style={{ fontSize: 15, color: muted, lineHeight: 1.8, marginBottom: 40 }}>
              Book a free Clinical Performance Audit. We'll review your follow-up rate, HEP compliance, utilisation, and DNA rate against benchmarks — using your existing PMS data.
            </p>

            {/* Direct links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {[
                {
                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                  label: "Book a demo",
                  detail: "30-minute call via Calendly",
                  href: "https://calendly.com/hello-strydeos/30min",
                  external: true,
                },
                {
                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
                  label: "hello@strydeos.com",
                  detail: "We respond within 24 hours",
                  href: "mailto:hello@strydeos.com",
                },
                {
                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
                  label: "West Hampstead, London",
                  detail: "Built and validated at Spires Physiotherapy",
                },
              ].map(({ icon, label, detail, href, external }) => (
                <div key={label} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${C.blue}10`, border: `1px solid ${C.blue}18`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>{icon}</div>
                  <div>
                    {href ? (
                      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        style={{ fontSize: 15, fontWeight: 600, color: head, textDecoration: "none", transition: "color 0.2s" }}
                        onMouseEnter={e => e.target.style.color = C.blue}
                        onMouseLeave={e => e.target.style.color = head}
                      >{label}</a>
                    ) : (
                      <div style={{ fontSize: 15, fontWeight: 600, color: head }}>{label}</div>
                    )}
                    <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{detail}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust signals */}
            <div style={{
              marginTop: 48, paddingTop: 32,
              borderTop: `1px solid ${bdr}`,
              display: "flex", gap: 20, flexWrap: "wrap",
            }}>
              {["GDPR compliant", "UK hosted", "Encrypted", "No lock-in"].map(badge => (
                <span key={badge} style={{
                  fontSize: 11, color: muted, fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Form */}
          <div style={{
            background: bgAlt, border: `1px solid ${bdr}`, borderRadius: 20,
            padding: "40px 36px",
            transition: "all 0.3s ease",
          }}>
            {submitted ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: `${C.success}15`, border: `2px solid ${C.success}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px",
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 className="serif" style={{ fontSize: 24, color: head, fontWeight: 400, marginBottom: 8 }}>
                  Message ready
                </h3>
                <p style={{ fontSize: 14, color: muted, lineHeight: 1.65 }}>
                  Your email client should have opened. If not, drop us a line at{" "}
                  <a href="mailto:hello@strydeos.com" style={{ color: C.blue, textDecoration: "none" }}>hello@strydeos.com</a>
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: head, marginBottom: 4, fontFamily: "'Outfit',sans-serif" }}>
                    Send us a message
                  </h3>
                  <p style={{ fontSize: 13, color: muted }}>
                    Or book directly via{" "}
                    <a href="https://calendly.com/hello-strydeos/30min" target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none", fontWeight: 500 }}>
                      Calendly
                    </a>
                  </p>
                </div>

                {[
                  { id: "name", label: "Your name", type: "text", required: true },
                  { id: "email", label: "Email address", type: "email", required: true },
                  { id: "clinic", label: "Clinic name", type: "text", required: false },
                ].map(({ id, label, type, required }) => (
                  <div key={id} style={{ marginBottom: 18 }}>
                    <label htmlFor={id} style={{
                      display: "block", fontSize: 13, fontWeight: 500, color: head,
                      marginBottom: 6,
                    }}>{label}{required && <span style={{ color: C.blue }}> *</span>}</label>
                    <input
                      id={id} type={type} required={required}
                      value={formState[id]}
                      onChange={e => setFormState(s => ({ ...s, [id]: e.target.value }))}
                      style={{
                        width: "100%", padding: "12px 16px",
                        background: inputBg, border: `1.5px solid ${inputBdr}`,
                        borderRadius: 12, fontSize: 14, color: head,
                        fontFamily: "'Outfit',sans-serif",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                    />
                  </div>
                ))}

                <div style={{ marginBottom: 24 }}>
                  <label htmlFor="message" style={{
                    display: "block", fontSize: 13, fontWeight: 500, color: head,
                    marginBottom: 6,
                  }}>Message <span style={{ color: C.blue }}>*</span></label>
                  <textarea
                    id="message" required rows={4}
                    value={formState.message}
                    onChange={e => setFormState(s => ({ ...s, message: e.target.value }))}
                    style={{
                      width: "100%", padding: "12px 16px",
                      background: inputBg, border: `1.5px solid ${inputBdr}`,
                      borderRadius: 12, fontSize: 14, color: head,
                      fontFamily: "'Outfit',sans-serif", resize: "vertical",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                    }}
                    placeholder="Tell us about your practice — team size, PMS, what you're looking for..."
                  />
                </div>

                <button type="submit" style={{
                  width: "100%", padding: "14px 32px",
                  background: C.blue, color: "white",
                  border: "none", borderRadius: 50,
                  fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.3s ease",
                }}
                  onMouseEnter={e => { e.target.style.background = C.blueBright; e.target.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.target.style.background = C.blue; e.target.style.transform = "translateY(0)"; }}
                >
                  Send message
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Brand strip ─────────────────────────────────────────────────────────── */}
      <section style={{
        padding: "60px 24px",
        background: C.navy,
        textAlign: "center",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", width: 500, height: 500, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.purple} 0%, transparent 70%)`,
          opacity: 0.06, top: "50%", left: "20%", transform: "translate(-50%,-50%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", width: 400, height: 400, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.teal} 0%, transparent 70%)`,
          opacity: 0.05, top: "40%", right: "10%", transform: "translate(50%,-50%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 2, maxWidth: 700, margin: "0 auto" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", letterSpacing: "0.06em", marginBottom: 8 }}>
            Built at Spires Physiotherapy · West Hampstead, London
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.18)" }}>
            StrydeOS is a registered trademark. All product names are trademarks of their respective owners.
          </p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#060F1E", padding: "32px 24px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 14, color: "white", letterSpacing: "-0.02em" }}>
              Stryde<span style={{ color: C.blueGlow }}>OS</span>
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 12 }}>© 2026 StrydeOS Ltd.</span>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {[
              { label: "Home", href: "/" },
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
            ].map(({ label, href }) => (
              <a key={label} href={href} style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={e => e.target.style.color = "rgba(255,255,255,0.7)"}
                onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.25)"}
              >{label}</a>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
