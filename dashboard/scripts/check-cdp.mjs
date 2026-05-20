import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://localhost:9222");
console.log("contexts:", browser.contexts().length);
for (const [i, ctx] of browser.contexts().entries()) {
  const pages = ctx.pages();
  const vcCookies = await ctx.cookies("https://vercel.com");
  console.log(`ctx ${i}: pages=${pages.length}, vercel.com cookies=${vcCookies.length}`);
  for (const p of pages.slice(0, 6)) console.log(`  page: ${p.url()}`);
}
