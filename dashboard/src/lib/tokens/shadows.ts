/**
 * Three-layer shadow stacks for the GlassCard system.
 * Lifted verbatim from website/ava-conversation-card.jsx:638-639.
 * `rest` and `hover` map to GlassCard idle and hover states.
 * `modal` matches the canonical SeatLimitModal depth.
 */
export const shadows = {
  rest: "0 1px 2px rgba(0,0,0,0.03), 0 4px 24px rgba(0,0,0,0.04), 0 12px 48px rgba(0,0,0,0.02)",
  hover:
    "0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06), 0 16px 56px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)",
  modal: "0 32px 80px rgba(0,0,0,0.25)",
} as const;

export type ShadowKey = keyof typeof shadows;
