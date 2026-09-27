// Production-build interaction checks for the lab (npm run preview on :4321). Prints PASS/FAIL lines.
// Runs against the production build: npm run build && npm run preview -- --host 127.0.0.1 --port 4321.
// Playwright is not a project dependency: run with a global install, NODE_PATH=$(npm root -g) node <script>.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const results = [];
const check = (name, ok, info = '') => { results.push([ok, name]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`); };
const trace = () => {
  // Records html[data-lab] changes with timestamps (top document only; runs before <html> exists).
  // One entry per change, not per callback: a state set and replaced in one task (a flight landing
  // with Back already pressed goes open → return at once) still shows. Each record holds the value
  // before its change, so the value after is the next record's old value, or the current one.
  if (window.top !== window) return;
  window.__labLog = [];
  const t0 = performance.now();
  new MutationObserver((recs) => {
    const at = Math.round(performance.now() - t0);
    recs.forEach((r, i) => window.__labLog.push([(i + 1 < recs.length ? recs[i + 1].oldValue : document.documentElement.dataset.lab) ?? '-', at]));
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-lab'], attributeOldValue: true });
};
// Under software rendering the harness can't poll fast enough to catch a flight in progress, so the
// page itself acts on the state change: `act` runs when html[data-lab] becomes `when`.
const onLab = (page, when, act, start) => page.evaluate(([when, act, start]) => {
  const mo = new MutationObserver(() => {
    if (document.documentElement.dataset.lab !== when) return;
    mo.disconnect();
    if (act === 'back') history.back();
    if (act === 'forward') history.forward();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lab'] });
  if (start) document.querySelector(start).click();
}, [when, act, start]);
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(trace);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_CERT|net::/.test(m.text())) errors.push(m.text()); });
  const st = () => page.evaluate(() => ({
    url: location.pathname + location.search, lab: document.documentElement.dataset.lab ?? null, state: history.state,
    home: !!document.querySelector('[data-lab-dialog]'), dialog: !!document.querySelector('[data-lab-dialog]')?.open, frame: !!document.querySelector('.lab-frame'),
    title: document.title, active: document.activeElement?.matches('[data-lab-dialog]') ? 'dialog' : document.activeElement?.matches('[data-lab-enter]') ? 'enter-link' : (document.activeElement?.tagName + '.' + document.activeElement?.className).slice(0, 60),
    log: (window.__labLog || []).map(([s, t]) => `${s}@${t}`).join(' '),
  }));
  const settled = (lab) => page.waitForFunction((l) => (document.documentElement.dataset.lab ?? null) === l, lab, { timeout: 20000 });
  const frameEl = () => page.frameLocator('.lab-frame');
  const frameLoaded = () => page.waitForFunction(() => { const f = document.querySelector('.lab-frame'); return f && f.style.opacity === '1'; }, null, { timeout: 20000 });

  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('[data-robot-root][data-drawn]', { timeout: 30000 });
  check('enter link is a real link to /systems/', await page.getAttribute('[data-lab-enter]', 'href') === '/systems/');

  // 1. Keyboard: focus Enter the lab, press Enter.
  await page.evaluate(() => (window.__labLog = []));
  await page.focus('[data-lab-enter]');
  await page.keyboard.press('Enter');
  await settled('open');
  await frameLoaded();
  let s = await st();
  check('opening: URL /systems/ with lab history state, dialog holds focus', s.url === '/systems/' && s.state?.lab === true && s.dialog && s.active === 'dialog', JSON.stringify({ url: s.url, active: s.active }));
  check('opening: fade → fly → open, title switched', /^fade@\d+ fly@\d+ open@\d+$/.test(s.log) && /^Systems map/.test(s.title), `${s.log}; title "${s.title}"`);
  const rest = await page.evaluate(() => { const f = document.querySelector('.lab-frame'); return { t: f.style.transform, src: f.getAttribute('src') }; });
  check('open: frame at rest is a whole-pixel translate (sharp text), src /systems/screen/', /^translate\(\d+px, \d+px\)$/.test(rest.t) && rest.src === '/systems/screen/', `${rest.t}; ${rest.src}`);
  const shared = await frameEl().locator('[data-console]').count();
  check('frame shows the shared Overview console', shared === 1);

  // 2. Selection in the frame updates the address and Expand dashboard.
  await frameEl().locator('.gn[data-id="project:cucadence"]').first().click();
  await page.waitForFunction(() => location.search.includes('cucadence'), null, { timeout: 5000 });
  s = await st();
  const expandHref = await page.getAttribute('[data-lab-expand]', 'href');
  check('selecting cuCadence in the frame: URL ?sel=, Expand dashboard follows, state kept', s.url === '/systems/?sel=project%3Acucadence' && expandHref === s.url && s.state?.lab === true, `${s.url}; expand ${expandHref}`);

  // 3. Escape inside the frame: first collapses an expanded map, then leaves the lab.
  const exp = frameEl().locator('[data-map-expand]');
  if (await exp.isVisible()) {
    await exp.click();
    await frameEl().locator('[data-console][data-expanded="true"]').waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const collapsed = await frameEl().locator('[data-console][data-expanded="false"]').count();
    s = await st();
    check('Escape in frame with map expanded collapses the map, lab stays open', collapsed === 1 && s.lab === 'open' && s.url.startsWith('/systems/'), `lab ${s.lab}`);
  } else check('map expand button visible in frame at 1440', false);
  await page.evaluate(() => (window.__labLog = []));
  await frameEl().locator('body').press('Escape');
  await settled(null);
  s = await st();
  check('Escape in frame leaves: return flight, URL /, focus back on Enter the lab, title restored', /^return@\d+ -@\d+$/.test(s.log) && s.url === '/' && !s.dialog && !s.frame && s.active === 'enter-link' && !/^Systems map/.test(s.title), `${s.log}; ${s.url}; focus ${s.active}; "${s.title}"`);

  // 4. Forward reopens with the selection; Back closes.
  await page.evaluate(() => (window.__labLog = []));
  await page.goForward();
  await settled('open');
  await frameLoaded();
  s = await st();
  const frameSel = await frameEl().locator('html').getAttribute('data-sel');
  check('Forward reopens the lab at /systems/?sel=… and the frame restores the selection', s.url === '/systems/?sel=project%3Acucadence' && frameSel === 'project:cucadence' && /fly@\d+ open@\d+/.test(s.log), `${s.url}; frame sel ${frameSel}; ${s.log}`);
  await page.evaluate(() => (window.__labLog = []));
  await page.goBack();
  await settled(null);
  s = await st();
  check('Back closes the lab with the return flight', s.url === '/' && !s.dialog && /return@\d+ -@\d+/.test(s.log), `${s.url}; ${s.log}`);

  // 5. Back mid-flight: the flight lands, then the lab closes.
  await page.evaluate(() => (window.__labLog = []));
  await onLab(page, 'fly', 'back', '[data-lab-enter]');
  await page.waitForFunction(() => location.pathname === '/' && document.documentElement.dataset.lab == null && window.__labLog.length >= 4, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  s = await st();
  check('Back during the flight in: lands, then returns; URL /; nothing left open', s.url === '/' && !s.dialog && !s.frame && /open@\d+ return@\d+ -@\d+/.test(s.log), `${s.log}`);
  // Forward during the return flight: lab reopens once the return lands.
  await page.evaluate(() => (window.__labLog = []));
  await page.goForward();
  await settled('open');
  await page.evaluate(() => (window.__labLog = []));
  await onLab(page, 'return', 'forward');
  await page.goBack();
  await page.waitForFunction(() => document.documentElement.dataset.lab === 'open' && window.__labLog.some(([l]) => l === 'return') && window.__labLog.at(-1)[0] === 'open', null, { timeout: 30000 });
  await page.waitForTimeout(300);
  s = await st();
  check('Forward during the return flight: reopens after landing, URL /systems/…', s.url.startsWith('/systems/') && s.dialog && s.frame && s.lab === 'open', `${s.log}; ${s.url}`);

  // 6. Escape on the dialog (top document) leaves.
  await page.evaluate(() => (window.__labLog = []));
  await page.focus('[data-lab-dialog]');
  await page.keyboard.press('Escape');
  await settled(null);
  s = await st();
  check('Escape on the dialog leaves via Back: URL /, focus on Enter the lab', s.url === '/' && !s.dialog && s.active === 'enter-link', `${s.url}; focus ${s.active}; ${s.log}`);

  // 7. Back to portfolio button.
  await page.click('[data-lab-enter]');
  await settled('open');
  await page.click('[data-lab-back]');
  await settled(null);
  s = await st();
  check('Back to portfolio button leaves, focus restored', s.url === '/' && !s.dialog && s.active === 'enter-link', `focus ${s.active}`);

  // 8. Links inside the frame leave the frame (base target _top); Back returns.
  await page.click('[data-lab-enter]');
  await settled('open');
  await frameLoaded();
  await frameEl().locator('.gn[data-id="project:cucadence"]').first().click();
  await page.waitForFunction(() => location.search.includes('cucadence'), null, { timeout: 5000 });
  await Promise.all([page.waitForURL('**/projects/cucadence/', { timeout: 15000 }), frameEl().locator('.gn[data-id="project:cucadence"]').first().click()]);
  check('activating the selected project node opens its case study in the window (not the frame)', page.url().endsWith('/projects/cucadence/'));
  await page.goBack();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  s = await st().catch(() => null);
  check('Back from the case study returns to the lab address (open lab if restored from bfcache, else the /systems/ page)', s.url.startsWith('/systems/') && (s.home ? s.dialog && s.lab === 'open' : true), `${s.url}; ${s.home ? `homepage (bfcache), lab ${s.lab}` : 'the ordinary /systems/ page (not restored from bfcache)'}`);

  // 9. Refresh while open loads the ordinary /systems/ page with the selection.
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('[data-robot-root][data-drawn]', { timeout: 30000 });
  await page.click('[data-lab-enter]');
  await settled('open');
  await frameLoaded();
  await frameEl().locator('.gn[data-id="project:cucadence"]').first().click();
  await page.waitForFunction(() => location.search.includes('cucadence'), null, { timeout: 5000 });
  await page.reload({ waitUntil: 'load' });
  const reloaded = await page.evaluate(() => ({ url: location.pathname + location.search, console: !!document.querySelector('[data-console]'), dialog: !!document.querySelector('[data-lab-dialog]'), sel: document.documentElement.dataset.sel, embed: document.documentElement.dataset.embed != null, header: !!document.querySelector('header') }));
  check('Refresh in the lab loads the ordinary /systems/ page with the selection', reloaded.url === '/systems/?sel=project%3Acucadence' && reloaded.console && !reloaded.dialog && reloaded.sel === 'project:cucadence' && !reloaded.embed, JSON.stringify(reloaded));

  // 10. Expand dashboard opens the full page with the selection.
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('[data-robot-root][data-drawn]', { timeout: 30000 });
  await page.click('[data-lab-enter]');
  await settled('open');
  await frameLoaded();
  await frameEl().locator('.gn[data-id="project:cucadence"]').first().click();
  await page.waitForFunction(() => location.search.includes('cucadence'), null, { timeout: 5000 });
  await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.click('[data-lab-expand]')]);
  const expd = await page.evaluate(() => ({ url: location.pathname + location.search, sel: document.documentElement.dataset.sel, console: !!document.querySelector('[data-console]') }));
  check('Expand dashboard opens /systems/?sel=… as a page', expd.url === '/systems/?sel=project%3Acucadence' && expd.sel === 'project:cucadence' && expd.console, JSON.stringify(expd));

  // 11. Direct links.
  await page.goto(BASE + '/systems/?sel=project:cucadence', { waitUntil: 'load' });
  check('/systems/?sel=project:cucadence opens with that selection', (await page.evaluate(() => document.documentElement.dataset.sel)) === 'project:cucadence');
  await page.goto(BASE + '/systems/screen/?sel=project:cucadence', { waitUntil: 'load' });
  await page.waitForURL('**/systems/?sel=project:cucadence', { timeout: 10000 }).catch(() => {});
  check('/systems/screen/ opened on its own redirects to /systems/ (keeping ?sel=)', new URL(page.url()).pathname === '/systems/' && page.url().includes('cucadence'), page.url());

  // 12. The monitor itself is a way in: find it by the hover cursor, click.
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('[data-robot-root][data-drawn]', { timeout: 30000 });
  let hit = null;
  for (let y = 420; y <= 580 && !hit; y += 12) for (let x = 660; x <= 900 && !hit; x += 12) {
    await page.mouse.move(x, y);
    if (await page.evaluate(() => document.querySelector('[data-robot-root]').style.cursor === 'pointer')) hit = [x, y];
  }
  if (hit) {
    await page.evaluate(() => (window.__labLog = []));
    await page.mouse.click(...hit);
    await settled('open');
    s = await st();
    check('clicking the monitor enters the lab', s.url === '/systems/' && s.dialog, `monitor at ${hit}; ${s.log}`);
    await page.keyboard.press('Escape');
    await settled(null);
    s = await st();
    check('…and Escape returns focus to Enter the lab (no focused opener)', s.active === 'enter-link', `focus ${s.active}`);
  } else check('monitor hover target found at 1440x900', false);

  // 13. Resize while open: short/narrow window shows the map across it, scene held; back again.
  await page.click('[data-lab-enter]');
  await settled('open');
  // Under software rendering the resize event itself can arrive a second or more after the resize, so
  // each step waits (up to 10 s) for the state it expects rather than a fixed time; the checks follow.
  const relaid = (full) => page.waitForFunction((full) => document.documentElement.hasAttribute('data-lab-full') === full, full, { timeout: 10000 }).catch(() => {});
  await page.setViewportSize({ width: 900, height: 700 });
  await relaid(true);
  let full = await page.evaluate(() => ({ full: document.documentElement.hasAttribute('data-lab-full'), running: document.querySelector('[data-robot-root]').dataset.running, r: (() => { const b = document.querySelector('.lab-frame').getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); })() }));
  check('open lab resized below 64rem: map fills the window under the bar, scene held', full.full && full.running === 'false', JSON.stringify(full));
  await page.setViewportSize({ width: 1440, height: 900 });
  await relaid(false);
  full = await page.evaluate(() => ({ full: document.documentElement.hasAttribute('data-lab-full'), running: document.querySelector('[data-robot-root]').dataset.running, t: document.querySelector('.lab-frame').style.transform }));
  check('…and back to 1440: framed on the monitor again, scene running', !full.full && full.running === 'true' && /^translate/.test(full.t), JSON.stringify(full));
  // Wide enough but narrower than 3:2 (4:3 here): the lens is composed for wide windows, so the map fills it.
  await page.setViewportSize({ width: 1280, height: 960 });
  await relaid(true);
  full = await page.evaluate(() => ({ full: document.documentElement.hasAttribute('data-lab-full'), running: document.querySelector('[data-robot-root]').dataset.running }));
  check('open lab resized to 1280x960 (4:3): map fills the window, scene held', full.full && full.running === 'false', JSON.stringify(full));
  await page.keyboard.press('Escape');
  await settled(null);
  // Leaving there has no return flight, and the opening's view must still come back (not the camera
  // left on the monitor's screen): the monitor is under the pointer again somewhere mid-stage.
  let back = null;
  for (let y = 0.35 * 960; y <= 0.7 * 960 && !back; y += 16) for (let x = 0.4 * 1280; x <= 0.8 * 1280 && !back; x += 16) {
    await page.mouse.move(x, y);
    if (await page.evaluate(() => document.querySelector('[data-robot-root]').style.cursor === 'pointer')) back = [x, y];
  }
  await page.mouse.move(2, 2);
  check('…Escape leaves without the flight, and the opening\'s view is back (the monitor picks)', !!back, back ? `monitor at ${back.map(Math.round)}` : 'no monitor under the pointer');
  // …and from a 4:3 window the way in is the ordinary page: no flight, no dialog.
  await page.waitForSelector('[data-robot-root][data-drawn]', { timeout: 30000 });
  await Promise.all([page.waitForURL('**/systems/', { timeout: 15000 }).catch(() => {}), page.click('[data-lab-enter]')]);
  s = await page.evaluate(() => ({ url: location.pathname, page: !document.querySelector('[data-lab-dialog]'), console: !!document.querySelector('[data-console]') }));
  check('Enter the lab at 1280x960 (4:3) opens the /systems/ page', s.url === '/systems/' && s.page && s.console, JSON.stringify(s));
  await page.setViewportSize({ width: 1440, height: 900 });

  check('no page errors or console errors (fonts/cert noise excluded)', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${results.filter((r) => r[0]).length}/${results.length} passed`);
  await browser.close();
})().catch((e) => { console.log('ERROR', e.message); process.exit(1); });
