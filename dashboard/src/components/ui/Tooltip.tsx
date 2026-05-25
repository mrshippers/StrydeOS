"use client";

import { useState, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  delayMs?: number;
}

export default function Tooltip({ content, children, side = "top", delayMs = 400 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter() {
    timeout.current = setTimeout(() => setOpen(true), delayMs);
  }

  function handleLeave() {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setOpen(false);
  }

  const placement = side === "top"
    ? "bottom-full left-1/2 -translate-x-1/2 mb-2"
    : "top-full left-1/2 -translate-x-1/2 mt-2";

  const originY = side === "top" ? 1 : 0;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, scale: 0.92, y: side === "top" ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: side === "top" ? 4 : -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: "#0B2545", transformOrigin: `center ${originY === 1 ? "bottom" : "top"}` }}
            className={`absolute ${placement} z-50 whitespace-nowrap px-3 py-1.5 rounded-lg text-[12px] font-medium text-navy dark:text-white shadow-lg pointer-events-none`}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
