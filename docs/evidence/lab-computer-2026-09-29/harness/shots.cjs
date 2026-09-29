// node shots.cjs [out] — the checkpoint's screens: the opening, the monitor's link under the keyboard,
// reading on the computer, and the phone's reader. Chrome on the Mac's GPU (ANGLE Metal), the site
// straight from dist/ (serve.cjs), with its own fonts.
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
const out = process.argv[2] || require('path').join(__dirname, '../screens');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = async (w, h, { touch = false, reduced = false, dpr = 1 } = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await routeDist(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    return p;
  };
  const drawn = (p) => p.waitForFunction(() => document.querySelector('[data-lab-root]')?.matches('[data-drawn], [data-failed]'), null, { timeout: 30000 });
  const reading = (p) => p.waitForFunction(() => document.documentElement.dataset.pc === 'read' && document.querySelector('.pc-frame')?.contentDocument?.readyState === 'complete' && document.querySelector('.pc-frame').contentDocument.hasFocus(), null, { timeout: 15000 });
  const frame = (p) => p.frames().find((f) => f.url().includes('/computer/'));
  const fonts = async (p) => { await p.evaluate(() => document.fonts.ready); const f = frame(p); if (f) await f.evaluate(() => document.fonts.ready); };
  const shot = async (p, name) => { await fonts(p); await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 }); console.log(name); };
  const enter = async (p, touch = false) => {
    const r = await p.evaluate(() => (({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 }))(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
    if (touch) await p.touchscreen.tap(r.x, r.y); else await p.mouse.click(r.x, r.y);
  };
  const go = async (p, sel) => { await frame(p).evaluate((s) => document.querySelector(s).click(), sel); await sleep(900); };

  // The opening, a moment into the dance (before the idle hint), at desktop sizes and on a phone.
  for (const [w, h, touch, dpr] of [[1440, 900], [1280, 800], [1920, 1080], [390, 844, true, 2]]) {
    const p = await page(w, h, { touch, dpr });
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(2500);
    await shot(p, `${touch ? 'phone-' : ''}opening-${w}x${h}`);
    await p.context().close();
  }
  // The keyboard on the monitor's link: the ring, and the monitor brightened.
  {
    const p = await page(1440, 900);
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(1200);
    await p.keyboard.press('Tab');
    await sleep(900);
    await shot(p, 'focus-monitor-1440x900');
    await p.context().close();
  }
  // Reading on the computer: Work, About, Résumé, a case study.
  {
    const p = await page(1440, 900);
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(1500);
    await enter(p);
    await reading(p);
    await sleep(700);
    await shot(p, 'reading-work-1440x900');
    await go(p, '.scr-nav a[href$="/about/"]');
    await shot(p, 'reading-about-1440x900');
    await go(p, '.scr-nav a[href$="/resume/"]');
    await shot(p, 'reading-resume-1440x900');
    await go(p, '.scr-nav a[href$="/work/"]');
    const card = await frame(p).evaluate(() => [...document.querySelectorAll('a[href*="/computer/work/"]')].map((a) => a.getAttribute('href')).find((h) => /\/computer\/work\/[\w-]+\/$/.test(h)));
    await go(p, `a[href="${card}"]`);
    await shot(p, 'reading-case-1440x900');
    await p.context().close();
  }
  // The phone's reader: Work, and a case study, across the window.
  {
    const p = await page(390, 844, { touch: true, dpr: 2 });
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(800);
    await enter(p, true);
    await reading(p);
    await sleep(600);
    await shot(p, 'phone-reading-work-390x844');
    const card = await frame(p).evaluate(() => [...document.querySelectorAll('a[href*="/computer/work/"]')].map((a) => a.getAttribute('href')).find((h) => /\/computer\/work\/[\w-]+\/$/.test(h)));
    await go(p, `a[href="${card}"]`);
    await shot(p, 'phone-reading-case-390x844');
    await p.context().close();
  }
  await b.close();
})();
