import { useState, useEffect, useRef, useCallback } from "react";

const B = {
  navy: "#0B2545", navyMid: "#132D5E",
  blue: "#1C54F2", blueBright: "#2E6BFF", blueGlow: "#4B8BF5",
  success: "#059669",
  cloud: "#F2F1EE", cloudLight: "#F9F8F6",
  white: "#FFFFFF",
  border: "#E2DFDA", borderSoft: "#EBE9E4",
  muted: "#8A8780", mutedSoft: "#A8A49E", ink: "#2C2A26",
};

// --- Speech envelope: "stride clinical operating system" ---------------------
const SPEECH = [
  [0.00,0.03],[0.03,0.75],[0.08,0.88],[0.13,0.12],
  [0.18,0.06],
  [0.21,0.55],[0.26,0.62],[0.29,0.28],[0.33,0.52],
  [0.39,0.05],
  [0.43,0.62],[0.49,0.48],[0.55,0.42],[0.61,0.50],
  [0.68,0.38],[0.73,0.05],
  [0.78,0.72],[0.84,0.78],[0.91,0.60],[0.96,0.22],
  [1.00,0.03],
];

function envelope(t) {
  const c = Math.max(0, Math.min(1, t));
  for (let i = 0; i < SPEECH.length - 1; i++) {
    const [t0, a0] = SPEECH[i], [t1, a1] = SPEECH[i + 1];
    if (c >= t0 && c <= t1) {
      const f = (c - t0) / (t1 - t0);
      return a0 + (a1 - a0) * f * f * (3 - 2 * f);
    }
  }
  return 0.03;
}

// --- Monolith Mark -----------------------------------------------------------
function MonolithMark({ size = 44, glow = 0, playing, onClick }) {
  const id = useRef(`m-${Math.random().toString(36).slice(2, 8)}`).current;
  const g = 0.06 + glow * 0.28;
  const s = 1 + glow * 0.1;

  return (
    <div onClick={onClick} title="Click to play" style={{
      position: "relative", cursor: "pointer",
      width: size + 22, height: size + 22,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {/* Glow field */}
      <div style={{
        position: "absolute", inset: -4,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(75,139,245,${g}), transparent 68%)`,
        transform: `scale(${s})`,
        transition: playing ? "none" : "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
        animation: playing ? "none" : "idleBreathe 4s ease-in-out infinite",
      }} />

      {/* Hint ring */}
      <div style={{
        position: "absolute",
        width: size + 10, height: size + 10,
        borderRadius: "50%",
        border: `1px solid rgba(75,139,245,${0.08 + glow * 0.2})`,
        transition: playing ? "border-color 0.06s linear" : "border-color 0.8s ease",
        animation: playing ? "none" : "idleBreathe 4s ease-in-out infinite",
      }} />

      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ position: "relative", zIndex: 1, filter: `drop-shadow(0 0 ${4 + glow * 12}px rgba(75,139,245,${0.1 + glow * 0.2}))` }}>
        <defs>
          <linearGradient id={`${id}-c`} x1=".1" y1="0" x2=".85" y2="1"><stop offset="0%" stopColor="#2E6BFF" stopOpacity=".58"/><stop offset="100%" stopColor="#091D3E" stopOpacity=".72"/></linearGradient>
          <radialGradient id={`${id}-r`} cx="28%" cy="24%" r="60%"><stop offset="0%" stopColor="#6AABFF" stopOpacity=".42"/><stop offset="100%" stopColor="#1C54F2" stopOpacity="0"/></radialGradient>
          <linearGradient id={`${id}-t`} x1=".05" y1="1" x2=".35" y2="0"><stop offset="0%" stopColor="white" stopOpacity=".55"/><stop offset="100%" stopColor="white" stopOpacity=".97"/></linearGradient>
          <linearGradient id={`${id}-b`} x1=".1" y1="0" x2=".4" y2="1"><stop offset="0%" stopColor="#7ABBFF" stopOpacity=".65"/><stop offset="100%" stopColor="#1C54F2" stopOpacity=".06"/></linearGradient>
          <clipPath id={`${id}-p`}><rect x="35" y="20" width="22" height="60" rx="5"/></clipPath>
          <clipPath id={`${id}-a`}><polygon points="35,52 57,40 57,20 35,20"/></clipPath>
        </defs>
        <rect width="100" height="100" rx="50" fill={`url(#${id}-c)`}/>
        <rect width="100" height="100" rx="50" fill={`url(#${id}-r)`}/>
        <rect width="100" height="100" rx="50" fill="none" stroke={`url(#${id}-b)`} strokeWidth="1.2"/>
        <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity=".07"/>
        <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity=".10"/>
        <g clipPath={`url(#${id}-p)`}>
          <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity=".20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity=".42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity=".72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </g>
        <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${id}-t)`} clipPath={`url(#${id}-a)`}/>
        <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity=".55" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// --- PS4 Cinematic Waveform --------------------------------------------------
function Wave({ playing, progress, width = 420, height = 52 }) {
  const canvasRef = useRef(null);
  const frame = useRef(0);
  const t = useRef(0);

  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = width * dpr, h = height * dpr;
    cvs.width = w; cvs.height = h;
    ctx.clearRect(0, 0, w, h);

    t.current += 0.008;
    const time = t.current;
    const cy = h / 2;

    const globalAmp = playing
      ? 0.25 + envelope(progress) * 0.75
      : 0.1 + Math.sin(time * 0.5) * 0.05;

    // --- Radial pulse sweep ---
    const pulsePos = playing
      ? (progress * 1.4 - 0.2)
      : (time * 0.12) % 1.6 - 0.3;
    const pulseWidth = 0.18;

    // --- Draw waves ---
    const layers = [
      { freq: 1.1, phase: 0, speed: 0.4, amp: 0.9, r: 75, g: 139, b: 245, baseA: 0.04, activeA: 0.14, w: 2.8 },
      { freq: 1.7, phase: 2.1, speed: -0.25, amp: 0.6, r: 46, g: 107, b: 255, baseA: 0.05, activeA: 0.18, w: 2.2 },
      { freq: 0.8, phase: 4.2, speed: 0.3, amp: 1.0, r: 75, g: 139, b: 245, baseA: 0.06, activeA: 0.22, w: 3.5 },
    ];

    layers.forEach(l => {
      ctx.beginPath();
      const alpha = l.baseA + globalAmp * l.activeA;
      ctx.strokeStyle = `rgba(${l.r},${l.g},${l.b},${alpha})`;
      ctx.lineWidth = l.w * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const pts = [];
      for (let x = 0; x <= w; x += 3) {
        const nx = x / w;
        const edge = Math.pow(Math.sin(nx * Math.PI), 1.5);
        const speechMod = playing ? (0.3 + envelope(nx) * 0.7) : 1;
        const amp = globalAmp * l.amp * edge * speechMod;

        const y = cy +
          Math.sin(nx * Math.PI * 2 * l.freq + l.phase + time * l.speed * 3) * (h * 0.32 * amp) +
          Math.sin(nx * Math.PI * 1.3 + l.phase * 0.7 + time * l.speed * 1.6) * (h * 0.14 * amp);

        pts.push([x, y]);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.beginPath();
      pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
      ctx.lineTo(w, cy);
      ctx.lineTo(0, cy);
      ctx.closePath();
      ctx.fillStyle = `rgba(${l.r},${l.g},${l.b},${alpha * 0.1})`;
      ctx.fill();
    });

    // --- Lightning pulse ---
    const pulseCenter = pulsePos * w;
    const pulseR = pulseWidth * w;

    if (pulsePos > -0.2 && pulsePos < 1.2) {
      const grad = ctx.createRadialGradient(pulseCenter, cy, 0, pulseCenter, cy, pulseR);
      const pulseStrength = playing ? 0.12 + envelope(progress) * 0.15 : 0.04;
      grad.addColorStop(0, `rgba(75, 139, 245, ${pulseStrength})`);
      grad.addColorStop(0.4, `rgba(122, 187, 255, ${pulseStrength * 0.5})`);
      grad.addColorStop(1, "rgba(75, 139, 245, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.beginPath();
      ctx.strokeStyle = `rgba(122, 187, 255, ${pulseStrength * 1.5})`;
      ctx.lineWidth = 1.5 * dpr;
      const coreSpread = pulseR * 0.6;
      for (let x = Math.max(0, pulseCenter - coreSpread); x <= Math.min(w, pulseCenter + coreSpread); x += 2) {
        const dx = (x - pulseCenter) / coreSpread;
        const fade = 1 - dx * dx;
        const coreY = cy + Math.sin(x / w * Math.PI * 3 + time * 2) * (h * 0.15 * globalAmp * fade);
        if (x === Math.max(0, pulseCenter - coreSpread)) ctx.moveTo(x, coreY); else ctx.lineTo(x, coreY);
      }
      ctx.stroke();
    }

    frame.current = requestAnimationFrame(draw);
  }, [playing, progress, width, height]);

  useEffect(() => {
    frame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame.current);
  }, [draw]);

  return <canvas ref={canvasRef} style={{ width, height, display: "block" }} />;
}

// --- Pill --------------------------------------------------------------------
function Pill({ children, variant = "default" }) {
  const s = {
    accent: { bg: "rgba(28,84,242,0.05)", color: B.blue, border: "rgba(28,84,242,0.08)" },
    connected: { bg: "rgba(5,150,105,0.05)", color: B.success, border: "rgba(5,150,105,0.08)" },
  }[variant] || { bg: "rgba(0,0,0,0.02)", color: B.mutedSoft, border: B.borderSoft };

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 13px", borderRadius: 50,
      fontSize: 12, fontWeight: 500, fontFamily: "'Outfit', sans-serif",
      color: s.color, backgroundColor: s.bg,
      border: `1px solid ${s.border}`, lineHeight: 1,
    }}>
      {children}
    </span>
  );
}

// --- Main --------------------------------------------------------------------
export default function AvaConversationCard() {
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [glow, setGlow] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => { requestAnimationFrame(() => setLoaded(true)); }, []);

  useEffect(() => {
    if (!playing) { setProgress(0); setGlow(0); return; }
    const tick = () => {
      const a = audioRef.current;
      if (a && a.duration && isFinite(a.duration)) {
        const p = a.currentTime / a.duration;
        setProgress(p);
        setGlow(envelope(p));
        setElapsed(Math.floor(a.currentTime));
      }
      tickRef.current = requestAnimationFrame(tick);
    };
    tickRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(tickRef.current);
  }, [playing]);

  const toggle = () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
    } else {
      const a = audioRef.current;
      if (a) {
        a.currentTime = 0;
        a.play().catch(() => {});
        a.onended = () => setPlaying(false);
      }
      setPlaying(true);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap');
        .ava-s * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes idleBreathe {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.06); opacity: 1; }
        }
      `}</style>

      <audio ref={audioRef} preload="none">
        <source src="/ava-demo.mp3" type="audio/mpeg" />
      </audio>

      <div className="ava-s" style={{
        fontFamily: "'Outfit', sans-serif",
        width: "100%", maxWidth: 520, margin: "0 auto",
      }}>
        <div style={{
          position: "relative",
          backgroundColor: B.cloud,
          borderRadius: 24,
          padding: "30px 30px 26px",
          border: `1px solid ${B.borderSoft}`,
          boxShadow: `
            0 1px 2px rgba(0,0,0,0.03),
            0 4px 24px rgba(0,0,0,0.04),
            0 12px 48px rgba(0,0,0,0.02)
          `,
          overflow: "hidden",
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(10px)",
          transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>

          {/* Minority Report gloss - top catch-light */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            height: 100,
            background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 30%, transparent 100%)",
            borderRadius: "24px 24px 0 0",
            pointerEvents: "none",
          }} />

          {/* Glass gloss - diagonal sheen through the full card */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.08) 100%)",
            pointerEvents: "none",
            borderRadius: 24,
          }} />

          {/* Subtle side sheen */}
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: 1,
            background: "linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0.1), transparent)",
            pointerEvents: "none",
          }} />

          {/* Avatar + Name */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14, marginBottom: 18,
            position: "relative",
          }}>
            <MonolithMark size={52} glow={glow} playing={playing} onClick={toggle} />

            <div style={{ flex: 1 }}>
              <h2 style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 26, fontWeight: 400, color: B.ink,
                lineHeight: 1.1, marginBottom: 3,
                letterSpacing: "-0.01em",
              }}>Ava</h2>
              <p style={{
                fontSize: 13, color: B.mutedSoft, fontWeight: 400,
                letterSpacing: "0.005em",
              }}>
                Receptionist &middot; StrydeOS
              </p>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 24, color: B.ink, lineHeight: 1, marginBottom: 2,
                letterSpacing: "-0.01em",
              }}>12</div>
              <div style={{
                fontSize: 9, fontWeight: 500, color: B.mutedSoft,
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>Calls today</div>
            </div>
          </div>

          {/* Pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18, position: "relative" }}>
            <Pill variant="accent">ElevenAgents</Pill>
            <Pill variant="connected">
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                backgroundColor: B.success,
                display: "inline-block",
                boxShadow: `0 0 5px ${B.success}50, 0 0 10px ${B.success}20`,
              }} />
              Connected
            </Pill>
          </div>

          {/* Waveform Bar */}
          <div style={{
            padding: "8px 14px",
            borderRadius: 16,
            backgroundColor: B.white,
            border: `1px solid ${B.borderSoft}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.02)",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: playing
                ? `radial-gradient(ellipse 60% 100% at 50% 50%, rgba(75,139,245,0.04), transparent 70%)`
                : "none",
              transition: "all 0.5s ease",
              pointerEvents: "none",
            }} />

            <Wave
              playing={playing}
              progress={progress}
              width={440}
              height={44}
            />
          </div>

          {/* Duration + hint */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: 10, position: "relative",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              opacity: playing ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}>
              <Wave
                playing={playing}
                progress={progress}
                width={48}
                height={16}
              />
              <span style={{
                fontSize: 10, fontWeight: 400, color: B.mutedSoft,
                fontVariantNumeric: "tabular-nums",
              }}>
                {elapsed}s
              </span>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 400, color: B.mutedSoft,
              opacity: playing ? 0 : 0.6,
              transition: "opacity 0.4s ease",
              fontStyle: "italic",
            }}>
              tap the monolith to listen
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
