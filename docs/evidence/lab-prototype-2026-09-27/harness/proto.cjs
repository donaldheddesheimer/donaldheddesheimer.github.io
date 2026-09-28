// Screenshots of /prototype/: the opening, the workstation, reading (a project scrolled), at each size.
// Run against `npm run preview -- --host 127.0.0.1 --port 4321`; Playwright from a global install:
// NODE_PATH=$(npm root -g) node proto.cjs. SwiftShader (software) rendering.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321/prototype/';
const sizes = (process.env.W || '1440x900').split(',');
const steps = (process.env.STEPS || 'hero,desk,read').split(',');
const out = process.env.OUT || '.';
const reduce = process.env.REDUCE === '1';
const tag = process.env.TAG || '';
const ext = process.env.EXT || 'png'; // jpg for committed evidence
const jpeg = ext === 'jpg' ? { type: 'jpeg', quality: 85 } : {};
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const wh of sizes) {
    const [width, height] = wh.split('x').map(Number);
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: +(process.env.DPR || 1), reducedMotion: reduce ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('[data-lab-root][data-drawn]', { timeout: 60000 });
    await page.waitForTimeout(+(process.env.WAIT || 1500));
    const name = (s) => `${out}/${tag}${s}-${width}x${height}.${ext}`;
    if (steps.includes('hero')) await page.screenshot({ path: name('opening'), timeout: 180000, ...jpeg });
    if (steps.includes('full')) await page.screenshot({ path: name('full'), fullPage: true, timeout: 180000, ...jpeg });
    for (const [i, c] of (process.env.CLIPS || '').split(';').filter(Boolean).entries()) {
      const [x, y, w, h] = c.split(',').map(Number);
      await page.screenshot({ path: name(`clip${i}`), clip: { x, y, width: w, height: h }, timeout: 180000, ...jpeg });
    }
    if (steps.includes('work')) {
      // Windows the lab doesn't open in: the entry is "Selected work", a plain link down the page.
      await page.click('[data-lab-enter]');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: name('work'), timeout: 180000, ...jpeg });
      console.log(JSON.stringify(await page.evaluate(() => ({ hash: location.hash, y: scrollY, pc: document.documentElement.dataset.pc ?? null }))));
    }
    if (steps.includes('desk') || steps.includes('read')) {
      await page.click('[data-lab-enter]');
      await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
      await page.waitForTimeout(1800);
      if (steps.includes('desk')) await page.screenshot({ path: name('desk'), timeout: 180000, ...jpeg });
    }
    if (steps.includes('read')) {
      await page.click('[data-pc-use]');
      await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
      await page.waitForTimeout(1200);
      if (steps.includes('overview')) await page.screenshot({ path: name('read-overview'), timeout: 180000, ...jpeg });
      const frame = page.frames().find((f) => f.url().includes('/computer/'));
      await frame.click('a[href="/projects/cucadence/"]');
      await page.waitForFunction(() => document.querySelector('.pc-frame')?.contentWindow?.location.pathname.includes('cucadence'), null, { timeout: 20000 });
      await page.waitForTimeout(1200);
      const f2 = page.frames().find((f) => f.url().includes('cucadence'));
      if (process.env.SCROLL) await f2.evaluate((y) => scrollTo(0, y), +process.env.SCROLL);
      await page.waitForTimeout(600);
      await page.screenshot({ path: name('read-cucadence'), timeout: 180000, ...jpeg });
      console.log(JSON.stringify(await page.evaluate(() => ({ title: document.title, frame: document.querySelector('.pc-frame').getBoundingClientRect().toJSON(), ordinary: document.querySelector('[data-pc-ordinary]').getAttribute('href'), focus: document.activeElement?.className }))));
    }
    await ctx.close();
  }
  await browser.close();
})();
