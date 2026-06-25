/**
 * EvidenceThreshold — the hidden way into StrydeOS Evidence (the quiet fourth
 * module). There is no menu item. You press and HOLD the monolith mark in the
 * sidebar for 2 seconds: a thin purple stroke draws around the mark, it glows,
 * then the screen fades into the Evidence threshold and a classic Stryde
 * "Explore Evidence" button surfaces, linking to evidence.strydeos.com.
 *
 * Renders the same lockup as <LogoNav theme="dark" /> (mark + Outfit-700
 * wordmark) so it is a drop-in replacement in the sidebar; the hold interaction
 * is bound to the MARK only. A normal quick click still navigates to /dashboard
 * (the parent <Link>), a completed 2s hold swallows that click and opens Evidence.
 *
 * Self-contained: bespoke animation lives in a scoped <style> tag injected once.
 * Nothing here imports from Ava / Pulse / Intelligence — it is brand chrome only.
 */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonolithMark } from "@/components/MonolithLogo";

const EVIDENCE_URL = "https://evidence.strydeos.com";
const HOLD_MS = 2000;
const TRACE_START = 0.42; // the stroke stays empty until ~42% of the hold
const RING_CIRC = 142.8; // perimeter of the 40x40 rx10 squircle stroke

interface Props {
  size?: number;
  fontSize?: number;
  gap?: number;
}

export const EvidenceThreshold: React.FC<Props> = ({
  size = 34,
  fontSize = 17,
  gap = 10,
}) => {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [revealOn, setRevealOn] = useState(false);
  const [bloomOn, setBloomOn] = useState(false);
  const [ctaOn, setCtaOn] = useState(false);

  const markRef = useRef<HTMLSpanElement | null>(null);
  const ringRef = useRef<SVGRectElement | null>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const holdingRef = useRef(false);
  const openedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => setMounted(true), []);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  const resetMark = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    holdingRef.current = false;
    if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_CIRC);
    const inner = markRef.current?.querySelector<HTMLElement>(".evi-mark-inner");
    if (inner) {
      inner.style.transform = "";
      inner.style.filter = "";
    }
    if (markRef.current) markRef.current.classList.remove("evi-ring-on");
  }, []);

  const closeAll = useCallback(() => {
    clearTimers();
    openedRef.current = false;
    setOpen(false);
    setRevealOn(false);
    setBloomOn(false);
    setCtaOn(false);
    resetMark();
  }, [resetMark]);

  const openReveal = useCallback(() => {
    holdingRef.current = false;
    openedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    if (markRef.current) markRef.current.classList.remove("evi-ring-on");
    suppressClickRef.current = true; // swallow the <Link> click that follows release
    setOpen(true);
    // soft white bloom, then the threshold eases in beneath it
    timersRef.current.push(window.setTimeout(() => setBloomOn(true), 20));
    timersRef.current.push(window.setTimeout(() => setRevealOn(true), 360));
    timersRef.current.push(window.setTimeout(() => setBloomOn(false), 520));
    // classic Stryde button ~2s after the page has settled
    timersRef.current.push(window.setTimeout(() => setCtaOn(true), 360 + 1000 + 2000));
  }, []);

  const tick = useCallback(() => {
    const p = Math.min(1, (performance.now() - startRef.current) / HOLD_MS);
    const tp = Math.max(0, (p - TRACE_START) / (1 - TRACE_START));
    if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_CIRC * (1 - tp));
    const inner = markRef.current?.querySelector<HTMLElement>(".evi-mark-inner");
    if (inner) {
      inner.style.transform = `scale(${1 + 0.12 * p})`;
      const g1 = 16 * p;
      const g2 = 6 * p;
      inner.style.filter =
        `drop-shadow(0 0 ${g1}px rgba(150,110,255,${0.7 * p})) ` +
        `drop-shadow(0 0 ${g2}px rgba(200,170,255,${0.5 * p})) brightness(${1 + 0.14 * p})`;
    }
    if (p >= 1) {
      openReveal();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [openReveal]);

  const startHold = useCallback(
    (e: React.PointerEvent) => {
      if (openedRef.current) return;
      e.preventDefault();
      holdingRef.current = true;
      startRef.current = performance.now();
      markRef.current?.classList.add("evi-ring-on");
      rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  const cancelHold = useCallback(() => {
    if (!holdingRef.current || openedRef.current) return;
    resetMark();
  }, [resetMark]);

  // global pointerup / Esc handling
  useEffect(() => {
    const up = () => cancelHold();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openedRef.current) closeAll();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      clearTimers();
      cancelAnimationFrame(rafRef.current);
    };
  }, [cancelHold, closeAll]);

  // swallow the navigation click that fires after a completed hold
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <span
        className="evi-lockup"
        style={{ display: "inline-flex", alignItems: "center", gap, userSelect: "none" }}
      >
        <span
          ref={markRef}
          className="evi-mark"
          onPointerDown={startHold}
          onClickCapture={onClickCapture}
          style={{ position: "relative", width: size, height: size, flex: "0 0 auto", cursor: "pointer" }}
        >
          <span className="evi-mark-inner" style={{ display: "block", width: size, height: size, transition: "transform .25s ease, filter .25s ease" }}>
            <MonolithMark size={size} />
          </span>
          <span className="evi-ring" aria-hidden>
            <svg width={size + 10} height={size + 10} viewBox="0 0 44 44">
              <rect ref={ringRef} className="evi-ring-rect" x="2" y="2" width="40" height="40" rx="10" />
            </svg>
          </span>
        </span>

        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize,
            letterSpacing: "-0.02em",
            color: "#FFFFFF",
            lineHeight: 1,
          }}
        >
          Stryde<span style={{ color: "#4B8BF5" }}>OS</span>
        </span>
      </span>

      {mounted && open
        ? createPortal(
            <div className={`evi-reveal${revealOn ? " on" : ""}`} role="dialog" aria-label="StrydeOS Evidence">
              <div className="evi-backdrop" onClick={closeAll} />
              <div className={`evi-bloom${bloomOn ? " on" : ""}`} />
              <div className="evi-stage">
                <img className="evi-mono" src="/evidence-monolith.png" alt="" draggable={false} />
                <div className="evi-word">
                  Stryde<span className="e">OS</span> &middot; Evidence
                </div>
                <div className="evi-sub">cited &middot; grounded &middot; on-box</div>
                <a className={`evi-cta${ctaOn ? " on" : ""}`} href={EVIDENCE_URL}>
                  Explore Evidence
                </a>
              </div>
              <button className="evi-close" onClick={closeAll} aria-label="Close">esc</button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

// ─── Scoped styles (injected once; bespoke animation the prototype proved) ─────
const CSS = `
.evi-ring{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;opacity:0;transition:opacity .25s}
.evi-mark.evi-ring-on .evi-ring{opacity:1}
.evi-ring svg{display:block;transform:rotate(0deg)}
.evi-ring-rect{fill:none;stroke:#8b5cf6;stroke-width:1.0;stroke-opacity:.8;stroke-linecap:round;
  filter:drop-shadow(0 0 2px rgba(139,92,246,.6));stroke-dasharray:142.8;stroke-dashoffset:142.8}

.evi-reveal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
  font-family:'Outfit',sans-serif}
.evi-backdrop{position:absolute;inset:0;background:#06182e;opacity:0;transition:opacity 1s ease}
.evi-reveal.on .evi-backdrop{opacity:1}
.evi-bloom{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,#eef3ff,#dbe6ff);opacity:0;transition:opacity .7s ease;pointer-events:none}
.evi-bloom.on{opacity:.85}
.evi-stage{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center}
.evi-mono{height:min(42vh,260px);width:auto;filter:drop-shadow(0 30px 80px rgba(20,60,180,.55));
  opacity:0;transform:translateY(16px) scale(.96);transition:opacity 1s ease,transform 1.1s cubic-bezier(.16,1,.3,1)}
.evi-reveal.on .evi-mono{opacity:1;transform:none}
.evi-word{font-size:30px;font-weight:700;letter-spacing:-.02em;color:#eef2f8;opacity:0;transform:translateY(14px);
  transition:opacity .9s ease .15s,transform .9s cubic-bezier(.16,1,.3,1) .15s}
.evi-word .e{color:#8b5cf6}
.evi-reveal.on .evi-word{opacity:1;transform:none}
.evi-sub{font-size:13px;color:#7e93b4;opacity:0;transform:translateY(14px);
  transition:opacity .9s ease .28s,transform .9s cubic-bezier(.16,1,.3,1) .28s}
.evi-reveal.on .evi-sub{opacity:1;transform:none}
.evi-cta{display:inline-flex;align-items:center;gap:8px;margin-top:8px;padding:16px 36px;
  background:linear-gradient(135deg,#2e6bff,#1c54f2);color:#fff;border:none;border-radius:50px;
  font-family:'Outfit',sans-serif;font-size:15px;font-weight:600;letter-spacing:.01em;text-decoration:none;cursor:pointer;
  box-shadow:0 2px 8px rgba(28,84,242,.3),0 0 0 1px rgba(46,107,255,.18),inset 0 1px 0 rgba(255,255,255,.15);
  opacity:0;transform:translateY(12px);
  transition:transform .35s cubic-bezier(.16,1,.3,1),box-shadow .35s,background .35s,opacity .7s ease}
.evi-cta.on{opacity:1;transform:none}
.evi-cta:hover{background:linear-gradient(135deg,#4b8bf5,#2e6bff);transform:translateY(-2px);
  box-shadow:0 4px 20px rgba(28,84,242,.45),0 0 0 1px rgba(46,107,255,.3),inset 0 1px 0 rgba(255,255,255,.2)}
.evi-close{position:absolute;top:20px;right:22px;z-index:3;border:1px solid rgba(126,147,180,.3);
  background:rgba(11,37,69,.5);color:#7e93b4;font-family:'Outfit',sans-serif;font-size:12px;border-radius:8px;
  padding:6px 12px;cursor:pointer;opacity:0;transition:opacity .6s ease .6s}
.evi-reveal.on .evi-close{opacity:1}
`;

export default EvidenceThreshold;
