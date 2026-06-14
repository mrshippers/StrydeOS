/**
 * Three-layer shadow stacks for the GlassCard system.
 * Navy-tinted (11,37,69) rather than black: on the warm #F2F1EE canvas a
 * navy shadow reads as cool ambient light where a grey one reads as dirt.
 * `rest`/`hover` mirror --shadow-card/--shadow-elevated in globals.css @theme —
 * update both together. Dark-mode stacks live only in globals.css html.dark.
 */
export const shadows = {
  rest: "0 1px 2px rgba(11,37,69,0.05), 0 4px 16px rgba(11,37,69,0.06), 0 16px 48px rgba(11,37,69,0.05)",
  hover:
    "0 2px 6px rgba(11,37,69,0.07), 0 12px 32px rgba(11,37,69,0.09), 0 24px 64px rgba(11,37,69,0.06), inset 0 1px 0 rgba(255,255,255,0.85)",
  modal: "0 32px 80px rgba(0,0,0,0.25)",
} as const;

export type ShadowKey = keyof typeof shadows;
