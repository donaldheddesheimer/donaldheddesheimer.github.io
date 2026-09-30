// node shots.cjs [outdir] — the maintenance-robot pass's screens, from the built site (dist/) on the GPU:
// the held opening (reduced motion) at 1440x900 and 1920x1080; the repair loop from a fresh session at
// 1440x900, each moment in full and cropped to the robot (the first weld, the visor up to inspect, the
// double take at the missed spot, the corrective weld); the terminal's work list, Tab listing ids, a
// project, and the room back after Escape; and a phone smoke check at 390x844 (touch): the monitor
// tapped reaches reading, the power button leaves. Times are seconds from the first draw.
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require(require('path').join(__dirname, '../../lab-terminal-2026-09-29/harness/serve.cjs'));
const out = process.argv[2] || require('path').join(__dirname, '../screens');
require('fs').mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAUNCH = { channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] };
const ROBOT = { x: 300, y: 0, width: 480, height: 420 }; // the robot and the sparks falling below it, at 1440x900
const errs = [];
(async () => {
  const b = await chromium.launch(LAUNCH);
  const open = async (w, h, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...opts });
    await routeDist(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    return p;
  };
  const drawn = (p) => p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
  const jpg = (p, name, clip) => p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 85, ...(clip && { clip }) });

  // The held opening.
  for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    const p = await open(w, h, { reducedMotion: 'reduce' });
    await p.goto(BASE + '/');
    await drawn(p);
    await p.evaluate(() => document.fonts.ready);
    await sleep(1500);
    await jpg(p, `opening-held-${w}x${h}`);
    await p.context().close();
  }

  // The repair loop, then the terminal, in one session.
  const p = await open(1440, 900);
  await p.goto(BASE + '/');
  await drawn(p);
  const t0 = Date.now();
  const at = (s) => sleep(Math.max(0, s * 1000 - (Date.now() - t0)));
  for (const [s, name] of [[10.6, 'weld'], [13.3, 'inspect'], [14.3, 'double-take'], [16.2, 'corrective-weld']]) {
    await at(s);
    const when = ((Date.now() - t0) / 1000).toFixed(1);
    await jpg(p, `robot-${name}-1440x900`);
    await jpg(p, `robot-${name}-crop`, ROBOT);
    console.log(JSON.stringify({ shot: name, at: +when }));
  }
  const m = await p.evaluate(() => (({ x, y, width, height }) => [x + width / 2, y + height / 2])(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
  await p.mouse.click(m[0], m[1]);
  await p.waitForFunction(() => document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 20000 });
  await p.focus('[data-term-input]');
  const say = async (s, wait = 900) => {
    await p.keyboard.type(s);
    await p.keyboard.press('Enter');
    await sleep(wait);
  };
  await say('work');
  await jpg(p, 'terminal-work-1440x900');
  await p.keyboard.type('work s');
  await p.keyboard.press('Tab');
  await sleep(300);
  await jpg(p, 'terminal-tab-lists-ids-1440x900');
  await p.fill('[data-term-input]', '');
  await say('work cucadence');
  await jpg(p, 'terminal-project-1440x900');
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
  await sleep(2500);
  await jpg(p, 'escape-room-back-1440x900');
  console.log(JSON.stringify({ terminal: 'work, Tab, work cucadence, Escape', running: await p.evaluate(() => document.querySelector('[data-lab-root]').dataset.running) }));
  await p.context().close();

  // Phone smoke: in and out.
  {
    const q = await open(390, 844, { hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await q.goto(BASE + '/');
    await drawn(q);
    await sleep(1200);
    await jpg(q, 'phone-opening-held-390x844');
    const r = await q.evaluate(() => (({ x, y, width, height }) => [x + width / 2, y + height / 2])(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
    await q.touchscreen.tap(r[0], r[1]);
    const inOk = await q.waitForFunction(() => document.documentElement.dataset.pc === 'read', null, { timeout: 15000 }).then(() => true, () => false);
    await sleep(600);
    await jpg(q, 'phone-terminal-390x844');
    const power = await q.$('[data-pc-exit]');
    if (power) await power.tap();
    const outOk = await q.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 }).then(() => true, () => false);
    console.log(JSON.stringify({ phone: '390x844', reading: inOk, left: outOk }));
    await q.context().close();
  }
  console.log(JSON.stringify({ pageErrors: errs }));
  await b.close();
})();
