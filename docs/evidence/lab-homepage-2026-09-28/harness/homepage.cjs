// The cutover to the lab as the homepage, from a running build (BASE, default http://127.0.0.1:4322) and
// its dist folder (DIST). Five checks, each assertion a PASS or FAIL line:
//   redirects  every retired address (/prototype/, /prototype/work/<id>/, /systems/, /systems/screen/, and
//              /?sel=), with and without JavaScript: where it lands, what it keeps, and that it adds no
//              history entry; hostile and unknown selections go to /#work, never to an address built
//              from the query
//   metadata   every built page: title, description, canonical, robots, og:url and og:image; indexable
//              pages are exactly / and /projects/<id>/, each canonical to itself with a unique title; the
//              link-preview image is served at 1200x630
//   links      no built page links to /prototype or /systems, or carries ?sel=; the header, tab bar and
//              ⌘K search on / and a case study, listed
//   settings   the Settings disclosure at 1440x900: Tab order, Enter / Space, Escape (focus back on its
//              button), focus leaving it, a click outside, the switch and the footer's in step, the
//              setting surviving a reload, the lab's frame loop stopping; under reduced motion, Motion
//              starts off, and turned on the room still holds; at 390x844 the button's size and the panel
//              inside the view
//   plain      the four sections on / with JavaScript off, and a case study
// Fonts are aborted (offline). NODE_PATH=<playwright> BASE=... DIST=<repo>/dist LOG=<file> node homepage.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:4322';
const DIST = process.env.DIST || path.join(__dirname, '..', '..', '..', '..', 'dist');
const LOG = process.env.LOG || path.join(__dirname, '..', 'logs', 'homepage.log');
const SITE = 'https://donaldheddesheimer.github.io';

const lines = [];
const log = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  console.log(s);
  lines.push(s);
};
let pass = 0;
let fail = 0;
const expect = (ok, what, got) => {
  ok ? pass++ : fail++;
  log(`${ok ? 'PASS' : 'FAIL'} ${what}`, got === undefined ? '' : got);
};

async function ctxOf(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return ctx;
}

// Where an address settles: the final path, query and anchor once nothing has navigated for 700 ms.
async function land(page, url) {
  await page.goto(BASE + url, { waitUntil: 'load' });
  let last = '';
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(350);
    const now = page.url();
    if (now === last) break;
    last = now;
  }
  await page.waitForLoadState('load');
  const u = new URL(page.url());
  return { at: u.pathname + u.search + u.hash, len: await page.evaluate(() => history.length) };
}

async function redirects(browser) {
  log('\n== redirects (JavaScript on, 1440x900) ==');
  const cases = [
    ['/prototype/', '/'],
    ['/prototype/#about', '/#about'],
    ['/prototype/?computer=about', '/?computer=about'],
    ['/prototype/?computer=work/fluxion', '/?computer=work/fluxion'],
    ['/prototype/?computer=about#contact', '/?computer=about#contact'],
    ['/prototype/work/fluxion/', '/projects/fluxion/'],
    ['/prototype/work/cucadence/?ref=x#results', '/projects/cucadence/?ref=x#results'],
    ['/systems/', '/'],
    ['/systems/?sel=project:fluxion', '/projects/fluxion/'],
    ['/systems/?sel=project:swerve-drive&x=1#y', '/projects/swerve-drive/'],
    ['/systems/?sel=org:gt', '/#work'],
    ['/systems/?sel=cap:cuda', '/#work'],
    ['/systems/?sel=project:nope', '/#work'],
    ['/systems/?sel=project:fluxion/../../evil', '/#work'],
    ['/systems/?sel=' + encodeURIComponent('project:fluxion?x=//evil.example'), '/#work'],
    ['/systems/?sel=' + encodeURIComponent('<script>alert(1)</script>'), '/#work'],
    ['/systems/?sel=' + encodeURIComponent('javascript:alert(1)'), '/#work'],
    ['/systems/?sel=' + encodeURIComponent('//evil.example'), '/#work'],
    ['/systems/?sel=', '/'],
    ['/systems/screen/', '/'],
    ['/systems/screen/?sel=project:cucadence', '/projects/cucadence/'],
    ['/systems/screen/?sel=hobby:climbing', '/#work'],
    ['/?sel=project:fluxion', '/projects/fluxion/'],
    ['/?sel=org:gt', '/#work'],
    ['/?sel=project:fluxion&computer=about', '/projects/fluxion/'],
    ['/?sel=', '/?sel='],
  ];
  const ctx = await ctxOf(browser);
  // A fresh page's history holds its first blank entry and the page: 2 for an address that doesn't move.
  const control = await ctx.newPage();
  const base = (await land(control, '/projects/fluxion/')).len;
  await control.close();
  log('history.length after opening an address that stays put (the baseline)', base);
  for (const [from, want] of cases) {
    const page = await ctx.newPage();
    const r = await land(page, from);
    expect(r.at === want && r.len === base, `${from} -> ${want}, no history entry added`, r);
    await page.close();
  }
  await ctx.close();

  log('\n== redirects without JavaScript (the meta refresh inside <noscript>) ==');
  const nojs = await ctxOf(browser, { javaScriptEnabled: false });
  for (const [from, want] of [
    ['/prototype/?computer=about', '/'],
    ['/prototype/work/fluxion/', '/projects/fluxion/'],
    ['/systems/?sel=project:fluxion', '/'],
    ['/systems/screen/', '/'],
  ]) {
    const page = await nojs.newPage();
    const r = await land(page, from);
    expect(r.at === want, `no JS: ${from} -> ${want}`, r);
    await page.close();
  }
  await nojs.close();
}

function builtPages() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push('/' + path.relative(DIST, p).replace(/index\.html$/, '').replace(/\\/g, '/'));
    }
  };
  walk(DIST);
  return out.sort();
}

async function metadata(browser) {
  log('\n== metadata on every built page ==');
  // Each page's HTML as served, parsed in a blank page (loading the retired ones would move on).
  const ctx = await ctxOf(browser);
  const page = await ctx.newPage();
  const pages = builtPages();
  const rows = [];
  for (const p of pages) {
    const html = await (await page.request.get(BASE + p)).text();
    const m = await page.evaluate((html) => {
      const document = new DOMParser().parseFromString(html, 'text/html');
      const q = (s, a = 'content') => document.querySelector(s)?.getAttribute(a) ?? null;
      return {
        title: document.title,
        description: q('meta[name="description"]'),
        canonical: q('link[rel="canonical"]', 'href'),
        robots: q('meta[name="robots"]'),
        ogUrl: q('meta[property="og:url"]'),
        ogImage: q('meta[property="og:image"]'),
        ogTitle: q('meta[property="og:title"]'),
      };
    }, html);
    rows.push({ p, ...m });
  }
  const retired = (p) => /^\/(prototype|systems)(\/|\.html|$)/.test(p);
  const indexable = rows.filter((r) => r.robots !== 'noindex').map((r) => r.p);
  const wantIndexable = pages.filter((p) => p === '/' || /^\/projects\/[\w-]+\/$/.test(p));
  expect(JSON.stringify(indexable) === JSON.stringify(wantIndexable), `indexable pages are exactly / and the ${wantIndexable.length - 1} case studies`, indexable);
  for (const r of rows) {
    if (r.robots === 'noindex') {
      const kind = r.p.startsWith('/computer/') ? 'computer page' : retired(r.p) ? 'retired address' : r.p === '/404.html' ? 'not-found page' : 'other';
      expect(kind !== 'other', `${r.p}: noindex (${kind}), canonical ${r.canonical ? r.canonical.replace(SITE, '') : 'none'}`, { title: r.title });
    } else {
      const own = SITE + r.p;
      expect(r.canonical === own && r.ogUrl === own && r.ogImage === SITE + '/og.jpg' && !!r.description && r.ogTitle === r.title, `${r.p}: canonical and og:url are itself, og:image /og.jpg, has a description`, { title: r.title, description: r.description?.slice(0, 60) + '…' });
    }
  }
  const titles = rows.filter((r) => r.robots !== 'noindex').map((r) => r.title);
  expect(new Set(titles).size === titles.length, 'indexable titles are unique', titles.length);
  // Retired addresses point their canonical at where they go.
  for (const r of rows.filter((r) => retired(r.p))) {
    const want = r.p.startsWith('/prototype/work/') ? SITE + r.p.replace('/prototype/work/', '/projects/') : SITE + '/';
    expect(r.canonical === want, `${r.p}: canonical is its replacement`, r.canonical);
  }
  const img = await page.request.get(BASE + '/og.jpg');
  const buf = await img.body();
  // JPEG size from the first SOF marker.
  let dims = null;
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      dims = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      break;
    }
    i += 2 + len;
  }
  expect(img.status() === 200 && img.headers()['content-type'] === 'image/jpeg' && dims?.w === 1200 && dims?.h === 630, '/og.jpg is served, a 1200x630 JPEG', { status: img.status(), type: img.headers()['content-type'], bytes: buf.length, dims });
  const png = await page.request.get(BASE + '/og.png');
  log('the old /og.png', png.status());
  await ctx.close();
}

async function links(browser) {
  log('\n== links to retired addresses in the built HTML ==');
  const hits = [];
  for (const p of builtPages()) {
    const file = path.join(DIST, p === '/404.html' ? '404.html' : p, p === '/404.html' ? '' : 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const re = /(?:href|src|action)="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) if (/^\/(prototype|systems)\b|[?&]sel=/.test(m[1])) hits.push({ page: p, href: m[1] });
  }
  const outside = hits.filter((h) => !/^\/(prototype|systems)/.test(h.page));
  expect(outside.length === 0, 'no page outside the retired ones links to /prototype, /systems or ?sel=', outside);
  log('links on the retired pages themselves', hits.filter((h) => /^\/(prototype|systems)/.test(h.page)).length);

  const ctx = await ctxOf(browser);
  const page = await ctx.newPage();
  for (const p of ['/', '/projects/fluxion/']) {
    await page.goto(BASE + p, { waitUntil: 'load' });
    const nav = await page.evaluate(() => ({
      header: [...document.querySelectorAll('header a[href]')].map((a) => a.getAttribute('href')),
      tabbar: [...document.querySelectorAll('.tabbar a[href]')].map((a) => a.getAttribute('href')),
      footer: [...document.querySelectorAll('footer a[href]')].map((a) => a.getAttribute('href')),
      search: JSON.parse(document.getElementById('cmdk-data').textContent).map((i) => i.href),
    }));
    const all = [...nav.header, ...nav.tabbar, ...nav.footer, ...nav.search];
    log(`${p} header`, nav.header, 'tab bar', nav.tabbar, 'footer', nav.footer, `search (${nav.search.length})`, nav.search.slice(0, 8));
    expect(all.every((h) => !/prototype|systems|[?&]sel=/.test(h)), `${p}: no navigation to /prototype, /systems or ?sel=`, all.length);
  }
  await ctx.close();
}

const S = (page) =>
  page.evaluate(() => {
    const b = document.querySelector('[data-settings-toggle]');
    const pop = document.getElementById('settings');
    const a = document.activeElement;
    return {
      expanded: b.getAttribute('aria-expanded'),
      open: !pop.hidden && pop.getBoundingClientRect().height > 0,
      focus: a === b ? 'settings button' : a?.matches('header [data-motion-toggle]') ? 'header switch' : a?.matches('footer [data-motion-toggle]') ? 'footer switch' : (a?.getAttribute('aria-label') || a?.textContent || a?.tagName || '').trim().replace(/\s+/g, ' ').slice(0, 30),
      focusVisible: !!a?.matches(':focus-visible'),
      motion: document.documentElement.dataset.motion,
      stored: (() => {
        try {
          return localStorage.getItem('motion');
        } catch {
          return 'unavailable';
        }
      })(),
      checked: [...document.querySelectorAll('[data-motion-toggle]')].map((s) => s.getAttribute('aria-checked')),
      running: document.querySelector('[data-lab-root]')?.dataset.running ?? null,
    };
  });

async function settings(browser) {
  log('\n== Settings disclosure, 1440x900, no motion preference ==');
  const ctx = await ctxOf(browser, { reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?probe', { waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 60000 });
  await page.waitForTimeout(800);
  const btn = await page.evaluate(() => {
    const b = document.querySelector('[data-settings-toggle]');
    const r = b.getBoundingClientRect();
    return { name: b.getAttribute('aria-label'), controls: b.getAttribute('aria-controls'), w: r.width, h: r.height, inHeader: !!b.closest('header') };
  });
  log('button', btn, 'accessible tree', (await page.locator('header [data-settings]').ariaSnapshot()).replace(/\n/g, ' | '));
  let s = await S(page);
  expect(s.expanded === 'false' && !s.open && s.motion === 'on' && s.checked.every((c) => c === 'true'), 'at load: closed, Motion on, both switches checked', s);

  const order = [];
  for (let i = 0; i < 12 && s.focus !== 'settings button'; i++) {
    await page.keyboard.press('Tab');
    s = await S(page);
    order.push(s.focus);
  }
  expect(s.focus === 'settings button' && s.focusVisible, `Tab x${order.length} reaches Settings, focus visible`, order);
  await page.keyboard.press('Enter');
  s = await S(page);
  expect(s.expanded === 'true' && s.open && s.focus === 'settings button', 'Enter opens it; the focus stays on the button', s);
  await page.keyboard.press('Tab');
  s = await S(page);
  expect(s.focus === 'header switch', 'Tab moves into the panel, to the Motion switch', s.focus);
  const f0 = await page.evaluate(() => window.__lab.stats().frames);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const f1 = await page.evaluate(() => window.__lab.stats().frames);
  await page.waitForTimeout(2000);
  const f2 = await page.evaluate(() => window.__lab.stats().frames);
  s = await S(page);
  // stats() draws one frame itself, so a stopped loop shows +1 per call.
  expect(s.motion === 'off' && s.stored === 'off' && s.checked.every((c) => c === 'false') && s.running !== 'true' && f2 - f1 <= 1, 'Space turns Motion off: stored, both switches unchecked, the frame loop stops', { ...s, framesOver2s: f2 - f1, framesBefore: f1 - f0 });
  await page.keyboard.press('Escape');
  s = await S(page);
  expect(!s.open && s.expanded === 'false' && s.focus === 'settings button', 'Escape closes it and puts the focus back on its button', s);
  const pc = await page.evaluate(() => document.documentElement.dataset.pc ?? null);
  expect(pc === null, 'Escape in Settings does nothing to the lab', pc);

  await page.keyboard.press('Space');
  s = await S(page);
  expect(s.open, 'Space on the button opens it too', s.expanded);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  s = await S(page);
  expect(!s.open && s.expanded === 'false', `Tab out of the panel closes it (focus now: ${s.focus})`, s);

  await page.click('[data-settings-toggle]');
  s = await S(page);
  expect(s.open, 'a click opens it', s.expanded);
  const note = await page.evaluate(() => document.querySelector('header [data-motion-toggle]').getAttribute('aria-describedby'));
  const noteText = await page.evaluate((id) => document.getElementById(id)?.textContent.trim(), note);
  log('switch description', noteText);
  await page.screenshot({ path: path.join(path.dirname(LOG), '..', 'screens', 'settings-open-1440x900-nofonts.png'), clip: { x: 1440 - 420, y: 0, width: 420, height: 260 } });
  await page.mouse.click(720, 30);
  s = await S(page);
  expect(!s.open && s.expanded === 'false', 'a click elsewhere closes it', s);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 60000 });
  await page.waitForTimeout(800);
  const g0 = await page.evaluate(() => window.__lab.stats().frames);
  await page.waitForTimeout(2000);
  const g1 = await page.evaluate(() => window.__lab.stats().frames);
  s = await S(page);
  expect(s.motion === 'off' && s.checked.every((c) => c === 'false') && g1 - g0 <= 1, 'after a reload Motion is still off and the room holds still', { ...s, framesOver2s: g1 - g0 });

  const foot = page.locator('footer [data-motion-toggle]');
  await foot.scrollIntoViewIfNeeded();
  await foot.click();
  s = await S(page);
  expect(s.motion === 'on' && s.stored === 'on' && s.checked.every((c) => c === 'true'), "the footer's switch turns it back on, and the header's follows", s);
  const role = await foot.getAttribute('role');
  expect(role === 'switch', "the footer's switch is a switch", role);
  expect(errors.length === 0, 'no page errors', errors);
  await ctx.close();

  log('\n== reduced motion (prefers-reduced-motion: reduce), nothing stored ==');
  const rctx = await ctxOf(browser, { reducedMotion: 'reduce' });
  const rp = await rctx.newPage();
  await rp.goto(BASE + '/?probe', { waitUntil: 'load' });
  await rp.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 60000 });
  await rp.waitForTimeout(800);
  s = await S(rp);
  expect(s.motion === 'off' && s.stored === null && s.checked.every((c) => c === 'false'), 'Motion starts off, nothing stored', s);
  await rp.click('[data-settings-toggle]');
  await rp.click('header [data-motion-toggle]');
  await rp.waitForTimeout(1500);
  const h0 = await rp.evaluate(() => window.__lab.stats().frames);
  await rp.waitForTimeout(1500);
  const h1 = await rp.evaluate(() => window.__lab.stats().frames);
  s = await S(rp);
  // The system's preference still wins in the lab (scene.ts motionOK), as before this pass; the switch
  // then only brings back the page's CSS transitions.
  expect(s.motion === 'on' && s.stored === 'on' && h1 - h0 <= 1, 'turned on in Settings: stored on, and the room still holds (the system preference wins in the lab)', { ...s, framesOver1_5s: h1 - h0 });
  await rctx.close();

  log('\n== Settings on a phone, 390x844 (touch) ==');
  const mctx = await ctxOf(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  await mp.goto(BASE + '/', { waitUntil: 'load' });
  await mp.waitForTimeout(800);
  const b = await mp.evaluate(() => {
    const r = document.querySelector('[data-settings-toggle]').getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(b.w >= 44 && b.h >= 44 && b.x + b.w <= 390, 'the button is at least 44x44 and in view', b);
  await mp.tap('[data-settings-toggle]');
  await mp.waitForTimeout(200);
  const pop = await mp.evaluate(() => {
    const r = document.getElementById('settings').getBoundingClientRect();
    return { x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y), h: Math.round(r.height) };
  });
  expect(pop.x >= 0 && pop.right <= 390 && pop.h > 0, 'the panel opens inside the view', pop);
  await mp.screenshot({ path: path.join(path.dirname(LOG), '..', 'screens', 'settings-open-390x844-nofonts.png'), clip: { x: 0, y: 0, width: 390, height: 300 } });
  await mctx.close();
}

async function plain(browser) {
  log('\n== without JavaScript ==');
  const ctx = await ctxOf(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  const home = await page.evaluate(() =>
    ['work', 'about', 'resume', 'contact'].map((id) => {
      const el = document.getElementById(id);
      const r = el?.getBoundingClientRect();
      return { id, present: !!el, visible: !!r && r.height > 0, heading: el?.querySelector('h1,h2')?.textContent.trim() ?? null, links: el?.querySelectorAll('a[href]').length ?? 0 };
    }),
  );
  expect(home.every((h) => h.present && h.visible), '/: Work, About, Résumé and Contact all show', home);
  const still = await page.evaluate(() => {
    const img = document.querySelector('[data-lab-root] svg, [data-lab-root] img');
    return img ? Math.round(img.getBoundingClientRect().height) : 0;
  });
  expect(still > 0, "/: the lab's still stands in", still);
  const inert = await page.evaluate(() =>
    ['[data-settings-toggle]', '.home-foot [data-motion-toggle]'].map((s) => ({ s, shown: !!document.querySelector(s)?.getClientRects().length })),
  );
  expect(inert.every((c) => !c.shown), "/: Settings and the footer's Motion switch, which need JavaScript, aren't shown", inert);
  await page.goto(BASE + '/projects/fluxion/', { waitUntil: 'load' });
  const cs = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent.trim(), words: document.querySelector('main')?.innerText.split(/\s+/).length }));
  expect(!!cs.h1 && cs.words > 150, '/projects/fluxion/: the case study reads', cs);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const started = new Date().toISOString();
  const checks = (process.env.CHECKS || 'redirects,metadata,links,settings,plain').split(',');
  for (const c of checks) await { redirects, metadata, links, settings, plain }[c](browser);
  log(`\n${pass} passed, ${fail} failed`);
  const head = `# homepage.cjs ${started} · Chrome ${browser.version()} (headless, Playwright, SwiftShader) · server: ${BASE} · checks: ${checks.join(',')}`;
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, [head, ...lines].join('\n') + '\n');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
