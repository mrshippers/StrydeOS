"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { CheckCircle, AlertTriangle, X, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

type ToastVariant = "success" | "warn" | "error" | "info";

const TOAST_DURATION = 4000;
const MAX_VISIBLE = 3;

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

const variantStyles: Record<ToastVariant, { bg: string; border: string; text: string; progress: string }> = {
  success: {
    bg: "var(--color-success-bg, #ECFDF5)",
    border: "var(--color-success-border, #A7F3D0)",
    text: "var(--color-success-text, #065F46)",
    progress: "var(--color-success, #059669)",
  },
  warn: {
    bg: "var(--color-warn-bg, #FFFBEB)",
    border: "var(--color-warn-border, #FDE68A)",
    text: "var(--color-warn-text, #92400E)",
    progress: "var(--color-warn, #D97706)",
  },
  error: {
    bg: "var(--color-danger-bg, #FEF2F2)",
    border: "var(--color-danger-border, #FECACA)",
    text: "var(--color-danger-text, #991B1B)",
    progress: "var(--color-danger, #EF4444)",
  },
  info: {
    bg: "var(--color-info-bg, #EFF6FF)",
    border: "var(--color-info-border, #BFDBFE)",
    text: "var(--color-info-text, #1E40AF)",
    progress: "var(--color-blue, #2563EB)",
  },
};

function ToastItem({
  t,
  onDismiss,
  stackIndex,
}: {
  t: Toast;
  onDismiss: (id: string) => void;
  stackIndex: number;
}) {
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
    if (stackIndex !== 0) return;
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

  const styles = variantStyles[t.variant];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{
        opacity: stackIndex === 0 ? 1 : 1 - stackIndex * 0.15,
        x: 0,
        scale: 1 - stackIndex * 0.04,
        y: stackIndex * -8,
      }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      ref={itemRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role={t.variant === "error" || t.variant === "warn" ? "alert" : "status"}
      className="pointer-events-auto flex flex-col rounded-xl shadow-[var(--shadow-elevated)] min-w-[280px] max-w-sm overflow-hidden touch-pan-y select-none origin-bottom-right"
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.text,
        zIndex: MAX_VISIBLE - stackIndex,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-sm font-medium">
        {t.variant === "success" && <CheckCircle size={16} strokeWidth={2} />}
        {t.variant === "warn" && <AlertTriangle size={16} strokeWidth={2} />}
        {t.variant === "error" && <AlertTriangle size={16} strokeWidth={2} />}
        {t.variant === "info" && <Info size={16} strokeWidth={2} />}
        <span className="flex-1">{t.message}</span>
        <button
          onClick={() => onDismiss(t.id)}
          aria-label="Dismiss notification"
          className="opacity-50 hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
      <div className="h-[2px] w-full" style={{ background: `${styles.progress}20` }}>
        <div
          ref={progressRef}
          className="h-full origin-left"
          style={{ background: styles.progress }}
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

  const visible = toasts.slice(-MAX_VISIBLE).reverse();

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] pointer-events-none" role="region" aria-label="Notifications" aria-live="polite">
        <div className="relative flex flex-col items-end">
          <AnimatePresence mode="popLayout">
            {visible.map((t, i) => (
              <div key={t.id} className={i > 0 ? "absolute bottom-0 right-0" : ""}>
                <ToastItem t={t} onDismiss={dismiss} stackIndex={i} />
              </div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
