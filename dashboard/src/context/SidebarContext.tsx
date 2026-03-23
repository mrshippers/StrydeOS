"use client";

import { createContext, useContext, useState, useMemo, type ReactNode } from "react";

type SidebarState = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
};

const SidebarContext = createContext<SidebarState>({
  collapsed: false,
  setCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("strydeos-sidebar-seen") === "1";
    } catch {
      return false;
    }
  });

  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed, setCollapsed]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
