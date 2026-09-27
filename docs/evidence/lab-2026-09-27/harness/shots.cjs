// Evidence from the production build (npm run preview on :4321): screenshots (JPEG), fallback checks,
// drawing-buffer sizes, and a short recording. Usage: node shots.cjs <outdir> [part,...]
// Runs against the production build: npm run build && npm run preview -- --host 127.0.0.1 --port 4321.
// Playwright is not a project dependency: run with a global install, NODE_PATH=$(npm root -g) node <script>.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const OUT = process.argv[2];
const parts = (process.argv[3] || 'open,lab,mobile,reduced,nowebgl,pages,ratio,video').split(',');
const SW = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const shot = (page, name, opts = {}) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82, ...opts });
const drawn = (page) => page.waitForSelector('[data-robot-root][data-drawn]', { timeout: 30000 });
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch({ args: SW });
  const ctxPage = async (opts) => (await browser.newContext(opts)).newPage();

  if (parts.includes('open')) for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    const page = await ctxPage({ viewport: { width: w, height: h } });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await drawn(page);
    await page.waitForTimeout(1200);
    await shot(page, `desktop-${w}-opening`);
    await page.close();
  }
  if (parts.includes('lab')) for (const [w, h] of [[1024, 768], [1440, 900], [1920, 1080]]) {
    const page = await ctxPage({ viewport: { width: w, height: h } });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await drawn(page);
    await page.click('[data-lab-enter]');
    await page.waitForFunction(() => document.documentElement.dataset.lab === 'open', null, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('.lab-frame')?.style.opacity === '1', null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    await shot(page, `desktop-${w}-lab-open`);
    await page.close();
  }
  if (parts.includes('mobile')) {
    const page = await ctxPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await drawn(page);
    await page.waitForTimeout(1200);
    await shot(page, 'mobile-390-opening');
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, desk: getComputedStyle(document.querySelector('.still-desk')).display, enter: document.querySelector('[data-lab-enter]').getBoundingClientRect().toJSON() }));
    log('mobile 390: scrollWidth', m.sw, '; still desk display', m.desk);
    await Promise.all([page.waitForURL('**/systems/', { timeout: 15000 }), page.tap('[data-lab-enter]')]);
    log('mobile 390: Enter the lab navigated to', new URL(page.url()).pathname, '; lab dialog present:', await page.locator('[data-lab-dialog]').count());
    await page.waitForTimeout(800);
    await shot(page, 'mobile-390-systems-page');
    await page.close();
  }
  if (parts.includes('reduced')) for (const [w, h, dpr, name] of [[1440, 900, 1, 'desktop-1440'], [390, 844, 2, 'mobile-390']]) {
    const page = await ctxPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => { const r = document.querySelector('[data-robot-root]'); return { drawn: r.dataset.drawn != null, running: r.dataset.running, offer: r.dataset.offer != null, label: document.querySelector('[data-robot-root] [data-robot-toggle]').getAttribute('aria-label') }; });
    log(`${name} reduced motion:`, JSON.stringify(s));
    await shot(page, `${name}-reduced-motion`);
    if (w >= 1024) {
      await Promise.all([page.waitForURL('**/systems/', { timeout: 15000 }), page.click('[data-lab-enter]')]);
      log(`${name} reduced motion: Enter the lab navigated to`, new URL(page.url()).pathname, '(no flight)');
    }
    await page.close();
  }
  if (parts.includes('nowebgl')) {
    const b2 = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
    for (const [w, h, dpr, name] of [[1024, 768, 1, 'desktop-1024'], [1440, 900, 1, 'desktop-1440'], [390, 844, 2, 'mobile-390']]) {
      const page = await (await b2.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage();
      await page.goto(BASE + '/', { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      const s = await page.evaluate(() => { const r = document.querySelector('[data-robot-root]'); const t = document.querySelector('[data-robot-root] [data-robot-toggle]'); return { failed: r.dataset.failed != null, still: getComputedStyle(r.querySelector('.still')).opacity, deskStill: getComputedStyle(r.querySelector('.still-desk')).display, toggleVisible: !!(t.offsetWidth || t.offsetHeight) && getComputedStyle(t).visibility !== 'hidden' }; });
      log(`${name} no WebGL:`, JSON.stringify(s));
      await shot(page, `${name}-no-webgl`);
      if (w >= 1024 && name === 'desktop-1440') {
        await Promise.all([page.waitForURL('**/systems/', { timeout: 15000 }), page.click('[data-lab-enter]')]);
        log(`${name} no WebGL: Enter the lab navigated to`, new URL(page.url()).pathname);
      }
      await page.close();
    }
    await b2.close();
  }
  if (parts.includes('pages')) for (const [w, h, dpr, name] of [[1440, 900, 1, 'desktop-1440'], [390, 844, 2, 'mobile-390']]) {
    for (const [path, tag] of [['/projects/cucadence/', 'case-study'], ['/does-not-exist/', '404'], ['/systems/?sel=project:cucadence', 'systems']]) {
      const page = await ctxPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
      const resp = await page.goto(BASE + path, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const s = await page.evaluate(() => { const b = getComputedStyle(document.body); const hd = document.querySelector('header'); const h1 = document.querySelector('h1'); return { bg: b.backgroundColor, color: b.color, font: b.fontFamily.split(',')[0], header: hd ? Math.round(hd.getBoundingClientRect().height) : null, h1: h1 ? getComputedStyle(h1).fontFamily.split(',')[0] + ' ' + getComputedStyle(h1).fontWeight : null, sw: document.documentElement.scrollWidth }; });
      log(`${name} ${path} [${resp.status()}]:`, JSON.stringify(s));
      await shot(page, `${name}-${tag}`);
      await page.close();
    }
    const page = await ctxPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    const s = await page.evaluate(() => { const b = getComputedStyle(document.body); const hd = document.querySelector('header'); const h1 = document.querySelector('h1'); return { bg: b.backgroundColor, color: b.color, font: b.fontFamily.split(',')[0], header: hd ? Math.round(hd.getBoundingClientRect().height) : null, h1: h1 ? getComputedStyle(h1).fontFamily.split(',')[0] + ' ' + getComputedStyle(h1).fontWeight : null, sw: document.documentElement.scrollWidth }; });
    log(`${name} / :`, JSON.stringify(s));
    await page.close();
  }
  if (parts.includes('ratio')) for (const dpr of [1, 2]) {
    const page = await ctxPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await drawn(page);
    const buf = () => page.evaluate(() => { const c = document.querySelector('[data-robot-root] canvas'); const r = c.getBoundingClientRect(); return `${c.width}x${c.height} (${(c.width * c.height / 1e6).toFixed(2)} MP) for ${Math.round(r.width)}x${Math.round(r.height)} CSS px`; });
    const hero = await buf();
    // The flight is over before the harness could poll under software rendering: read it in the page.
    await page.evaluate(() => {
      const mo = new MutationObserver(() => {
        if (document.documentElement.dataset.lab !== 'fly') return;
        mo.disconnect();
        const c = document.querySelector('[data-robot-root] canvas');
        const r = c.getBoundingClientRect();
        window.__flyBuf = `${c.width}x${c.height} (${(c.width * c.height / 1e6).toFixed(2)} MP) for ${Math.round(r.width)}x${Math.round(r.height)} CSS px`;
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lab'] });
      document.querySelector('[data-lab-enter]').click();
    });
    await page.waitForFunction(() => document.documentElement.dataset.lab === 'open', null, { timeout: 20000 });
    const fly = await page.evaluate(() => window.__flyBuf);
    const lab = await buf();
    const sharp = await page.evaluate(() => { const f = document.querySelector('.lab-frame'); return f.style.transform; });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.documentElement.dataset.lab == null, null, { timeout: 20000 });
    const back = await buf();
    log(`drawing buffer @1440x900 DPR ${dpr}: opening ${hero}; flying ${fly}; lab ${lab}; after return ${back}; frame at rest ${sharp}`);
    await page.close();
  }
  if (parts.includes('video')) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1152, height: 720 } } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await drawn(page);
    await page.waitForTimeout(1500);
    await page.focus('[data-lab-enter]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.lab === 'open', null, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('.lab-frame')?.style.opacity === '1', null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    // Select in the frame without Playwright's scroll-into-view (it would scroll the dashboard), and hold
    // each step: under software rendering the screencast lags the page.
    const fr = page.frames().find((x) => x.url().includes('/systems/screen/'));
    await fr.evaluate(() => document.querySelector('.gn[data-id="project:cucadence"]').click());
    await page.waitForFunction(() => location.search.includes('cucadence'), null, { timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.documentElement.dataset.lab == null, null, { timeout: 30000 });
    await page.waitForTimeout(4000);
    const v = page.video();
    await ctx.close();
    log('video:', await v.path());
  }
  await browser.close();
})().catch((e) => { console.log('ERROR', e.message); process.exit(1); });
