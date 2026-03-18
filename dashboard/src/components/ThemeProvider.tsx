"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: (e?: React.MouseEvent | MouseEvent) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

const STORAGE_KEY = "strydeos-app-theme";
const WIPE_DURATION = 2500;

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage unavailable
  }
  return "light";
}

interface WipeState {
  nextTheme: Theme;
  x: number;
  y: number;
}

function WipeOverlay({ wipe, onDone }: { wipe: WipeState; onDone: () => void }) {
  const bg = wipe.nextTheme === "dark"
    ? `radial-gradient(ellipse at ${wipe.x}px ${wipe.y}px, #1a3a6e 0%, #132D5E 30%, #0B2545 70%, #091e38 100%)`
    : `radial-gradient(ellipse at ${wipe.x}px ${wipe.y}px, #FFFFFF 0%, #FAF9F7 30%, #F2F1EE 70%, #E8E6E0 100%)`;

  return createPortal(
    <>
      {/* Soft glow halo — leads the wipe for depth */}
      <div
        className="theme-wipe-glow"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          pointerEvents: "none",
          background: wipe.nextTheme === "dark"
            ? `radial-gradient(circle at ${wipe.x}px ${wipe.y}px, rgba(75,139,245,0.12) 0%, transparent 60%)`
            : `radial-gradient(circle at ${wipe.x}px ${wipe.y}px, rgba(28,84,242,0.06) 0%, transparent 60%)`,
          "--wipe-x": `${wipe.x}px`,
          "--wipe-y": `${wipe.y}px`,
        } as React.CSSProperties}
      />
      {/* Main wipe surface */}
      <div
        className="theme-wipe-overlay"
        onAnimationEnd={onDone}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "none",
          background: bg,
          "--wipe-x": `${wipe.x}px`,
          "--wipe-y": `${wipe.y}px`,
        } as React.CSSProperties}
      />
    </>,
    document.body
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [wipe, setWipe] = useState<WipeState | null>(null);
  const wipeActive = useRef(false);

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable
    }
  }, [theme, applyTheme]);

  const toggleTheme = useCallback((e?: React.MouseEvent | MouseEvent) => {
    if (wipeActive.current) return;

    const nextTheme: Theme = theme === "light" ? "dark" : "light";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !e) {
      setTheme(nextTheme);
      return;
    }

    const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : e.clientX;
    const y = rect ? rect.top + rect.height / 2 : e.clientY;

    wipeActive.current = true;
    setWipe({ nextTheme, x, y });
    setTimeout(() => setTheme(nextTheme), WIPE_DURATION * 0.35);
  }, [theme]);

  const handleWipeDone = useCallback(() => {
    setWipe(null);
    wipeActive.current = false;
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        toggleTheme();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
      {wipe && <WipeOverlay wipe={wipe} onDone={handleWipeDone} />}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
