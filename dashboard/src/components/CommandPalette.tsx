"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Search,
  LayoutGrid,
  Users,
  RefreshCw,
  Phone,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  ArrowRight,
  Command,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useClinicians } from "@/hooks/useClinicians";

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  action: () => void;
  section: "pages" | "clinicians" | "actions";
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { clinicians } = useClinicians();
  const isSuperAdmin = user?.role === "superadmin";

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const items: PaletteItem[] = useMemo(() => {
    const pages: PaletteItem[] = [
      { id: "dashboard", label: "Dashboard", icon: LayoutGrid, action: () => { router.push("/dashboard"); close(); }, section: "pages" },
      { id: "clinicians", label: "Clinicians", icon: Users, action: () => { router.push("/clinicians"); close(); }, section: "pages" },
      { id: "continuity", label: "Patient Continuity", icon: RefreshCw, action: () => { router.push("/continuity"); close(); }, section: "pages" },
      { id: "receptionist", label: "Receptionist", icon: Phone, action: () => { router.push("/receptionist"); close(); }, section: "pages" },
      { id: "intelligence", label: "Intelligence", icon: BarChart3, action: () => { router.push("/intelligence"); close(); }, section: "pages" },
      { id: "settings", label: "Settings", icon: Settings, action: () => { router.push("/settings"); close(); }, section: "pages" },
    ];

    if (isSuperAdmin) {
      pages.push({
        id: "admin",
        label: "Stryde Super User",
        icon: Shield,
        action: () => { router.push("/admin"); close(); },
        section: "pages",
      });
    }

    const clinicianItems: PaletteItem[] = clinicians
      .filter((c) => c.active)
      .map((c) => ({
        id: `clinician-${c.id}`,
        label: c.name,
        sublabel: c.role,
        icon: Users,
        action: () => {
          router.push(`/clinicians?id=${c.id}`);
          close();
        },
        section: "clinicians" as const,
      }));

    const actions: PaletteItem[] = [
      {
        id: "signout",
        label: "Sign out",
        icon: LogOut,
        action: async () => {
          close();
          await signOut();
          router.replace("/login");
        },
        section: "actions",
      },
    ];

    return [...pages, ...clinicianItems, ...actions];
  }, [clinicians, isSuperAdmin, router, close, signOut]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items.filter(
      (item) =>
        fuzzyMatch(query, item.label) ||
        (item.sublabel && fuzzyMatch(query, item.sublabel))
    );
  }, [query, items]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault();
      filtered[activeIndex].action();
    } else if (e.key === "Escape") {
      close();
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const sections = useMemo(() => {
    const map: Record<string, PaletteItem[]> = {};
    for (const item of filtered) {
      if (!map[item.section]) map[item.section] = [];
      map[item.section].push(item);
    }
    return map;
  }, [filtered]);

  const sectionLabels: Record<string, string> = {
    pages: "Pages",
    clinicians: "Clinicians",
    actions: "Actions",
  };

  let globalIndex = -1;

  return (
    <>
      {/* Keyboard hint in sidebar area -- rendered by AppShell */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4"
            style={{ background: "rgba(11, 37, 69, 0.5)", backdropFilter: "blur(4px)" }}
            onClick={close}
          >
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl overflow-hidden"
              style={{
                background: "#fff",
                boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
                border: "1px solid var(--color-border)",
              }}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search size={16} className="text-muted shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search pages, clinicians, actions..."
                  className="flex-1 bg-transparent text-sm text-navy placeholder-muted/50 focus:outline-none"
                />
                <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted bg-cloud-dark/60 border border-border">
                  esc
                </kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[340px] overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-muted">No results for &ldquo;{query}&rdquo;</p>
                  </div>
                ) : (
                  Object.entries(sections).map(([section, sectionItems]) => (
                    <div key={section}>
                      <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-muted/50 uppercase tracking-widest">
                        {sectionLabels[section] ?? section}
                      </p>
                      {sectionItems.map((item) => {
                        globalIndex++;
                        const idx = globalIndex;
                        const isActive = idx === activeIndex;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            data-index={idx}
                            onClick={item.action}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              isActive ? "bg-blue/8 text-navy" : "text-navy/70 hover:bg-cloud-light"
                            }`}
                          >
                            <Icon size={15} className={isActive ? "text-blue" : "text-muted"} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">{item.label}</span>
                              {item.sublabel && (
                                <span className="text-[11px] text-muted ml-2">{item.sublabel}</span>
                              )}
                            </div>
                            {isActive && <ArrowRight size={12} className="text-blue shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-[10px] text-muted">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-cloud-dark/60 border border-border font-medium">↑</kbd>
                    <kbd className="px-1 py-0.5 rounded bg-cloud-dark/60 border border-border font-medium">↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 rounded bg-cloud-dark/60 border border-border font-medium">↵</kbd>
                    select
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <Command size={10} />K to toggle
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
