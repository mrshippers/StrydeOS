"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  ArrowRight,
  Shield,
  CreditCard,
  Clock,
  Zap,
} from "lucide-react";
import { StrydeOSLogo } from "@/components/MonolithLogo";

// ─── Module icon — mini Monolith mark tinted to module colour ───────────────

function ModuleIcon({ color, size = 22 }: { color: string; size?: number }) {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const light = `rgba(${Math.min(r + 80, 255)},${Math.min(g + 80, 255)},${Math.min(b + 80, 255)},0.58)`;
  const dark = `rgba(${Math.max(r - 60, 0)},${Math.max(g - 60, 0)},${Math.max(b - 60, 0)},0.72)`;

  const id = `mi-${color.replace("#", "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img">
      <defs>
        <linearGradient id={`${id}-c`} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
        <linearGradient id={`${id}-t`} x1="0.05" y1="1" x2="0.35" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0.97" />
        </linearGradient>
        <clipPath id={`${id}-p`}><rect x="35" y="20" width="22" height="60" rx="5" /></clipPath>
        <clipPath id={`${id}-a`}><polygon points="35,52 57,40 57,20 35,20" /></clipPath>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${id}-c)`} />
      <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07" />
      <rect x="35" y="46" width="22" height="34" rx="5" fill="black" fillOpacity="0.10" />
      <g clipPath={`url(#${id}-p)`}>
        <polyline points="32,80 46,72 60,80" stroke="white" strokeOpacity="0.20" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="32,72 46,64 60,72" stroke="white" strokeOpacity="0.42" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polyline points="32,64 46,56 60,64" stroke="white" strokeOpacity="0.72" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <rect x="35" y="20" width="22" height="60" rx="5" fill={`url(#${id}-t)`} clipPath={`url(#${id}-a)`} />
      <line x1="33" y1="52" x2="59" y2="39" stroke="white" strokeWidth="1.2" strokeOpacity="0.55" strokeLinecap="round" />
    </svg>
  );
}

// ─── Brand tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "#0B2545",
  blue: "#1C54F2",
  blueBright: "#2E6BFF",
  blueGlow: "#4B8BF5",
  teal: "#0891B2",
  purple: "#8B5CF6",
  cream: "#FAF9F7",
  cloudDancer: "#F2F1EE",
  ink: "#111827",
  muted: "#6B7280",
  border: "#E2DFDA",
  success: "#059669",
};

// ─── Module definitions ──────────────────────────────────────────────────────

type ModuleId = "intelligence" | "ava" | "pulse" | "fullstack";

interface ModuleDef {
  id: ModuleId;
  name: string;
  tagline: string;
  color: string;
  features: string[];
  startingAt: string;
}

const MODULES: ModuleDef[] = [
  {
    id: "intelligence",
    name: "Intelligence",
    tagline: "Clinical performance dashboard",
    color: C.purple,
    features: [
      "Per-clinician KPI dashboard",
      "90-day rolling trends & alerts",
      "NPS & Google Review pipeline",
      "HEP compliance monitoring",
      "Revenue per session tracking",
      "Weekly email digest",
    ],
    startingAt: "£79",
  },
  {
    id: "ava",
    name: "Ava",
    tagline: "AI voice receptionist",
    color: C.blue,
    features: [
      "24/7 AI inbound call handling",
      "Direct calendar booking",
      "Patient call summaries",
      "Missed call recovery",
      "Multi-language support",
      "PMS integration (write)",
    ],
    startingAt: "£149",
  },
  {
    id: "pulse",
    name: "Pulse",
    tagline: "Patient retention engine",
    color: C.teal,
    features: [
      "Automated rebooking reminders",
      "HEP adherence nudges",
      "Discharge follow-up sequences",
      "DNA recovery workflows",
      "Patient satisfaction tracking",
      "Configurable timing rules",
    ],
    startingAt: "£99",
  },
  {
    id: "fullstack",
    name: "Full Stack",
    tagline: "All three modules — one platform",
    color: C.navy,
    features: [
      "Everything in Intelligence",
      "Everything in Ava",
      "Everything in Pulse",
      "Cross-module insights",
      "Priority onboarding",
      "Best value — save up to 20%",
    ],
    startingAt: "£279",
  },
];

// ─── Benefits ────────────────────────────────────────────────────────────────

const BENEFITS = [
  {
    icon: Clock,
    title: "14-day free trial",
    desc: "Full access to every feature in your chosen module. No restrictions, no watermarks.",
  },
  {
    icon: CreditCard,
    title: "No card required",
    desc: "Start exploring immediately. You'll only enter payment details if you choose to continue.",
  },
  {
    icon: Zap,
    title: "Live in minutes",
    desc: "Connect your existing PMS and start seeing data straight away. No migration needed.",
  },
  {
    icon: Shield,
    title: "GDPR compliant · UK hosted",
    desc: "Data stays in europe-west2 (London). SOC 2-aligned infrastructure. Your patients' data is safe.",
  },
];

// ─── Hex to RGBA helper ──────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Trial Page ──────────────────────────────────────────────────────────────

export default function TrialPage() {
  const router = useRouter();
  const { loading } = useAuth();
  const [selected, setSelected] = useState<ModuleId | null>(null);
  const [hoveredModule, setHoveredModule] = useState<ModuleId | null>(null);

  const handleStart = () => {
    if (!selected) return;
    // Route to signup with module context, then onboarding
    const next = encodeURIComponent("/onboarding");
    router.push(`/login?mode=signup&next=${next}&module=${selected}`);
  };

  // Show spinner only while auth is loading (page renders for everyone)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.cream }}>
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-transparent" style={{ borderTopColor: C.blue }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(180deg, ${C.cloudDancer} 0%, ${C.cream} 50%, white 100%)`,
        fontFamily: "var(--font-body), 'Outfit', sans-serif",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-cloud-dancer/80 backdrop-blur-xl border-b border-border/50">
        <a href="https://strydeos.com" className="no-underline">
          <StrydeOSLogo size={34} fontSize={17} theme="light" gap={10} />
        </a>
        <a
          href="/login"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-navy border border-border hover:border-navy/30 hover:bg-cloud-light transition-colors no-underline"
        >
          Log in
          <ArrowRight size={14} />
        </a>
      </header>

      <div className="max-w-[1080px] mx-auto px-6 pt-28 pb-20">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-6"
            style={{
              background: hexToRgba(C.blue, 0.08),
              color: C.blue,
              border: `1px solid ${hexToRgba(C.blue, 0.15)}`,
            }}
          >
            <Clock size={13} />
            14-day free trial · No card required
          </div>

          <h1
            className="font-[var(--font-display)] text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] mb-5"
            style={{
              fontFamily: "var(--font-display), 'DM Serif Display', serif",
              fontWeight: 400,
              color: C.navy,
              letterSpacing: "-0.01em",
            }}
          >
            See where your clinic is
            <br />
            <span style={{ fontStyle: "italic", color: C.blue }}>
              leaving money on the table.
            </span>
          </h1>

          <p
            className="text-lg max-w-[560px] mx-auto"
            style={{ color: C.muted, lineHeight: 1.7 }}
          >
            StrydeOS connects your PMS, HEP, and patient data into one clinical
            performance layer — so you can coach clinicians, retain patients, and
            grow revenue.
          </p>
        </motion.div>

        {/* ── Benefits row ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16"
        >
          {BENEFITS.map((b, i) => (
            <div
              key={b.title}
              className="rounded-2xl p-5"
              style={{
                background: "white",
                border: `1px solid ${C.border}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{
                  background: hexToRgba(C.blue, 0.08),
                }}
              >
                <b.icon size={18} style={{ color: C.blue }} />
              </div>
              <div
                className="text-sm font-semibold mb-1"
                style={{ color: C.ink }}
              >
                {b.title}
              </div>
              <div className="text-xs" style={{ color: C.muted, lineHeight: 1.55 }}>
                {b.desc}
              </div>
            </div>
          ))}
        </motion.div>

        {/* ── Module selection ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h2
            className="text-center text-2xl sm:text-3xl mb-2"
            style={{
              fontFamily: "var(--font-display), 'DM Serif Display', serif",
              fontWeight: 400,
              color: C.navy,
            }}
          >
            Choose what to try
          </h2>
          <p
            className="text-center text-sm mb-10"
            style={{ color: C.muted }}
          >
            Pick a module — or go full stack. You can always change later.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[860px] mx-auto">
            {MODULES.map((mod) => {
              const isSelected = selected === mod.id;
              const isHovered = hoveredModule === mod.id;
              const isFullStack = mod.id === "fullstack";
              const accent = isFullStack ? C.blue : mod.color;

              return (
                <motion.button
                  key={mod.id}
                  onClick={() => setSelected(mod.id)}
                  onMouseEnter={() => setHoveredModule(mod.id)}
                  onMouseLeave={() => setHoveredModule(null)}
                  whileTap={{ scale: 0.98 }}
                  className="text-left rounded-2xl p-6 transition-all duration-300 relative overflow-hidden"
                  style={{
                    background: isSelected
                      ? isFullStack
                        ? C.navy
                        : "white"
                      : "white",
                    border: isSelected
                      ? `2px solid ${accent}`
                      : isHovered
                        ? `2px solid ${hexToRgba(accent, 0.4)}`
                        : `2px solid ${C.border}`,
                    boxShadow: isSelected
                      ? `0 4px 24px ${hexToRgba(accent, 0.15)}, 0 0 0 1px ${hexToRgba(accent, 0.1)}`
                      : isHovered
                        ? `0 4px 16px rgba(0,0,0,0.06)`
                        : "0 1px 3px rgba(0,0,0,0.04)",
                    cursor: "pointer",
                    gridColumn: isFullStack ? "1 / -1" : undefined,
                  }}
                >
                  {/* Selected check */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: accent }}
                      >
                        <Check size={14} color="white" strokeWidth={3} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 shrink-0">
                      <ModuleIcon
                        color={isSelected && isFullStack ? C.blueGlow : accent}
                        size={44}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span
                          className="text-base font-bold"
                          style={{
                            color:
                              isSelected && isFullStack ? "white" : C.ink,
                          }}
                        >
                          {mod.name}
                        </span>
                        <span
                          className="text-xs font-medium"
                          style={{
                            color:
                              isSelected && isFullStack
                                ? "rgba(255,255,255,0.5)"
                                : C.muted,
                          }}
                        >
                          from {mod.startingAt}/mo
                        </span>
                      </div>
                      <p
                        className="text-sm mb-3"
                        style={{
                          color:
                            isSelected && isFullStack
                              ? "rgba(255,255,255,0.6)"
                              : C.muted,
                        }}
                      >
                        {mod.tagline}
                      </p>

                      <div
                        className={`grid gap-2 ${isFullStack ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1"}`}
                      >
                        {mod.features.map((f) => (
                          <div
                            key={f}
                            className="flex items-center gap-2 text-xs"
                            style={{
                              color:
                                isSelected && isFullStack
                                  ? "rgba(255,255,255,0.75)"
                                  : C.ink,
                            }}
                          >
                            <Check
                              size={12}
                              style={{
                                color:
                                  isSelected && isFullStack
                                    ? C.blueGlow
                                    : accent,
                                flexShrink: 0,
                              }}
                            />
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-12"
        >
          <button
            onClick={handleStart}
            disabled={!selected}
            className="inline-flex items-center gap-3 px-10 py-4 rounded-full text-base font-bold text-white transition-all duration-300"
            style={{
              background: selected
                ? `linear-gradient(135deg, ${C.blueBright}, ${C.blue})`
                : C.border,
              color: selected ? "white" : C.muted,
              cursor: selected ? "pointer" : "not-allowed",
              boxShadow: selected
                ? `0 4px 20px ${hexToRgba(C.blue, 0.3)}, 0 0 0 1px ${hexToRgba(C.blueBright, 0.15)}`
                : "none",
              transform: selected ? "translateY(0)" : "none",
            }}
            onMouseEnter={(e) => {
              if (selected) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 6px 28px ${hexToRgba(C.blue, 0.4)}, 0 0 0 1px ${hexToRgba(C.blueBright, 0.25)}`;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              if (selected) {
                e.currentTarget.style.boxShadow = `0 4px 20px ${hexToRgba(C.blue, 0.3)}, 0 0 0 1px ${hexToRgba(C.blueBright, 0.15)}`;
              }
            }}
          >
            {selected ? "Start your free trial" : "Select a module to continue"}
            <ArrowRight size={18} />
          </button>

          <div className="flex items-center justify-center gap-6 mt-5">
            {[
              "No credit card",
              "14 days free",
              "Cancel anytime",
            ].map((label) => (
              <div
                key={label}
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: C.muted }}
              >
                <Check size={12} style={{ color: C.success }} />
                {label}
              </div>
            ))}
          </div>

          <p className="text-xs mt-8" style={{ color: hexToRgba(C.muted, 0.6) }}>
            Already have an account?{" "}
            <a
              href="/login"
              className="underline"
              style={{ color: C.blue }}
            >
              Log in
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
