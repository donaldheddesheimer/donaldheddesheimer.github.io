// Reduced motion and the Motion switch on /prototype/?probe at 1440x900.
// Reduced motion (reducedMotion 'reduce'): the opening holds still (data-running, __lab.stats().frames
// and two screenshots 2 s apart), no idle hint after 7 s untouched, no look-around under a mouse drag,
// and going in and out (the link, the monitor, Escape, the computer's "Leave computer") without the
// camera flight: every html[data-pc] value is traced with its time from the click (a flight passes
// through 'fade' and 'fly', a flown return through 'return'). Then the same with the Motion switch turned
// on under reduced motion. The Motion switch (no preference): its role, accessible name and state, that
// Tab reaches it and Space / Enter toggle it, that off stops the frame loop and on resumes it, that the
// setting survives a reload (localStorage 'motion'), and which pose the room holds when switched off
// mid-dance compared with a load with Motion already off.
// Note: stats() draws one frame itself (scene.ts stats() calls render()), so a stopped loop shows
// frames +1 per stats() call, not +0.
// NODE_PATH=<dir with the playwright shim> node fallbacks-motion.cjs   (BASE defaults to http://127.0.0.1:4322)
const { chromium } = require('playwright');
const C = require('./fallbacks-common.cjs');

const L = C.makeLog('fallbacks-motion');
const log = L.log;
const URL = `${C.SERVER}/prototype/?probe`;
const viewport = { width: 1440, height: 900 };
const waitRoom = (page) => page.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 60000 });

// html[data-pc] and the root's data-hint / data-running, with times.
const TRACE = () => {
  window.__trace = [];
  window.__t0 = performance.now();
  new MutationObserver((ms) => {
    for (const m of ms) window.__trace.push([Math.round(performance.now() - window.__t0), m.target === document.documentElement ? 'pc' : m.attributeName.slice(5), m.target.getAttribute(m.attributeName)]);
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-pc', 'data-hint', 'data-running'] });
};
const resetTrace = (page) => page.evaluate(() => {
  window.__trace = [];
  window.__t0 = performance.now();
});
const trace = (page, kind) => page.evaluate((k) => window.__trace.filter((e) => !k || e[1] === k), kind);

async function framesOver(page, ms) {
  const a = await page.evaluate(() => window.__lab.stats().frames);
  await page.waitForTimeout(ms);
  const b = await page.evaluate(() => window.__lab.stats().frames);
  return { frames: b - a, ms, running: await page.evaluate(() => document.querySelector('[data-lab-root]').dataset.running) };
}
async function stillOver(page, ms) {
  const clip = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  const a = await page.screenshot({ clip });
  await page.waitForTimeout(ms);
  const b = await page.screenshot({ clip });
  return C.pxdiff(page, a, b);
}
const switches = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-motion-toggle]')].map((b) => ({ where: b.closest('header') ? 'header' : b.closest('footer') ? 'footer' : 'other', role: b.getAttribute('role'), ariaChecked: b.getAttribute('aria-checked'), ariaPressed: b.getAttribute('aria-pressed'), shown: b.getBoundingClientRect().width > 0 && getComputedStyle(b).visibility !== 'hidden' })));
const pref = (page) => page.evaluate(() => ({ motion: document.documentElement.dataset.motion, stored: (() => { try { return localStorage.getItem('motion'); } catch { return 'unavailable'; } })() }));

async function dragLook(page) {
  const box = await page.locator('[data-lab-root]').boundingBox();
  const cx = box.x + box.width * 0.62;
  const cy = box.y + box.height * 0.72;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx - i * 60, cy - i * 20);
  await page.waitForTimeout(800);
  const during = await page.evaluate(() => ({ az: window.__lab.stats().lookAz, el: window.__lab.stats().lookEl, cursor: document.querySelector('[data-lab-root]').style.cursor }));
  await page.mouse.up();
  await page.mouse.move(700, 20);
  return during;
}

// In and out, tracing html[data-pc]: `how` is 'link' or 'monitor'; out by Escape or the frame's button.
async function inAndOut(page, how, out) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  let at = null;
  if (how === 'monitor') {
    const q = await page.evaluate(() => window.__lab.quad());
    at = [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4];
  }
  await resetTrace(page);
  if (how === 'link') await page.click('[data-lab-enter]');
  else await page.mouse.click(at[0], at[1]);
  await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
  const readAt = await page.evaluate(() => Math.round(performance.now() - window.__t0));
  const op = [];
  for (const gap of [0, 100, 300]) {
    await page.waitForTimeout(gap);
    op.push(await page.evaluate(() => getComputedStyle(document.querySelector('.pc-frame')).opacity));
  }
  await page.waitForTimeout(1200);
  const inTrace = await trace(page, 'pc');
  const inState = await C.labState(page);
  const frame = await page.evaluate(() => {
    const b = document.querySelector('.pc-frame').getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), focused: document.activeElement?.className };
  });
  await resetTrace(page);
  if (out === 'escape') await page.keyboard.press('Escape');
  else await page.frameLocator('.pc-frame').locator('[data-leave]').click();
  await page.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 30000 });
  const closedAt = await page.evaluate(() => Math.round(performance.now() - window.__t0));
  await page.waitForTimeout(800);
  return { how, out, readAtMs: readAt, frameOpacityAt0_100_400ms: op, pcTraceIn: inTrace, stateIn: { url: inState.url, pc: inState.pc, running: inState.running }, frame, closedAtMs: closedAt, pcTraceOut: await trace(page, 'pc'), after: await C.labState(page), active: await page.evaluate(() => document.activeElement?.getAttribute('data-lab-enter') != null ? '[data-lab-enter]' : document.activeElement?.tagName) };
}

async function reduced(browser) {
  log('\n== reduced motion (reducedMotion reduce), 1440x900 ==');
  const ctx = await C.newCtx(browser, { viewport, reducedMotion: 'reduce' });
  await ctx.addInitScript(TRACE);
  const page = await ctx.newPage();
  const w = C.watch(page, 'reduce');
  await page.goto(URL, { waitUntil: 'load' });
  await waitRoom(page);
  const r = await C.rendererOf(page);
  L.setRenderer(r);
  log('renderer', r);
  await page.waitForTimeout(1000);
  log('matchMedia reduce', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'pref', await pref(page), 'switches', await switches(page));
  log('state', await C.labState(page));
  for (let run = 1; run <= 2; run++) log(`frame loop run ${run}`, await framesOver(page, 3000), 'screenshot 2 s apart', await stillOver(page, 2000));
  await page.waitForTimeout(3000); // >7 s since drawn, untouched
  log('idle hint after ~10 s untouched', { hint: (await C.labState(page)).hint, hintTrace: await trace(page, 'hint') });
  await page.screenshot({ path: `${C.SHOTS}/fallbacks-reduce-opening-1440x900.jpg`, type: 'jpeg', quality: 86 });
  for (let run = 1; run <= 2; run++) log(`mouse drag run ${run} (12 x 60px)`, await dragLook(page));
  log('in and out', await inAndOut(page, 'link', 'escape'));
  log('in and out', await inAndOut(page, 'monitor', 'button'));
  log('in and out', await inAndOut(page, 'link', 'button'));
  // Reading, for the record.
  await page.click('[data-lab-enter]');
  await page.waitForSelector('html[data-pc="read"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${C.SHOTS}/fallbacks-reduce-reading-1440x900.jpg`, type: 'jpeg', quality: 86 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.documentElement.dataset.pc);
  await page.waitForTimeout(500);

  // Reduced motion, with the Motion switch turned on.
  log('\n-- reduced motion, Motion switch turned on --');
  await page.locator('header [data-motion-toggle]').click();
  await page.mouse.move(700, 20);
  await page.waitForTimeout(500);
  log('pref', await pref(page), 'switches', await switches(page), 'state', await C.labState(page));
  log('frame loop', await framesOver(page, 2000), 'screenshot 2 s apart', await stillOver(page, 2000));
  await page.reload({ waitUntil: 'load' });
  await waitRoom(page);
  await page.waitForTimeout(7500);
  log('after reload, 7.5 s untouched', 'pref', await pref(page), 'switches', await switches(page), 'state', await C.labState(page), 'hintTrace', await trace(page, 'hint'));
  log('frame loop', await framesOver(page, 2000));
  log('mouse drag', await dragLook(page));
  log('in and out', await inAndOut(page, 'link', 'escape'));
  log('errors', w.summary());
  await ctx.close();
}

async function motionSwitch(browser) {
  log('\n== Motion switch, no motion preference, 1440x900 ==');
  const ctx = await C.newCtx(browser, { viewport, reducedMotion: 'no-preference' });
  await ctx.addInitScript(TRACE);
  const page = await ctx.newPage();
  const w = C.watch(page, 'switch');
  await page.goto(URL, { waitUntil: 'load' });
  await waitRoom(page);
  const r = await C.rendererOf(page);
  L.setRenderer(r);
  log('renderer', r);
  await page.waitForTimeout(1000);
  log('pref', await pref(page), 'switches', await switches(page));
  log('frame loop, motion on', await framesOver(page, 2000));
  log('aria snapshot, header switch', (await page.locator('header [data-motion-toggle]').ariaSnapshot()).replace(/\n/g, ' | '));
  log('getByRole(switch, name Motion) count', await page.getByRole('switch', { name: 'Motion' }).count(), 'accessible description (title)', await page.locator('header [data-motion-toggle]').getAttribute('title'));

  // Tab from the top of the page to the header switch.
  const order = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const a = document.activeElement;
      return { txt: (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30), sw: a.hasAttribute('data-motion-toggle'), header: !!a.closest('header'), visible: a.matches(':focus-visible') };
    });
    order.push(f.txt);
    if (f.sw && f.header) {
      log(`Tab x${i + 1} reaches the header switch`, { order, focusVisible: f.visible });
      break;
    }
  }
  for (let cycle = 1; cycle <= 2; cycle++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    log(`cycle ${cycle}: Space`, 'pref', await pref(page), 'switches', await switches(page), 'loop', await framesOver(page, 2000), 'screenshot 2 s apart', await stillOver(page, 2000));
    await page.reload({ waitUntil: 'load' });
    await waitRoom(page);
    await page.waitForTimeout(1000);
    log(`cycle ${cycle}: after reload`, 'pref', await pref(page), 'switches', await switches(page), 'loop', await framesOver(page, 2000), 'state', await C.labState(page));
    await page.locator('header [data-motion-toggle]').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    log(`cycle ${cycle}: Enter`, 'pref', await pref(page), 'switches', await switches(page), 'loop', await framesOver(page, 2000));
  }
  // Off while the look-around is displaced: the look resets and nothing moves.
  const box = await page.locator('[data-lab-root]').boundingBox();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.72);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * 0.62 - i * 60, box.y + box.height * 0.72);
  await page.waitForTimeout(600);
  const held = await page.evaluate(() => ({ az: window.__lab.stats().lookAz }));
  await page.mouse.up();
  await page.locator('header [data-motion-toggle]').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  log('switched off mid-look', { lookAzBefore: held.az, after: await page.evaluate(() => ({ az: window.__lab.stats().lookAz, el: window.__lab.stats().lookEl })), loop: await framesOver(page, 1500) });
  await page.keyboard.press('Space');
  log('errors', w.summary());
  await ctx.close();
}

// The pose the room holds: switched off at two moments of the dance, and loaded with Motion off.
async function pose(browser) {
  log('\n== pose held with Motion off: switched off mid-dance vs loaded off ==');
  const ctx = await C.newCtx(browser, { viewport, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const w = C.watch(page, 'pose');
  const clip = async () => {
    const b = await page.locator('[data-lab-stage]').boundingBox();
    return { x: 0, y: 0, width: Math.min(viewport.width, Math.round(b.width)), height: Math.min(viewport.height, Math.round(b.height)) };
  };
  const shots = {};
  for (let run = 1; run <= 2; run++) {
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.removeItem('motion'));
    await page.reload({ waitUntil: 'load' });
    await waitRoom(page);
    await page.waitForTimeout(2000);
    const sw = page.locator('header [data-motion-toggle]');
    await sw.click();
    await page.mouse.move(700, 20);
    await page.waitForTimeout(600);
    shots[`off-at-2s-run${run}`] = await page.screenshot({ clip: await clip() });
    await sw.click();
    await page.waitForTimeout(2700);
    await sw.click();
    await page.mouse.move(700, 20);
    await page.waitForTimeout(600);
    shots[`off-at-5s-run${run}`] = await page.screenshot({ clip: await clip() });
    await page.reload({ waitUntil: 'load' });
    await waitRoom(page);
    await page.waitForTimeout(1200);
    log(`run ${run} reload with Motion off`, await pref(page), (await C.labState(page)).running);
    shots[`loaded-off-run${run}`] = await page.screenshot({ clip: await clip() });
  }
  for (const [a, b] of [
    ['loaded-off-run1', 'loaded-off-run2'],
    ['off-at-2s-run1', 'loaded-off-run1'],
    ['off-at-5s-run1', 'loaded-off-run1'],
    ['off-at-2s-run1', 'off-at-5s-run1'],
    ['off-at-2s-run2', 'loaded-off-run2'],
    ['off-at-5s-run2', 'loaded-off-run2'],
  ])
    log(`pxdiff ${a} vs ${b}`, await C.pxdiff(page, shots[a], shots[b]));
  for (const k of ['off-at-2s-run1', 'off-at-5s-run1', 'loaded-off-run1']) require('fs').writeFileSync(`${C.SHOTS}/fallbacks-pose-${k}.png`, shots[k]);
  log('errors', w.summary());
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await reduced(browser);
    await motionSwitch(browser);
    await pose(browser);
  } catch (e) {
    log('HARNESS ERROR', e.stack.split('\n').slice(0, 4).join(' | '));
  } finally {
    await browser.close();
    L.save();
  }
})();
