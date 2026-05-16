import { describe, it, expect } from "vitest";
import {
  brand,
  moduleColors,
  hexToRgba,
  shadows,
  motion,
  glass,
} from "@/lib/tokens";
import {
  brand as brandLegacy,
  moduleColors as moduleColorsLegacy,
  hexToRgba as hexToRgbaLegacy,
} from "@/lib/brand";

describe("tokens/colors", () => {
  it("brand exposes the canonical palette", () => {
    expect(brand.navy).toBe("#0B2545");
    expect(brand.blue).toBe("#1C54F2");
    expect(brand.teal).toBe("#0891B2");
    expect(brand.purple).toBe("#8B5CF6");
    expect(brand.cloud).toBe("#F2F1EE");
    expect(brand.ink).toBe("#111827");
  });

  it("moduleColors maps modules to canonical hexes", () => {
    expect(moduleColors.ava).toBe(brand.blue);
    expect(moduleColors.pulse).toBe(brand.teal);
    expect(moduleColors.intelligence).toBe(brand.purple);
    expect(moduleColors.default).toBe(brand.navy);
  });

  it("hexToRgba converts hex to rgba string", () => {
    expect(hexToRgba("#1C54F2", 0.5)).toBe("rgba(28,84,242,0.5)");
    expect(hexToRgba("#0B2545", 1)).toBe("rgba(11,37,69,1)");
  });

  it("legacy @/lib/brand barrel re-exports the same surface", () => {
    expect(brandLegacy).toBe(brand);
    expect(moduleColorsLegacy).toBe(moduleColors);
    expect(hexToRgbaLegacy).toBe(hexToRgba);
  });
});

describe("tokens/shadows", () => {
  it("rest stack has three black-alpha layers", () => {
    expect(shadows.rest).toContain("0 1px 2px");
    expect(shadows.rest).toContain("0 4px 24px");
    expect(shadows.rest).toContain("0 12px 48px");
  });

  it("hover stack adds a fourth layer plus inset highlight", () => {
    expect(shadows.hover).toContain("0 2px 4px");
    expect(shadows.hover).toContain("0 8px 32px");
    expect(shadows.hover).toContain("0 16px 56px");
    expect(shadows.hover).toContain("inset 0 1px 0 rgba(255,255,255,0.7)");
  });

  it("modal stack matches the canonical SeatLimitModal depth", () => {
    expect(shadows.modal).toContain("0 32px 80px");
    expect(shadows.modal).toContain("rgba(0,0,0,0.25)");
  });
});

describe("tokens/motion", () => {
  it("easing matches the canonical cubic-bezier", () => {
    expect(motion.easing).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  });

  it("duration map exposes the canonical milliseconds", () => {
    expect(motion.duration.mount).toBe(500);
    expect(motion.duration.hover).toBe(300);
    expect(motion.duration.pill).toBe(400);
    expect(motion.duration.morphOut).toBe(150);
    expect(motion.duration.morphIn).toBe(30);
    expect(motion.duration.subtitleDelay).toBe(30);
  });

  it("hoverLift covers all four variants", () => {
    expect(motion.hoverLift.hero).toContain("translateY(-6px)");
    expect(motion.hoverLift.hero).toContain("scale(1.015)");
    expect(motion.hoverLift.primary).toContain("translateY(-6px)");
    expect(motion.hoverLift.standard).toBe("translateY(-2px)");
    expect(motion.hoverLift.row).toBe("none");
  });

  it("borderOpacity rest and hover are bounded", () => {
    expect(motion.borderOpacity.rest).toBe(0.07);
    expect(motion.borderOpacity.hover).toBe(0.6);
  });
});

describe("tokens/glass", () => {
  it("exposes six absolutely-positioned layers", () => {
    (["L1", "L2", "L3", "L4", "L5", "L6"] as const).forEach((key) => {
      expect(glass[key].position).toBe("absolute");
      expect(glass[key].pointerEvents).toBe("none");
    });
  });

  it("L1 caps the top with a downward gradient", () => {
    expect(glass.L1.background).toContain("linear-gradient(180deg");
    expect(glass.L1.borderRadius).toBe("24px 24px 0 0");
  });

  it("L3 is the radial light source", () => {
    expect(glass.L3.background).toContain("radial-gradient(circle");
  });

  it("L6 inner border radius is one less than outer", () => {
    expect(glass.L6.borderRadius).toBe(23);
  });

  it("ambientAlpha defines glow strength per variant", () => {
    expect(glass.ambientAlpha.hero).toBeGreaterThan(
      glass.ambientAlpha.primary,
    );
    expect(glass.ambientAlpha.standard).toBe(0);
    expect(glass.ambientAlpha.row).toBe(0);
  });
});
