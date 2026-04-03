"use client";

import { useEffect, useRef } from "react";

/**
 * Locks document.body scroll when `locked` is true.
 * Preserves the previous overflow value on cleanup so concurrent
 * consumers (SplashScreen + NotificationPanel) don't clobber each other.
 */
export function useBodyScrollLock(locked: boolean) {
  const prevRef = useRef<string>("");

  useEffect(() => {
    if (!locked) return;

    prevRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevRef.current;
    };
  }, [locked]);
}
