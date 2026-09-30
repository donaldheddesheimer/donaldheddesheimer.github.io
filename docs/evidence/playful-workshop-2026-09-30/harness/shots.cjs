// node shots.cjs [outdir] — this pass's evidence, from the built site (dist/, served from disk), GPU:
// - the opening held (reduced motion) at desktop, wide, short-wide and phone sizes, and the city window;
// - a fresh session with motion on (1440x900): the greeting (two points) and the copycat exchange (three);
// - the screensaver close up, three steps apart;
// - the monitor clicked: the screensaver mid-dissolve, the terminal after its startup, Escape back to the
//   screensaver, and in again (the transcript kept, no startup);
// - reduced motion: in and out at once, the screensaver held;
// - a shared project link, opened straight into the terminal; the phone's tap on the monitor.
// Prints what it checked; timings are the harness's clock from the first draw or the click, so approximate.
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const { BASE, routeDist } = require(path.join(__dirname, '../../lab-terminal-2026-09-29/harness/serve.cjs'));
const out = process.argv[2] || path.join(__dirname, '../screens');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const drawn = (p) => p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
const reading = (p) => p.waitForFunction(() => document.documentElement.dataset.pc === 'read', null, { timeout: 20000 });
const booted = (p) => p.waitForFunction(() => document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 8000 });
const closed = (p) => p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
const monitor = (p) => p.evaluate(() => (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
const state = (p) =>
  p.evaluate(() => {
    const t = document.querySelector('[data-term]');
    return { pc: document.documentElement.dataset.pc ?? null, boot: t?.dataset.boot, at: location.pathname + location.search, first: t?.innerText.trim().split('\n')[0], entries: t?.querySelectorAll('.term-entry').length };
  });
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const errors = [];
  const page = async (w, h, { reduced = false, touch = false } = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: touch, isMobile: touch });
    await routeDist(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    return p;
  };
  const shot = (p, name, clip) => p.screenshot({ path: path.join(out, name + '.png'), clip });

  for (const [w, h, touch] of [[1440, 900], [1920, 1080], [1920, 640], [390, 844, true]]) {
    const p = await page(w, h, { reduced: true, touch });
    await p.goto(BASE + '/');
    await drawn(p);
    await p.evaluate(() => document.fonts.ready);
    await sleep(500);
    await shot(p, `${touch ? 'phone-' : ''}opening-held-${w}x${h}`);
    if (w === 1440) await shot(p, 'city-window-1440x900', { x: 620, y: 0, width: 600, height: 250 });
    await p.context().close();
  }

  {
    const p = await page(1440, 900);
    await p.goto(BASE + '/');
    await drawn(p);
    const t0 = Date.now();
    for (const [at, name] of [[2.9, 'greeting-noticed'], [4.4, 'greeting-wave'], [11.2, 'copycat-terracotta'], [15.6, 'copycat-graphite'], [20.6, 'copycat-ivory-tada']]) {
      await sleep(at * 1000 - (Date.now() - t0));
      await shot(p, `${name}-1440x900`);
    }
    const m = await monitor(p);
    const clip = { x: m.x - 12, y: m.y - 12, width: m.w + 24, height: m.h + 24 };
    for (const i of [0, 1, 2]) {
      await shot(p, `screensaver-${i}-1440x900`, clip);
      await sleep(400);
    }
    // In: the screensaver giving way (about 0.95 s after the click), then the terminal after its startup.
    await p.mouse.click(m.x + m.w / 2, m.y + m.h / 2);
    const c0 = Date.now();
    await sleep(950 - (Date.now() - c0));
    await shot(p, 'entering-dissolve-1440x900');
    await reading(p);
    await booted(p);
    const first = await state(p);
    await shot(p, 'terminal-started-1440x900');
    await p.keyboard.type('help');
    await p.keyboard.press('Enter');
    await sleep(300);
    await p.keyboard.press('Escape');
    await closed(p);
    await sleep(1200);
    await shot(p, 'escape-screensaver-back-1440x900', clip);
    await p.evaluate(() => {
      const t = document.querySelector('[data-term]');
      window.__boot = [t.dataset.boot];
      new MutationObserver(() => window.__boot.push(t.dataset.boot)).observe(t, { attributes: true, attributeFilter: ['data-boot'] });
    });
    await p.mouse.click(m.x + m.w / 2, m.y + m.h / 2);
    await reading(p);
    await sleep(600);
    await shot(p, 'reentry-transcript-1440x900');
    console.log('first entry:', first);
    console.log('reentry:', await state(p), 'boot states seen:', await p.evaluate(() => window.__boot));
    await p.context().close();
  }

  {
    const p = await page(1440, 900, { reduced: true });
    await p.goto(BASE + '/');
    await drawn(p);
    const m = await monitor(p);
    await p.mouse.click(m.x + m.w / 2, m.y + m.h / 2);
    await sleep(150);
    const inAt = await state(p);
    await shot(p, 'reduced-in-150ms-1440x900');
    await booted(p);
    await p.keyboard.press('Escape');
    await sleep(150);
    const outAt = await state(p);
    await shot(p, 'reduced-out-150ms-1440x900');
    console.log('reduced motion: 150 ms after the click', inAt.pc, '; 150 ms after Escape', outAt.pc);
    await p.context().close();
  }

  {
    const p = await page(1440, 900);
    await p.goto(BASE + '/?computer=work/cucadence');
    await reading(p);
    await sleep(1200);
    await shot(p, 'shared-project-link-1440x900');
    console.log('shared link /?computer=work/cucadence:', await p.evaluate(() => ({ at: location.search, last: [...document.querySelectorAll('.term-echo')].at(-1)?.innerText.trim(), title: document.title })));
    await p.context().close();
  }

  {
    const p = await page(390, 844, { touch: true });
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(1000);
    const m = await monitor(p);
    await p.touchscreen.tap(m.x + m.w / 2, m.y + m.h / 2);
    await reading(p);
    await sleep(1500);
    await shot(p, 'phone-terminal-390x844');
    console.log('phone: tapped the monitor, pc:', await p.evaluate(() => document.documentElement.dataset.pc));
    await p.context().close();
  }
  console.log('page errors:', errors.length ? errors : 'none');
  await b.close();
})();
