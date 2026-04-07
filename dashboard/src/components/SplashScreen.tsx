"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/* ─── Timing constants (ms) — match the standalone HTML exactly ─── */
const AUTO_DISMISS_MS = 3200;
const EXIT_WIPE_MS = 700;
const EXIT_DELAY_MS = 250;

/**
 * Full-viewport splash overlay with procedural diagonal waveform,
 * light streak, ambient glow, particles, monolith mark + wordmark,
 * and progress bar. Pure CSS + canvas — no animation libraries.
 *
 * Props:
 *  onComplete — called after the exit wipe finishes (parent can unmount)
 */
export default function SplashScreen({ onComplete }: { onComplete?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const splashRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [exiting, setExiting] = useState(false);

  /* ─── Freeform flowing ribbons — PlayStation-style (canvas) ─── */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const cx = cv.getContext("2d");
    if (!cx) return;

    let W = 0;
    let H = 0;

    function resize() {
      W = cv!.width = window.innerWidth;
      H = cv!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const t0 = performance.now();

    /* Organic noise: stack multiple sine harmonics for non-repeating flow */
    function flow(x: number, t: number, seed: number) {
      return (
        Math.sin(x * 0.0018 + t * 0.7 + seed) * 1.0 +
        Math.sin(x * 0.0041 + t * 1.1 + seed * 2.3) * 0.6 +
        Math.sin(x * 0.0074 + t * 0.5 + seed * 4.1) * 0.35 +
        Math.sin(x * 0.0112 + t * 1.6 + seed * 0.7) * 0.2 +
        Math.sin(x * 0.0023 + t * 0.3 + seed * 5.8) * 0.8
      );
    }

    /* Ribbon configs — each one is a flowing organic band */
    const ribbons = [
      { seed: 0.0, amp: 75, width: 120, speed: 0.8, delay: 0.0, r: 28, g: 84, b: 242, peakAlpha: 0.1 },
      { seed: 2.4, amp: 90, width: 90, speed: 0.65, delay: 0.12, r: 46, g: 107, b: 255, peakAlpha: 0.12 },
      { seed: 4.8, amp: 65, width: 140, speed: 0.9, delay: 0.06, r: 75, g: 139, b: 245, peakAlpha: 0.08 },
      { seed: 1.6, amp: 100, width: 70, speed: 0.55, delay: 0.18, r: 46, g: 107, b: 255, peakAlpha: 0.14 },
      { seed: 6.2, amp: 55, width: 160, speed: 1.0, delay: 0.24, r: 28, g: 84, b: 242, peakAlpha: 0.07 },
      { seed: 3.7, amp: 85, width: 50, speed: 0.7, delay: 0.1, r: 106, g: 171, b: 255, peakAlpha: 0.1 },
      { seed: 8.1, amp: 70, width: 100, speed: 0.85, delay: 0.15, r: 75, g: 139, b: 245, peakAlpha: 0.09 },
    ];

    function draw(t: number) {
      const e = (t - t0) / 1000;
      cx!.clearRect(0, 0, W, H);

      /* Global sweep progress — drives the diagonal travel */
      const sweepRaw = Math.min(e / 2.8, 1);
      const sweep = 1 - Math.pow(1 - sweepRaw, 3);

      const diag = Math.sqrt(W * W + H * H);
      const angle = (-35 * Math.PI) / 180;

      for (const rb of ribbons) {
        /* Per-ribbon sweep with staggered delay */
        const rp = Math.max(0, Math.min(1, (sweep - rb.delay) / 0.55));
        if (rp <= 0 || rp >= 1) continue;

        /* Fade envelope — breathes in and out */
        const alpha = Math.sin(rp * Math.PI) * rb.peakAlpha;
        if (alpha < 0.005) continue;

        cx!.save();
        cx!.translate(W / 2, H / 2);
        cx!.rotate(angle);
        cx!.translate(-W / 2, -H / 2);

        /* Sweep position along the diagonal */
        const baseY = -diag * 0.35 + rp * diag * 1.7;
        const halfW = rb.width / 2;
        const step = 6;
        const span = diag * 2.5;
        const startX = -diag * 0.6;

        /* Build upper and lower edges of the ribbon with organic flow */
        const upperPts: { x: number; y: number }[] = [];
        const lowerPts: { x: number; y: number }[] = [];

        for (let x = startX; x < startX + span; x += step) {
          const n = flow(x, e * rb.speed, rb.seed);
          const centerY = baseY + n * rb.amp;

          /* Ribbon width also undulates slightly */
          const widthMod = 1 + Math.sin(x * 0.003 + e * 0.4 + rb.seed * 1.5) * 0.3;
          const hw = halfW * widthMod;

          upperPts.push({ x, y: centerY - hw });
          lowerPts.push({ x, y: centerY + hw });
        }

        /* Draw filled ribbon shape */
        const gy = baseY;
        const grad = cx!.createLinearGradient(0, gy - rb.width, 0, gy + rb.width);
        grad.addColorStop(0, `rgba(${rb.r},${rb.g},${rb.b}, 0)`);
        grad.addColorStop(0.25, `rgba(${rb.r},${rb.g},${rb.b}, ${alpha * 0.5})`);
        grad.addColorStop(0.5, `rgba(${rb.r},${rb.g},${rb.b}, ${alpha})`);
        grad.addColorStop(0.75, `rgba(${rb.r},${rb.g},${rb.b}, ${alpha * 0.5})`);
        grad.addColorStop(1, `rgba(${rb.r},${rb.g},${rb.b}, 0)`);

        cx!.beginPath();
        /* Upper edge — forward */
        cx!.moveTo(upperPts[0].x, upperPts[0].y);
        for (let i = 1; i < upperPts.length - 1; i++) {
          const cpx = (upperPts[i].x + upperPts[i + 1].x) / 2;
          const cpy = (upperPts[i].y + upperPts[i + 1].y) / 2;
          cx!.quadraticCurveTo(upperPts[i].x, upperPts[i].y, cpx, cpy);
        }
        /* Lower edge — backward */
        const last = lowerPts[lowerPts.length - 1];
        cx!.lineTo(last.x, last.y);
        for (let i = lowerPts.length - 2; i >= 1; i--) {
          const cpx = (lowerPts[i].x + lowerPts[i - 1].x) / 2;
          const cpy = (lowerPts[i].y + lowerPts[i - 1].y) / 2;
          cx!.quadraticCurveTo(lowerPts[i].x, lowerPts[i].y, cpx, cpy);
        }
        cx!.closePath();
        cx!.fillStyle = grad;
        cx!.fill();

        /* Centre spine line — thin, bright, organic */
        cx!.beginPath();
        const spinePts: { x: number; y: number }[] = [];
        for (let x = startX; x < startX + span; x += step) {
          const n = flow(x, e * rb.speed, rb.seed);
          spinePts.push({ x, y: baseY + n * rb.amp });
        }
        cx!.moveTo(spinePts[0].x, spinePts[0].y);
        for (let i = 1; i < spinePts.length - 1; i++) {
          const cpx = (spinePts[i].x + spinePts[i + 1].x) / 2;
          const cpy = (spinePts[i].y + spinePts[i + 1].y) / 2;
          cx!.quadraticCurveTo(spinePts[i].x, spinePts[i].y, cpx, cpy);
        }
        cx!.strokeStyle = `rgba(${rb.r},${rb.g},${rb.b}, ${alpha * 2.5})`;
        cx!.lineWidth = 1.2;
        cx!.stroke();

        cx!.restore();
      }

      if (e < 3.8) {
        rafRef.current = requestAnimationFrame(draw);
      }
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /* ─── Particles (DOM, spawned once) ─── */
  const ptsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = ptsRef.current;
    if (!container) return;
    const particles: HTMLDivElement[] = [];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement("div");
      const s = 1 + Math.random() * 1.8;
      Object.assign(p.style, {
        position: "absolute",
        background: "rgba(75,139,245,0.4)",
        borderRadius: "50%",
        opacity: "0",
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        width: `${s}px`,
        height: `${s}px`,
        animation: `splashPtDrift ${3 + Math.random() * 3.5}s ease ${Math.random() * 2}s forwards`,
        ["--dx" as string]: `${-25 + Math.random() * 50}px`,
        ["--dy" as string]: `${-40 - Math.random() * 40}px`,
      });
      container.appendChild(p);
      particles.push(p);
    }
    return () => {
      particles.forEach((p) => p.remove());
    };
  }, []);

  /* ─── Auto-dismiss → exit wipe → onComplete ─── */
  const triggerExit = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      onComplete?.();
    }, EXIT_DELAY_MS + EXIT_WIPE_MS + 50);
  }, [onComplete]);

  useEffect(() => {
    const id = setTimeout(triggerExit, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [triggerExit]);

  /* Lock body scroll while splash is visible */
  useBodyScrollLock(!exiting);

  return (
    <>
      {/* ─── Keyframes injected once via <style> ─── */}
      <style jsx global>{`
        /* Canvas fade-in/out lifecycle */
        @keyframes splashCanvasLife {
          0%   { opacity: 0; }
          20%  { opacity: 1; }
          75%  { opacity: 0.65; }
          100% { opacity: 0; }
        }

        /* Diagonal light streak */
        @keyframes splashStreakMove {
          0%   { opacity: 0; translate: 0 0; }
          8%   { opacity: 1; }
          82%  { opacity: 0.7; }
          100% { opacity: 0; translate: 0 120vh; }
        }

        /* Ambient centre glow */
        @keyframes splashAmbIn {
          0%   { opacity: 0; }
          50%  { opacity: 1; }
          100% { opacity: 0.55; }
        }

        /* Particles drift */
        @keyframes splashPtDrift {
          0%   { opacity: 0; transform: translate(0, 0); }
          20%  { opacity: 0.5; }
          80%  { opacity: 0.15; }
          100% { opacity: 0; transform: translate(var(--dx), var(--dy)); }
        }

        /* Logo block entrance */
        @keyframes splashLogoIn {
          0%   { opacity: 0; transform: translate(-50%, -44%) scale(0.9); filter: blur(10px); }
          55%  { filter: blur(0px); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); filter: blur(0px); }
        }

        /* Glow rings breathe */
        @keyframes splashRingB {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50%      { opacity: 0.75; transform: scale(1.03); }
        }

        /* Icon glow breathe */
        @keyframes splashGlowB {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%      { opacity: 1; transform: scale(1.06); }
        }

        /* Wordmark entrance */
        @keyframes splashWordIn {
          0%   { opacity: 0; transform: translateY(6px); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        /* Exit wipe */
        @keyframes splashWipeOff {
          0%   { clip-path: inset(0 0 0 0); opacity: 1; }
          100% { clip-path: inset(0 0 0 100%); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .splash-root,
          .splash-root * {
            animation-duration: 0.01ms !important;
            animation-delay: 0.01ms !important;
          }
        }
      `}</style>

      <div
        ref={splashRef}
        className="splash-root"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "#0B2545",
          overflow: "hidden",
          ...(exiting
            ? {
                animation: `splashWipeOff ${EXIT_WIPE_MS}ms cubic-bezier(0.4,0,0.2,1) ${EXIT_DELAY_MS}ms forwards`,
              }
            : {}),
        }}
      >
        {/* ── Canvas: procedural diagonal waveform ── */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            animation: "splashCanvasLife 3.6s ease 0.2s forwards",
          }}
        />

        {/* ── Diagonal light streak ── */}
        <div
          style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
        >
          {/* Thin core line */}
          <div
            style={{
              position: "absolute",
              top: "-10%",
              left: "-10%",
              width: "120%",
              height: "3px",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(28,84,242,0) 20%, rgba(46,107,255,0.5) 44%, rgba(75,139,245,0.85) 50%, rgba(46,107,255,0.5) 56%, rgba(28,84,242,0) 80%, transparent 100%)",
              transform: "rotate(-35deg)",
              transformOrigin: "center",
              opacity: 0,
              animation: "splashStreakMove 2s cubic-bezier(0.4,0,0.2,1) 0.6s forwards",
              boxShadow:
                "0 0 24px rgba(46,107,255,0.35), 0 0 50px rgba(28,84,242,0.15)",
            }}
          />
          {/* Soft glow behind streak */}
          <div
            style={{
              position: "absolute",
              top: "-10%",
              left: "-10%",
              width: "120%",
              height: "70px",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(28,84,242,0) 25%, rgba(75,139,245,0.05) 45%, rgba(106,171,255,0.09) 50%, rgba(75,139,245,0.05) 55%, rgba(28,84,242,0) 75%, transparent 100%)",
              transform: "rotate(-35deg)",
              transformOrigin: "center",
              filter: "blur(18px)",
              opacity: 0,
              animation: "splashStreakMove 2s cubic-bezier(0.4,0,0.2,1) 0.6s forwards",
            }}
          />
        </div>

        {/* ── Ambient centre glow ── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            animation: "splashAmbIn 3s ease 1s forwards",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 550,
              height: 550,
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(ellipse at center, rgba(28,84,242,0.14) 0%, rgba(28,84,242,0.06) 35%, rgba(19,45,94,0.03) 60%, transparent 80%)",
              filter: "blur(35px)",
            }}
          />
        </div>

        {/* ── Particles ── */}
        <div
          ref={ptsRef}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />

        {/* ── Logo block: monolith + wordmark + progress ── */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
            opacity: 0,
            animation: "splashLogoIn 1.3s cubic-bezier(0.16,1,0.3,1) 1.6s forwards",
          }}
        >
          {/* Mark wrapper with glow rings */}
          <div style={{ position: "relative", width: 96, height: 96 }}>
            {/* Concentric rings */}
            {[
              { inset: -45, opacity: 0.04, delay: "2.2s" },
              { inset: -90, opacity: 0.03, delay: "2.5s" },
              { inset: -145, opacity: 0.02, delay: "2.8s" },
            ].map((r, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: r.inset,
                  borderRadius: "50%",
                  border: `1px solid rgba(75,139,245,${r.opacity})`,
                  opacity: 0,
                  animation: `splashRingB 3.2s ease-in-out ${r.delay} infinite`,
                }}
              />
            ))}

            {/* Soft radial behind icon */}
            <div
              style={{
                position: "absolute",
                inset: -35,
                background:
                  "radial-gradient(circle, rgba(28,84,242,0.22) 0%, rgba(28,84,242,0.06) 45%, transparent 70%)",
                filter: "blur(14px)",
                opacity: 0,
                animation: "splashGlowB 3s ease-in-out 2s infinite",
              }}
            />

            {/* ── Monolith SVG mark ── */}
            <svg
              style={{
                position: "relative",
                zIndex: 2,
                width: 96,
                height: 96,
                filter:
                  "drop-shadow(0 4px 20px rgba(0,0,0,0.35)) drop-shadow(0 0 35px rgba(28,84,242,0.18))",
              }}
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="StrydeOS"
            >
              <defs>
                <linearGradient id="sp-cont" x1="0.1" y1="0" x2="0.85" y2="1">
                  <stop offset="0%" stopColor="#2E6BFF" stopOpacity={0.58} />
                  <stop offset="100%" stopColor="#091D3E" stopOpacity={0.72} />
                </linearGradient>
                <radialGradient id="sp-rad" cx="28%" cy="24%" r="60%">
                  <stop offset="0%" stopColor="#6AABFF" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="#1C54F2" stopOpacity={0} />
                </radialGradient>
                <linearGradient id="sp-topface" x1="0.05" y1="1" x2="0.35" y2="0">
                  <stop offset="0%" stopColor="white" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="white" stopOpacity={0.97} />
                </linearGradient>
                <linearGradient id="sp-rim" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="white" stopOpacity={0} />
                  <stop offset="28%" stopColor="white" stopOpacity={0.6} />
                  <stop offset="65%" stopColor="white" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="white" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="sp-border" x1="0.1" y1="0" x2="0.4" y2="1">
                  <stop offset="0%" stopColor="#7ABBFF" stopOpacity={0.65} />
                  <stop offset="100%" stopColor="#1C54F2" stopOpacity={0.06} />
                </linearGradient>
                <clipPath id="sp-pc">
                  <rect x="35" y="20" width="22" height="60" rx="5" />
                </clipPath>
                <clipPath id="sp-ac">
                  <polygon points="35,52 57,40 57,20 35,20" />
                </clipPath>
              </defs>

              {/* Container */}
              <rect width="100" height="100" rx="24" fill="url(#sp-cont)" />
              <rect width="100" height="100" rx="24" fill="url(#sp-rad)" />
              <rect
                width="100"
                height="100"
                rx="24"
                fill="none"
                stroke="url(#sp-border)"
                strokeWidth="1.2"
              />

              {/* Top arc rim highlight */}
              <path
                d="M 17 21 Q 50 12 83 21"
                stroke="url(#sp-rim)"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />

              {/* Pillar body */}
              <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity={0.07} />
              {/* Lower shadow */}
              <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity={0.1} />

              {/* Three ascending chevrons */}
              <g clipPath="url(#sp-pc)">
                <polyline
                  points="32,80 46,72 60,80"
                  stroke="white"
                  strokeOpacity={0.2}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <polyline
                  points="32,72 46,64 60,72"
                  stroke="white"
                  strokeOpacity={0.42}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <polyline
                  points="32,64 46,56 60,64"
                  stroke="white"
                  strokeOpacity={0.72}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </g>

              {/* Top face catch-light */}
              <rect
                x="35"
                y="20"
                width="22"
                height="60"
                rx="5"
                fill="url(#sp-topface)"
                clipPath="url(#sp-ac)"
              />

              {/* Diagonal cut edge */}
              <line
                x1="33"
                y1="52"
                x2="59"
                y2="39"
                stroke="white"
                strokeWidth="1.2"
                strokeOpacity={0.55}
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* ── Wordmark ── */}
          <div
            style={{
              fontWeight: 700,
              fontSize: 20,
              letterSpacing: "-0.02em",
              color: "white",
              fontFamily: "var(--font-body, 'Outfit', sans-serif)",
              opacity: 0,
              animation: "splashWordIn 0.9s cubic-bezier(0.16,1,0.3,1) 2.2s forwards",
            }}
          >
            Stryde<span style={{ color: "#4B8BF5" }}>OS</span>
          </div>

        </div>
      </div>
    </>
  );
}
