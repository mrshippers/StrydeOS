"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { StatCardProps } from "@/types";
import { ChevronUp, ChevronDown, Minus, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, { dot: string; glow: string }> = {
  ok:      { dot: "#059669", glow: "rgba(5,150,105,0.45)" },
  warn:    { dot: "#F59E0B", glow: "rgba(245,158,11,0.45)" },
  danger:  { dot: "#EF4444", glow: "rgba(239,68,68,0.45)" },
  neutral: { dot: "#6B7280", glow: "rgba(107,114,128,0.2)" },
};

const TREND_COLORS: Record<string, string> = {
  up:   "#059669",
  down: "#EF4444",
  warn: "#F59E0B",
  flat: "#6B7280",
};

function useCountUp(rawTarget: string | number, duration = 800): { display: string; ref: React.RefObject<HTMLElement | null> } {
  const target = String(rawTarget);
  const numericPart = parseFloat(target.replace(/[^0-9.-]/g, ""));
  const isNumeric = !isNaN(numericPart);
  const prefix = isNumeric ? target.match(/^[^0-9.-]*/)?.[0] ?? "" : "";
  const suffix = isNumeric ? target.match(/[^0-9.-]*$/)?.[0] ?? "" : "";
  const decimals = target.includes(".") ? (target.split(".")[1]?.replace(/[^0-9]/g, "").length ?? 0) : 0;

  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const hasAnimated = useRef(false);
  const elRef = useRef<HTMLElement | null>(null);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const animate = useCallback(() => {
    const now = performance.now();
    const elapsed = now - startRef.current;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = numericPart * eased;

    setDisplay(`${prefix}${current.toFixed(decimals)}${suffix}`);

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }, [numericPart, prefix, suffix, decimals, duration]);

  const startAnimation = useCallback(() => {
    if (hasAnimated.current || !isNumeric || reducedMotion) {
      setDisplay(target);
      return;
    }
    hasAnimated.current = true;
    setDisplay(`${prefix}${(0).toFixed(decimals)}${suffix}`);
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(animate);
  }, [target, isNumeric, prefix, suffix, decimals, animate, reducedMotion]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !isNumeric) {
      setDisplay(target);
      return;
    }

    if (reducedMotion) {
      setDisplay(target);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startAnimation();
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, isNumeric, startAnimation, reducedMotion]);

  useEffect(() => {
    hasAnimated.current = false;
  }, [target]);

  return { display, ref: elRef };
}

function Sparkline({ data, status }: { data: number[]; status: string }) {
  if (data.length < 2) return null;

  const lineColor =
    status === "ok"      ? "#059669" :
    status === "danger"  ? "#EF4444" :
    status === "warn"    ? "#F59E0B" :
    "#6B7280";

  const W = 48;
  const H = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  });

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

export default function StatCard({
  label,
  value,
  unit,
  target,
  benchmark,
  trend,
  trendPercent,
  status,
  insight,
  onClick,
  progress,
  action,
  sparklineData,
}: StatCardProps) {
  const dotStyle = STATUS_COLORS[status] ?? STATUS_COLORS.neutral;
  const { display: animatedValue, ref: countRef } = useCountUp(value);

  const TrendIcon = trend === "up"
    ? ChevronUp
    : trend === "down"
      ? ChevronDown
      : trend === "warn"
        ? AlertTriangle
        : Minus;

  const trendColor = TREND_COLORS[trend ?? "flat"];

  const progressFill = status === "warn" || status === "danger"
    ? "#F59E0B"
    : undefined;

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-[var(--radius-card)] bg-white border border-border shadow-[var(--shadow-card)] overflow-hidden transition-all duration-300 ease-out flex flex-col ${
        onClick ? "cursor-pointer hover:shadow-[var(--shadow-elevated)] hover:-translate-y-1 active:scale-[0.99] active:shadow-[var(--shadow-card)]" : "hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5"
      }`}
    >
      {/* Hover glow — radial wash using status colour */}
      <div
        className="stat-card-glow"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${dotStyle.glow} 0%, transparent 70%)`,
        }}
      />

      {/* Status dot — top right */}
      <div
        className="absolute top-4 right-4 w-[7px] h-[7px] rounded-full"
        style={{
          backgroundColor: dotStyle.dot,
          boxShadow: `0 0 8px ${dotStyle.glow}`,
        }}
      />

      <div className="p-6 flex-1">
        <div className="flex items-start justify-between mb-3">
          <span className="text-[11px] font-semibold text-muted-strong uppercase tracking-[0.1em]">
            {label}
          </span>
          {benchmark && (
            <span className="text-[11px] font-medium text-muted bg-cloud-dark/60 px-2 py-0.5 rounded-full mr-4">
              {benchmark}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between mb-1">
          <div className="flex items-baseline gap-2">
            <span ref={countRef as React.RefObject<HTMLSpanElement>} className="font-display text-[44px] text-navy leading-none tabular-nums">
              {animatedValue}
            </span>
            {unit && (
              <span className="text-[13px] text-muted font-medium">{unit}</span>
            )}
            {trend && (
              <span className="flex items-center gap-0.5">
                <TrendIcon size={14} color={trendColor} strokeWidth={2.5} />
                {trendPercent !== undefined && (
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: trendColor }}
                  >
                    {trendPercent > 0 ? "+" : ""}{trendPercent.toFixed(0)}%
                  </span>
                )}
              </span>
            )}
          </div>

          {sparklineData && sparklineData.length >= 2 && (
            <Sparkline data={sparklineData} status={status} />
          )}
        </div>

        {target !== undefined && (
          <p className="text-[12px] text-muted mt-1">
            Target: {target}
          </p>
        )}

        {insight && (
          <p className="text-[12px] text-muted italic mt-2 leading-relaxed">
            {insight}
          </p>
        )}
      </div>

      {/* Action link — bottom of card */}
      {action && (
        <div className="px-6 pb-4">
          {action.href ? (
            <Link
              href={action.href}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[12px] font-semibold transition-colors hover:underline"
              style={{ color: "#1C54F2" }}
            >
              {action.label} <span className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">→</span>
            </Link>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); action.onClick?.(); }}
              className="inline-flex items-center gap-1 text-[12px] font-semibold transition-colors hover:underline"
              style={{ color: "#1C54F2" }}
            >
              {action.label} <span className="inline-block transition-transform duration-150 group-hover:translate-x-0.5">→</span>
            </button>
          )}
        </div>
      )}

      {/* Progress bar — bottom */}
      {progress !== undefined && (
        <div className="h-[3px] w-full bg-black/[0.06]">
          <div
            className="h-full rounded-r-[2px] transition-all duration-700 ease-out"
            style={{
              width: `${Math.min(Math.max(progress, 0), 100)}%`,
              background: progressFill ?? "linear-gradient(90deg, #0891B2, #4B8BF5)",
            }}
          />
        </div>
      )}
    </div>
  );
}
