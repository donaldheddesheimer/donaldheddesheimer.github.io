// node shots.cjs [dir] — the terminal overhaul's stills: each view as it's read, one at a time, the prompt at
// its foot. At 1440×900 (a mouse, on the monitor): the startup, help, work (the two featured, then all
// eleven), a project with its sections folded and one opened, about, resume and contact. At 390×844 (a
// touch screen, across the window): help, work, a project, about and contact, each tapped. The site from
// dist/ (the lab-terminal pass's serve.cjs), the Mac's GPU.
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('../../lab-terminal-2026-09-29/harness/serve.cjs');
const path = require('path');
const dir = process.argv[2] || path.join(__dirname, '../screens');
require('fs').mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = '[data-term] [data-view]:not([hidden])';

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  // In by the monitor, the way a person goes in, and the startup played out.
  const open = async (w, h, touch) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    await routeDist(ctx);
    const p = await ctx.newPage();
    await p.goto(BASE + '/');
    await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.matches('[data-drawn], [data-failed]'), null, { timeout: 30000 });
    await p.evaluate(() => document.fonts.ready);
    await sleep(600);
    const m = await p.locator('[data-lab-monitor]').boundingBox();
    if (touch) await p.touchscreen.tap(m.x + m.width / 2, m.y + m.height / 2);
    else await p.mouse.click(m.x + m.width / 2, m.y + m.height / 2);
    await p.waitForFunction(() => document.documentElement.dataset.pc === 'read' && document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 20000 });
    await sleep(500);
    return p;
  };
  const shot = async (p, name) => {
    await sleep(900);
    await p.screenshot({ path: path.join(dir, `${name}.jpg`), type: 'jpeg', quality: 85 });
  };
  const type = async (p, s) => {
    await p.keyboard.type(s);
    await p.keyboard.press('Enter');
  };
  // A command where the view shows it, tapped; where it doesn't, typed at the prompt.
  const tap = async (p, cmd) => {
    const el = p.locator(`[data-term] :is([data-view]:not([hidden]), [data-term-note]) [data-term-run="${cmd}"]`).first();
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded();
      const r = await el.boundingBox();
      await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    } else {
      await p.focus('[data-term-input]');
      await type(p, cmd);
    }
  };

  const d = await open(1440, 900, false);
  await shot(d, 'startup-1440x900');
  await type(d, 'help');
  await shot(d, 'help-1440x900');
  await type(d, 'work');
  await shot(d, 'work-1440x900');
  await d.click(`${V} details.t-more > summary`);
  await d.focus('[data-term-input]');
  await shot(d, 'work-all-1440x900');
  await type(d, 'work cucadence');
  await shot(d, 'project-1440x900');
  // A section opened by its line: How it works, brought up to read.
  await d.click(`${V} details.t-sec > summary:has([data-anchor="how-it-works"])`);
  await d.evaluate((v) => { const s = document.querySelector(`${v} [data-anchor="how-it-works"]`); const t = document.querySelector('[data-term]'); t.scrollTo({ top: t.scrollTop + s.getBoundingClientRect().top - t.getBoundingClientRect().top - 60, behavior: 'instant' }); }, V);
  await d.focus('[data-term-input]');
  await shot(d, 'project-open-1440x900');
  await type(d, 'about');
  await shot(d, 'about-1440x900');
  await type(d, 'resume');
  await shot(d, 'resume-1440x900');
  await type(d, 'contact');
  await shot(d, 'contact-1440x900');
  await d.context().close();

  const m = await open(390, 844, true);
  await tap(m, 'help');
  await shot(m, 'phone-help-390x844');
  await tap(m, 'work');
  await shot(m, 'phone-work-390x844');
  await tap(m, 'work cucadence');
  await shot(m, 'phone-project-390x844');
  await tap(m, 'about');
  await shot(m, 'phone-about-390x844');
  await tap(m, 'contact');
  await shot(m, 'phone-contact-390x844');
  await m.context().close();

  console.log(`# Chrome ${b.version()}; ${require('fs').readdirSync(dir).length} stills`);
  await b.close();
})();
