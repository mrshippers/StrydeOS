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

// ——— Speech envelope —————————————————————————————————————————————————————————
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

// ——— Downsample float32 PCM to target sample rate ————————————————————————————
function downsample(buffer, inRate, outRate) {
  if (inRate === outRate) return buffer;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.round(buffer.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), buffer.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += buffer[j];
    out[i] = sum / (end - start);
  }
  return out;
}

// ——— Monolith Mark (FIX #1: hover scale) —————————————————————————————————————
function MonolithMark({ size = 44, glow = 0, playing, onClick }) {
  const id = useRef(`m-${Math.random().toString(36).slice(2, 8)}`).current;
  const [hovered, setHovered] = useState(false);
  const g = 0.06 + glow * 0.28;
  const s = 1 + glow * 0.1;
  const hoverScale = hovered && !playing ? 1.06 : 1;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Click to play"
      style={{
        position: "relative", cursor: "pointer",
        width: size + 22, height: size + 22,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        transform: `scale(${hoverScale})`,
        transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
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
        border: `1px solid rgba(75,139,245,${hovered ? 0.25 : 0.08 + glow * 0.2})`,
        transition: playing ? "border-color 0.06s linear" : "all 0.4s ease",
        animation: playing ? "none" : "idleBreathe 4s ease-in-out infinite",
      }} />

      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{
        position: "relative", zIndex: 1,
        filter: `drop-shadow(0 0 ${4 + glow * 12}px rgba(75,139,245,${0.1 + glow * 0.2}))`,
      }}>
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

// ——— PS4 Cinematic Waveform (FIX #5: ref-based progress) —————————————————————
function Wave({ playingRef, progressRef, width = 420, height = 52 }) {
  const canvasRef = useRef(null);
  const frame = useRef(0);
  const t = useRef(0);

  useEffect(() => {
    const draw = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const w = width * dpr, h = height * dpr;
      cvs.width = w; cvs.height = h;
      ctx.clearRect(0, 0, w, h);

      t.current += 0.005;
      const time = t.current;
      const cy = h / 2;
      const isPlaying = playingRef.current;
      const progress = progressRef.current;

      const globalAmp = isPlaying
        ? 0.3 + envelope(progress) * 0.7
        : 0.14 + Math.sin(time * 0.35) * 0.06;

      const pulsePos = isPlaying
        ? (progress * 1.4 - 0.2)
        : (time * 0.08) % 1.6 - 0.3;
      const pulseWidth = 0.22;

      const layers = [
        { freq: 0.7, phase: 0, speed: 0.25, amp: 1.0, r: 55, g: 120, b: 245, baseA: 0.06, activeA: 0.22, lw: 3.2 },
        { freq: 1.2, phase: 1.8, speed: -0.18, amp: 0.7, r: 28, g: 84, b: 242, baseA: 0.08, activeA: 0.26, lw: 2.5 },
        { freq: 0.5, phase: 3.6, speed: 0.2, amp: 1.1, r: 75, g: 139, b: 245, baseA: 0.08, activeA: 0.30, lw: 4.0 },
      ];

      layers.forEach(l => {
        ctx.beginPath();
        const alpha = l.baseA + globalAmp * l.activeA;
        ctx.strokeStyle = `rgba(${l.r},${l.g},${l.b},${alpha})`;
        ctx.lineWidth = l.lw * dpr;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const pts = [];
        for (let x = 0; x <= w; x += 3) {
          const nx = x / w;
          const edge = Math.pow(Math.sin(nx * Math.PI), 1.5);
          const speechMod = isPlaying ? (0.3 + envelope(nx) * 0.7) : 1;
          const amp = globalAmp * l.amp * edge * speechMod;
          const y = cy +
            Math.sin(nx * Math.PI * 2 * l.freq + l.phase + time * l.speed * 2.2) * (h * 0.38 * amp) +
            Math.sin(nx * Math.PI * 0.9 + l.phase * 0.5 + time * l.speed * 1.1) * (h * 0.18 * amp);
          pts.push([x, y]);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.beginPath();
        pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
        ctx.lineTo(w, cy);
        ctx.lineTo(0, cy);
        ctx.closePath();
        ctx.fillStyle = `rgba(${l.r},${l.g},${l.b},${alpha * 0.15})`;
        ctx.fill();
      });

      // Lightning pulse
      const pulseCenter = pulsePos * w;
      const pulseR = pulseWidth * w;

      if (pulsePos > -0.2 && pulsePos < 1.2) {
        const grad = ctx.createRadialGradient(pulseCenter, cy, 0, pulseCenter, cy, pulseR);
        const pulseStrength = isPlaying ? 0.16 + envelope(progress) * 0.2 : 0.05;
        grad.addColorStop(0, `rgba(55, 120, 245, ${pulseStrength})`);
        grad.addColorStop(0.35, `rgba(100, 170, 255, ${pulseStrength * 0.6})`);
        grad.addColorStop(1, "rgba(55, 120, 245, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.beginPath();
        ctx.strokeStyle = `rgba(100, 170, 255, ${pulseStrength * 1.8})`;
        ctx.lineWidth = 1.8 * dpr;
        const coreSpread = pulseR * 0.6;
        for (let x = Math.max(0, pulseCenter - coreSpread); x <= Math.min(w, pulseCenter + coreSpread); x += 2) {
          const dx = (x - pulseCenter) / coreSpread;
          const fade = 1 - dx * dx;
          const coreY = cy + Math.sin(x / w * Math.PI * 2.2 + time * 1.3) * (h * 0.18 * globalAmp * fade);
          if (x === Math.max(0, pulseCenter - coreSpread)) ctx.moveTo(x, coreY); else ctx.lineTo(x, coreY);
        }
        ctx.stroke();
      }

      frame.current = requestAnimationFrame(draw);
    };

    frame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame.current);
  }, [width, height]); // Only re-init on size change

  return <canvas ref={canvasRef} style={{ width, height, display: "block" }} />;
}

// ——— Mini Waveform (FIX #2: lightweight SVG, no canvas) ——————————————————————
function MiniWave({ playing }) {
  const bars = [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.45, 0.75, 0.55, 0.85, 0.5, 0.7];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1.5, height: 14 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 2, borderRadius: 1,
          backgroundColor: playing ? B.blueGlow : B.borderSoft,
          height: `${h * 100}%`,
          transition: "background-color 0.3s ease",
          animation: playing
            ? `miniPulse 1s ease-in-out ${i * 0.07}s infinite alternate`
            : `miniIdle 4s ease-in-out ${i * 0.2}s infinite alternate`,
        }} />
      ))}
    </div>
  );
}

// ——— Pill ————————————————————————————————————————————————————————————————————
function Pill({ children, variant = "default" }) {
  const s = {
    accent:     { bg: "rgba(28,84,242,0.04)", color: B.blue,      border: "rgba(28,84,242,0.07)" },
    connected:  { bg: "rgba(5,150,105,0.04)", color: B.success,   border: "rgba(5,150,105,0.07)" },
    connecting: { bg: "rgba(217,119,6,0.05)", color: "#B45309",   border: "rgba(217,119,6,0.10)" },
    error:      { bg: "rgba(220,38,38,0.05)", color: "#B91C1C",   border: "rgba(220,38,38,0.10)" },
  }[variant] || { bg: "rgba(0,0,0,0.02)", color: B.mutedSoft, border: B.borderSoft };

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 10px", borderRadius: 50,
      fontSize: 10, fontWeight: 500, fontFamily: "'Outfit', sans-serif",
      color: s.color, backgroundColor: s.bg,
      border: `1px solid ${s.border}`, lineHeight: 1,
      transition: "background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease",
    }}>
      {children}
    </span>
  );
}

// ——— Main ————————————————————————————————————————————————————————————————————
const MAX_ACTIVATIONS = 2; // hard cap per page load to prevent API abuse

export default function AvaShowcase() {
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [connectionState, setConnectionState] = useState("idle"); // "idle" | "connecting" | "connected" | "error"
  const [errorMsg, setErrorMsg] = useState("");
  const [activations, setActivations] = useState(0);
  const [glow, setGlow] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cardHover, setCardHover] = useState(false);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioNodesRef = useRef(null); // { source, processor }
  const audioChunksRef = useRef([]);
  const tickRef = useRef(null);
  const keepaliveRef = useRef(null);

  // Refs for canvas
  const playingRef = useRef(false);
  const progressRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { requestAnimationFrame(() => setLoaded(true)); }, []);

  // Centralised teardown so every end-path cleans up identically
  const tearDown = useCallback(() => {
    try { wsRef.current?.close(); } catch (e) {}
    wsRef.current = null;
    try { mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive" && mediaRecorderRef.current.stop(); } catch (e) {}
    mediaRecorderRef.current = null;
    try { audioStreamRef.current?.getTracks().forEach(t => t.stop()); } catch (e) {}
    audioStreamRef.current = null;
    try { audioNodesRef.current?.processor?.disconnect(); } catch (e) {}
    try { audioNodesRef.current?.source?.disconnect(); } catch (e) {}
    audioNodesRef.current = null;
    if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }
    setPlaying(false);
  }, []);

  // Tear down on unmount
  useEffect(() => () => tearDown(), [tearDown]);

  // Progress animation loop
  useEffect(() => {
    if (!playing) {
      progressRef.current = 0;
      setGlow(0);
      elapsedRef.current = 0;
      setElapsed(0);
      return;
    }
    const tick = () => {
      elapsedRef.current += 0.016;
      progressRef.current = Math.min(elapsedRef.current / 30, 1);
      setGlow(envelope(progressRef.current));
      setElapsed(Math.floor(elapsedRef.current));
      tickRef.current = requestAnimationFrame(tick);
    };
    tickRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(tickRef.current);
  }, [playing]);

  const toggle = async () => {
    // Stop path: always end the call cleanly and return to idle
    if (playing || connectionState === "connecting") {
      tearDown();
      setConnectionState("idle");
      return;
    }

    // Hard activation cap (per page load) — prevents button-mashing bleeding API credits
    if (activations >= MAX_ACTIVATIONS) {
      setConnectionState("error");
      setErrorMsg("Demo limit reached. Refresh to try again.");
      return;
    }

    // Feature detection — surface support gaps as inline state instead of dropping into try/catch
    if (typeof window === "undefined" ||
        typeof window.WebSocket === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof window.MediaRecorder === "undefined" ||
        !(window.AudioContext || window.webkitAudioContext)) {
      setConnectionState("error");
      setErrorMsg("Live demo isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }

    setConnectionState("connecting");
    setErrorMsg("");
    setActivations(n => n + 1);

    try {
      // Request mic access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      // Initialize AudioContext if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        console.log("[Ava] Created new AudioContext");
      }
      const audioContext = audioContextRef.current;

      // Resume audio context if suspended (browser requirement for audio playback)
      if (audioContext.state === "suspended") {
        await audioContext.resume();
        console.log("[Ava] Resumed suspended AudioContext");
      }

      // Setup MediaRecorder — wrap in try so Windows/Edge codec rejection surfaces as UI error, not crash
      let mediaRecorder;
      try {
        const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("audio/webm")
          ? "audio/webm"
          : undefined; // let the browser pick its own default
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (err) {
        console.error("[Ava] MediaRecorder unsupported:", err);
        setConnectionState("error");
        setErrorMsg("Audio recording isn't supported in this browser.");
        tearDown();
        return;
      }
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (ev) => {
        audioChunksRef.current.push(ev.data);
      };

      // Connect WebSocket
      const ws = new WebSocket(
        "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_6301kp6cxhx4e3vt35a2vbd9m8wq"
      );
      wsRef.current = ws;

      // Connection timeout failsafe — surface as inline error, don't alert()
      const connectionTimeout = setTimeout(() => {
        console.error("[Ava] WebSocket timeout. readyState=", ws.readyState);
        setConnectionState("error");
        setErrorMsg("Couldn't reach the voice service. Check your connection and try again.");
        tearDown();
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        mediaRecorder.start(100);

        keepaliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);

        setPlaying(true);
        setConnectionState("connected");
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[Ava] Received message type:", data.type);

          // ElevenLabs sends audio in audio_event.audio_base_64 (PCM16 @ 16000 Hz)
          if (data.type === "audio") {
            const b64 = data.audio_event?.audio_base_64;
            if (!b64 || typeof b64 !== "string" || b64.length === 0) {
              console.warn("[Ava] audio message missing audio_event.audio_base_64");
              return;
            }

            if (audioContextRef.current && audioContextRef.current.state === "suspended") {
              await audioContextRef.current.resume();
            }

            try {
              const raw = atob(b64);
              const uint8 = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) uint8[i] = raw.charCodeAt(i);

              const int16 = new Int16Array(uint8.buffer);
              const float32 = new Float32Array(int16.length);
              for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

              if (audioContextRef.current) {
                const ctx = audioContextRef.current;
                // ElevenLabs sends PCM16 @ 16000 Hz — use 16000 so browser resamples correctly
                const audioBuffer = ctx.createBuffer(1, float32.length, 16000);
                audioBuffer.getChannelData(0).set(float32);
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.start(0);
                console.log(`[Ava] ✓ Playing ${float32.length} samples @ 16000 Hz`);
              }
            } catch (err) {
              console.error("[Ava] ✗ Audio decode failed:", err.message);
            }
          }

          if (data.type === "conversation_initiation_metadata") {
            console.log("[Ava] Session initiated:", data.conversation_initiation_metadata_event?.conversation_id);
          }

          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", event_id: data.ping_event?.event_id }));
          }

          if (data.type === "user_transcript") {
            console.log(`[Ava] 👤 User said: "${data.user_transcription_event?.user_transcript}"`);
          }

          if (data.type === "agent_response") {
            console.log(`[Ava] 🤖 Agent: "${data.agent_response_event?.agent_response}"`);
          }
        } catch (err) {
          console.error("[Ava] Error processing message:", err);
        }
      };

      ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        console.error("[Ava] WebSocket error (readyState=" + ws.readyState + "):", event);
        // Don't alert — set inline state. onclose will follow and fully tear down.
        setConnectionState("error");
        setErrorMsg("Voice service error. Try again in a moment.");
      };

      ws.onclose = () => {
        clearTimeout(connectionTimeout);
        // If we were in error, keep that state so the user sees the message. Otherwise return to idle.
        setConnectionState(prev => (prev === "error" ? "error" : "idle"));
        tearDown();
      };

      // Stream user audio chunks to the WebSocket
      mediaRecorder.onstop = () => {
        audioChunksRef.current = [];
      };

      // Send audio chunks as they are recorded
      const audioContext_ = audioContextRef.current;
      const source = audioContext_.createMediaStreamSource(stream);
      const processor = audioContext_.createScriptProcessor(4096, 1, 1);
      audioNodesRef.current = { source, processor };

      processor.onaudioprocess = (e) => {
        try {
          const rawFloat = e.inputBuffer.getChannelData(0);

          // Downsample from browser native rate (44100/48000) to 16000 Hz (ElevenLabs requirement)
          const pcm16k = downsample(rawFloat, audioContext_.sampleRate, 16000);

          // Convert float32 → int16 PCM
          const int16 = new Int16Array(pcm16k.length);
          for (let i = 0; i < pcm16k.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, pcm16k[i] * 32768));
          }

          // Int16 bytes → base64
          const uint8 = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
          let bin = "";
          for (let i = 0; i < uint8.length; i++) bin += String.fromCharCode(uint8[i]);
          const b64 = btoa(bin);

          if (ws && ws.readyState === WebSocket.OPEN) {
            // ElevenLabs ConvAI expects user_audio_chunk (not type:"audio")
            ws.send(JSON.stringify({ user_audio_chunk: b64 }));
          } else {
            console.warn(`[Ava] WebSocket not ready (readyState=${ws?.readyState})`);
          }
        } catch (err) {
          console.error("[Ava] Error encoding audio:", err);
        }
      };

      source.connect(processor);
      processor.connect(audioContext_.destination);
    } catch (error) {
      console.error("[Ava] Fatal error in toggle():", error);
      const msg =
        error.name === "NotAllowedError" ? "Microphone access denied." :
        error.name === "NotFoundError"   ? "No microphone detected." :
        error.name === "NotSupportedError" ? "Browser not supported. Try Chrome, Edge, or Safari." :
        error.message || "Something went wrong. Try again.";
      setConnectionState("error");
      setErrorMsg(msg);
      tearDown();
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
        @keyframes miniPulse {
          0% { transform: scaleY(0.5); }
          100% { transform: scaleY(1); }
        }
        @keyframes miniIdle {
          0% { transform: scaleY(0.6); opacity: 0.35; }
          100% { transform: scaleY(1); opacity: 0.65; }
        }
        @keyframes connectedPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.85); }
        }
      `}</style>

      {/* DEBUG: State Monitor */}
      {typeof window !== 'undefined' && window.location?.hash === '#debug' && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0,
          backgroundColor: "rgba(0,0,0,0.9)", color: "#00ff00",
          fontFamily: "monospace", fontSize: 11, padding: 8, zIndex: 9999,
          borderBottom: "2px solid #00ff00",
        }}>
          <div>[Ava DEBUG] playing={String(playing)} | glow={glow.toFixed(2)} | elapsed={elapsed}s | cardHover={String(cardHover)}</div>
          <div>[Ava DEBUG] ws={wsRef.current ? wsRef.current.readyState : "null"} | mediaRecorder={mediaRecorderRef.current ? mediaRecorderRef.current.state : "null"}</div>
        </div>
      )}

      <div className="ava-s" style={{
        fontFamily: "'Outfit', sans-serif",
        width: "100%", maxWidth: 520, margin: "0 auto",
        marginTop: typeof window !== 'undefined' && window.location?.hash === '#debug' ? 60 : 0,
      }}>
        {/* FIX #4: card hover lift */}
        <div
          onMouseEnter={() => setCardHover(true)}
          onMouseLeave={() => setCardHover(false)}
          style={{
            position: "relative",
            backgroundColor: B.cloud,
            borderRadius: 24,
            padding: "30px 30px 22px",
            border: `1px solid ${cardHover ? "rgba(255,255,255,0.6)" : B.borderSoft}`,
            boxShadow: cardHover
              ? `0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06), 0 16px 56px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)`
              : `0 1px 2px rgba(0,0,0,0.03), 0 4px 24px rgba(0,0,0,0.04), 0 12px 48px rgba(0,0,0,0.02)`,
            transform: cardHover ? "translateY(-2px)" : "translateY(0)",
            overflow: "hidden",
            opacity: loaded ? 1 : 0,
            transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >

          {/* ——— PS5 Glass layers ——— */}

          {/* Layer 1: Top catch-light */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            height: 110,
            background: "linear-gradient(180deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.2) 25%, rgba(255,255,255,0.06) 50%, transparent 100%)",
            borderRadius: "24px 24px 0 0",
            pointerEvents: "none",
          }} />

          {/* Layer 2: Full diagonal sheen */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: `linear-gradient(
              135deg,
              rgba(255,255,255,0.4) 0%,
              rgba(255,255,255,0.12) 20%,
              rgba(255,255,255,0) 45%,
              rgba(255,255,255,0) 55%,
              rgba(255,255,255,0.06) 80%,
              rgba(255,255,255,0.15) 100%
            )`,
            pointerEvents: "none", borderRadius: 24,
          }} />

          {/* Layer 3: Radial light source */}
          <div style={{
            position: "absolute", top: -40, left: -40,
            width: 280, height: 280, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.2), transparent 65%)",
            pointerEvents: "none",
          }} />

          {/* Layer 4: Bottom edge reflection */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
            pointerEvents: "none",
          }} />

          {/* Layer 5: Left edge sheen */}
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: 1,
            background: "linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.15), transparent)",
            pointerEvents: "none",
          }} />

          {/* Layer 6: Inner border highlight */}
          <div style={{
            position: "absolute", top: 1, left: 1, right: 1, bottom: 1,
            borderRadius: 23,
            border: "1px solid rgba(255,255,255,0.25)",
            pointerEvents: "none",
          }} />

          {/* ——— Avatar + Name ——— */}
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

          {/* ——— Pills — status reflects real WebSocket state ——— */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 5, marginBottom: 18, position: "relative",
            maxWidth: "70%", margin: "0 auto 18px",
            maskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)",
          }}>
            {connectionState === "connected" ? (
              <Pill variant="connected">
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  backgroundColor: B.success,
                  display: "inline-block",
                  boxShadow: `0 0 5px ${B.success}50, 0 0 10px ${B.success}20`,
                  animation: "connectedPulse 1.6s ease-in-out infinite",
                }} />
                Connected
              </Pill>
            ) : connectionState === "connecting" ? (
              <Pill variant="connecting">
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  backgroundColor: "#D97706",
                  display: "inline-block",
                  animation: "connectedPulse 0.9s ease-in-out infinite",
                }} />
                Connecting…
              </Pill>
            ) : connectionState === "error" ? (
              <Pill variant="error">
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  backgroundColor: "#DC2626",
                  display: "inline-block",
                }} />
                {errorMsg || "Connection error"}
              </Pill>
            ) : (
              <Pill variant="default">
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  backgroundColor: B.mutedSoft,
                  display: "inline-block",
                }} />
                Not connected
              </Pill>
            )}
            <Pill variant="accent">ElevenLabs</Pill>
          </div>

          {/* ——— Waveform Bar ——— */}
          <div style={{
            padding: "8px 14px",
            borderRadius: 16,
            backgroundColor: B.white,
            border: `1px solid ${B.borderSoft}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.02), 0 1px 0 rgba(255,255,255,0.5)",
          }}>
            {/* Inner glow when playing */}
            <div style={{
              position: "absolute", inset: 0,
              background: playing
                ? `radial-gradient(ellipse 60% 100% at 50% 50%, rgba(75,139,245,0.04), transparent 70%)`
                : "none",
              transition: "all 0.5s ease",
              pointerEvents: "none",
            }} />

            <Wave
              playingRef={playingRef}
              progressRef={progressRef}
              width={440}
              height={44}
            />
          </div>

          {/* ——— Footer: mini wave + elapsed/duration + hint ——— */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: 10, position: "relative",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              opacity: playing ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}>
              <MiniWave playing={playing} />
              <span style={{
                fontSize: 10, fontWeight: 400, color: B.mutedSoft,
                fontVariantNumeric: "tabular-nums",
                minWidth: 30,
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
              {activations >= MAX_ACTIVATIONS
                ? "demo limit reached — refresh to retry"
                : activations === 0
                  ? "tap the monolith to talk to Ava"
                  : `${MAX_ACTIVATIONS - activations} demo call${MAX_ACTIVATIONS - activations === 1 ? "" : "s"} left`}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
