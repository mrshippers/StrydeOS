'use client';

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

// ─── Speech envelope: "stride clinical operating system" ─────────────────────
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
    const [t0, v0] = SPEECH[i];
    const [t1, v1] = SPEECH[i + 1];
    if (c >= t0 && c <= t1) {
      const frac = (c - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (3 * frac * frac - 2 * frac * frac * frac);
    }
  }
  return 0.03;
}

// ─── Monolith Mark ───────────────────────────────────────────────────────────
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
      <style>{`
        @keyframes idleBreathe {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
      <div style={{
        position: "absolute", inset: -4,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(75,139,245,${g}), transparent 68%)`,
        transform: `scale(${s})`,
        transition: playing ? "none" : "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
        animation: playing ? "none" : "idleBreathe 4s ease-in-out infinite",
      }} />

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

// ─── PS4 Cinematic Waveform ──────────────────────────────────────────────────
function Wave({ playing, progress, width = 420, height = 52 }) {
  const canvasRef = useRef(null);
  const frame = useRef(0);
  const t = useRef(0);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = playing ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, width, height);
    const bars = 60;
    for (let i = 0; i < bars; i++) {
      const x = (i / bars) * width;
      const envPos = progress + (i / bars) * 0.3;
      let amp = envelope(envPos % 1.0) * (0.4 + Math.sin(t.current * 0.08 + i * 0.1) * 0.15);
      if (Math.abs(progress - i / bars) < 0.05) amp *= 1.3;
      const h = Math.max(2, amp * height * 0.7);
      const y = (height - h) / 2;
      ctx.fillStyle = `rgba(75,139,245,${0.3 + amp * 0.5})`;
      ctx.fillRect(x + 1, y, width / bars - 2, h);
    }
    if (playing) {
      frame.current = requestAnimationFrame(draw);
    }
  }, [playing, progress, width, height]);

  useEffect(() => {
    if (playing) {
      t.current = 0;
      frame.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(frame.current);
  }, [draw, playing]);

  useEffect(() => {
    if (playing) t.current += 1;
  });

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: "block", width, height }} />;
}

// ─── Pill ────────────────────────────────────────────────────────────────────
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

// ─── Main ────────────────────────────────────────────────────────────────────
export default function AvaShowcase() {
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [glow, setGlow] = useState(0);
  const audioRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!playing) {
      setProgress(0);
      setGlow(0);
      return;
    }
    const tick = () => {
      if (!audioRef.current) return;
      const dur = audioRef.current.duration || 8.3;
      const curr = audioRef.current.currentTime || 0;
      setProgress(Math.max(0, Math.min(1, curr / dur)));
      setGlow(0.1 + Math.sin(Date.now() * 0.003) * 0.05);
      tickRef.current = requestAnimationFrame(tick);
    };
    tickRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(tickRef.current);
  }, [playing]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  if (!loaded) return null;

  return (
    <div style={{
      position: "relative",
      maxWidth: 440, width: "100%",
      borderRadius: 24,
      padding: 20,
      background: `linear-gradient(135deg, ${B.navy}dd, ${B.navyMid}aa)`,
      border: `1px solid rgba(75,139,245,0.15)`,
      boxShadow: "0 20px 60px rgba(11,37,69,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
      backdropFilter: "blur(20px)",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg, ${B.blue}, ${B.blueBright})` }}>
            <MonolithMark size={24} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: B.white, lineHeight: 1 }}>Ava</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>AI Receptionist • StrydeOS</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: B.white, lineHeight: 1 }}>12</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Calls today</div>
        </div>
      </div>

      {/* Status badges */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <Pill variant="connected">
          <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: B.success }} />
          Live
        </Pill>
        <Pill variant="accent">ElevenAgents</Pill>
        <Pill>PMS: Connected</Pill>
      </div>

      {/* Play button + waveform */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, background: "rgba(75,139,245,0.05)", borderRadius: 16, padding: 12 }}>
        <MonolithMark size={36} glow={glow} playing={playing} onClick={toggle} />
        <Wave playing={playing} progress={progress} width={320} height={40} />
      </div>

      {/* Demo transcript label */}
      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Demo transcript</div>

      {/* Placeholder for transcript (dark overlay) */}
      <div style={{
        borderRadius: 12, padding: 12,
        background: "rgba(0,0,0,0.2)", border: "1px solid rgba(75,139,245,0.08)",
        minHeight: 120,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center",
      }}>
        Play to hear a sample conversation
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} src="/ava-demo.mp3" onEnded={() => setPlaying(false)} />
    </div>
  );
}
