// node shots.cjs [out] — the terminal's screens: the opening, the monitor's link under the keyboard, the
// terminal after its startup, help, work, contact, a project's details over it, a tablet's terminal with
// the power button on the bezel (a touch screen's only), and the phone's terminal. Chrome on the Mac's GPU (ANGLE Metal), the site straight from
// dist/ (serve.cjs), with its own fonts. Mouse clicks and typing, as a person would.
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
const out = process.argv[2] || require('path').join(__dirname, '../screens');
require('fs').mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = async (w, h, { touch = false, dpr = 1 } = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
    await routeDist(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    return p;
  };
  const drawn = (p) => p.waitForFunction(() => document.querySelector('[data-lab-root]')?.matches('[data-drawn], [data-failed]'), null, { timeout: 30000 });
  const booted = (p) => p.waitForFunction(() => document.documentElement.dataset.pc === 'read' && document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 20000 });
  const detailed = (p) => p.waitForFunction(() => { const f = document.querySelector('.pc-detail'); return !!f?.classList.contains('is-loaded') && f.contentDocument?.readyState === 'complete'; }, null, { timeout: 15000 });
  const fonts = async (p) => { await p.evaluate(() => document.fonts.ready); for (const f of p.frames()) await f.evaluate(() => document.fonts.ready).catch(() => {}); };
  const shot = async (p, name) => { await fonts(p); await p.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 82 }); console.log(name); };
  const at = (p, sel) => p.evaluate((s) => (({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 }))(document.querySelector(s).getBoundingClientRect()), sel);
  const enter = async (p, touch = false) => {
    const m = await at(p, '[data-lab-monitor]');
    if (touch) await p.touchscreen.tap(m.x, m.y); else await p.mouse.click(m.x, m.y);
  };
  const type = async (p, s, wait = 900) => { await p.keyboard.type(s, { delay: 60 }); await p.keyboard.press('Enter'); await sleep(wait); };

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
  // The terminal: its startup, help, work, contact, a project's details.
  {
    const p = await page(1440, 900);
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(1500);
    await enter(p);
    await booted(p);
    await sleep(600);
    await shot(p, 'terminal-startup-1440x900');
    await type(p, 'help');
    await shot(p, 'terminal-help-1440x900');
    await type(p, 'work', 1200);
    await shot(p, 'terminal-work-1440x900');
    await type(p, 'contact', 1200);
    await shot(p, 'terminal-contact-1440x900');
    // A project's details, from work's output (scrolled to, then clicked).
    const link = p.locator('[data-term] a[href^="/projects/"]').first();
    await link.scrollIntoViewIfNeeded();
    await sleep(500);
    const r = await link.boundingBox();
    await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await detailed(p);
    await sleep(900);
    await shot(p, 'details-1440x900');
    await p.context().close();
  }
  // A tablet, landscape: the terminal on the monitor, the power button on the bezel under it.
  {
    const p = await page(1180, 820, { touch: true, dpr: 2 });
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(1500);
    await enter(p, true);
    await booted(p);
    await sleep(900);
    await shot(p, 'tablet-terminal-1180x820');
    await p.context().close();
  }
  // The phone's terminal: after its startup, then work (help tapped, then work in its list).
  {
    const p = await page(390, 844, { touch: true, dpr: 2 });
    const tap = async (name) => {
      const c = p.locator(`[data-term] [data-term-run="${name}"]`).last();
      await c.scrollIntoViewIfNeeded();
      const r = await c.boundingBox();
      await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
      await sleep(1200);
    };
    await p.goto(BASE + '/');
    await drawn(p);
    await sleep(800);
    await enter(p, true);
    await booted(p);
    await sleep(600);
    await shot(p, 'phone-terminal-390x844');
    await tap('help');
    await tap('work');
    await shot(p, 'phone-terminal-work-390x844');
    await p.context().close();
  }
  await b.close();
})();
