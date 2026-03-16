"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { colors } from "@/lib/brand";

export interface TourStepDef {
  target: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
}

interface TourStepProps {
  step: TourStepDef;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  isLast: boolean;
}

interface Position {
  top: number;
  left: number;
  arrowSide: "top" | "bottom" | "left" | "right";
}

const TOOLTIP_GAP = 14;

function computePosition(
  targetRect: DOMRect,
  tooltipW: number,
  tooltipH: number,
  placement: TourStepDef["placement"] = "bottom"
): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;
  let arrowSide: Position["arrowSide"] = "top";

  if (placement === "bottom") {
    top = targetRect.bottom + TOOLTIP_GAP;
    left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
    arrowSide = "top";
  } else if (placement === "top") {
    top = targetRect.top - tooltipH - TOOLTIP_GAP;
    left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
    arrowSide = "bottom";
  } else if (placement === "right") {
    top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
    left = targetRect.right + TOOLTIP_GAP;
    arrowSide = "left";
  } else {
    top = targetRect.top + targetRect.height / 2 - tooltipH / 2;
    left = targetRect.left - tooltipW - TOOLTIP_GAP;
    arrowSide = "right";
  }

  if (left < 12) left = 12;
  if (left + tooltipW > vw - 12) left = vw - tooltipW - 12;
  if (top < 12) top = 12;
  if (top + tooltipH > vh - 12) top = vh - tooltipH - 12;

  return { top, left, arrowSide };
}

export default function TourStep({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  isLast,
}: TourStepProps) {
  const [pos, setPos] = useState<Position | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const recalc = useCallback(() => {
    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setHighlightRect(rect);

    const tooltipEl = tooltipRef.current;
    const tooltipW = tooltipEl?.offsetWidth ?? 320;
    const tooltipH = tooltipEl?.offsetHeight ?? 160;
    setPos(computePosition(rect, tooltipW, tooltipH, step.placement));

    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [step.target, step.placement]);

  useEffect(() => {
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [recalc]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence mode="wait">
      <motion.div
        key={`tour-step-${stepIndex}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="fixed inset-0 z-[100]"
      >
        {/* Overlay with cutout */}
        <svg className="fixed inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {highlightRect && (
                <rect
                  x={highlightRect.left - 6}
                  y={highlightRect.top - 6}
                  width={highlightRect.width + 12}
                  height={highlightRect.height + 12}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%"
            fill="rgba(11, 37, 69, 0.55)"
            mask="url(#tour-mask)"
            style={{ pointerEvents: "all" }}
            onClick={onSkip}
          />
        </svg>

        {/* Highlight ring */}
        {highlightRect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="fixed rounded-xl border-2 border-blue-glow pointer-events-none"
            style={{
              top: highlightRect.top - 6,
              left: highlightRect.left - 6,
              width: highlightRect.width + 12,
              height: highlightRect.height + 12,
              boxShadow: "0 0 0 4px rgba(59, 144, 255, 0.15), 0 0 24px rgba(59, 144, 255, 0.1)",
            }}
          />
        )}

        {/* Tooltip */}
        {pos && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.94, y: pos.arrowSide === "top" ? -10 : 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: pos.arrowSide === "top" ? -6 : 6 }}
            transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="fixed w-[320px] rounded-2xl bg-white shadow-[var(--shadow-elevated)] overflow-hidden"
            style={{
              top: pos.top,
              left: pos.left,
              zIndex: 101,
            }}
          >
            {/* Header */}
            <div className="px-5 pt-4 pb-3 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-1">
                  Step {stepIndex + 1} of {totalSteps}
                </p>
                <h3 className="font-display text-[17px] text-navy leading-snug">
                  {step.title}
                </h3>
              </div>
              <button
                onClick={onSkip}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-muted hover:text-navy hover:bg-cloud-light transition-colors shrink-0 mt-0.5"
              >
                <X size={13} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 pb-4">
              <p className="text-[13px] text-muted leading-relaxed">{step.body}</p>
            </div>

            {/* Footer */}
            <div className="px-5 pb-4 flex items-center justify-between">
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: i === stepIndex ? 16 : 6,
                      background: i === stepIndex ? colors.blue : colors.border,
                    }}
                  />
                ))}
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <button
                    onClick={onPrev}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-muted hover:text-navy hover:bg-cloud-light transition-colors"
                  >
                    <ChevronLeft size={12} />
                    Back
                  </button>
                )}
                <button
                  onClick={onNext}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: colors.blue }}
                >
                  {isLast ? "Finish" : "Next"}
                  {!isLast && <ChevronRight size={12} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
