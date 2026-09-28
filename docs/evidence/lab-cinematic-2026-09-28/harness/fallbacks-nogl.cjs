// The homepage's fallbacks: WebGL missing, a WebGL context that can't be created, no JavaScript, and
// Save-Data. For each: what the opening shows (the SVG still, the canvas, data-failed / data-mounted,
// data-pc-able), what "Explore the lab" (or its "See the work" form) and a click on the picture do, where
// the computer's shared address (/?computer=about) leads, and every page error, console error
// and failed request.
// - no WebGL: a browser launched with --disable-webgl --disable-3d-apis (the GPU shim leaves those alone),
//   at 1440x900 and 390x844;
// - context failure: the GPU browser with HTMLCanvasElement.prototype.getContext returning null for
//   webgl / webgl2 / experimental-webgl (an init script), at 1440x900;
// - no JavaScript (javaScriptEnabled false), at 1440x900 and 390x844, / and the addresses;
// - Save-Data: the request header alone (Save-Data: on), then the header plus navigator.connection.saveData
//   true (the code reads only navigator.connection.saveData, LabStage.astro), at 1440x900: the scene waits
//   until the lab is entered, and entering loads it (html[data-pc] traced).
// NODE_PATH=<dir with the playwright shim> node fallbacks-nogl.cjs   (BASE defaults to http://127.0.0.1:4322)
const { chromium } = require('playwright');
const C = require('./fallbacks-common.cjs');

const L = C.makeLog('fallbacks-nogl');
const log = L.log;
const desk = { width: 1440, height: 900 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const TRACE = () => {
  window.__trace = [];
  window.__t0 = performance.now();
  new MutationObserver((ms) => {
    for (const m of ms) window.__trace.push([Math.round(performance.now() - window.__t0), m.target === document.documentElement ? m.attributeName.slice(5) : m.attributeName.slice(5), m.target.getAttribute(m.attributeName)]);
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-pc', 'data-pc-loading', 'data-mounted', 'data-drawn', 'data-failed', 'data-pc-able'] });
};
const NO_CONTEXT = () => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/i.test(type)) return null;
    return get.call(this, type, ...rest);
  };
};
const stillBox = (page) =>
  page.evaluate(() => {
    const s = document.querySelector('[data-lab-root] .still');
    if (!s) return null;
    const b = s.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), opacity: getComputedStyle(s).opacity, visibility: getComputedStyle(s).visibility };
  });

// The opening without a room: the still, the entry's form, the link and a click on the picture.
async function failedOpening(page, tag, size) {
  await page.goto(`${C.SERVER}/?probe`, { waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-failed], [data-lab-root][data-drawn]', { timeout: 30000 });
  await page.waitForTimeout(800);
  const r = await C.rendererOf(page);
  L.setRenderer(r);
  log('renderer', r);
  log('state', await C.labState(page), 'still', await stillBox(page), 'scroll', await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })));
  log('__lab', await page.evaluate(() => (window.__lab === undefined ? 'undefined' : window.__lab === null ? 'null' : typeof window.__lab)));
  await page.screenshot({ path: `${C.SHOTS}/fallbacks-${tag}-opening-${size}.jpg`, type: 'jpeg', quality: 86, scale: 'css' });
  for (let run = 1; run <= 2; run++) {
    await page.evaluate(() => {
      history.replaceState(null, '', '/?probe');
      scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.waitForTimeout(400);
    const box = await page.locator('[data-lab-stage]').boundingBox();
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.6);
    await page.waitForTimeout(800);
    const clickPicture = await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, y: Math.round(scrollY), dialogOpen: document.querySelector('[data-pc-dialog]').open }));
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    await page.click('[data-lab-enter]');
    await page.waitForTimeout(1200);
    log(`run ${run}`, { clickPicture, enter: await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, y: Math.round(scrollY), workTop: Math.round(document.getElementById('work').getBoundingClientRect().top), dialogOpen: document.querySelector('[data-pc-dialog]').open, pc: document.documentElement.dataset.pc ?? null })) });
  }
}

// The shared address with no room behind it.
async function sharedAddress(page, tag) {
  for (let run = 1; run <= 2; run++) {
    await page.goto(`${C.SERVER}/?computer=about&probe`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const s = await C.labState(page);
    const frame = await page.evaluate(() => {
      const f = document.querySelector('.pc-frame');
      if (!f) return null;
      const b = f.getBoundingClientRect();
      let title = null;
      try {
        title = f.contentDocument?.title;
      } catch {}
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), opacity: getComputedStyle(f).opacity, title, focused: document.activeElement === f };
    });
    log(`shared address run ${run}`, s, { frame });
    if (run === 1) await page.screenshot({ path: `${C.SHOTS}/fallbacks-${tag}-shared-about-1440x900.jpg`, type: 'jpeg', quality: 86 });
    if (s.pc === 'read') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1200);
      log(`shared address run ${run} after Escape`, await C.labState(page));
    }
  }
}

async function noWebGL() {
  log('\n== no WebGL: --disable-webgl --disable-3d-apis ==');
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
  for (const [size, opts] of [
    ['1440x900', { viewport: desk }],
    ['390x844', phone],
  ]) {
    log(`-- ${size} --`);
    const ctx = await C.newCtx(browser, opts);
    const page = await ctx.newPage();
    const w = C.watch(page, size);
    await failedOpening(page, 'nowebgl', size);
    if (size === '1440x900') await sharedAddress(page, 'nowebgl');
    log('errors', w.summary());
    await ctx.close();
  }
  await browser.close();
}

async function noContext(browser) {
  log('\n== context failure: getContext(webgl*) returns null (GPU browser) ==');
  const ctx = await C.newCtx(browser, { viewport: desk });
  await ctx.addInitScript(NO_CONTEXT);
  const page = await ctx.newPage();
  const w = C.watch(page, 'nocontext');
  await failedOpening(page, 'nocontext', '1440x900');
  await sharedAddress(page, 'nocontext');
  log('errors', w.summary());
  await ctx.close();
}

async function noJS(browser) {
  log('\n== no JavaScript ==');
  for (const [size, opts] of [
    ['1440x900', { viewport: desk }],
    ['390x844', phone],
  ]) {
    log(`-- ${size} --`);
    const ctx = await C.newCtx(browser, { ...opts, javaScriptEnabled: false });
    const page = await ctx.newPage();
    const w = C.watch(page, size);
    await page.goto(`${C.SERVER}/`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    log('renderer (a probe canvas from the harness; the page runs no script)', await C.rendererOf(page));
    log('state', await C.labState(page), 'still', await stillBox(page));
    log(
      'page',
      await page.evaluate(() => ({
        jsClass: document.documentElement.classList.contains('js'),
        sections: ['work', 'about', 'resume', 'contact'].map((id) => {
          const el = document.getElementById(id);
          const b = el?.getBoundingClientRect();
          return el ? { id, h: Math.round(b.height), w: Math.round(b.width), visible: getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0' } : { id, missing: true };
        }),
        hiddenByJsOnly: [...document.querySelectorAll('main *')].filter((e) => getComputedStyle(e).opacity === '0' && e.textContent.trim().length > 20).length,
        sw: document.documentElement.scrollWidth,
        iw: innerWidth,
      })),
    );
    await page.screenshot({ path: `${C.SHOTS}/fallbacks-nojs-opening-${size}.jpg`, type: 'jpeg', quality: 86, scale: 'css' });
    await page.click('[data-lab-enter]');
    await page.waitForTimeout(800);
    log('enter link', await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, workTop: Math.round(document.getElementById('work').getBoundingClientRect().top) })));
    for (const u of ['/?computer=about', '/computer/about/', '/projects/cucadence/']) {
      await page.goto(C.SERVER + u, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      log(`address ${u}`, await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, title: document.title, h1: document.querySelector('h1, h2')?.textContent.trim().slice(0, 40), sw: document.documentElement.scrollWidth, iw: innerWidth })));
    }
    log('errors', w.summary());
    await ctx.close();
  }
}

async function saveData(browser) {
  for (const [label, withApi] of [
    ['Save-Data request header only', false],
    ['Save-Data header + navigator.connection.saveData = true', true],
  ]) {
    log(`\n== ${label}, 1440x900 ==`);
    for (let run = 1; run <= 2; run++) {
      const ctx = await C.newCtx(browser, { viewport: desk, extraHTTPHeaders: { 'Save-Data': 'on' } });
      await ctx.addInitScript(TRACE);
      if (withApi) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g' }) }));
      const page = await ctx.newPage();
      const w = C.watch(page, 'savedata');
      const threeRequests = [];
      page.on('request', (r) => {
        if (/scene|three/i.test(r.url())) threeRequests.push(r.url().replace(C.SERVER, ''));
      });
      await page.goto(`${C.SERVER}/?probe`, { waitUntil: 'load' });
      await page.waitForTimeout(4000);
      const r0 = await C.rendererOf(page);
      L.setRenderer(r0);
      log(`run ${run}`, 'saveData seen by the page', await page.evaluate(() => navigator.connection?.saveData ?? null), 'renderer', r0);
      log(`run ${run} after 4 s`, await C.labState(page), 'still', await stillBox(page), 'scene chunks requested', threeRequests.length);
      if (run === 1) await page.screenshot({ path: `${C.SHOTS}/fallbacks-savedata${withApi ? '-api' : '-header'}-opening-1440x900.jpg`, type: 'jpeg', quality: 86 });
      await page.evaluate(() => {
        window.__trace = [];
        window.__t0 = performance.now();
      });
      await page.click('[data-lab-enter]');
      await page.waitForSelector('html[data-pc="read"]', { timeout: 60000 });
      await page.waitForTimeout(1500);
      const r = await C.rendererOf(page);
      L.setRenderer(r);
      log(`run ${run} entered`, { trace: await page.evaluate(() => window.__trace), state: await C.labState(page), renderer: r, sceneChunks: threeRequests.length });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 30000 });
      await page.waitForTimeout(800);
      log(`run ${run} left`, await C.labState(page));
      log(`run ${run} errors`, w.summary());
      await ctx.close();
    }
  }
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await saveData(browser);
    await noContext(browser);
    await noJS(browser);
    await noWebGL();
  } catch (e) {
    log('HARNESS ERROR', e.stack.split('\n').slice(0, 4).join(' | '));
  } finally {
    await browser.close();
    L.save();
  }
})();
