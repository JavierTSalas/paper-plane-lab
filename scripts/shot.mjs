#!/usr/bin/env node
// Local visual check helper (not used in CI).
// Usage: node scripts/shot.mjs <baseUrl> <hashRoute> <outPrefix> [waitMs] [--click "selector"]...
// Writes <outPrefix>-mobile.png (390x844) and <outPrefix>-desktop.png (1280x800). Prints console errors.
import { chromium } from 'playwright';

const [, , base = 'http://localhost:5173', route = '/', out = '/tmp/shot', waitArg = '1200', ...rest] = process.argv;
const waitMs = Number(waitArg) || 1200;
const clicks = [];
for (let i = 0; i < rest.length; i++) if (rest[i] === '--click' && rest[i + 1]) clicks.push(rest[++i]);
const seed = rest.includes('--fresh') ? null : process.env.PPL_STATE ?? null;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
for (const [name, viewport, mobile] of [
  ['mobile', { width: 390, height: 844 }, true],
  ['desktop', { width: 1280, height: 800 }, false],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') { failed = true; console.log(`[${name}] console.error: ${m.text()}`); } });
  page.on('pageerror', (e) => { failed = true; console.log(`[${name}] pageerror: ${e.message}`); });
  if (seed) await page.addInitScript((s) => { try { localStorage.setItem('ppl-state', s); } catch {} }, seed);
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
  for (const sel of clicks) { await page.locator(sel).first().click({ timeout: 5000 }); await page.waitForTimeout(400); }
  await page.waitForTimeout(waitMs);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) console.log(`[${name}] horizontal overflow: ${overflow}px`);
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log(`[${name}] wrote ${out}-${name}.png`);
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
