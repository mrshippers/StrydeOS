/**
 * Brand barrel - re-exports the tokens system at src/lib/tokens/.
 * Every existing `import { brand, moduleColors, hexToRgba } from '@/lib/brand'`
 * continues to work. New code should prefer `from '@/lib/tokens'`.
 */
export { brand, moduleColors, hexToRgba } from "./tokens/colors";
export type { BrandColor } from "./tokens/colors";
export { shadows } from "./tokens/shadows";
export type { ShadowKey } from "./tokens/shadows";
export { motion as motionTokens } from "./tokens/motion";
export type { Variant as MotionVariant, MotionEasing } from "./tokens/motion";
export { glass } from "./tokens/glass";
export type { GlassLayer } from "./tokens/glass";
