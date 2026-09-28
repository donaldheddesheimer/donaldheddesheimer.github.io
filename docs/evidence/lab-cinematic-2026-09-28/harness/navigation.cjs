// Navigation and history of the lab computer on /prototype/ (src/scripts/lab-prototype/computer.ts,
// routes.ts, src/layouts/Screen.astro), at 1440x900 unless a check says otherwise. Eleven checks:
//   1 entering and moving inside the computer: one entry each, the address follows, the top page stays
//   2 Back and Forward through the computer's pages and out; the frame's scroll per entry
//   3 "Leave computer": back through the entries (or replace when opened directly), focus, page scroll
//   4 Escape, with the focus in the frame and in the parent page
//   5 reload inside, direct links, invalid ?computer= values, a frame page opened on its own
//   6 "Open ordinary page" for each computer page
//   7 windows the lab doesn't open in (1024x768, 390x844): the redirect, and whether it paints first
//   8 links out of the computer (stubbed external hosts), the résumé PDF, the copy-email button, and a
//     scan of the served pages for phone numbers (counts only; no number is ever printed)
//   9 the back-forward cache (run twice: with Playwright request routing, and without it)
//  10 resizing while reading: 1440x900 -> 1024x768 -> 1440x900 -> 1920x1080, frame against __lab.quad()
//  11 the keyboard inside the computer: tab order, visible focus, focus after leaving
// Each line of the log is `[run N] [cK] label {json}`; PASS/FAIL lines are the assertions. Every value is
// read from the page (history.length, navigation.currentEntry.index, location, html[data-pc], focus,
// scroll). Nothing leaves the machine: fonts are aborted and every other non-local host gets a stub page.
// Mail links are never clicked (they could hand off to the OS mail client).
// NODE_PATH=<playwright> BASE=http://127.0.0.1:4322 RUNS=2 CHECKS=1,2,...,11 OUT=<shots dir> \
//   LOG=../logs/navigation.log node navigation.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:4322';
const ORIGIN = new URL(BASE).origin;
const RUNS = +(process.env.RUNS || 2);
const CHECKS = (process.env.CHECKS || '1,2,3,4,5,6,7,8,9,10,11').split(',').map(Number);
const OUT = process.env.OUT || '.';
const LOG = process.env.LOG || path.join(__dirname, '../logs/navigation.log');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
// Playwright launches Chrome with --disable-back-forward-cache; a person's Chrome has the cache on, so it is
// dropped here (check 9 depends on it, and Back from an ordinary page in check 6 behaves as it would).
const LAUNCH = { args: ARGS, ignoreDefaultArgs: ['--disable-back-forward-cache'] };

const lines = [];
let run = 0;
let ck = 0;
const results = {}; // `${run}:${ck}` -> { pass, fail }
const L = (label, obj) => {
  const s = `[run ${run}] [c${ck}] ${label}${obj === undefined ? '' : ' ' + JSON.stringify(obj)}`.replace(/\s+$/, '');
  lines.push(s);
  console.log(s);
};
const expect = (ok, what, got) => {
  const k = `${run}:${ck}`;
  results[k] ??= { pass: 0, fail: 0, failed: [] };
  if (ok) results[k].pass++;
  else {
    results[k].fail++;
    results[k].failed.push(what);
  }
  L(`${ok ? 'PASS' : 'FAIL'} ${what}`, got);
};

// Before any page script: a document id (a changed id means the top page navigated), the data-pc values
// in order, pageshow events, and on pagehide whether the document had painted (for check 7).
const INIT = () => {
  if (window.top !== window) return;
  window.__doc = Math.random().toString(36).slice(2, 8);
  window.__pcSeq = [];
  window.__shows = [];
  const rec = () => {
    const v = document.documentElement ? (document.documentElement.dataset.pc ?? null) : null;
    if (window.__pcSeq[window.__pcSeq.length - 1] !== v) window.__pcSeq.push(v);
  };
  new MutationObserver(rec).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-pc'] });
  addEventListener('pageshow', (e) => {
    const f = document.querySelector('.pc-frame');
    let fp = null;
    try {
      fp = f ? f.contentWindow.location.pathname : null;
    } catch {}
    window.__shows.push({ persisted: e.persisted, url: location.pathname + location.search, pc: document.documentElement.dataset.pc ?? null, frame: fp, dialogOpen: !!document.querySelector('[data-pc-dialog]')?.open });
  });
  addEventListener('pagehide', () => {
    try {
      const hops = JSON.parse(sessionStorage.getItem('__hops') || '[]');
      hops.push({ url: location.pathname + location.search + location.hash, paints: performance.getEntriesByType('paint').map((p) => p.name) });
      sessionStorage.setItem('__hops', JSON.stringify(hops));
    } catch {}
  });
};

const externals = [];
async function mk(browser, o = {}) {
  const { width = 1440, height = 900, mobile = false, route = true, clipboard = false } = o;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, acceptDownloads: false });
  if (clipboard) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  if (route) {
    await ctx.route((u) => /^fonts\./.test(u.hostname), (r) => r.abort());
    await ctx.route(
      (u) => u.origin !== ORIGIN && !/^fonts\./.test(u.hostname),
      (r) => {
        externals.push(r.request().url());
        r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>external stub</title><p>external stub</p>' });
      },
    );
  }
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => L('pageerror', e.message));
  return { ctx, page };
}

// The state the checks compare: address, history, the lab's state, the frame, focus and scroll.
const S = (page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const name = (el) => {
      if (!el) return null;
      if (el === el.ownerDocument.body) return 'body';
      if (el.matches('[data-lab-enter]')) return 'Explore the lab (enter link)';
      if (el.matches('.pc-frame')) return 'iframe.pc-frame';
      const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32);
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '';
      return el.tagName.toLowerCase() + cls + (t ? ` "${t}"` : '');
    };
    const f = document.querySelector('.pc-frame');
    let frame = null;
    if (f) {
      try {
        const w = f.contentWindow;
        frame = { path: w.location.pathname + w.location.hash, y: Math.round(w.scrollY), focus: name(w.document.activeElement) };
      } catch (e) {
        frame = { error: String(e) };
      }
    }
    const nav = window.navigation;
    return {
      url: location.pathname + location.search + location.hash,
      doc: window.__doc,
      len: history.length,
      idx: nav ? nav.currentEntry.index : null,
      n: nav ? nav.entries().length : null,
      state: history.state,
      pc: h.dataset.pc ?? null,
      full: h.hasAttribute('data-pc-full'),
      dialog: !!document.querySelector('[data-pc-dialog]')?.open,
      src: f ? f.getAttribute('src') : null,
      frame,
      focus: name(document.activeElement),
      y: Math.round(scrollY),
      ovf: getComputedStyle(h).overflowY,
    };
  });
const entries = (page) => page.evaluate(() => (window.navigation ? navigation.entries().map((e) => { const u = new URL(e.url); return u.pathname + u.search + u.hash; }) : null));
const seq = (page) => page.evaluate(() => window.__pcSeq.slice());
const clearSeq = (page) => page.evaluate(() => (window.__pcSeq = [document.documentElement.dataset.pc ?? null]));
const drawn = (page) => page.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 60000 });
const waitRead = (page, p) =>
  page
    .waitForFunction(
      (p) => {
        const f = document.querySelector('.pc-frame');
        try {
          return document.documentElement.dataset.pc === 'read' && f.contentWindow.location.pathname === `/computer/${p}/` && f.contentDocument.readyState === 'complete' && f.style.opacity === '1' && !f.inert;
        } catch {
          return false;
        }
      },
      p,
      { timeout: 30000 },
    )
    .then(() => page.waitForTimeout(300));
const waitClosed = (page) => page.waitForFunction(() => !document.documentElement.dataset.pc && !document.querySelector('[data-pc-dialog]')?.open, null, { timeout: 30000 }).then(() => page.waitForTimeout(300));
const frameOf = async (page) => (await page.$('.pc-frame'))?.contentFrame();
const navSel = (p) => `.scr-nav a[href="/prototype/?computer=${p}"]`;
// The computer's bar is sticky: Playwright's own click scrolls a sticky element "into view", which moves
// the page under it (a scrolled case study went from 1200 to 480 before the click landed). Bar controls
// are clicked with the mouse at their place instead, as a person would; other links with Playwright's click.
async function barClick(page, sel) {
  const fr = await frameOf(page);
  const box = await (await fr.$(sel)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function go(page, p, sel) {
  if (sel || p.startsWith('work/')) await (await frameOf(page)).click(sel || `a[href="/prototype/?computer=${p}"] >> nth=0`);
  else await barClick(page, navSel(p));
  await waitRead(page, p);
}
const enter = async (page) => {
  await page.click('[data-lab-enter]');
  await waitRead(page, 'work');
};
const shot = async (page, name, clip) => {
  if (run !== 1) return;
  const file = path.join(OUT, `navigation-${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 86, ...(clip ? { clip } : {}) });
  L('screenshot', file);
};

// ---------------------------------------------------------------------------------------------------------
async function c1(browser) {
  const { ctx, page } = await mk(browser);
  await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
  await drawn(page);
  const s0 = await S(page);
  L('opening', s0);
  await clearSeq(page);
  await page.click('[data-lab-enter]');
  await waitRead(page, 'work');
  const s1 = await S(page);
  L('entered with "Explore the lab"', { ...s1, pcSeq: await seq(page) });
  expect(s1.idx === s0.idx + 1 && s1.n === s0.n + 1 && s1.len === s0.len + 1, 'entering adds exactly one entry', { idx: [s0.idx, s1.idx], n: [s0.n, s1.n], len: [s0.len, s1.len] });
  expect(s1.url === '/prototype/?computer=work', 'address is /prototype/?computer=work', s1.url);
  expect(s1.doc === s0.doc, 'top page did not load a new document', [s0.doc, s1.doc]);
  let prev = s1;
  for (const p of ['work/cucadence', 'about', 'resume', 'contact']) {
    await go(page, p);
    const s = await S(page);
    L(`inside the computer -> ${p}`, s);
    expect(s.idx === prev.idx + 1 && s.n === prev.n + 1 && s.len === prev.len + 1, `-> ${p}: one entry`, { idx: [prev.idx, s.idx], n: [prev.n, s.n], len: [prev.len, s.len] });
    expect(s.url === `/prototype/?computer=${p}`, `-> ${p}: address follows`, s.url);
    expect(s.frame?.path === `/computer/${p}/` && s.doc === s0.doc, `-> ${p}: the frame changed, the top page did not navigate`, { frame: s.frame?.path, doc: s.doc });
    expect(s.state?.pc === p && s.state?.back === (prev.state?.back ?? 0) + 1, `-> ${p}: history.state {pc, back+1}`, s.state);
    prev = s;
  }
  // The page already shown: a link to it scrolls, and adds nothing.
  await barClick(page, navSel('contact'));
  await page.waitForTimeout(800);
  const same = await S(page);
  expect(same.idx === prev.idx && same.n === prev.n, 'a link to the page already shown adds no entry', { idx: [prev.idx, same.idx], n: [prev.n, same.n] });
  const e = await entries(page);
  L('navigation.entries()', e);
  expect(e.every((u, i) => i === 0 || u !== e[i - 1]), 'no two neighbouring entries are the same', e.length);
  L('iframe src attribute (the frame navigates with location.replace, the attribute keeps the first page)', same.src);
  await ctx.close();
}

async function walk(page) {
  await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
  await drawn(page);
  const s0 = await S(page);
  await enter(page);
  for (const p of ['work/cucadence', 'about', 'resume', 'contact']) await go(page, p);
  return s0;
}

async function c2(browser) {
  const { ctx, page } = await mk(browser);
  const s0 = await walk(page);
  L('at contact after work -> case -> about -> resume -> contact', await S(page));
  for (const p of ['resume', 'about', 'work/cucadence', 'work', null]) {
    await page.goBack();
    if (p) await waitRead(page, p);
    else await waitClosed(page);
    const s = await S(page);
    L(`Back -> ${p ?? 'opening'}`, s);
    if (p) expect(s.url === `/prototype/?computer=${p}` && s.frame?.path === `/computer/${p}/` && s.pc === 'read', `Back -> ${p}: address, frame and lab agree`, { url: s.url, frame: s.frame?.path, pc: s.pc });
    else expect(s.url === '/prototype/' && s.pc === null && !s.dialog && s.idx === s0.idx && s.doc === s0.doc, 'Back -> the opening: lab closed, same document', { url: s.url, pc: s.pc, idx: s.idx, doc: s.doc });
  }
  await clearSeq(page);
  for (const p of ['work', 'work/cucadence', 'about', 'resume', 'contact']) {
    await page.goForward();
    await waitRead(page, p);
    const s = await S(page);
    L(`Forward -> ${p}`, { ...s, ...(p === 'work' ? { pcSeq: await seq(page) } : {}) });
    expect(s.url === `/prototype/?computer=${p}` && s.frame?.path === `/computer/${p}/`, `Forward -> ${p}: address and frame agree`, { url: s.url, frame: s.frame?.path });
  }
  // Scroll per entry: the case study scrolled, About, Back.
  for (let i = 0; i < 3; i++) await page.goBack();
  await waitRead(page, 'work/cucadence');
  let fr = await frameOf(page);
  const set = await fr.evaluate(() => (scrollTo(0, 1200), Math.round(scrollY)));
  await go(page, 'about');
  const atAbout = await S(page);
  L('case study scrolled, then About', { caseY: set, ...atAbout });
  expect(atAbout.frame.y === 0, 'About opens at its top', atAbout.frame.y);
  await page.goBack();
  await waitRead(page, 'work/cucadence');
  await page.waitForTimeout(300);
  const back = await S(page);
  L('Back -> case study', back);
  expect(back.frame.y === set, 'the case study scroll is restored on Back', { saved: set, restored: back.frame.y, state: back.state });
  if (run === 1) await shot(page, 'c2-back-case-scroll-restored');
  // And the page left with Back (Résumé, which is long enough): scrolled, Back, Forward.
  await go(page, 'resume');
  fr = await frameOf(page);
  const resY = await fr.evaluate(() => (scrollTo(0, 900), Math.round(scrollY)));
  await page.goBack();
  await waitRead(page, 'work/cucadence');
  const caseAgain = await S(page);
  await page.goForward();
  await waitRead(page, 'resume');
  const fwd = await S(page);
  L('case study -> Résumé scrolled to ' + resY + ', Back, Forward', { caseYAfterBack: caseAgain.frame.y, resumeYAfterForward: fwd.frame.y, resumeState: fwd.state });
  expect(caseAgain.frame.y === set, 'the case study keeps its scroll on a second Back', caseAgain.frame.y);
  expect(fwd.frame.y === resY, 'a page left with Back keeps its scroll for Forward', { scrolled: resY, afterForward: fwd.frame.y });
  await ctx.close();
}

async function c3(browser) {
  // a) entered with "Explore the lab" from a scrolled page, three pages deep, then Leave.
  {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
    await drawn(page);
    await page.evaluate(() => scrollTo(0, 150));
    await page.waitForTimeout(300);
    const s0 = await S(page);
    L('a) opening scrolled to 150', s0);
    await enter(page);
    await page.evaluate(() => scrollTo(0, 600));
    await page.waitForTimeout(300);
    await page.mouse.move(40, 450); // over the room, outside the frame
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(500);
    const locked = await page.evaluate(() => Math.round(scrollY));
    L('a) while reading: scrollTo(0, 600) and a wheel outside the frame leave the page at', locked);
    expect(locked === 150, 'a) the page underneath is locked while reading', locked);
    for (const p of ['work/cucadence', 'about']) await go(page, p);
    const before = await S(page);
    L('a) at about, three entries in', before);
    await clearSeq(page);
    await barClick(page, '[data-leave]');
    await waitClosed(page);
    const s = await S(page);
    L('a) after Leave computer', { ...s, pcSeq: await seq(page) });
    expect(s.idx === s0.idx && s.url === '/prototype/' && s.doc === s0.doc, 'a) Leave goes back through the entries to the opening', { idx: [s0.idx, before.idx, s.idx], url: s.url });
    expect(s.focus === 'Explore the lab (enter link)', 'a) focus returns to "Explore the lab"', s.focus);
    expect(s.y === 150, 'a) page scroll restored to 150', s.y);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(600);
    const y2 = await page.evaluate(() => Math.round(scrollY));
    expect(y2 > 150 && s.ovf !== 'hidden', 'a) page scroll unlocked (wheel moves it)', { overflowY: s.ovf, afterWheel: y2 });
    const e = await entries(page);
    L('a) entries after Leave (forward entries kept)', e);
    await ctx.close();
  }
  // b) opened directly: Leave replaces the entry.
  {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/?computer=about', { waitUntil: 'load' });
    await waitRead(page, 'about');
    const s0 = await S(page);
    L('b) opened directly at ?computer=about', s0);
    await barClick(page, '[data-leave]');
    await waitClosed(page);
    const s = await S(page);
    L('b) after Leave computer', s);
    expect(s.url === '/prototype/' && s.idx === s0.idx && s.n === s0.n && s.len === s0.len, 'b) Leave replaces the entry (no new entry, same index)', { url: s.url, idx: [s0.idx, s.idx], n: [s0.n, s.n] });
    expect(s.focus === 'Explore the lab (enter link)', 'b) focus on the enter link', s.focus);
    expect(s.y === 0 && s.ovf !== 'hidden', 'b) page at its top and unlocked', { y: s.y, ovf: s.ovf });
    await ctx.close();
  }
  // c) entered by clicking the monitor.
  {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/?probe', { waitUntil: 'load' });
    await drawn(page);
    await page.waitForTimeout(800);
    const q = await page.evaluate(() => (window.__lab.stats(), window.__lab.quad()));
    const cx = q.reduce((a, c) => a + c[0], 0) / 4;
    const cy = q.reduce((a, c) => a + c[1], 0) / 4;
    const s0 = await S(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await waitRead(page, 'work');
    const s1 = await S(page);
    L('c) entered by clicking the monitor at ' + Math.round(cx) + ',' + Math.round(cy), s1);
    expect(s1.idx === s0.idx + 1, 'c) the monitor click adds one entry', { idx: [s0.idx, s1.idx] });
    await barClick(page, '[data-leave]');
    await waitClosed(page);
    const s = await S(page);
    L('c) after Leave computer', s);
    expect(s.idx === s0.idx && s.focus === 'Explore the lab (enter link)', 'c) back at the opening, focus on the enter link', { idx: s.idx, focus: s.focus, url: s.url });
    await ctx.close();
  }
  // d) opened directly, then another page, then Leave: what is left behind the opening.
  {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/?computer=about', { waitUntil: 'load' });
    await waitRead(page, 'about');
    const s0 = await S(page);
    await go(page, 'contact');
    const s1 = await S(page);
    L('d) direct about -> contact', s1);
    await barClick(page, '[data-leave]');
    await waitClosed(page);
    const s = await S(page);
    L('d) after Leave computer', { ...s, entries: await entries(page) });
    expect(s.url === '/prototype/' && s.pc === null, 'd) Leave returns to the opening', { url: s.url, idx: [s0.idx, s1.idx, s.idx] });
    await clearSeq(page);
    await page.goBack();
    await page.waitForTimeout(3500);
    const b = await S(page);
    L('d) then Back (the directly opened entry is still behind the opening)', { ...b, pcSeq: await seq(page) });
    await ctx.close();
  }
}

async function c4(browser) {
  for (const where of ['frame', 'parent']) {
    for (const deep of [false, true]) {
      const { ctx, page } = await mk(browser);
      await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
      await drawn(page);
      const s0 = await S(page);
      await enter(page);
      if (deep) for (const p of ['about', 'contact']) await go(page, p);
      if (where === 'parent') await page.evaluate(() => document.querySelector('[data-pc-dialog]').focus());
      const before = await S(page);
      const tag = `${where}${deep ? ', three entries in' : ''}`;
      L(`Escape with focus in the ${tag}: before`, { focus: before.focus, frameFocus: before.frame?.focus, idx: before.idx, url: before.url });
      await page.keyboard.press('Escape');
      await waitClosed(page);
      await page.waitForTimeout(1500); // a second traversal, if any, would land in this time
      const s = await S(page);
      L(`Escape (${tag}): after`, s);
      expect(s.idx === s0.idx && s.url === '/prototype/' && s.doc === s0.doc, `Escape (${tag}) returns to the opening entry, no further`, { idx: [s0.idx, before.idx, s.idx], url: s.url, doc: s.doc === s0.doc });
      expect(s.focus === 'Explore the lab (enter link)', `Escape (${tag}): focus on "Explore the lab"`, s.focus);
      await ctx.close();
    }
  }
  // Two Escapes in quick succession, focus in the parent (Chrome may force-close the dialog).
  {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
    await drawn(page);
    const s0 = await S(page);
    await enter(page);
    await go(page, 'about');
    await page.evaluate(() => document.querySelector('[data-pc-dialog]').focus());
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await waitClosed(page);
    await page.waitForTimeout(1500);
    const s = await S(page);
    L('two quick Escapes in the parent, two entries in', s);
    expect(s.idx === s0.idx && s.url === '/prototype/', 'two quick Escapes land on the opening entry', { idx: [s0.idx, s.idx], url: s.url });
    await ctx.close();
  }
}

async function c5(browser) {
  // Reload inside the computer, reached by entering and moving to About.
  {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
    await drawn(page);
    const s0 = await S(page);
    await enter(page);
    await go(page, 'about');
    await go(page, 'resume');
    const fr = await frameOf(page);
    const y = await fr.evaluate(() => (scrollTo(0, 900), Math.round(scrollY)));
    await page.waitForTimeout(300);
    const before = await S(page);
    L('resume, entered then navigated, frame scrolled to ' + y, before);
    await page.reload({ waitUntil: 'load' });
    await waitRead(page, 'resume');
    const s = await S(page);
    const pcSeq = await seq(page);
    L('after reload', { ...s, pcSeq });
    expect(s.url === '/prototype/?computer=resume' && s.frame?.path === '/computer/resume/', 'reload: same page in the computer', { url: s.url, frame: s.frame?.path });
    expect(!pcSeq.includes('fade') && !pcSeq.includes('fly'), 'reload: opens flat, no camera flight (no fade/fly state)', pcSeq);
    expect(s.len === before.len && s.idx === before.idx, 'reload: no history change', { len: [before.len, s.len], idx: [before.idx, s.idx] });
    expect(s.frame?.y === y, 'reload: the frame page keeps its scroll (computer.ts:98 says remember() is for "Back and Forward (and a reload)")', { before: y, afterReload: s.frame?.y, state: s.state });
    await clearSeq(page);
    await barClick(page, '[data-leave]');
    await page.waitForTimeout(4000);
    const left = await S(page);
    L('reload, then Leave computer', { ...left, pcSeq: await seq(page) });
    expect(left.url === '/prototype/' && left.pc === null, 'reload, then Leave: back at the opening', { url: left.url, pc: left.pc, idx: [s0.idx, left.idx] });
    expect(left.doc === s.doc, 'reload, then Leave: without loading the page again', { reloaded: s.doc, afterLeave: left.doc });
    expect(left.focus === 'Explore the lab (enter link)', 'reload, then Leave: focus on the enter link', left.focus);
    await ctx.close();
  }
  // A direct reload of a directly opened page.
  {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/?computer=about', { waitUntil: 'load' });
    await waitRead(page, 'about');
    await page.reload({ waitUntil: 'load' });
    await waitRead(page, 'about');
    const s = await S(page);
    L('direct ?computer=about, reloaded', { ...s, pcSeq: await seq(page) });
    expect(s.state?.pc === 'about' && s.state?.back === 0 && !(await seq(page)).includes('fly'), 'direct + reload: flat, state {pc: about, back: 0}', s.state);
    await ctx.close();
  }
  // Direct links.
  for (const p of ['work', 'work/cucadence', 'about', 'resume', 'contact']) {
    const { ctx, page } = await mk(browser);
    const t = Date.now();
    await page.goto(BASE + '/prototype/?computer=' + p, { waitUntil: 'load' });
    await waitRead(page, p);
    const s = await S(page);
    const pcSeq = await seq(page);
    L(`direct /prototype/?computer=${p}`, { ...s, pcSeq, msToReading: Date.now() - t });
    expect(s.url === `/prototype/?computer=${p}` && s.frame?.path === `/computer/${p}/` && !pcSeq.includes('fly') && s.state?.back === 0, `direct ${p}: opens on it, flat, back 0`, { url: s.url, frame: s.frame?.path, pcSeq, state: s.state });
    await ctx.close();
  }
  // Invalid values.
  for (const q of ['bogus', 'work/nope', '', 'work/', '/about/']) {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/?computer=' + q, { waitUntil: 'load' });
    await drawn(page);
    await page.waitForTimeout(1000);
    const s = await S(page);
    const vis = await page.evaluate(() => ({ enter: getComputedStyle(document.querySelector('[data-lab-enter] .pc-yes')).display !== 'none', h1: document.querySelector('#hero-name')?.getBoundingClientRect().top }));
    L(`invalid ?computer=${q}`, { ...s, pcSeq: await seq(page), opening: vis });
    if (q === 'work/') expect(s.pc === 'read' && s.frame?.path === '/computer/work/', 'a trailing slash is trimmed: ?computer=work/ opens Work', { url: s.url, pc: s.pc });
    else if (q === '/about/') expect(s.pc === 'read' && s.frame?.path === '/computer/about/', 'slashes are trimmed: ?computer=/about/ opens About', { url: s.url, pc: s.pc });
    else expect(s.pc === null && !s.dialog && s.url === '/prototype/', `?computer=${q}: falls back to the opening, the address cleaned to /prototype/`, { url: s.url, pc: s.pc });
    await ctx.close();
  }
  // A frame page opened on its own.
  for (const p of ['/computer/about/', '/computer/work/cucadence/', '/computer/work/nope/']) {
    const { ctx, page } = await mk(browser);
    const r = await page.goto(BASE + p, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const s = await S(page);
    L(`frame page opened on its own: ${p}`, { status: r.status(), url: s.url, pc: s.pc, len: s.len });
    await ctx.close();
  }
}

async function c6(browser) {
  const cases = [
    ['about', '/prototype/#about', 'about'],
    ['work/cucadence', '/prototype/work/cucadence/', null],
    ['work', '/prototype/#work', 'work'],
    ['resume', '/prototype/#resume', 'resume'],
    ['contact', '/prototype/#contact', 'contact'],
  ];
  for (const [p, want, id] of cases) {
    const { ctx, page } = await mk(browser);
    await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
    await drawn(page);
    await enter(page);
    if (p !== 'work') await go(page, p);
    const s0 = await S(page);
    await barClick(page, 'a[data-top]');
    await page.waitForURL((u) => u.pathname + u.hash === want, { timeout: 15000 });
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    const s = await S(page);
    const sec = await page.evaluate((id) => {
      const el = id ? document.getElementById(id) : document.querySelector('h1');
      return el ? { top: Math.round(el.getBoundingClientRect().top), text: el.querySelector('h1,h2')?.textContent?.trim() ?? el.textContent.trim().slice(0, 40), atPageEnd: scrollY >= document.documentElement.scrollHeight - innerHeight - 1 } : null;
    }, id);
    L(`Open ordinary page from ${p}`, { ...s, target: sec });
    expect(s.url === want && s.pc === null && s.doc !== s0.doc && s.idx === s0.idx + 1, `${p} -> ${want} (top window, one new entry)`, { url: s.url, idx: [s0.idx, s.idx], pc: s.pc });
    if (id) expect(sec && sec.top >= -2 && (sec.top < 200 || sec.atPageEnd), `${p}: the section is at the top of the view (or the page is scrolled to its end)`, sec);
    if (run === 1 && p === 'about') await shot(page, 'c6-ordinary-about');
    // The lab may come back from the back-forward cache, which fires no load event (as in check 9).
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForTimeout(2500);
    const b = await S(page);
    const shows = await page.evaluate(() => window.__shows);
    L(`  then Back`, { url: b.url, pc: b.pc, frame: b.frame?.path, doc: b.doc === s0.doc ? 'same as before' : 'new', lastPageshow: shows[shows.length - 1] });
    await ctx.close();
  }
}

async function c7(browser) {
  for (const [w, h, mobile] of [
    [1024, 768, false],
    [390, 844, true],
  ]) {
    for (const [p, want] of [
      ['about', '/prototype/#about'],
      ['work/cucadence', '/prototype/work/cucadence/'],
      ['work', '/prototype/#work'],
      ['resume', '/prototype/#resume'],
      ['contact', '/prototype/#contact'],
    ]) {
      const { ctx, page } = await mk(browser, { width: w, height: h, mobile });
      const navs = [];
      page.on('framenavigated', (f) => f === page.mainFrame() && navs.push(new URL(f.url()).pathname + new URL(f.url()).search + new URL(f.url()).hash));
      await page.goto(BASE + '/prototype/?computer=' + p, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      const s = await S(page);
      const hops = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__hops') || '[]'));
      const able = await page.evaluate(() => document.documentElement.hasAttribute('data-pc-able'));
      L(`${w}x${h} ?computer=${p}`, { url: s.url, len: s.len, pc: s.pc, pcAble: able, mainFrameNavigations: navs, unloadedDocs: hops });
      const first = hops.find((x) => x.url.includes('computer='));
      // history.length counts the tab's first about:blank entry too, so the same-origin entries are compared.
      expect(s.url === want && s.pc === null && s.n === 1, `${w}x${h} ${p} -> ${want} (replace, no extra entry)`, { url: s.url, len: s.len, sameOriginEntries: s.n });
      expect(first && first.paints.length === 0, `${w}x${h} ${p}: the ?computer= document never painted`, first);
      if (run === 1 && mobile && p === 'work/cucadence') await shot(page, 'c7-390x844-case-redirected');
      await ctx.close();
    }
    // The frame page on its own in this window.
    const { ctx, page } = await mk(browser, { width: w, height: h, mobile });
    await page.goto(BASE + '/computer/about/', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const hops = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__hops') || '[]'));
    L(`${w}x${h} /computer/about/ opened on its own`, { url: await page.evaluate(() => location.pathname + location.hash), unloadedDocs: hops });
    await ctx.close();
  }
}

async function c8(browser) {
  const { ctx, page } = await mk(browser, { clipboard: true });
  await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
  await drawn(page);
  await enter(page);
  const projects = await page.evaluate(() => JSON.parse(document.querySelector('[data-pc-dialog]').dataset.projects));
  // Every link on every computer page, sorted by what a plain click does (Screen.astro's handler).
  const kinds = {};
  const swallowed = [];
  for (const p of ['work', 'about', 'resume', 'contact', ...projects.map((id) => 'work/' + id)]) {
    const r = await page.request.get(`${BASE}/computer/${p}/`);
    const html = await r.text();
    const res = await page.evaluate(
      ({ html, projects }) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const out = [];
        const PAGES = ['work', 'about', 'resume', 'contact'];
        const pathOf = (u) => {
          if (u.origin !== location.origin) return null;
          const p = u.pathname;
          if (p === '/prototype/' || p === '/prototype') {
            const q = u.searchParams.get('computer');
            if (q) return q;
            const h = u.hash.slice(1);
            return PAGES.includes(h) ? h : null;
          }
          const m = p.match(/^\/(?:computer|prototype)\/(work\/[\w-]+|work|about|resume|contact)\/?$/) ?? p.match(/^\/projects\/([\w-]+)\/?$/);
          if (!m) return null;
          return p.startsWith('/projects/') ? `work/${m[1]}` : m[1];
        };
        const valid = (p) => {
          p = (p ?? '').replace(/^\/+|\/+$/g, '');
          if (PAGES.includes(p)) return true;
          const m = p.match(/^work\/([\w-]+)$/);
          return !!(m && projects.includes(m[1]));
        };
        for (const a of doc.querySelectorAll('body a[href]')) {
          const u = new URL(a.getAttribute('href'), location.origin + '/computer/x/');
          let kind;
          if (a.hasAttribute('download')) kind = 'download';
          else if (a.hasAttribute('data-top')) kind = 'top window (ordinary page)';
          else if (a.getAttribute('target') === '_blank') kind = 'new tab (target=_blank)';
          else if (!/^https?:$/.test(u.protocol)) kind = u.protocol + ' (default, target _top via <base>)';
          else {
            const to = pathOf(u);
            if (!to) kind = u.origin === location.origin ? 'new tab (window.open, same-origin page with no computer path)' : 'new tab (window.open, external)';
            else if (!valid(to)) kind = 'SWALLOWED (pc:go with a path the lab rejects)';
            else kind = 'pc:go';
          }
          out.push({ kind, href: u.protocol === 'mailto:' ? 'mailto:(address)' : u.href.replace(location.origin, '') });
        }
        return out;
      },
      { html, projects },
    );
    for (const x of res) {
      kinds[x.kind] = (kinds[x.kind] || 0) + 1;
      if (x.kind.startsWith('SWALLOWED')) swallowed.push(p + ': ' + x.href);
    }
  }
  L('links on the computer pages by what a plain click does', kinds);
  expect(swallowed.length === 0, 'no link is swallowed by the frame', swallowed);

  const popup = async (label, fr, sel) => {
    const before = await S(page);
    const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null), fr.click(sel)]);
    if (pop) await pop.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(600);
    const after = await S(page);
    const got = { newTab: pop ? pop.url() : null, topUrl: after.url, frame: after.frame?.path, sameDoc: after.doc === before.doc, idx: [before.idx, after.idx] };
    L(label, got);
    expect(!!pop && after.url === before.url && after.frame?.path === before.frame?.path && after.idx === before.idx, `${label}: a new tab; the frame and the top page stay`, got);
    if (pop) await pop.close();
  };
  await go(page, 'contact');
  let fr = await frameOf(page);
  await popup('Contact: GitHub', fr, 'a[href^="https://github.com/"]');
  await popup('Contact: LinkedIn', fr, 'a[href^="https://www.linkedin.com/"]');
  // Copy address.
  const copyHas = await fr.evaluate(() => !!document.querySelector('[data-copy-email]'));
  if (copyHas) {
    await fr.evaluate(() => navigator.clipboard.writeText('-').catch((e) => String(e)));
    await fr.click('[data-copy-email]');
    await page.waitForTimeout(300);
    const label = await fr.evaluate(() => document.querySelector('[data-copy-email] span').textContent);
    const want = await fr.evaluate(() => document.querySelector('[data-copy-email]').dataset.copyEmail);
    const clip = await fr.evaluate(() => navigator.clipboard.readText().catch((e) => 'error: ' + e));
    const s = await S(page);
    L('Contact: Copy address', { label, clipboardMatchesButton: clip === want, frame: s.frame?.path, url: s.url });
    expect(label === 'Copied' && clip === want && s.frame?.path === '/computer/contact/', 'Copy address works inside the frame', { label, clipboardMatchesButton: clip === want });
  }
  await go(page, 'work');
  await go(page, 'work/cucadence');
  fr = await frameOf(page);
  await popup('Case study: repository button', fr, '.btn[href^="https://github.com/"] >> nth=0');
  await popup('Case study: inline external link without target (ui.perfetto.dev)', fr, 'a[href="https://ui.perfetto.dev"]');
  await popup('Case study: same-origin image link (/projects/cadence-timeline.png)', fr, 'a[href="/projects/cadence-timeline.png"]');
  // The résumé PDF.
  const r = await page.request.get(BASE + '/resume.pdf');
  const body = await r.body();
  L('GET /resume.pdf', { status: r.status(), type: r.headers()['content-type'], bytes: body.length });
  expect(r.status() === 200 && /application\/pdf/.test(r.headers()['content-type']), 'the résumé PDF is served (200, application/pdf)', { status: r.status(), type: r.headers()['content-type'] });
  await go(page, 'resume');
  fr = await frameOf(page);
  const before = await S(page);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), fr.click('a[href="/resume.pdf"]')]);
  await page.waitForTimeout(800);
  const after = await S(page);
  const got = { download: dl ? { url: dl.url().replace(ORIGIN, ''), suggested: dl.suggestedFilename() } : null, frame: after.frame?.path, url: after.url, pages: ctx.pages().length };
  L('Résumé: Download PDF', got);
  expect(!!dl && after.frame?.path === '/computer/resume/' && after.url === before.url, 'Download PDF downloads; the frame keeps the Résumé page', got);
  // Phone numbers on the served pages and in the PDF (counts only).
  const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g;
  const scan = {};
  for (const p of ['/prototype/', '/computer/work/', '/computer/about/', '/computer/resume/', '/computer/contact/', '/computer/work/cucadence/', '/prototype/work/cucadence/', '/']) {
    const t = await (await page.request.get(BASE + p)).text();
    scan[p] = { tel: (t.match(/tel:/gi) || []).length, phoneLike: (t.match(PHONE) || []).length };
  }
  let pdfText = '';
  const raw = body.toString('latin1');
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const end = raw.indexOf('endstream', m.index);
    if (end < 0) break;
    try {
      pdfText += zlib.inflateSync(body.subarray(m.index + m[0].length, end)).toString('latin1');
    } catch {}
  }
  const tj = (pdfText.match(/\((?:\\.|[^\\)])*\)/g) || []).map((s) => s.slice(1, -1)).join('');
  // Calibration: whether this scan can read the PDF's words at all (glyph-coded text would read as nothing).
  const readable = ['Education', 'Experience', 'Skills'].filter((w) => tj.replace(/\s+/g, '').includes(w) || pdfText.includes(w));
  scan['/resume.pdf'] = { inflatedBytes: pdfText.length, literalTextChars: tj.length, wordsReadable: readable, tel: (pdfText.match(/tel:/gi) || []).length, phoneLike: (tj.match(PHONE) || []).length + (pdfText.match(PHONE) || []).length };
  L('phone-number scan (counts only)', scan);
  expect(Object.entries(scan).every(([, v]) => v.tel === 0 && v.phoneLike === 0), 'no phone number on the served pages (or found in the PDF text layer)', Object.fromEntries(Object.entries(scan).map(([k, v]) => [k, v.tel + v.phoneLike])));
  L('external requests answered by the stub (hosts)', [...new Set(externals.map((u) => new URL(u).host))]);
  await ctx.close();
}

async function c9(browser, label) {
  const withRoute = label === 'routed';
  const cdpWatch = async (page) => {
    const cdp = await page.context().newCDPSession(page);
    const notUsed = [];
    cdp.on('Page.backForwardCacheNotUsed', (e) => notUsed.push((e.notRestoredExplanations || []).map((x) => `${x.type}:${x.reason}`)));
    await cdp.send('Page.enable');
    return notUsed;
  };
  // a) direct ?computer=about -> / -> Back.
  {
    const { ctx, page } = await mk(browser, { route: withRoute });
    const notUsed = await cdpWatch(page);
    await page.goto(BASE + '/prototype/?computer=about', { waitUntil: 'load' });
    await waitRead(page, 'about');
    const s0 = await S(page);
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.goBack({ waitUntil: 'commit' });
    const t0 = Date.now();
    await page.waitForTimeout(100);
    const s = await S(page);
    const shows = await page.evaluate(() => window.__shows);
    L(`[${label}] a) ?computer=about -> / -> Back`, { ...s, msAfterBack: Date.now() - t0, pageshows: shows, bfcacheNotUsed: notUsed });
    const last = shows[shows.length - 1];
    expect(last?.persisted === true && s.doc === s0.doc, `[${label}] a) restored from the back-forward cache (pageshow persisted, same document)`, { persisted: last?.persisted, sameDoc: s.doc === s0.doc, notUsed });
    expect(last?.pc === 'read' && last?.frame === '/computer/about/' && s.url === '/prototype/?computer=about', `[${label}] a) at pageshow the lab already reads About`, last);
    await ctx.close();
  }
  // b) the lab opened from the opening, then Contact; the top page to /; Back.
  {
    const { ctx, page } = await mk(browser, { route: withRoute });
    const notUsed = await cdpWatch(page);
    await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
    await drawn(page);
    const s0 = await S(page);
    await enter(page);
    await go(page, 'contact');
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForTimeout(100);
    let s = await S(page);
    let shows = await page.evaluate(() => window.__shows);
    L(`[${label}] b) opening -> work -> contact -> / -> Back`, { ...s, lastPageshow: shows[shows.length - 1], bfcacheNotUsed: notUsed });
    expect(s.url === '/prototype/?computer=contact' && shows[shows.length - 1]?.frame === '/computer/contact/' && s.pc === 'read', `[${label}] b) restored on Contact, matching the address`, { url: s.url, pageshow: shows[shows.length - 1] });
    // Now skip two entries at once, to the opening: a restore whose document is reading, at an address
    // that isn't.
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await clearSeq(page).catch(() => {});
    await page.evaluate(() => history.go(-3));
    await page.waitForURL((u) => u.pathname === '/prototype/' && !u.search, { timeout: 15000, waitUntil: 'commit' });
    await page.waitForTimeout(100);
    const s100 = await S(page);
    await page.waitForTimeout(2500);
    s = await S(page);
    shows = await page.evaluate(() => window.__shows);
    L(`[${label}] b) then / and history.go(-3) straight to the opening (a jump to another entry of the cached document; see bfcacheNotUsed for whether Chrome restored it)`, { at100ms: { pc: s100.pc, dialog: s100.dialog }, ...s, lastPageshow: shows[shows.length - 1], pcSeq: await seq(page), bfcacheNotUsed: notUsed });
    expect(s.url === '/prototype/' && s.pc === null && !s.dialog, `[${label}] b) restored at the opening: the lab closes`, { url: s.url, pc: s.pc, dialog: s.dialog });
    expect(!(await seq(page)).includes('return'), `[${label}] b) closed at once (no return flight)`, await seq(page));
    await ctx.close();
  }
}

async function c10(browser) {
  const { ctx, page } = await mk(browser);
  await page.goto(BASE + '/prototype/?probe', { waitUntil: 'load' });
  await drawn(page);
  await enter(page);
  const fr = await frameOf(page);
  await fr.evaluate(() => scrollTo(0, 300));
  const align = () =>
    page.evaluate(() => {
      const f = document.querySelector('.pc-frame');
      const r = f.getBoundingClientRect();
      let q = null;
      try {
        window.__lab.stats();
        q = window.__lab.quad();
      } catch {}
      const c = [
        [r.left, r.top],
        [r.right, r.top],
        [r.right, r.bottom],
        [r.left, r.bottom],
      ];
      const dev = q ? Math.max(...q.map((p, i) => Math.hypot(p[0] - c[i][0], p[1] - c[i][1]))) : null;
      const cv = document.querySelector('[data-lab-root] canvas')?.getBoundingClientRect();
      return {
        viewport: [innerWidth, innerHeight],
        pc: document.documentElement.dataset.pc ?? null,
        full: document.documentElement.hasAttribute('data-pc-full'),
        pcAble: document.documentElement.hasAttribute('data-pc-able'),
        frameRect: [r.left, r.top, r.width, r.height].map((v) => Math.round(v)),
        quad: q && q.map((p) => p.map((v) => Math.round(v))),
        maxCornerDevPx: dev == null ? null : +dev.toFixed(1),
        canvas: cv && [cv.left, cv.top, cv.width, cv.height].map((v) => Math.round(v)),
        frameY: Math.round(f.contentWindow.scrollY),
        framePath: f.contentWindow.location.pathname,
        url: location.pathname + location.search,
        dialog: document.querySelector('[data-pc-dialog]').open,
        pageY: scrollY,
      };
    });
  const a0 = await align();
  L('1440x900 reading Work', a0);
  expect(a0.maxCornerDevPx != null && a0.maxCornerDevPx <= 2, '1440x900: frame on the monitor screen (corner deviation <= 2 px)', a0.maxCornerDevPx);
  for (const [w, h] of [
    [1024, 768],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(1200);
    const a = await align();
    L(`resized to ${w}x${h}`, a);
    if (w === 1024) {
      expect(a.full && a.pc === 'read' && a.frameRect.join() === `0,0,${w},${h}` && !a.pcAble, '1024x768 (below the gate): the page across the window, still reading', { full: a.full, rect: a.frameRect, pc: a.pc });
      if (run === 1) await shot(page, 'c10-1024x768-reading-full');
    } else {
      expect(!a.full && a.pc === 'read' && a.maxCornerDevPx != null && a.maxCornerDevPx <= 2, `${w}x${h}: frame back on the monitor screen (corner deviation <= 2 px)`, { full: a.full, dev: a.maxCornerDevPx, rect: a.frameRect });
      if (run === 1 && w === 1920) await shot(page, 'c10-1920x1080-reading-after-resize');
    }
    expect(a.url === '/prototype/?computer=work' && a.framePath === '/computer/work/' && a.dialog, `${w}x${h}: address, frame page and dialog unchanged`, { url: a.url, frame: a.framePath, frameY: a.frameY, dialog: a.dialog });
  }
  // Leave at 1920x1080: the opening at its new size.
  await barClick(page, '[data-leave]');
  await waitClosed(page);
  await page.waitForTimeout(800);
  const s = await S(page);
  const q = await page.evaluate(() => (window.__lab.stats(), window.__lab.quad().map((p) => p.map((v) => Math.round(v)))));
  L('left at 1920x1080', { ...s, monitorQuad: q });
  expect(s.pc === null && s.focus === 'Explore the lab (enter link)' && q.every(([x, y]) => x >= 0 && x <= 1920 && y >= 0 && y <= 1080), 'left at 1920x1080: opening with the monitor in frame, focus on the enter link', { pc: s.pc, focus: s.focus });
  // Leave while below the gate.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  await enter(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(800);
  await barClick(page, '[data-leave]');
  await waitClosed(page);
  const s2 = await S(page);
  L('entered at 1440x900, resized to 1024x768, left', s2);
  expect(s2.pc === null && !s2.full && !s2.url.includes('computer=') && s2.ovf !== 'hidden', 'leaving below the gate: closed, full flag cleared, page unlocked', { pc: s2.pc, full: s2.full, url: s2.url, ovf: s2.ovf, focus: s2.focus });
  // A directly opened lab, resized.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/prototype/?probe&computer=about', { waitUntil: 'load' });
  await waitRead(page, 'about');
  await page.waitForTimeout(2500);
  const d0 = await align();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(1200);
  const d1 = await align();
  L('direct ?probe&computer=about at 1440x900, then 1920x1080', { at1440: d0, at1920: d1 });
  expect(d0.maxCornerDevPx <= 2 && d1.maxCornerDevPx <= 2, 'direct link: frame on the screen before and after the resize', [d0.maxCornerDevPx, d1.maxCornerDevPx]);
  await ctx.close();
}

async function c11(browser) {
  const { ctx, page } = await mk(browser);
  await page.goto(BASE + '/prototype/', { waitUntil: 'load' });
  await drawn(page);
  const path0 = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const f = (await S(page)).focus;
    path0.push(f);
    if (f === 'Explore the lab (enter link)') break;
  }
  L('Tab from the top of the page to the entry', path0);
  const s0 = await S(page);
  await page.keyboard.press('Enter');
  await waitRead(page, 'work');
  const s1 = await S(page);
  L('Enter on "Explore the lab"', s1);
  expect(s1.focus === 'iframe.pc-frame', 'the frame has the focus on arrival', { focus: s1.focus, frameFocus: s1.frame?.focus });
  const fr = await frameOf(page);
  const order = [];
  let leaveAt = -1;
  let ordinaryAt = -1;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const f = await fr.evaluate(() => {
      const a = document.activeElement;
      const cs = getComputedStyle(a);
      return { el: (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().replace(/\s+/g, ' ').slice(0, 28), fv: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, box: (() => { const r = a.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })() };
    });
    order.push(f);
    if (/Leave computer/.test(f.el)) leaveAt = i;
    if (/Open ordinary page/.test(f.el)) ordinaryAt = i;
  }
  L('Tab order inside the computer', order);
  expect(leaveAt >= 0 && ordinaryAt >= 0, 'Tab reaches "Open ordinary page" and "Leave computer"', { ordinaryAt, leaveAt });
  expect(order.length > leaveAt + 1 && !/Work|About|Résumé|Contact|Leave|ordinary|Heddesheimer/.test(order[leaveAt + 1].el), 'Tab continues from the bar into the content', order[leaveAt + 1]);
  expect(order.every((o) => o.fv && /solid 2px/.test(o.outline)), 'every stop shows a visible focus ring (:focus-visible, 2px solid outline)', order.map((o) => o.fv + ' ' + o.outline));
  // Back to "Leave computer" for a picture of its ring, then Shift+Tab off the first stop.
  for (let i = order.length - 1; i > leaveAt; i--) await page.keyboard.press('Shift+Tab');
  const onLeave = await fr.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent).trim());
  if (run === 1) {
    const r = await page.evaluate(() => {
      const b = document.querySelector('.pc-frame').getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: 120 };
    });
    await shot(page, 'c11-focus-ring-leave-computer', r);
  }
  L('Shift+Tab back to', onLeave);
  // Keyboard navigation to About keeps the focus in the frame.
  for (let i = 0; i < 20; i++) {
    const t = await fr.evaluate(() => document.activeElement.textContent.trim());
    if (t === 'About') break;
    await page.keyboard.press('Shift+Tab');
  }
  await page.keyboard.press('Enter');
  await waitRead(page, 'about');
  const s2 = await S(page);
  L('Enter on About in the bar', s2);
  expect(s2.focus === 'iframe.pc-frame' && s2.url === '/prototype/?computer=about', 'after a keyboard move to About, the focus stays in the frame', { focus: s2.focus, frameFocus: s2.frame?.focus });
  const fr2 = await frameOf(page);
  await page.keyboard.press('Tab');
  const first = await fr2.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent).trim());
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(200);
  const outOf = await S(page);
  L('Tab once on About, then Shift+Tab off the first stop', { firstStop: first, topFocus: outOf.focus, frameFocus: outOf.frame?.focus });
  // Leave with the keyboard. The button is found by its accessible name: narrow windows shorten its text
  // to "Leave" (the rest is a no-break space and a span).
  const fr3 = await frameOf(page);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const t = await fr3.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent).trim()).catch(() => '');
    if (t === 'Leave computer') break;
  }
  await page.keyboard.press('Enter');
  await waitClosed(page);
  const s3 = await S(page);
  const fv = await page.evaluate(() => document.activeElement.matches(':focus-visible'));
  L('Enter on "Leave computer"', { ...s3, focusVisible: fv });
  expect(s3.focus === 'Explore the lab (enter link)' && fv && s3.idx === s0.idx, 'after leaving by keyboard: focus (visible) on "Explore the lab", at the opening entry', { focus: s3.focus, focusVisible: fv, idx: [s0.idx, s3.idx] });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const probe = await browser.newPage();
  const renderer = await probe.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const x = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return gl ? (x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no WebGL';
  });
  const version = browser.version();
  await probe.close();
  const header = `# ${new Date().toISOString()} · navigation.cjs · renderer: ${renderer} · Chrome ${version} (headless, Playwright, back-forward cache enabled) · server: ${BASE} · 1440x900 unless stated · runs: ${RUNS} · checks: ${CHECKS.join(',')}`;
  console.log(header);
  let browser2 = null;
  for (run = 1; run <= RUNS; run++) {
    for (ck of CHECKS) {
      L('--- start');
      try {
        if (ck === 9) {
          await c9(browser, 'routed');
          // Without request interception: fonts refused at the resolver instead.
          browser2 ??= await chromium.launch({ ...LAUNCH, args: [...ARGS, '--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:9, MAP fonts.gstatic.com 127.0.0.1:9'] });
          await c9(browser2, 'unrouted');
        } else await [c1, c2, c3, c4, c5, c6, c7, c8, null, c10, c11][ck - 1](browser);
      } catch (e) {
        expect(false, 'the check ran to the end', String(e.message || e).split('\n')[0]);
      }
    }
  }
  const summary = Object.entries(results).map(([k, v]) => `[summary] run ${k.split(':')[0]} check ${k.split(':')[1]}: ${v.pass} pass, ${v.fail} fail${v.fail ? ' (' + v.failed.join('; ') + ')' : ''}`);
  summary.forEach((s) => console.log(s));
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, [header, ...lines, ...summary].map((l) => l.replace(/\s+$/, '')).join('\n') + '\n');
  await browser.close();
  if (browser2) await browser2.close();
})();
