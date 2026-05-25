"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HelpCircle, X } from "lucide-react";
import { brand, hexToRgba } from "@/lib/brand";

interface HelpWidgetProps {
  helpText?: string;
}

export default function HelpWidget({
  helpText = "Need help? Check the docs or ping support.",
}: HelpWidgetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Popover panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="fixed bottom-24 right-6 z-[200] w-72 rounded-2xl p-4 text-sm"
            style={{
              background: brand.navyMid,
              border: `1px solid rgba(255,255,255,0.10)`,
              boxShadow: `0 8px 32px ${hexToRgba(brand.navy, 0.55)}, 0 0 0 1px ${hexToRgba(brand.blue, 0.08)}`,
              color: "rgba(255,255,255,0.75)",
              lineHeight: "1.55",
            }}
          >
            <p className="font-body">{helpText}</p>
            <a
              href="mailto:support@strydeos.com"
              className="mt-3 inline-block text-xs font-semibold"
              style={{ color: brand.blueGlow }}
            >
              Contact support
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orb button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[200] w-[52px] h-[52px] rounded-full flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${brand.blue}, ${brand.blueBright})`,
          boxShadow: open
            ? `0 0 0 0 ${hexToRgba(brand.blue, 0)}`
            : `0 4px 18px ${hexToRgba(brand.blue, 0.45)}`,
        }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.93 }}
        aria-label={open ? "Close help" : "Open help"}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <X size={20} color="white" strokeWidth={2.5} />
            </motion.span>
          ) : (
            <motion.span
              key="help"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <HelpCircle size={22} color="white" strokeWidth={1.8} />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Pulse ring — only when closed */}
        {!open && (
          <span
            className="absolute inset-0 rounded-full pointer-events-none help-widget-pulse"
            style={{ background: `radial-gradient(circle, ${hexToRgba(brand.blue, 0.35)} 0%, transparent 70%)` }}
          />
        )}
      </motion.button>
    </>
  );
}
