"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { CheckCircle, AlertTriangle, X, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

type ToastVariant = "success" | "warn" | "error" | "info";

const TOAST_DURATION = 4000;

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  const progressRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const dragging = useRef(false);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    el.style.transform = "scaleX(1)";
    const raf = requestAnimationFrame(() => {
      el.style.transition = `transform ${TOAST_DURATION}ms linear`;
      el.style.transform = "scaleX(0)";
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
    dragging.current = true;
    itemRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    currentX.current = e.clientX - startX.current;
    if (itemRef.current) {
      const x = Math.max(0, currentX.current);
      itemRef.current.style.transform = `translateX(${x}px)`;
      itemRef.current.style.opacity = `${1 - x / 250}`;
    }
  }

  function handlePointerUp() {
    dragging.current = false;
    if (currentX.current > 80) {
      onDismiss(t.id);
    } else if (itemRef.current) {
      itemRef.current.style.transition = "transform 0.2s, opacity 0.2s";
      itemRef.current.style.transform = "translateX(0)";
      itemRef.current.style.opacity = "1";
      setTimeout(() => {
        if (itemRef.current) itemRef.current.style.transition = "";
      }, 200);
    }
  }

  const bg =
    t.variant === "success" ? "#ECFDF5"
    : t.variant === "warn" ? "#FFFBEB"
    : t.variant === "error" ? "#FEF2F2"
    : "#EFF6FF";

  const border =
    t.variant === "success" ? "#A7F3D0"
    : t.variant === "warn" ? "#FDE68A"
    : t.variant === "error" ? "#FECACA"
    : "#BFDBFE";

  const color =
    t.variant === "success" ? "#065F46"
    : t.variant === "warn" ? "#92400E"
    : t.variant === "error" ? "#991B1B"
    : "#1E40AF";

  const progressColor =
    t.variant === "success" ? "#059669"
    : t.variant === "warn" ? "#D97706"
    : t.variant === "error" ? "#DC2626"
    : "#2563EB";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      ref={itemRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="pointer-events-auto flex flex-col rounded-xl shadow-[var(--shadow-elevated)] min-w-[280px] max-w-sm overflow-hidden touch-pan-y select-none"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-sm font-medium">
        {t.variant === "success" && <CheckCircle size={16} strokeWidth={2} />}
        {t.variant === "warn" && <AlertTriangle size={16} strokeWidth={2} />}
        {t.variant === "error" && <AlertTriangle size={16} strokeWidth={2} />}
        {t.variant === "info" && <Info size={16} strokeWidth={2} />}
        <span className="flex-1">{t.message}</span>
        <button
          onClick={() => onDismiss(t.id)}
          className="opacity-50 hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
      <div className="h-[2px] w-full" style={{ background: `${progressColor}20` }}>
        <div
          ref={progressRef}
          className="h-full origin-left"
          style={{ background: progressColor }}
        />
      </div>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant, createdAt: Date.now() }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} t={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
