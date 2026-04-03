"use client";

import { useState, useEffect } from "react";

const PORTAL_ROOT_ID = "portal-root";

/**
 * Returns a safe DOM element for createPortal, or null during SSR / before mount.
 * Prefers #portal-root if present, falls back to document.body.
 */
export function usePortalTarget(): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById(PORTAL_ROOT_ID) ?? document.body);
  }, []);

  return target;
}
