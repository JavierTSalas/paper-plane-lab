#!/usr/bin/env node
/*
 * End-to-end smoke test of Paper Plane Lab in a real browser. A local tool, not part of CI.
 *
 * Usage:
 *   npx vite build && npx vite preview --port 4173 --strictPort &      # serve the production build
 *   node scripts/smoke.cjs [baseUrl] [--out <dir>] [--only <a,b,...>] [--headed]
 *
 *   baseUrl   default http://localhost:4173 (a dev server such as http://localhost:5191 works too)
 *   --out     directory for screenshots, default <tmp>/ppl-smoke
 *   --only    run only the steps whose letter is listed (later steps may need the state of earlier ones)
 *   --headed  show the browser
 *
 * What it does: one phone-sized touch context (390 x 844) starts from a first visit and walks through the app
 * as a player would, tapping with a "finger" (Playwright touch taps):
 *   a  onboarding from hello to graduation, ending in the hangar with the saved dart
 *   b  hangar: open the Nakamura Lock from the library, fold it (guided), shape, trim, save
 *   c  fly in the gym: throw with the button, result card, Details sheet open and closed
 *   d  Record Hangar: throw, enter the ranking, submit, own entry highlighted on Ranks
 *   e  ranks: open a lab benchmark entry and watch its replay in Fly
 *   f  tunnel: loads, the angle slider changes the readouts, "Go to trim" works
 *   g  plane detail: stats and "Looks like" matches
 *   h  freeform: blank sheet, one fold by a pointer drag between two snap points, shape, save
 *   i  notebook index and one topic; settings sheet
 *   w  the main routes once at 1280 x 800 (screenshots for a layout check)
 *   r  settings: reset progress, back to a first visit with nothing left in storage
 * Every step collects console errors and page errors, checks for horizontal overflow and saves screenshots.
 * It prints one PASS / FAIL line per step and exits non-zero when any step failed.
 *
 * Playwright is expected to be installed globally (it is not a dependency of this repository).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

/* ------------------------------------------------------------------ arguments */

const argv = process.argv.slice(2);
let base = 'http://localhost:4173';
let outDir = path.join(os.tmpdir(), 'ppl-smoke');
let only = null;
let headed = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') outDir = argv[++i];
  else if (a === '--only') only = new Set(argv[++i].split(','));
  else if (a === '--headed') headed = true;
  else if (!a.startsWith('--')) base = a.replace(/\/+$/, '');
}
fs.mkdirSync(outDir, { recursive: true });

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const GPU_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
/** A flight is simulated in milliseconds but played back in real time: the longest waits are for landings. */
const LAND_TIMEOUT = 90_000;

/* ------------------------------------------------------------------ helpers */

class Check extends Error {}
const expect = (cond, message) => {
  if (!cond) throw new Check(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
let problems = [];

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${label}console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${label}pageerror: ${e.message}`));
}

async function overflowOf(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/**
 * A screenshot with motion reduced for the moment of capture. Needed on the tunnel page: under the software
 * GL of headless Chromium (SwiftShader) its endless smoke animation starves the screenshot capture, which then
 * takes seconds or never returns (and later captures on the same page hang too). The checks themselves run
 * with the animation on.
 */
async function shotStill(page, name) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(250);
  try {
    return await shot(page, name);
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
}

/** The persisted lab state. */
const labState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ppl-state') || '{"state":{}}').state);

/** Names of the visible buttons, for failure messages. */
async function visibleButtons(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, a[href]')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      })
      .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40))
      .filter(Boolean)
      .slice(0, 40)
      .join(' | '),
  );
}

async function runStep(id, title, page, fn) {
  if (only && !only.has(id)) return;
  problems = [];
  const started = Date.now();
  let failure = null;
  try {
    await fn();
    const overflow = await overflowOf(page);
    if (overflow > 1) problems.push(`horizontal overflow of ${overflow}px at ${page.url()}`);
  } catch (err) {
    failure = err instanceof Check ? err.message : String(err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : err);
    try {
      failure += `\n      at ${page.url()}\n      visible: ${await visibleButtons(page)}`;
      await shot(page, `${id}-FAILED`);
    } catch {
      /* the page is gone */
    }
  }
  const ok = failure === null && problems.length === 0;
  results.push({ id, title, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${title}  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  if (failure) console.log(`      ${failure}`);
  for (const p of problems) console.log(`      ${p}`);
}

/** A finger tap on the first visible match. Fails when something else lies on top of it. */
async function tap(target, opts = {}) {
  const loc = target.first();
  await loc.waitFor({ state: 'visible', timeout: opts.timeout ?? 15_000 });
  await loc.tap({ timeout: opts.timeout ?? 15_000 });
}

const button = (page, name, exact = true) => page.getByRole('button', { name, exact });
const sheet = (page) => page.locator('dialog.ppl-sheet[open]');

async function closeSheet(page) {
  await tap(sheet(page).locator('.ppl-sheet__close'));
  await sheet(page).waitFor({ state: 'detached', timeout: 5000 });
}

async function goto(page, route) {
  await page.evaluate((r) => {
    window.location.hash = `#${r}`;
  }, route);
  await sleep(300);
}

/** Set a range input the way a person would move it: through the native value setter and an input event. */
async function setRange(loc, value) {
  await loc.first().evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** The slider (its wrapper) whose label is exactly `label`, inside `scope`. */
const slider = (scope, label) => scope.locator('.ppl-slider').filter({ has: scope.page().locator('.ppl-slider__label', { hasText: new RegExp(`^${label}$`) }) });

/** What lies at the centre of an element: itself (or a child), or the thing covering it. */
async function coveredBy(loc) {
  return loc.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && (top === el || el.contains(top))) return null;
    return top ? `${top.tagName.toLowerCase()}.${typeof top.className === 'string' ? top.className : ''}` : 'nothing';
  });
}

/** Guided fold: tap "Fold it for me" (or "Turn it over") for every step until the finish button shows. */
async function foldEveryStep(page, finishLabel) {
  const finish = button(page, finishLabel);
  const stepBtn = page.locator('.ppl-guided__actions .ppl-btn--primary');
  const deadline = Date.now() + 120_000;
  let taps = 0;
  while (Date.now() < deadline) {
    if (await finish.isVisible()) return taps;
    if ((await stepBtn.isVisible()) && (await stepBtn.isEnabled()) && /fold it for me|turn it over/i.test(await stepBtn.innerText())) {
      await stepBtn.tap({ timeout: 5000 }).catch(() => undefined);
      taps++;
    }
    await sleep(250);
  }
  throw new Check(`the guided fold did not reach "${finishLabel}" after ${taps} taps`);
}

/** Throw with the big button by a real finger tap at its centre, then wait for the result card. */
async function throwWithButton(page) {
  const btn = page.locator('.ppl-fly__panel .ppl-throwpad > .ppl-btn');
  await btn.waitFor({ state: 'visible', timeout: 15_000 });
  // The slide-in of the panel must be over, or the tap lands where the button was.
  await sleep(450);
  const cover = await coveredBy(btn);
  expect(cover === null, `the Throw button is covered by ${cover}`);
  const box = await btn.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('.ppl-fly--flying, .ppl-fly--landed').first().waitFor({ timeout: 5000 });
  await page.locator('.ppl-fly-result').waitFor({ timeout: LAND_TIMEOUT });
}

/**
 * A real finger drag (touch events through the DevTools protocol), in viewport pixels. `hold` is the pause
 * before the finger lifts: a fold is placed and then let go, a throwing swipe is released while still moving.
 */
async function fingerDrag(page, from, to, steps = 12, hold = 120) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 6, radiusY: 6, force: 1, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t) });
    await sleep(25);
  }
  if (hold > 0) await sleep(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** The open sheet must sit fully on screen: not scrolled away, its bottom inside the viewport. */
async function expectSheetOnScreen(page, what) {
  const m = await sheet(page).evaluate((d) => {
    const panel = d.querySelector('.ppl-sheet__panel').getBoundingClientRect();
    const foot = d.querySelector('.ppl-sheet__foot');
    return { scrollTop: d.scrollTop, top: panel.top, bottom: panel.bottom, footBottom: foot ? foot.getBoundingClientRect().bottom : null, vh: window.innerHeight };
  });
  expect(m.scrollTop === 0, `${what}: the sheet itself is scrolled by ${m.scrollTop}px`);
  expect(m.top >= 0 && m.bottom <= m.vh + 0.5, `${what}: the sheet panel (${Math.round(m.top)}..${Math.round(m.bottom)}) leaves the ${m.vh}px viewport`);
  expect(m.footBottom === null || m.footBottom <= m.vh + 0.5, `${what}: the sheet footer ends at ${m.footBottom}, below the viewport`);
}

/** Choose a place on the Fly screen through its sheet. */
async function choosePlace(page, name) {
  await tap(page.locator('.ppl-fly__chip--env'));
  await sheet(page).waitFor();
  await sleep(350);
  await tap(sheet(page).locator('.ppl-fly-place', { hasText: name }));
  await tap(sheet(page).getByRole('button', { name: 'Done' }));
  await sheet(page).waitFor({ state: 'detached', timeout: 5000 });
  const chip = await page.locator('.ppl-fly__chip--env .ppl-fly__chip-main').innerText();
  expect(chip === name, `the place chip says "${chip}", expected "${name}"`);
}

/* ------------------------------------------------------------------ the walk */

async function main() {
  const browser = await chromium.launch({ headless: !headed, args: GPU_ARGS });
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, '');

  /* a ---------------------------------------------------------------- onboarding */
  await runStep('a', 'onboarding: hello to graduation, into the hangar with the saved dart', page, async () => {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForURL(/#\/welcome/, { timeout: 15_000 });
    await page.locator('.ppl-onb[data-step="hello"]').waitFor();
    await shot(page, 'a1-hello');
    await tap(button(page, 'Show me'));

    // Step 2: the Professor folds. Watch it to the end.
    await page.locator('.ppl-onb[data-step="watch-fold"]').waitFor();
    await button(page, 'Now throw it').waitFor({ timeout: 90_000 });
    await shot(page, 'a2-watch-fold');
    await tap(button(page, 'Now throw it'));

    // Step 3: he throws.
    await page.locator('.ppl-onb[data-step="watch-throw"]').waitFor();
    await button(page, 'My turn').waitFor({ timeout: LAND_TIMEOUT });
    await shot(page, 'a3-watch-throw');
    await tap(button(page, 'My turn'));

    // Step 4: the player folds.
    await page.locator('.ppl-onb[data-step="your-fold"]').waitFor();
    await tap(button(page, 'Start folding'));
    await foldEveryStep(page, 'Throw it');
    const closing = await page.locator('.ppl-guided__text').innerText();
    expect(/throw/i.test(closing) && !/fine-tune/i.test(closing), `the intro's fold should close with the throw, it says: "${closing}"`);
    await shot(page, 'a4-your-fold');
    await tap(button(page, 'Throw it'));

    // Step 5: the player throws.
    await page.locator('.ppl-onb[data-step="your-throw"]').waitFor();
    const throwBtn = page.locator('.ppl-onb__pad .ppl-throwpad > .ppl-btn');
    await throwBtn.waitFor();
    await sleep(600);
    const cover = await coveredBy(throwBtn);
    expect(cover === null, `the intro's Throw button is covered by ${cover}`);
    await tap(throwBtn);
    await button(page, 'Continue').waitFor({ timeout: LAND_TIMEOUT });
    const verdict = (await page.locator('.ppl-onb__step--your-throw').innerText()).replace(/\s+/g, ' ');
    expect(!/far wall|ceiling/i.test(verdict), `the untouched first throw of the intro should land on the floor: "${verdict.slice(0, 160)}"`);
    await shot(page, 'a5-your-throw');
    await tap(button(page, 'Continue'));

    // Step 6: graduation, a name, and the door to the hangar.
    await page.locator('.ppl-onb[data-step="graduate"]').waitFor();
    await page.locator('.ppl-onb__input').fill('Smoke Tester');
    await shot(page, 'a6-graduate');
    await tap(page.locator('.ppl-onb__door', { hasText: 'Explore the plane library' }));
    await page.waitForURL(/#\/hangar/, { timeout: 20_000 });
    await page.locator('.ppl-hangar').waitFor();
    await sleep(600);

    const s = await labState(page);
    expect(s.profile.onboarded === true, 'the profile is not marked as onboarded');
    expect(s.profile.name === 'Smoke Tester', `the name was not stored (got "${s.profile.name}")`);
    const planes = Object.values(s.planes);
    expect(planes.length === 1, `expected the saved dart in the hangar, found ${planes.length} planes`);
    expect(s.currentPlaneId === planes[0].id, 'the saved dart is not the current plane');
    expect(s.flights.length >= 1, 'the intro throw was not kept');
    expect(await page.evaluate(() => localStorage.getItem('ppl-onboarding')) === null, 'the intro progress was not cleared');
    expect((await page.locator('.ppl-hangar').innerText()).includes(planes[0].name), `the hangar does not show "${planes[0].name}"`);
    await shot(page, 'a7-hangar');
  });

  /* b ---------------------------------------------------------------- hangar -> fold a preset */
  await runStep('b', 'hangar: Nakamura Lock from the library, guided fold, shape, trim, save', page, async () => {
    await goto(page, '/hangar');
    await page.locator('.ppl-hangar').waitFor();
    const card = page.locator('a, button', { hasText: 'Nakamura Lock' }).first();
    await card.scrollIntoViewIfNeeded();
    await tap(card);
    await sheet(page).waitFor();
    await sleep(400);
    await shot(page, 'b1-preset-sheet');
    await tap(sheet(page).getByRole('button', { name: 'Fold this plane' }));
    await page.waitForURL(/#\/fold/, { timeout: 10_000 });
    // The link from the library starts the guided fold on the recommended sheet (paper can be changed under "Choose").
    await button(page, 'Play all').waitFor({ timeout: 15_000 });
    expect((await page.locator('.ppl-fold__title').innerText()).includes('Nakamura'), 'the workbench did not open the Nakamura Lock');

    // Guided fold: let the lab play all steps.
    await tap(button(page, 'Play all'));
    await button(page, 'Shape it').waitFor({ timeout: 120_000 });
    await shot(page, 'b2-folded');
    await tap(button(page, 'Shape it'));

    await button(page, 'Trim it').waitFor({ timeout: 15_000 });
    await sleep(500);
    await shot(page, 'b3-shape');
    await tap(button(page, 'Trim it'));

    await button(page, 'Save to the hangar').waitFor({ timeout: 15_000 });
    await sleep(500);
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled < 5, `the trim stage should open at its top, the page is scrolled by ${scrolled}px`);
    await shot(page, 'b4-trim');
    await tap(button(page, 'Save to the hangar'));
    await sheet(page).waitFor();
    await tap(sheet(page).getByRole('button', { name: 'Save', exact: true }));
    await sheet(page).getByRole('button', { name: 'Fly it' }).waitFor({ timeout: 10_000 });
    await shot(page, 'b5-saved');

    const s = await labState(page);
    const lock = Object.values(s.planes).find((p) => p.presetId === 'nakamura-lock');
    expect(lock, 'the Nakamura Lock was not saved');
    expect(s.currentPlaneId === lock.id, 'the Nakamura Lock is not the current plane');
    await tap(sheet(page).getByRole('button', { name: 'Fly it' }));
    await page.waitForURL(/#\/fly/, { timeout: 10_000 });
  });

  /* c ---------------------------------------------------------------- fly in the gym */
  await runStep('c', 'fly in the gym: throw with the button, result card, Details open and closed', page, async () => {
    if (!/#\/fly/.test(page.url())) await goto(page, '/fly');
    await page.locator('.ppl-fly--ready').waitFor({ timeout: 20_000 });
    await page.locator('.ppl-stage canvas, .ppl-stage svg').first().waitFor({ timeout: 30_000 });
    const place = await page.locator('.ppl-fly__chip--env .ppl-fly__chip-main').innerText();
    expect(place === 'Gymnasium', `Fly should open in the Gymnasium after the intro, it opened in "${place}"`);
    const plane = await page.locator('.ppl-fly__chip--plane .ppl-fly__chip-main').innerText();
    expect(/Nakamura/.test(plane), `Fly should use the plane just saved, it shows "${plane}"`);
    await shot(page, 'c1-ready');

    const before = (await labState(page)).flights.length;
    await throwWithButton(page);
    await sleep(500);
    await shot(page, 'c2-result');
    const s = await labState(page);
    expect(s.flights.length === before + 1, 'the throw was not logged');
    const f = s.flights[0];
    expect(f.envId === 'gym', `the flight was logged in "${f.envId}"`);
    expect(f.metrics.distance > 2, `the first gym throw flew only ${f.metrics.distance.toFixed(2)} m`);
    const tags = await page.locator('.ppl-fly-result__tags').innerText();
    expect(!/Hit the/.test(tags), `the first throw in the gym ended badly: "${tags.trim()}"`);
    expect((await page.locator('.ppl-fly-result .ppl-profsays, .ppl-fly-result').first().innerText()).length > 40, 'the result card has no diagnosis');
    expect((await page.locator('.ppl-fly-result__rank, .ppl-fly-result__norank').count()) === 0, 'a gym throw must not offer a ranking');

    await tap(button(page, 'Details'));
    await sheet(page).waitFor();
    await sleep(600);
    await expectSheetOnScreen(page, 'Details');
    expect((await sheet(page).locator('figure.ppl-chart').count()) >= 3, 'the Details sheet should show three charts');
    await shot(page, 'c3-details');
    // Its last block must be reachable by scrolling the body.
    const reach = await sheet(page).locator('.ppl-sheet__body').evaluate((b) => {
      b.scrollTop = b.scrollHeight;
      const last = b.lastElementChild.getBoundingClientRect();
      return { bottom: last.bottom, vh: window.innerHeight };
    });
    expect(reach.bottom <= reach.vh, `the end of the Details sheet (${Math.round(reach.bottom)}) is below the viewport (${reach.vh})`);
    await shot(page, 'c4-details-end');
    await closeSheet(page);
    await page.locator('.ppl-fly-result').waitFor();

    // The other way to throw: a finger swipe up over the scene.
    await tap(button(page, 'Throw again'));
    await page.locator('.ppl-fly--ready').waitFor();
    await sleep(500);
    const area = await page.locator('.ppl-fly__swipe').boundingBox();
    const x = area.x + area.width / 2;
    await fingerDrag(page, { x, y: area.y + 330 }, { x, y: area.y + 150 }, 6, 0);
    await page.locator('.ppl-fly--flying, .ppl-fly--landed').first().waitFor({ timeout: 5000 });
    await page.locator('.ppl-fly-result').waitFor({ timeout: LAND_TIMEOUT });
    const swiped = await labState(page);
    expect(swiped.flights.length === before + 2, 'the swipe throw was not logged');
    const swipeSpeed = swiped.flights[0].launch.speed;
    expect(swipeSpeed > 3 && swipeSpeed <= 30, `a brisk swipe should make a real throw, it gave ${swipeSpeed} m/s`);
    await shot(page, 'c5-swipe-result');
  });

  /* d ---------------------------------------------------------------- ranked throw */
  await runStep('d', 'Record Hangar: throw, enter the ranking, submit, own entry highlighted on Ranks', page, async () => {
    if (!/#\/fly/.test(page.url())) await goto(page, '/fly');
    await page.locator('.ppl-fly').waitFor();
    if (await button(page, 'Throw again').isVisible()) await tap(button(page, 'Throw again'));
    await page.locator('.ppl-fly--ready').waitFor();
    await choosePlace(page, 'Record Hangar');
    // The plane's recommended throw, set with the sliders (the swipe before left its own speed and angle).
    const pad = page.locator('.ppl-fly__panel .ppl-throwpad');
    await setRange(slider(pad, 'Speed').locator('input[type=range]'), 5);
    await setRange(slider(pad, 'Angle').locator('input[type=range]'), 0);
    await sleep(200);
    const shown = (await slider(pad, 'Speed').locator('output').innerText()).trim();
    expect(/^5\.0\s*m\/s/.test(shown), `the speed slider should read 5.0 m/s, it reads "${shown}"`);
    await throwWithButton(page);
    const ranked = (await labState(page)).flights[0];
    expect(ranked.envId === 'hangar' && ranked.launch.speed === 5 && ranked.launch.pitchDeg === 0, `the hangar throw was logged as ${JSON.stringify(ranked.launch)} in ${ranked.envId}`);
    expect(ranked.metrics.distance > 4, `the Nakamura Lock's recommended throw flew only ${ranked.metrics.distance.toFixed(2)} m in the hangar`);
    await sleep(400);
    await shot(page, 'd1-result');
    await tap(button(page, 'Enter ranking'));
    await sheet(page).waitFor();
    await sleep(400);
    await expectSheetOnScreen(page, 'Enter the ranking');
    const boards = await sheet(page).locator('.ppl-fly-rank__row--pick').count();
    expect(boards >= 2, `expected at least two boards to choose from, found ${boards}`);
    const name = await sheet(page).locator('.ppl-fly-rank__input').inputValue();
    expect(name === 'Smoke Tester', `the name field should be prefilled from the profile, it holds "${name}"`);
    await sheet(page).locator('.ppl-fly-rank__input').fill('Smoke Pilot');
    await shot(page, 'd2-rank-sheet');
    await tap(sheet(page).getByRole('button', { name: /^Submit/ }));
    const outcome = sheet(page).locator('[data-rank-outcome]');
    await outcome.waitFor({ timeout: 60_000 });
    const kind = await outcome.getAttribute('data-rank-outcome');
    expect(kind === 'stored' || kind === 'accepted', `the submission was ${kind}: ${(await outcome.innerText()).replace(/\s+/g, ' ')}`);
    expect((await outcome.locator('.ppl-tag', { hasText: 'Accepted' }).count()) === boards, 'not every chosen board accepted the throw');
    if (kind === 'stored') expect(/this device/i.test(await outcome.innerText()), 'an offline submission should say it is stored on this device');
    await shot(page, 'd3-outcome');
    const s = await labState(page);
    expect(s.profile.name === 'Smoke Pilot', `the name was not stored with setName (profile says "${s.profile.name}")`);
    expect(s.assignmentsDone.includes('enter-ranking'), 'the "enter a ranking" assignment was not marked');

    await tap(sheet(page).getByRole('button', { name: 'View rankings' }));
    await page.waitForURL(/#\/ranks/, { timeout: 10_000 });
    const mine = page.locator('.ppl-rrow.is-mine');
    await mine.first().waitFor({ timeout: 60_000 });
    const text = (await mine.first().innerText()).replace(/\s+/g, ' ');
    expect(/Smoke Pilot/.test(text) && /you/.test(text), `the highlighted row should be the player's: "${text}"`);
    await mine.first().scrollIntoViewIfNeeded();
    await shot(page, 'd4-ranks-mine');
  });

  /* e ---------------------------------------------------------------- replay from ranks */
  await runStep('e', 'ranks: open a lab benchmark entry and watch its replay in Fly', page, async () => {
    await goto(page, '/ranks');
    const row = page.locator('.ppl-rrow', { hasText: 'Lab benchmark' }).first();
    await row.waitFor({ timeout: 60_000 });
    const planeName = (await row.locator('.ppl-rrow__plane').innerText()).trim();
    const before = await labState(page);
    await row.scrollIntoViewIfNeeded();
    await tap(row);
    await sheet(page).waitFor();
    await sleep(500);
    await expectSheetOnScreen(page, 'Entry sheet');
    await shot(page, 'e1-entry');
    await tap(sheet(page).getByRole('button', { name: 'Watch replay' }));
    await page.waitForURL(/#\/fly/, { timeout: 10_000 });
    const banner = page.locator('.ppl-fly__replay');
    await banner.waitFor({ timeout: 20_000 });
    const title = (await banner.locator('.ppl-fly__replay-title').innerText()).trim();
    expect(title === `Replay: Lab benchmark - ${planeName}`, `the banner says "${title}"`);
    await page.locator('.ppl-fly--flying, .ppl-fly--landed').first().waitFor();
    await sleep(1500);
    await shot(page, 'e2-replay');
    // Watch a little, then skip to the landing (the top benchmark flies for a long time).
    if (await button(page, 'Skip').isVisible()) await tap(button(page, 'Skip'));
    await page.locator('.ppl-fly-result').waitFor({ timeout: LAND_TIMEOUT });
    expect((await page.locator('.ppl-fly-result__rank, .ppl-fly-result__norank').count()) === 0, 'a replay must not offer a ranking');
    expect(await button(page, 'Throw again').count() === 0, 'a replay must not offer "Throw again"');
    await shot(page, 'e3-replay-landed');
    const after = await labState(page);
    expect(after.flights.length === before.flights.length, 'the replay logged a flight');
    expect(JSON.stringify(after.planes) === JSON.stringify(before.planes) && after.currentPlaneId === before.currentPlaneId, 'the replay changed the planes');
    await tap(page.locator('.ppl-fly__replay').getByRole('button', { name: 'Back to my plane' }));
    await page.locator('.ppl-fly--ready').waitFor();
    const plane = await page.locator('.ppl-fly__chip--plane .ppl-fly__chip-main').innerText();
    expect(/Nakamura/.test(plane), `after the replay the plane chip shows "${plane}"`);
  });

  /* f ---------------------------------------------------------------- tunnel */
  await runStep('f', 'tunnel: loads, the angle slider changes the readouts, Go to trim works', page, async () => {
    await goto(page, '/tunnel');
    await page.locator('.ppl-tunnel').waitFor({ timeout: 20_000 });
    await sleep(600);
    const lift = () => page.locator('.ppl-tunnel__legend').innerText();
    const angle = slider(page.locator('.ppl-tunnel__controls'), 'Angle of attack').locator('input[type=range]');
    await setRange(angle, 2);
    await sleep(300);
    const at2 = await lift();
    await setRange(angle, 12);
    await sleep(300);
    const at12 = await lift();
    expect(at2 !== at12, `the readouts did not change with the angle of attack ("${at2.replace(/\s+/g, ' ')}")`);
    expect((await page.locator('.ppl-tunnel__side').innerText()).length > 100, 'the tunnel readouts are empty');
    await shotStill(page, 'f1-tunnel');
    const trimBtn = page.locator('.ppl-tunnel__trimrow .ppl-btn');
    await trimBtn.scrollIntoViewIfNeeded();
    expect((await trimBtn.innerText()).trim() === 'Go to trim', `expected "Go to trim", found "${(await trimBtn.innerText()).trim()}"`);
    await tap(trimBtn);
    await page.locator('.ppl-tunnel__trimrow .ppl-btn', { hasText: 'At trim' }).waitFor({ timeout: 5000 });
    const note = await page.locator('.ppl-tunnel__trimrow').innerText();
    const m = /at ([\d.]+)°/.exec(note);
    expect(m, `no trim angle in "${note}"`);
    const shown = Number(await angle.inputValue());
    expect(Math.abs(shown - Number(m[1])) <= 0.5, `the angle slider (${shown}) did not go to the trim angle (${m[1]})`);
    await shotStill(page, 'f2-at-trim');
    expect((await labState(page)).assignmentsDone.includes('try-tunnel'), 'the wind-tunnel assignment was not marked');
  });

  /* g ---------------------------------------------------------------- plane detail */
  await runStep('g', 'plane detail: stats and "Looks like" matches', page, async () => {
    const s = await labState(page);
    await goto(page, `/plane/${encodeURIComponent(s.currentPlaneId)}`);
    await page.locator('.ppl-detail').waitFor({ timeout: 20_000 });
    await sleep(600);
    const stats = await page.locator('.ppl-detail__stats').innerText();
    for (const word of ['Mass', 'Wingspan', 'Wing area', 'Static margin', 'Glide ratio']) expect(stats.includes(word), `the stats lack "${word}"`);
    expect(/\d/.test(stats) && !/NaN|undefined|Infinity/.test(stats), `the stats hold bad numbers: ${stats.replace(/\s+/g, ' ')}`);
    await shot(page, 'g1-detail');
    const looks = page.locator('.ppl-looks__item');
    await looks.first().waitFor({ timeout: 20_000 });
    const first = (await looks.first().innerText()).replace(/\s+/g, ' ');
    expect(/Nakamura Lock/.test(first) && /%/.test(first), `the closest look-alike of a Nakamura Lock should be the Nakamura Lock: "${first}"`);
    await looks.first().scrollIntoViewIfNeeded();
    await shot(page, 'g2-looks-like');
    expect((await page.locator('.ppl-flog__row').count()) >= 2, 'the plane detail should list the flights of this plane');
  });

  /* h ---------------------------------------------------------------- freeform */
  await runStep('h', 'freeform: blank sheet, one fold by a finger drag between two snap points, shape, save', page, async () => {
    await goto(page, '/fold?new=1');
    await page.locator('.ppl-free').waitFor({ timeout: 20_000 });
    await sleep(500);
    expect(await page.locator('.ppl-free__toolbar .ppl-chip', { hasText: 'Mirror' }).getAttribute('aria-pressed') === 'true', 'Mirror should be on by default');
    const dots = await page.locator('.ppl-free__dot').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
    expect(dots.length >= 8, `a blank sheet should offer its corners and edge midpoints as snap points, found ${dots.length}`);
    const top = Math.min(...dots.map((d) => d.y));
    const topRow = dots.filter((d) => Math.abs(d.y - top) < 2).sort((a, b) => a.x - b.x);
    expect(topRow.length === 3, `expected three snap points on the top edge, found ${topRow.length}`);
    await shot(page, 'h1-blank');
    // Top-left corner onto the middle of the top edge: with Mirror on, both top quarters fold in.
    await fingerDrag(page, topRow[0], topRow[1]);
    await sleep(500);
    const readout = (await page.locator('.ppl-free__readout').innerText()).replace(/\s+/g, ' ');
    expect(/^2 steps/.test(readout), `after one mirrored fold the editor should count 2 steps: "${readout}"`);
    expect(/Symmetric/.test(readout) && !/Not symmetric/.test(readout), `the mirrored fold should be symmetric: "${readout}"`);
    await shot(page, 'h2-folded');
    await tap(button(page, 'Shape the plane'));
    await button(page, 'Trim it').waitFor({ timeout: 15_000 });
    await sleep(600);
    await shot(page, 'h3-shape');
    await tap(button(page, 'Trim it'));
    await button(page, 'Save to the hangar').waitFor({ timeout: 15_000 });
    await tap(button(page, 'Save to the hangar'));
    await sheet(page).waitFor();
    await sleep(300);
    await sheet(page).locator('#ppl-plane-name').fill('Smoke Glider');
    await tap(sheet(page).getByRole('button', { name: 'Save', exact: true }));
    await sheet(page).getByRole('button', { name: 'Fly it' }).waitFor({ timeout: 10_000 });
    await shot(page, 'h4-saved');
    const s = await labState(page);
    const mine = Object.values(s.planes).find((p) => p.name === 'Smoke Glider');
    expect(mine, 'the freeform plane was not saved');
    expect(mine.steps.length === 2 && !mine.presetId, 'the saved freeform plane should hold the two mirrored folds and no preset');
    await closeSheet(page);
  });

  /* i ---------------------------------------------------------------- notebook, settings */
  await runStep('i', 'notebook index and one topic; settings sheet', page, async () => {
    await goto(page, '/notebook');
    await page.locator('.ppl-nb-grid').first().waitFor({ timeout: 20_000 });
    expect((await page.locator('.ppl-nb-card').count()) >= 8, 'the notebook index should list its topics');
    await shot(page, 'i1-notebook');
    const card = page.locator('.ppl-nb-card', { hasText: 'Records and arenas' });
    await card.scrollIntoViewIfNeeded();
    await tap(card);
    await page.waitForURL(/#\/notebook\/records/, { timeout: 10_000 });
    await page.locator('.ppl-nb-records').waitFor({ timeout: 20_000 });
    const records = await page.locator('.ppl-nb-records').innerText();
    expect(/88\.31/.test(records), 'the records topic should list the 88.31 m record');
    const reported = await page.locator('.ppl-nb-records > li.is-reported').allInnerTexts();
    for (const r of reported) expect(/Reported, not verified here/.test(r), `a post-2022 mark is not labelled as reported: "${r.replace(/\s+/g, ' ')}"`);
    const established = await page.locator('.ppl-nb-records > li:not(.is-reported)').allInnerTexts();
    for (const r of established) expect(!/202[3-9]/.test(r), `a mark after 2022 is shown as established: "${r.replace(/\s+/g, ' ')}"`);
    await shot(page, 'i2-topic');

    await page.evaluate(() => window.scrollTo(0, 0));
    await tap(page.getByRole('button', { name: 'More' }));
    await tap(page.getByRole('menuitem', { name: /Settings/ }));
    await sheet(page).waitFor();
    await sleep(400);
    await expectSheetOnScreen(page, 'Settings');
    const settings = await sheet(page).innerText();
    for (const word of ['Units', 'Reduce motion']) expect(settings.includes(word), `the settings sheet lacks "${word}"`);
    await shot(page, 'i3-settings');
    await closeSheet(page);
  });

  /* w ---------------------------------------------------------------- desktop layout pass */
  const state = await ctx.storageState();
  const wideCtx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, storageState: state });
  const wide = await wideCtx.newPage();
  watch(wide, '[1280] ');
  await runStep('w', 'main routes at 1280 x 800 (screenshots)', wide, async () => {
    const s = await labState(page);
    const routes = [
      ['hangar', '/hangar', '.ppl-hangar'],
      ['plane', `/plane/${encodeURIComponent(s.currentPlaneId ?? '')}`, '.ppl-detail'],
      ['fold', '/fold', '.ppl-fold, .ppl-choose'],
      ['fly', '/fly', '.ppl-fly--ready'],
      ['tunnel', '/tunnel', '.ppl-tunnel'],
      ['ranks', '/ranks', '.ppl-rrow'],
      ['notebook', '/notebook', '.ppl-nb-grid'],
      ['notebook-topic', '/notebook/how-it-works', '.ppl-nb-article, article'],
    ];
    await wide.goto(`${base}/#/hangar`, { waitUntil: 'networkidle' });
    for (const [name, route, ready] of routes) {
      await goto(wide, route);
      await wide.locator(ready).first().waitFor({ timeout: 60_000 });
      await sleep(900);
      const overflow = await overflowOf(wide);
      expect(overflow <= 1, `horizontal overflow of ${overflow}px on ${route} at 1280 px`);
      if (name === 'tunnel') await shotStill(wide, `w-${name}`);
      else await shot(wide, `w-${name}`);
    }
    // One throw on the wide layout: the result card sits beside the scene.
    await goto(wide, '/fly');
    const btn = wide.locator('.ppl-fly__panel .ppl-throwpad > .ppl-btn');
    await btn.waitFor();
    await sleep(500);
    await btn.click();
    await wide.locator('.ppl-fly-result').waitFor({ timeout: LAND_TIMEOUT });
    await sleep(500);
    await shot(wide, 'w-fly-result');
  });
  await wideCtx.close();

  /* r ---------------------------------------------------------------- reset progress */
  await runStep('r', 'settings: reset progress clears the lab, the intro progress, the local board and the drafts', page, async () => {
    await goto(page, '/hangar');
    await page.locator('.ppl-hangar').waitFor();
    const keys = () =>
      page.evaluate(() => ({
        state: JSON.parse(localStorage.getItem('ppl-state') || '{"state":{"planes":{}}}').state,
        board: localStorage.getItem('ppl-leaderboard'),
        intro: localStorage.getItem('ppl-onboarding'),
        draft: sessionStorage.getItem('ppl-fold-draft'),
        fly: sessionStorage.getItem('ppl-fly'),
      }));
    const before = await keys();
    if (!only) {
      expect(before.board !== null, 'expected ranked flights on this device before the reset');
      expect(before.draft !== null && before.fly !== null, 'expected a fold draft and the Fly place in session storage before the reset');
    }
    await tap(page.getByRole('button', { name: 'More' }));
    await tap(page.getByRole('menuitem', { name: /Settings/ }));
    await sheet(page).waitFor();
    await sleep(300);
    const reset = sheet(page).getByRole('button', { name: /^Reset progress/ });
    await reset.scrollIntoViewIfNeeded();
    await tap(reset);
    await tap(sheet(page).getByRole('button', { name: 'Yes, reset everything' }));
    await page.waitForURL(/#\/welcome/, { timeout: 10_000 });
    await page.locator('.ppl-onb[data-step="hello"]').waitFor({ timeout: 15_000 });
    await sleep(500);
    const after = await keys();
    expect(Object.keys(after.state.planes).length === 0 && after.state.flights.length === 0 && after.state.profile.onboarded === false, 'the lab state was not reset');
    expect(after.board === null, 'the local leaderboard survived the reset');
    expect(after.draft === null, 'the fold draft survived the reset');
    expect(after.fly === null, 'the Fly place survived the reset');
    const intro = after.intro ? JSON.parse(after.intro) : null;
    expect(intro === null || (intro.step === 0 && intro.throws.length === 0), 'the intro progress survived the reset');
    await shot(page, 'r1-fresh-again');
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} steps passed. Screenshots: ${outDir}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
