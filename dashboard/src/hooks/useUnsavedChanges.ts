"use client";

import { useEffect, useCallback, useState } from "react";

interface UseUnsavedChangesOptions {
  isDirty: boolean;
  message?: string;
}

export function useUnsavedChanges({
  isDirty,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: UseUnsavedChangesOptions) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Browser tab close / reload
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = message;
      return message;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, message]);

  // In-app navigation intercept via click delegation on anchor tags
  useEffect(() => {
    if (!isDirty) return;

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;

      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
      setShowDialog(true);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    setShowDialog(false);
    if (pendingHref) {
      window.location.href = pendingHref;
    }
  }, [pendingHref]);

  const cancelLeave = useCallback(() => {
    setShowDialog(false);
    setPendingHref(null);
  }, []);

  return { showDialog, confirmLeave, cancelLeave };
}
