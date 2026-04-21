import { RefObject, useEffect } from "react";

interface UseModalFocusTrapOptions {
  /** Whether the modal is open (trap only runs when true). */
  open: boolean;
  /** Invoked when the user presses Escape. Omit to disable Esc handling. */
  onEscape?: () => void;
  /** Optional guard — e.g. don't close while a request is in flight. */
  escapeEnabled?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button, [href], [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus-trap hook.
 *
 * On open:
 *   1. Saves the currently focused element
 *   2. After a 100ms tick, moves focus to the first `[data-autofocus]` inside the dialog
 *   3. Installs a keydown listener that:
 *        - calls `onEscape` on Escape (when `escapeEnabled`)
 *        - loops Tab / Shift+Tab within the dialog's focusable elements
 *
 * On close / unmount: removes the listener, clears the focus timer,
 * and restores focus to the previously focused element.
 */
export function useModalFocusTrap(
  dialogRef: RefObject<HTMLElement | null>,
  options: UseModalFocusTrapOptions,
): void {
  const { open, onEscape, escapeEnabled = true } = options;

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-autofocus]")
        ?.focus();
    }, 100);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (escapeEnabled && onEscape) onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, [open, onEscape, escapeEnabled, dialogRef]);
}
