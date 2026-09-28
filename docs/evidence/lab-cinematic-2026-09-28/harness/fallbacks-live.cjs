// Errors and failed requests, page by page. (1) The live site's own pages (/, /projects/cucadence/,
// /systems/, a 404) at 390x844 (isMobile, hasTouch, DPR 2) and 1440x900, on this branch's build and on
// the origin/main cc1a6c4 baseline, each scrolled to its end so lazy content loads: page errors,
// console.error, 4xx/5xx responses (the 404 page's own 404 excepted) and failed requests, plus the
// document's width against the window's. A sanity check, not the pixel diff. (2) Every computer page on
// this branch: read in the lab at 1440x900 (/?computer=<path>, frame loaded and scrolled to its
// end), opened directly at 1440x900 and 390x844 (/computer/<path>/, which sends a window to the lab or to
// the ordinary page), and every ordinary case study (/projects/<id>/) at both sizes.
// NODE_PATH=<dir with the playwright shim> node fallbacks-live.cjs
// (BASE, default http://127.0.0.1:4322, is this branch; MAIN, default http://127.0.0.1:4330, the baseline.)
const { chromium } = require('playwright');
const C = require('./fallbacks-common.cjs');

const MAIN = process.env.MAIN || 'http://127.0.0.1:4330';
const L = C.makeLog('fallbacks-live', `${C.SERVER} (branch), ${MAIN} (baseline cc1a6c4)`);
const log = L.log;
const SIZES = [
  ['390x844', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['1440x900', { viewport: { width: 1440, height: 900 } }],
];
// /projects/useless-machine/ too: its video's metadata-only download is cancelled on both builds.
const LIVE = ['/', '/projects/cucadence/', '/systems/', '/nope-404/', '/projects/useless-machine/'];

async function toEnd(target) {
  await target.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      const before = scrollY;
      scrollBy(0, innerHeight * 0.9);
      await new Promise((r) => setTimeout(r, 120));
      if (scrollY === before) break;
    }
  });
}
const brief = (w) => {
  const s = w.summary();
  const extra = [s.mediaAborted.length && `video metadata-only abort ${s.mediaAborted.length}`, s.expected.length && `expected: ${s.expected.join('; ')}`].filter(Boolean).join(', ');
  return w.clean() ? `clean (fonts aborted ${s.fontsAborted}${extra ? ', ' + extra : ''})` : JSON.stringify(s);
};

async function live(browser) {
  log('\n== live pages ==');
  let dirty = 0;
  for (const server of [C.SERVER, MAIN]) {
    for (const [size, opts] of SIZES) {
      const ctx = await C.newCtx(browser, opts);
      for (const u of LIVE) {
        const page = await ctx.newPage();
        const w = C.watch(page, u, (r) => u === '/nope-404/' && r.url() === server + u && r.status() === 404);
        const res = await page.goto(server + u, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        await toEnd(page);
        await page.waitForTimeout(800);
        const r = await C.rendererOf(page);
        L.setRenderer(r);
        const info = await page.evaluate(() => ({ title: document.title, sw: document.documentElement.scrollWidth, iw: innerWidth }));
        if (!w.clean()) dirty++;
        log(`${server === MAIN ? 'baseline' : 'branch'} ${size} ${u}`, `status ${res.status()}`, `"${info.title}"`, `width ${info.sw}/${info.iw}`, r, '|', brief(w));
        await page.close();
      }
      await ctx.close();
    }
  }
  log('live pages with errors:', dirty);
}

async function computer(browser) {
  log('\n== computer pages (branch) ==');
  const ctx = await C.newCtx(browser, SIZES[1][1]);
  const page = await ctx.newPage();
  await page.goto(`${C.SERVER}/`, { waitUntil: 'load' });
  const projects = await page.evaluate(() => JSON.parse(document.querySelector('[data-pc-dialog]').dataset.projects));
  await page.close();
  log('projects', projects);
  const paths = ['work', 'about', 'resume', 'contact', ...projects.map((p) => `work/${p}`)];
  let dirty = 0;
  // Read in the lab.
  for (const path of paths) {
    const p = await ctx.newPage();
    const w = C.watch(p, path);
    await p.goto(`${C.SERVER}/?computer=${path}`, { waitUntil: 'load' });
    await p.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
    await p.waitForFunction(() => getComputedStyle(document.querySelector('.pc-frame')).opacity === '1', null, { timeout: 30000 });
    const f = p.frames().find((fr) => fr.url().includes('/computer/'));
    await toEnd(f);
    await p.waitForTimeout(800);
    L.setRenderer(await C.rendererOf(p));
    const info = { frame: f.url().replace(C.SERVER, ''), title: await f.title(), top: await p.title(), sw: await f.evaluate(() => document.documentElement.scrollWidth), iw: await f.evaluate(() => innerWidth) };
    if (!w.clean()) dirty++;
    log(`in the lab 1440x900 ${path}`, info, '|', brief(w));
    await p.close();
  }
  await ctx.close();
  // Opened directly, and the ordinary case studies.
  for (const [size, opts] of SIZES) {
    const c2 = await C.newCtx(browser, opts);
    for (const u of [...paths.map((p) => `/computer/${p}/`), ...projects.map((p) => `/projects/${p}/`)]) {
      const p = await c2.newPage();
      const w = C.watch(p, u);
      await p.goto(C.SERVER + u, { waitUntil: 'load' });
      await p.waitForTimeout(1200);
      if (!u.startsWith('/computer/')) await toEnd(p);
      await p.waitForTimeout(300);
      const info = await p.evaluate(() => ({ url: location.pathname + location.search + location.hash, pc: document.documentElement.dataset.pc ?? null, sw: document.documentElement.scrollWidth, iw: innerWidth }));
      if (!w.clean()) dirty++;
      log(`direct ${size} ${u} ->`, info, '|', brief(w));
      await p.close();
    }
    await c2.close();
  }
  log('computer / case study loads with errors:', dirty);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await live(browser);
    await computer(browser);
  } catch (e) {
    log('HARNESS ERROR', e.stack.split('\n').slice(0, 4).join(' | '));
  } finally {
    await browser.close();
    L.save();
  }
})();
