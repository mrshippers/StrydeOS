"use client";

import { useEffect, useRef, useState } from "react";
import { motion as tokens } from "./tokens/motion";

export const EASING = tokens.easing;
export const DURATION = tokens.duration;

/**
 * Flips to true after two animation frames. Single rAF can miss the
 * first paint frame in React 19, so a double rAF is required to make
 * the mount fade visible on every card.
 */
export function useDoubleRAF(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let id2: number | undefined;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setMounted(true));
    });
    return () => {
      cancelAnimationFrame(id1);
      if (id2 !== undefined) cancelAnimationFrame(id2);
    };
  }, []);
  return mounted;
}

/**
 * Two-stage value morph. 150ms out, swap, 30ms in. Consumer binds
 * `opacity` to `!isAnimating` and renders `value`. Stagger between
 * a headline value and its subtitle is handled by passing
 * `DURATION.subtitleDelay` to the subtitle's transition delay.
 */
export function useMorphValue<T>(
  target: T,
): { value: T; isAnimating: boolean } {
  const [value, setValue] = useState<T>(target);
  const [isAnimating, setIsAnimating] = useState(false);
  const previous = useRef<T>(target);

  useEffect(() => {
    if (previous.current === target) return;
    previous.current = target;
    setIsAnimating(true);
    const out = setTimeout(() => {
      setValue(target);
      setTimeout(() => setIsAnimating(false), DURATION.morphIn);
    }, DURATION.morphOut);
    return () => clearTimeout(out);
  }, [target]);

  return { value, isAnimating };
}

/**
 * Pure helper for the sliding pill geometry. Exposed as a separate
 * function so it can be unit-tested without rendering.
 */
export function pillStyleFor(
  activeIndex: number,
  count: number,
): { width: string; left: string; transition: string } {
  return {
    width: `calc(${100 / count}% - 2px)`,
    left: `calc(${(activeIndex * 100) / count}% + 2px)`,
    transition: `left ${DURATION.pill}ms ${EASING}`,
  };
}

/**
 * Sliding-pill style for segmented controls. Pattern: pill div at
 * zIndex 1 absolute-positioned via the returned style, buttons sit
 * transparent at zIndex 2 above.
 */
export function useSlidingPill(
  activeIndex: number,
  count: number,
): { pillStyle: { width: string; left: string; transition: string } } {
  return { pillStyle: pillStyleFor(activeIndex, count) };
}
