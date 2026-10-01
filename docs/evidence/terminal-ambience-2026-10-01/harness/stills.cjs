// node stills.cjs [dir]: the ambience pass's stills and a walk through what's new, logged as it goes.
// At 1440x900 on the monitor with a mouse: the startup; the robot cropped open, mid-blink (its
// animation paused there), looking at the prompt, and squinting at a mistake; ls; about. Then
// whoami, ls, pwd, sudo and coffee, each said over the prompt, and the robot's mood after each. Then
// reduced motion: no look, no mood, no animation. At 390x844 by touch: the startup and ls. The
// site is served from dist/ (the lab-terminal pass's serve.cjs), on the Mac's GPU.
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('../../lab-terminal-2026-09-29/harness/serve.cjs');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2] || path.join(__dirname, '../screens');
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const open = async (w, h, touch, reducedMotion = 'no-preference') => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, reducedMotion });
    await routeDist(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await p.goto(BASE + '/');
    await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.matches('[data-drawn], [data-failed]'), null, { timeout: 30000 });
    await p.evaluate(() => document.fonts.ready);
    await sleep(600);
    const m = await p.locator('[data-lab-monitor]').boundingBox();
    if (touch) await p.touchscreen.tap(m.x + m.width / 2, m.y + m.height / 2);
    else await p.mouse.click(m.x + m.width / 2, m.y + m.height / 2);
    await p.waitForFunction(() => document.documentElement.dataset.pc === 'read' && document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 20000 });
    await sleep(600);
    return p;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(out, n + '.jpg'), type: 'jpeg', quality: 88 });
  const zoom = async (p, n) => { const r = await p.locator('[data-term] [data-view]:not([hidden]) .t-bot').boundingBox(); await p.screenshot({ path: path.join(out, n + '.png'), clip: { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 } }); };
  const state = (p) => p.evaluate(() => { const t = document.querySelector('[data-term]'); return { bot: t.dataset.bot ?? null, look: t.hasAttribute('data-bot-look'), note: document.querySelector('[data-term-note]').hidden ? null : document.querySelector('[data-term-note]').textContent.trim(), status: document.querySelector('[data-term-status]').textContent, clock: document.querySelector('[data-term-clock]').textContent, ps1: document.querySelector('[data-term-ps1]').textContent }; });
  const type = async (p, s) => { await p.keyboard.type(s); await p.keyboard.press('Enter'); await sleep(120); };

  const d = await open(1440, 900, false);
  await shot(d, 'startup-1440x900');
  await zoom(d, 'bot-open');
  // Freeze the blink at its shut frame.
  await d.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.matches?.('.t-bot-eyes, .t-bot-shut')).forEach((a) => { a.pause(); a.currentTime = 5200 * 0.96; }));
  await zoom(d, 'bot-blink');
  await d.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  await d.keyboard.type('abo');
  await sleep(100);
  console.log('typing', JSON.stringify(await state(d)));
  await zoom(d, 'bot-look');
  await d.fill('[data-term-input]', '');
  await type(d, 'nope');
  console.log('mistake', JSON.stringify(await state(d)));
  await zoom(d, 'bot-squint');
  await shot(d, 'mistake-1440x900');
  for (const c of ['whoami', 'ls', 'pwd', 'sudo rm -rf /', 'coffee']) { await type(d, c); console.log(c, JSON.stringify(await state(d))); }
  await type(d, 'ls'); await shot(d, 'ls-1440x900');
  await d.click('[data-term-note] [data-term-run="work"]'); await sleep(300);
  console.log('ls->work', JSON.stringify(await state(d)));
  await type(d, 'work cucadence'); await type(d, 'pwd'); console.log('pwd in project', JSON.stringify(await state(d)));
  await type(d, 'about'); await sleep(200); console.log('about', JSON.stringify(await state(d))); await sleep(600); await shot(d, 'about-1440x900');
  // Tab doesn't complete hidden ones; help doesn't list them.
  await d.keyboard.type('who'); await d.keyboard.press('Tab'); console.log('tab who ->', await d.inputValue('[data-term-input]'));
  await d.fill('[data-term-input]', '');
  await type(d, 'exit'); await sleep(800); console.log('exit -> pc', await d.evaluate(() => document.documentElement.dataset.pc));
  await d.context().close();

  const r = await open(1440, 900, false, 'reduce');
  await r.keyboard.type('ab'); const typing = await state(r); await type(r, 'x');
  console.log('reduced: typing', JSON.stringify(typing), 'mistake', JSON.stringify(await state(r)), 'bot animations', await r.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.('.t-bot')).length), 'glass', await r.evaluate(() => getComputedStyle(document.querySelector('.term-glass')).display));
  await r.context().close();
  const m = await open(390, 844, true);
  await shot(m, 'phone-startup-390x844');
  await m.focus('[data-term-input]'); await type(m, 'ls'); await shot(m, 'phone-ls-390x844');
  await m.context().close();
  console.log(`# Chrome ${b.version()}`);
  await b.close();
})();
