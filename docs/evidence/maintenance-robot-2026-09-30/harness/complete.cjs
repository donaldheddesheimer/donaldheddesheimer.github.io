// node complete.cjs [shot.png] — the terminal's Tab completion and what it mustn't disturb, at 1440x900 on
// the GPU: completion of commands and `work <id>`, a shared prefix, a listed set and the second Tab
// moving on; no match, nothing typed, a caret short of the end, a selection, Shift/Ctrl/Alt+Tab and IME
// composition all left to the browser; nothing run by a completion; history; work's links, a modified
// click, the project's source and demo links, the résumé PDF, contact's links and copy, and a shared
// /?computer=work/<id>. (A tab a modified click opens isn't routed to dist/ by Playwright: it's counted,
// not loaded. The test origin isn't a secure context, so copy falls back to selecting the address.)
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require(require('path').join(__dirname, '../../lab-terminal-2026-09-29/harness/serve.cjs'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (n, c, i = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${typeof i === 'string' ? i : JSON.stringify(i)}`); };
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  await routeDist(ctx);
  await ctx.route((u) => /^https?:$/.test(u.protocol) && !u.href.startsWith(BASE) && !/^fonts\./.test(u.hostname), (r) => r.fulfill({ body: '<!doctype html><title>stub</title>', headers: { 'content-type': 'text/html' } }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  pageerror:', e.message));
  await p.goto(BASE + '/?computer');
  await p.waitForFunction(() => document.documentElement.dataset.pc === 'read', null, { timeout: 30000 });
  await p.waitForFunction(() => document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 8000 });
  await p.focus('[data-term-input]');
  const st = () => p.evaluate(() => {
    const t = document.querySelector('[data-term]'); const i = t.querySelector('[data-term-input]'); const m = t.querySelector('[data-term-matches]');
    const a = document.activeElement;
    return { v: i.value, focus: a === i ? 'input' : (a?.tagName || '') + ':' + (a?.textContent || '').trim().slice(0, 30), list: m.hidden ? null : m.textContent, status: t.querySelector('[data-term-status]').textContent, n: t.querySelectorAll('.term-entry').length };
  });
  const reset = async () => { await p.focus('[data-term-input]'); await p.fill('[data-term-input]', ''); };
  const n0 = (await st()).n;
  await reset(); await p.keyboard.type('wo'); await p.keyboard.press('Tab');
  let s = await st(); ok('wo + Tab fills "work "', s.v === 'work ' && s.focus === 'input', s);
  await p.keyboard.type('s'); await p.keyboard.press('Tab'); await sleep(150);
  s = await st(); ok('work s + Tab lists three ids', s.list === 'skyblock-bazaar  smart-bin  swerve-drive' && s.focus === 'input' && /3 matches/.test(s.status), s);
  await p.keyboard.press('Tab');
  s = await st(); ok('second Tab moves focus on, list gone', s.focus !== 'input' && s.list === null, s);
  await reset(); await p.keyboard.type('work sw'); await p.keyboard.press('Tab');
  s = await st(); ok('work sw + Tab fills swerve-drive, nothing run', s.v === 'work swerve-drive' && s.n === n0, s);
  await p.keyboard.press('Tab');
  s = await st(); ok('complete id + Tab moves on', s.focus !== 'input', s);
  await reset(); await p.keyboard.type('work t'); await p.keyboard.press('Tab');
  s = await st(); ok('work t + Tab extends to tra', s.v === 'work tra', s);
  await p.keyboard.press('Tab'); s = await st(); ok('work tr + Tab lists', s.list === 'traffic-ops-center  travelmate', s);
  await p.keyboard.type('a'); s = await st(); ok('typing hides list', s.list === null && s.v === 'work traa', s);
  await reset(); await p.keyboard.type('WO'); await p.keyboard.press('Tab');
  s = await st(); ok('upper case WO + Tab', s.v === 'work ', s);
  for (const [txt, name] of [['abc', 'no match'], ['', 'empty'], ['help me', 'two words'], ['   ', 'spaces']]) {
    await reset(); if (txt) await p.keyboard.type(txt); await p.keyboard.press('Tab');
    s = await st(); ok(`${name} + Tab moves focus`, s.focus !== 'input' && s.v === txt, s);
  }
  await reset(); await p.keyboard.type('abo'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Tab');
  s = await st(); ok('caret not at end: Tab moves on', s.focus !== 'input' && s.v === 'abo', s);
  await reset(); await p.keyboard.type('abo'); await p.keyboard.press('Shift+ArrowLeft'); await p.keyboard.press('ArrowRight').catch(()=>{});
  await reset(); await p.keyboard.type('abo'); await p.keyboard.press('Shift+ArrowLeft');
  await p.evaluate(() => { const i = document.querySelector('[data-term-input]'); i.setSelectionRange(1, 3); });
  await p.keyboard.press('Tab'); s = await st(); ok('selection: Tab moves on', s.focus !== 'input' && s.v === 'abo', s);
  await reset(); await p.keyboard.type('abo'); await p.keyboard.press('Shift+Tab');
  s = await st(); ok('Shift+Tab not taken', s.focus !== 'input' && s.v === 'abo', s);
  await reset(); await p.keyboard.type('abo');
  const def = await p.evaluate(() => { const i = document.querySelector('[data-term-input]'); const e = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true, cancelable: true }); i.dispatchEvent(e); const f = new KeyboardEvent('keydown', { key: 'Tab', altKey: true, bubbles: true, cancelable: true }); i.dispatchEvent(f); const g = new KeyboardEvent('keydown', { key: 'Tab', isComposing: true, bubbles: true, cancelable: true }); i.dispatchEvent(g); return [e.defaultPrevented, f.defaultPrevented, g.defaultPrevented, i.value]; });
  ok('Ctrl/Alt+Tab, composing: not taken', !def[0] && !def[1] && !def[2] && def[3] === 'abo', def);
  await reset(); await p.keyboard.type('abo'); await p.keyboard.press('Tab'); await sleep(150);
  s = await st(); ok('abo + Tab -> about, not run', s.v === 'about' && s.n === n0 && s.status.includes('about'), s);
  await p.keyboard.press('Enter'); await sleep(600);
  s = await st(); ok('Enter runs about once', s.n === n0 + 1 && s.v === '', s);
  await p.keyboard.type('he'); await p.keyboard.press('Tab'); s = await st(); ok('he -> help', s.v === 'help', s);
  await reset(); await p.keyboard.type('ex'); await p.keyboard.press('Tab'); s = await st(); ok('exit not completed', s.focus !== 'input', s);
  // History
  await reset(); await p.keyboard.press('ArrowUp'); s = await st(); ok('Up recalls about', s.v === 'about', s);
  await p.keyboard.press('ArrowDown'); s = await st(); ok('Down back to empty', s.v === '', s);
  // Work list, links
  await p.keyboard.type('work'); await p.keyboard.press('Enter'); await sleep(800);
  const links = await p.evaluate(() => [...document.querySelectorAll('[data-term] .term-entry:last-child a')].map((a) => a.getAttribute('href')).slice(0, 4));
  ok('work lists linked projects', links.length > 0 && links.some((h) => h.includes('computer=work/')), links);
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => void (window.__copied = t) } }));
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), p.locator('[data-term] .term-entry:last-child [data-term-run^="work "]').first().click({ modifiers: ['Meta'] })]);
  s = await st(); ok('Cmd+click opens a new tab, nothing run', !!popup && s.n === n0 + 2, { url: popup?.url(), n: s.n });
  if (popup) { await popup.waitForLoadState().catch(()=>{}); console.log('  popup at', popup.url()); await popup.close(); }
  await p.locator('[data-term] .term-entry:last-child [data-term-run^="work "]').first().click(); await sleep(800);
  const proj = await p.evaluate(() => ({ at: location.search, links: [...document.querySelectorAll('[data-term] .term-entry:last-child .t-project a[href^="http"]')].map((a) => [a.textContent.trim(), a.target, a.rel]) }));
  ok('project opened, has source/demo links', /computer=work\//.test(proj.at) && proj.links.length > 0 && proj.links.every((l) => l[1] === '_blank' && /noopener/.test(l[2])), proj);
  await reset(); await p.keyboard.type('resume'); await p.keyboard.press('Enter'); await sleep(600);
  const res = await p.evaluate(() => [...document.querySelectorAll('[data-term] .term-entry:last-child a')].map((a) => [a.textContent.trim(), a.getAttribute('href'), a.hasAttribute('download')]));
  ok('resume has a PDF', res.some((r) => /\.pdf$/.test(r[1])), res);
  const pdf = res.find((r) => /\.pdf$/.test(r[1]));
  if (pdf) { const r = await p.evaluate(async (u) => { const x = await fetch(u); return [x.status, x.headers.get('content-type'), (await x.arrayBuffer()).byteLength]; }, pdf[1]); ok('resume PDF serves', r[0] === 200 && /pdf/.test(r[1]), r); }
  await reset(); await p.keyboard.type('contact'); await p.keyboard.press('Enter'); await sleep(600);
  const con = await p.evaluate(() => [...document.querySelectorAll('[data-term] .term-entry:last-child a, [data-term] .term-entry:last-child [data-term-copy]')].map((a) => [a.textContent.trim(), a.getAttribute('href') || a.dataset.termCopy]));
  ok('contact: email, GitHub, LinkedIn', con.some((c) => /mailto:/.test(c[1])) && con.some((c) => /github\.com/.test(c[1])) && con.some((c) => /linkedin\.com/.test(c[1])), con);
  await p.locator('[data-term] .term-entry:last-child [data-term-copy]').first().click(); await sleep(200);
  const clip = await p.evaluate(() => window.__copied || document.getSelection().toString());
  ok('copy puts the email on the clipboard', /@/.test(clip), clip);
  // Shared project URL
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '/?computer=work/fluxion');
  await p2.waitForFunction(() => document.documentElement.dataset.pc === 'read', null, { timeout: 30000 });
  await sleep(1500);
  const sh = await p2.evaluate(() => ({ at: location.search, proj: [...document.querySelectorAll('[data-term] .t-project')].at(-1)?.dataset.project }));
  ok('shared /?computer=work/fluxion opens it', sh.proj === 'fluxion', sh);
  await p.screenshot({ path: process.argv[2] || '/dev/null' });
  console.log(fails ? `${fails} FAILED` : 'all pass');
  await b.close();
})();
