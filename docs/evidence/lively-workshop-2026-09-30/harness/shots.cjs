// node shots.cjs [outdir] — this pass's evidence, from the built site (dist/, served from disk), GPU:
// - the opening held (reduced motion) at desktop, wide, short-wide and phone sizes;
// - the caught moment at three points, from a fresh session with motion on (1440x900);
// - the monitor entered during the caught moment (clicked 3 s in), then Escape back to the opening;
// - the same fresh session reloaded: the moment doesn't play again (Terracotta dancing, not waving);
// - the phone (390x844, touch): the monitor tapped during the moment, the terminal up.
// Prints what it checked; timings are the harness's clock from the first draw, so approximate.
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const { BASE, routeDist } = require(path.join(__dirname, '../../lab-terminal-2026-09-29/harness/serve.cjs'));
const out = process.argv[2] || path.join(__dirname, '../screens');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const drawn = (p) => p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
const reading = (p) => p.waitForFunction(() => document.documentElement.dataset.pc === 'read', null, { timeout: 20000 });
const closed = (p) => p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
const monitor = (p) => p.evaluate(() => (({ x, y, width, height }) => [x + width / 2, y + height / 2])(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const errors = [];
  const page = async (w, h, { reduced = false, touch = false } = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: touch, isMobile: touch });
    await routeDist(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    return p;
  };
  const shot = (p, name) => p.screenshot({ path: path.join(out, name + '.png') });

  for (const [w, h, touch] of [[1440, 900], [1920, 1080], [1920, 640], [390, 844, true]]) {
    const p = await page(w, h, { reduced: true, touch });
    await p.goto(BASE + '/');
    await drawn(p);
    await p.evaluate(() => document.fonts.ready);
    await sleep(500);
    await shot(p, `${touch ? 'phone-' : ''}opening-held-${w}x${h}`);
    await p.context().close();
  }

  {
    const p = await page(1440, 900);
    await p.goto(BASE + '/');
    await drawn(p);
    const t0 = Date.now();
    for (const [at, name] of [[1.0, 'dancing'], [2.9, 'noticed'], [4.4, 'wave']]) {
      await sleep(at * 1000 - (Date.now() - t0));
      await shot(p, `caught-${name}-1440x900`);
    }
    await p.reload();
    await drawn(p);
    await sleep(4400);
    await shot(p, 'reloaded-no-replay-1440x900');
    await p.context().close();
  }

  {
    const p = await page(1440, 900);
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(3000);
    const [x, y] = await monitor(p);
    await p.mouse.click(x, y);
    await reading(p);
    await sleep(900);
    const read = await p.evaluate(() => ({ pc: document.documentElement.dataset.pc, focus: document.activeElement?.closest('[data-term]') ? 'terminal' : document.activeElement?.tagName }));
    await shot(p, 'monitor-entered-1440x900');
    await p.keyboard.press('Escape');
    await closed(p);
    await sleep(1500);
    await shot(p, 'escape-back-1440x900');
    console.log('entered during the moment:', read, 'after Escape, pc:', await p.evaluate(() => document.documentElement.dataset.pc ?? null), 'flag:', await p.evaluate(() => sessionStorage.getItem('lab:caught')));
    await p.context().close();
  }

  {
    const p = await page(390, 844, { touch: true });
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(2800);
    const [x, y] = await monitor(p);
    await p.touchscreen.tap(x, y);
    await reading(p);
    await sleep(900);
    await shot(p, 'phone-terminal-390x844');
    console.log('phone: entered during the moment, pc:', await p.evaluate(() => document.documentElement.dataset.pc));
    await p.context().close();
  }
  console.log('page errors:', errors.length ? errors : 'none');
  await b.close();
})();
