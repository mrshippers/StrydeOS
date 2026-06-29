"use client";

import { useEffect, useRef, useState } from "react";

/* Brand tokens */
const C = {
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  ink: "#111827", muted: "#6B7280",
  cloud: "#F2F1EE", border: "#E2DFDA", success: "#059669", white: "#FFFFFF",
};

/* A real after-hours call, the way the live Ava graph runs it:
   answer -> check the live diary -> offer a real slot -> book it -> SMS confirm. */
const STEPS = [
  { who: "sys",    text: "Incoming call · 6:42 PM · after hours" },
  { who: "ava",    text: "Good evening, you've reached the clinic. How can I help?" },
  { who: "caller", text: "Hi, I've done my back in. Any chance of seeing someone this week?" },
  { who: "ava",    text: "Of course, sorry to hear that. Let me check the diary for you.", checking: true },
  { who: "ava",    text: "I've got Thursday at 5:30 or Friday at 9. Which suits you better?" },
  { who: "caller", text: "Thursday, please." },
  { who: "ava",    text: "Perfect, you're booked in for Thursday at 5:30. I'll text your confirmation now." },
  { who: "done" },
];

function Avatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${C.blueBright}, ${C.navy})`,
      boxShadow: `0 2px 8px ${C.blue}44, inset 0 1px 0 rgba(255,255,255,0.25)`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="13" height="13" viewBox="0 0 100 100" fill="none">
        <rect x="38" y="20" width="20" height="60" rx="5" fill="white" fillOpacity="0.92" />
        <polyline points="34,60 48,52 62,60" stroke="white" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

export default function AvaCallSample({ darkMode = false }) {
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0); // bump to replay
  const wrapRef = useRef(null);

  // theme
  const cardBg   = darkMode ? "rgba(255,255,255,0.035)" : C.white;
  const cardBdr  = darkMode ? "rgba(255,255,255,0.08)" : C.border;
  const headCol  = darkMode ? "#FFFFFF" : C.navy;
  const mutedCol = darkMode ? "rgba(255,255,255,0.5)" : C.muted;
  const avaBubble    = darkMode ? "rgba(28,84,242,0.16)" : "rgba(28,84,242,0.06)";
  const avaText      = darkMode ? "rgba(255,255,255,0.92)" : C.navy;
  const callerBubble = darkMode ? "rgba(255,255,255,0.06)" : "#F4F3F0";
  const callerText   = darkMode ? "rgba(255,255,255,0.82)" : C.ink;

  // Play once when scrolled into view
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(STEPS.length); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { setPlaying(true); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Sequenced reveal
  useEffect(() => {
    if (!playing) return;
    setShown(0);
    const timers = [];
    let t = 350;
    STEPS.forEach((s, i) => {
      timers.push(setTimeout(() => setShown(i + 1), t));
      t += s.checking ? 1950 : s.who === "done" ? 700 : 1150;
    });
    return () => timers.forEach(clearTimeout);
  }, [playing, run]);

  const replay = () => { setShown(0); setPlaying(false); requestAnimationFrame(() => { setRun((n) => n + 1); setPlaying(true); }); };
  const finished = shown >= STEPS.length;

  return (
    <section style={{ padding: "60px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        @keyframes acsIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes acsDot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-3px); opacity: 1; } }
        @keyframes acsShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes acsPing { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(1.8); opacity: 0; } }
      `}</style>

      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.blue, marginBottom: 14 }}>See it happen</div>
        <h2 className="serif" style={{ fontSize: "clamp(28px,4vw,40px)", fontWeight: 400, color: headCol, lineHeight: 1.12, margin: "0 0 12px" }}>
          A call you would have missed
        </h2>
        <p style={{ fontSize: 16, color: mutedCol, maxWidth: 520, margin: "0 auto 36px", lineHeight: 1.6 }}>
          6:42pm, front desk closed. Here is the same call playing out with Ava on the line.
        </p>
      </div>

      <div ref={wrapRef} style={{ maxWidth: 540, margin: "0 auto" }}>
        <div style={{
          background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: 24,
          padding: "22px 22px 18px", position: "relative",
          boxShadow: darkMode ? "0 20px 60px rgba(0,0,0,0.4)" : "0 12px 48px rgba(11,37,69,0.08)",
          minHeight: 420,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, marginBottom: 16, borderBottom: `1px solid ${cardBdr}` }}>
            <Avatar />
            <div style={{ flex: 1 }}>
              <div className="serif" style={{ fontSize: 18, color: headCol, lineHeight: 1.1 }}>Ava</div>
              <div style={{ fontSize: 11.5, color: mutedCol }}>Receptionist · StrydeOS</div>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: C.success }}>
              <span style={{ position: "relative", width: 7, height: 7 }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.success }} />
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.success, animation: "acsPing 1.6s ease-out infinite" }} />
              </span>
              On a call
            </div>
          </div>

          {/* Transcript */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {STEPS.slice(0, shown).map((s, i) => {
              if (s.who === "sys") {
                return (
                  <div key={i} style={{ textAlign: "center", animation: "acsIn 0.4s ease both" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 50,
                      background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(11,37,69,0.04)",
                      fontSize: 11, fontWeight: 500, color: mutedCol,
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                      {s.text}
                    </span>
                  </div>
                );
              }
              if (s.who === "done") {
                return (
                  <div key={i} style={{ animation: "acsIn 0.5s ease both", marginTop: 4 }}>
                    {/* SMS confirmation mock */}
                    <div style={{
                      background: `linear-gradient(135deg, ${C.blueBright}, ${C.blue})`, borderRadius: 16,
                      padding: "13px 15px", color: "white", maxWidth: 300, marginLeft: "auto",
                      boxShadow: `0 6px 18px ${C.blue}33`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", opacity: 0.8, marginBottom: 4 }}>SMS · JUST NOW</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>You're booked in for Thursday 5:30pm. Reply to reschedule. See you then.</div>
                    </div>
                    {/* Status ticks */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", justifyContent: "center", marginTop: 18 }}>
                      {["Booked into your diary", "SMS confirmation sent", "Logged for the front desk"].map((t) => (
                        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: darkMode ? "rgba(255,255,255,0.7)" : C.ink }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="7" fill={C.success} fillOpacity="0.12" /><path d="M4 7l2 2 4-4" stroke={C.success} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }
              const isAva = s.who === "ava";
              return (
                <div key={i} style={{ display: "flex", justifyContent: isAva ? "flex-start" : "flex-end", animation: "acsIn 0.45s ease both" }}>
                  <div style={{
                    maxWidth: "82%", padding: "11px 14px", borderRadius: 16,
                    borderBottomLeftRadius: isAva ? 4 : 16, borderBottomRightRadius: isAva ? 16 : 4,
                    background: isAva ? avaBubble : callerBubble,
                    color: isAva ? avaText : callerText,
                    fontSize: 14, lineHeight: 1.5,
                  }}>
                    {s.text}
                    {s.checking && (
                      <div style={{
                        marginTop: 9, display: "inline-flex", alignItems: "center", gap: 8,
                        fontSize: 11.5, fontWeight: 600, color: C.blue,
                        padding: "5px 10px", borderRadius: 50,
                        background: darkMode ? "rgba(28,84,242,0.18)" : "rgba(28,84,242,0.08)",
                      }}>
                        <span style={{ display: "inline-flex", gap: 3 }}>
                          {[0, 1, 2].map((d) => (
                            <span key={d} style={{ width: 4, height: 4, borderRadius: "50%", background: C.blue, animation: `acsDot 1.1s ${d * 0.15}s ease-in-out infinite` }} />
                          ))}
                        </span>
                        Checking live availability
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Replay */}
          {finished && (
            <div style={{ textAlign: "center", marginTop: 22, animation: "acsIn 0.5s ease both" }}>
              <button onClick={replay} style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 50,
                border: `1px solid ${cardBdr}`, background: "transparent", cursor: "pointer",
                fontFamily: "'Outfit',sans-serif", fontSize: 12.5, fontWeight: 600, color: mutedCol,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
                Replay the call
              </button>
            </div>
          )}
        </div>

        {/* Caption */}
        <p style={{ textAlign: "center", fontSize: 12.5, color: mutedCol, marginTop: 16, lineHeight: 1.5 }}>
          Same flow on every call, day or night. Prefer to hear it? Use the live demo and talk to Ava yourself.
        </p>
      </div>
    </section>
  );
}
