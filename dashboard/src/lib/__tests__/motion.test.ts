import { describe, it, expect } from "vitest";
import { DURATION, EASING, pillStyleFor } from "@/lib/motion";

describe("motion re-exports", () => {
  it("re-exports canonical easing", () => {
    expect(EASING).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  });

  it("re-exports DURATION map matching tokens", () => {
    expect(DURATION.mount).toBe(500);
    expect(DURATION.hover).toBe(300);
    expect(DURATION.pill).toBe(400);
    expect(DURATION.morphOut).toBe(150);
    expect(DURATION.morphIn).toBe(30);
    expect(DURATION.subtitleDelay).toBe(30);
  });
});

describe("pillStyleFor", () => {
  it("width is count fraction minus 2px", () => {
    expect(pillStyleFor(0, 4).width).toBe("calc(25% - 2px)");
    expect(pillStyleFor(0, 2).width).toBe("calc(50% - 2px)");
  });

  it("left edge positions proportionally", () => {
    expect(pillStyleFor(0, 4).left).toBe("calc(0% + 2px)");
    expect(pillStyleFor(2, 4).left).toBe("calc(50% + 2px)");
    expect(pillStyleFor(3, 4).left).toBe("calc(75% + 2px)");
  });

  it("transition uses canonical easing and pill duration", () => {
    const s = pillStyleFor(1, 3);
    expect(s.transition).toBe(
      "left 400ms cubic-bezier(0.16, 1, 0.3, 1)",
    );
  });
});
