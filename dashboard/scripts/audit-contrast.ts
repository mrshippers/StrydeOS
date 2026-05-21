#!/usr/bin/env -S npx tsx
/**
 * Contrast audit - Fix 1 gate for portal-premium-uplift.
 *
 * Attaches to the existing Chrome instance over CDP (port 9222 per
 * project CLAUDE.md), walks every authenticated portal route in both
 * light and dark mode, computes the WCAG contrast ratio of every
 * text-bearing element against its effective background, and writes
 * a JSON report alongside the design spec.
 *
 * Targets:
 *   - Body text:  ratio >= 4.5  (AA)
 *   - Large text: ratio >= 3.0  (AA - font-size >= 18.66px OR >= 14px bold)
 *   - AAA flag:   ratio >= 7.0
 *
 * Run:
 *   AUDIT_BASE_URL=http://localhost:3000 npm run audit:contrast
 *   AUDIT_BASE_URL=https://portal.strydeos.com npm run audit:contrast
 *
 * Output:
 *   docs/superpowers/specs/2026-05-16-portal-premium-uplift-design.contrast.json
 *
 * Exit code: 0 if zero failures across all routes/modes, 1 otherwise.
 */
import { chromium, type Browser, type Page } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const CDP_ENDPOINT = process.env.CDP_ENDPOINT ?? "http://localhost:9222";

/** Authenticated portal routes the auditor walks. */
const ROUTES = [
  "/",
  "/intelligence",
  "/receptionist",
  "/continuity",
  "/patients",
  "/clinicians",
  "/settings",
  "/billing",
  "/onboarding",
];

const OUT_PATH = resolve(
  __dirname,
  "../docs/superpowers/specs/2026-05-16-portal-premium-uplift-design.contrast.json",
);

interface ElementResult {
  selector: string;
  text: string;
  color: string;
  background: string;
  ratio: number;
  fontSize: number;
  fontWeight: number;
  isLarge: boolean;
  pass: boolean;
  aaa: boolean;
}

interface RouteResult {
  failures: ElementResult[];
  passes: number;
  aaaPasses: number;
  total: number;
}

interface Report {
  timestamp: string;
  baseUrl: string;
  byRoute: Record<string, { light: RouteResult; dark: RouteResult }>;
  summary: {
    totalElements: number;
    totalFailures: number;
    totalAaaPasses: number;
  };
}

async function captureRoute(
  page: Page,
  route: string,
  mode: "light" | "dark",
): Promise<RouteResult> {
  const url = `${BASE_URL}${route}`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    // Continue with whatever rendered - some routes may have ongoing XHR.
  }

  await page.evaluate((m) => {
    const cls = document.documentElement.classList;
    if (m === "dark") cls.add("dark");
    else cls.remove("dark");
  }, mode);
  await page.waitForTimeout(450);

  const results = await page.evaluate(() => {
    const parseRgba = (s: string): [number, number, number, number] | null => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
      const [r, g, b] = parts;
      const a = parts[3] ?? 1;
      return [r, g, b, a];
    };

    const relativeLuminance = (rgb: [number, number, number]): number => {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928
          ? v / 12.92
          : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    };

    const contrast = (a: number, b: number): number => {
      const L = Math.max(a, b);
      const D = Math.min(a, b);
      return (L + 0.05) / (D + 0.05);
    };

    const effectiveBg = (el: Element): [number, number, number] => {
      let cur: Element | null = el;
      while (cur) {
        const cs = getComputedStyle(cur);
        const parsed = parseRgba(cs.backgroundColor);
        if (parsed && parsed[3] > 0.1) {
          return [parsed[0], parsed[1], parsed[2]];
        }
        cur = cur.parentElement;
      }
      const bodyBg = parseRgba(getComputedStyle(document.body).backgroundColor);
      return bodyBg
        ? [bodyBg[0], bodyBg[1], bodyBg[2]]
        : [255, 255, 255];
    };

    const selectorFor = (el: Element): string => {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      if (typeof el.className === "string" && el.className.trim().length > 0) {
        const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
        return `${tag}.${classes}`;
      }
      return tag;
    };

    const out: Array<{
      selector: string;
      text: string;
      color: string;
      background: string;
      ratio: number;
      fontSize: number;
      fontWeight: number;
      isLarge: boolean;
      pass: boolean;
      aaa: boolean;
    }> = [];

    const nodes = document.querySelectorAll<HTMLElement>("body *");
    nodes.forEach((el) => {
      const hasDirectText = Array.from(el.childNodes).some(
        (n) =>
          n.nodeType === Node.TEXT_NODE &&
          (n.textContent ?? "").trim().length > 0,
      );
      if (!hasDirectText) return;
      const text = (el.textContent ?? "").trim();
      if (text.length === 0) return;

      const cs = getComputedStyle(el);
      const fg = parseRgba(cs.color);
      if (!fg || fg[3] < 0.1) return;
      const bgRgb = effectiveBg(el);
      const Lfg = relativeLuminance([fg[0], fg[1], fg[2]]);
      const Lbg = relativeLuminance(bgRgb);
      const ratio = contrast(Lfg, Lbg);
      const fontSize = parseFloat(cs.fontSize) || 14;
      const fontWeight = parseInt(cs.fontWeight, 10) || 400;
      const isLarge = fontSize >= 18.66 || (fontSize >= 14 && fontWeight >= 700);
      const threshold = isLarge ? 3 : 4.5;
      const rounded = Math.round(ratio * 100) / 100;

      out.push({
        selector: selectorFor(el),
        text: text.slice(0, 80),
        color: cs.color,
        background: `rgb(${bgRgb.join(",")})`,
        ratio: rounded,
        fontSize,
        fontWeight,
        isLarge,
        pass: ratio >= threshold,
        aaa: ratio >= 7,
      });
    });

    return out;
  });

  const failures = results.filter((r) => !r.pass);
  const aaaPasses = results.filter((r) => r.aaa).length;
  return {
    failures,
    passes: results.length - failures.length,
    aaaPasses,
    total: results.length,
  };
}

async function main(): Promise<void> {
  console.log(`Audit baseUrl=${BASE_URL} cdp=${CDP_ENDPOINT}`);
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  } catch {
    console.error(
      `Cannot connect to Chrome at ${CDP_ENDPOINT}. Is Chrome running with --remote-debugging-port=9222?`,
    );
    process.exit(2);
  }

  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();

  const report: Report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    byRoute: {},
    summary: { totalElements: 0, totalFailures: 0, totalAaaPasses: 0 },
  };

  for (const route of ROUTES) {
    console.log(`Auditing ${route}...`);
    const light = await captureRoute(page, route, "light");
    const dark = await captureRoute(page, route, "dark");
    report.byRoute[route] = { light, dark };
    report.summary.totalElements += light.total + dark.total;
    report.summary.totalFailures += light.failures.length + dark.failures.length;
    report.summary.totalAaaPasses += light.aaaPasses + dark.aaaPasses;
    console.log(
      `  light: ${light.failures.length} fail / ${light.total} total | aaa ${light.aaaPasses}`,
    );
    console.log(
      `  dark:  ${dark.failures.length} fail / ${dark.total} total | aaa ${dark.aaaPasses}`,
    );
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), "utf-8");
  await page.close();

  console.log(`\nReport: ${OUT_PATH}`);
  console.log(
    `Summary: ${report.summary.totalFailures} failures across ${report.summary.totalElements} elements (${report.summary.totalAaaPasses} AAA).`,
  );

  process.exit(report.summary.totalFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
