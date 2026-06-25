"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { EASING } from "@/lib/motion";

interface SortableTileProps {
  id: string;
  /** Human label for the drag handle's aria-label, e.g. "Revenue". */
  label: string;
  children: ReactNode;
}

/**
 * Wraps a dashboard tile in a drag-sortable shell. The card body stays a normal
 * (clickable) link — only the corner grip handle carries the drag/keyboard
 * listeners, so a click still navigates and a grab still reorders. The handle is
 * keyboard-operable (space to lift, arrows to move) for accessible reordering.
 */
export function SortableTile({ id, label, children }: SortableTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const wrapperStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    position: "relative",
  };

  const liftStyle: CSSProperties = {
    position: "relative",
    borderRadius: 24,
    transform: isDragging ? "scale(1.025)" : "scale(1)",
    boxShadow: isDragging
      ? "0 24px 60px rgba(11,37,69,0.30), 0 6px 18px rgba(11,37,69,0.18)"
      : undefined,
    transition: `transform 200ms ${EASING}, box-shadow 200ms ${EASING}`,
    willChange: "transform",
  };

  return (
    <li ref={setNodeRef} style={wrapperStyle} className="group/sortable list-none">
      <div style={liftStyle}>
        {children}

        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Reorder ${label} card`}
          title="Drag to reorder"
          className={[
            "absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-lg inline-flex items-center justify-center",
            "text-navy/40 dark:text-white/40 hover:text-navy/75 dark:hover:text-white/75",
            "bg-white/55 dark:bg-white/[0.07] border border-navy/5 dark:border-white/10",
            "opacity-0 group-hover/sortable:opacity-100 focus-visible:opacity-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40",
            "transition-opacity duration-200 cursor-grab active:cursor-grabbing",
          ].join(" ")}
          style={{ touchAction: "none", backdropFilter: "blur(8px)" }}
        >
          <GripVertical size={14} />
        </button>
      </div>
    </li>
  );
}
