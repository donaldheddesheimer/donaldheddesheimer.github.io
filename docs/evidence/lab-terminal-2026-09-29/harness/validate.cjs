// node validate.cjs [base] [only] [--swiftshader] — the lab terminal's checks, against the production
// build: installed Chrome, WebGL through ANGLE Metal on the Mac it runs on (or SwiftShader). `base` is
// 'dist' (the default: the built site straight from disk, no server) or a server's address; `only` runs
// the groups whose names start with it. Playwright isn't a dependency: PW=<its module path>, or NODE_PATH.
// Screenshots of the checks go to SHOTS (default: a folder in the system's temp directory). Links out of
// the site (source, demo, GitHub, LinkedIn) are answered here with a stub page: nothing is fetched from
// them. Google Fonts load as on the live site, or from a local copy (FONTS, serve.cjs).
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
const base = !process.argv[2] || process.argv[2] === 'dist' ? BASE : process.argv[2];
const only = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const SW = process.argv.includes('--swiftshader');
const shots = process.env.SHOTS || require('path').join(require('os').tmpdir(), 'lab-terminal-shots');
require('fs').mkdirSync(shots, { recursive: true });
let fails = 0;
const ok = (name, cond, info = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`);
};
const note = (msg, info = '') => console.log(`NOTE  ${msg}${info ? '  ' + JSON.stringify(info) : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EMAIL = 'donaldheddes@gmail.com';
const PS1 = 'donald@lab:~$';
const NOT_FOUND = 'Command not found. Run help for available commands.';

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: SW ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = async ({ w = 1440, h = 900, reduced = false, js = true, touch = false, init = null, fail = false, perms = null } = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference', javaScriptEnabled: js, hasTouch: touch, isMobile: touch, permissions: perms ?? undefined });
    if (base === BASE) await routeDist(ctx, { failScripts: fail });
    await ctx.route((u) => /^https?:$/.test(u.protocol) && !u.href.startsWith(base) && !/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname), (r) => r.fulfill({ body: '<!doctype html><title>stub</title>', headers: { 'content-type': 'text/html' } }));
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  pageerror:', e.message));
    return p;
  };
  {
    const p = await (await b.newContext()).newPage();
    const gl = await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c?.getExtension('WEBGL_debug_renderer_info'); return c ? c.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : c.RENDERER) : 'no WebGL'; });
    console.log(`# Chrome ${b.version()}, ${process.platform} ${require('os').release()}, ${require('os').cpus()[0].model}; WebGL: ${gl}`);
    await p.context().close();
  }

  // --- Helpers ------------------------------------------------------------------------------------------
  const run = (name) => !only || name.startsWith(only);
  const where = (p) => { const u = new URL(p.url()); return u.pathname + u.search + u.hash; };
  const drawn = (p) => p.waitForFunction(() => document.querySelector('[data-lab-root]')?.matches('[data-drawn], [data-failed]'), null, { timeout: 30000 });
  const reading = (p) => p.waitForFunction(() => document.documentElement.dataset.pc === 'read', null, { timeout: 20000 });
  const booted = (p) => p.waitForFunction(() => document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 5000 });
  const closed = (p) => p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
  const frame = (p) => p.frames().find((f) => /\/computer\/work\/[\w-]+\/$/.test(new URL(f.url()).pathname));
  const detailed = (p) => p.waitForFunction(() => { const f = document.querySelector('.pc-detail'); return !!f?.classList.contains('is-loaded') && f.contentDocument?.readyState === 'complete' && f.contentDocument.activeElement?.matches('main h1'); }, null, { timeout: 15000 });
  const enter = async (p, touch = false) => {
    const r = await p.evaluate(() => (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
    const [x, y] = [r.x + r.w / 2, r.y + r.h / 2];
    if (touch) await p.touchscreen.tap(x, y);
    else await p.mouse.click(x, y);
  };
  // Every state the lab and the terminal go through from now on.
  const watch = (p) => p.evaluate(() => {
    const h = document.documentElement;
    const t = document.querySelector('[data-term]');
    window.__seen = { pc: [], boot: [t.dataset.boot] };
    new MutationObserver(() => window.__seen.pc.push(h.dataset.pc ?? '-')).observe(h, { attributes: true, attributeFilter: ['data-pc'] });
    new MutationObserver(() => window.__seen.boot.push(t.dataset.boot)).observe(t, { attributes: true, attributeFilter: ['data-boot'] });
  });
  const seen = (p) => p.evaluate(() => window.__seen);
  // The terminal as it is: its history (what was said, and the announcement of what it printed), the
  // focus, its scroll, the window's.
  const snap = (p) => p.evaluate(() => {
    const h = document.documentElement;
    const t = document.querySelector('[data-term]');
    const input = t.querySelector('[data-term-input]');
    const said = (echo) => [...echo.childNodes].slice(1).map((n) => n.textContent).join('');
    const all = [...t.querySelectorAll('.term-entry')];
    const a = document.activeElement;
    const focus = !a || a === document.body ? 'body' : a === input ? 'input' : a === t ? 'terminal' : a.matches('.term-echo') ? `echo:${said(a).trim()}${a.closest('.term-entry') === all.at(-1) ? ' (newest)' : ''}` : a.matches('[data-lab-monitor]') ? 'monitor' : a.matches('[data-pc-exit]') ? 'power' : a === document.querySelector('[data-pc-dialog]') ? 'dialog' : a.tagName === 'IFRAME' ? 'frame' : `${a.tagName.toLowerCase()}:${(a.getAttribute('aria-label') || a.textContent).trim().replace(/\s+/g, ' ').slice(0, 48)}`;
    return {
      at: location.pathname + location.search + location.hash,
      pc: h.dataset.pc ?? null,
      full: h.hasAttribute('data-pc-full'),
      boot: t.dataset.boot,
      entries: all.map((e) => ({ said: said(e.querySelector('.term-echo')), out: e.querySelector(':scope > .t-out')?.dataset.announce ?? null })),
      focus,
      ring: !!a?.matches(':focus-visible'),
      status: t.querySelector('[data-term-status]').textContent,
      top: Math.round(t.scrollTop),
      max: t.scrollHeight - t.clientHeight,
      winY: scrollY,
      title: document.title,
      value: input.value,
    };
  });
  const said = (s) => s.entries.map((e) => e.said.trim());
  const last = (s) => s.entries.at(-1) ?? null;
  // The newest entry, as it's shown: whole with the prompt under it (where it fits), or from its start.
  const shown = (p) => p.evaluate(() => {
    const t = document.querySelector('[data-term]');
    const tr = t.getBoundingClientRect();
    const e = [...t.querySelectorAll('.term-entry')].at(-1);
    const er = e.getBoundingClientRect();
    const fr = t.querySelector('[data-term-form]').getBoundingClientRect();
    const fits = er.height + fr.height + 12 <= t.clientHeight;
    return { fits, whole: er.top >= tr.top - 1 && er.bottom <= fr.top + 1, fromTop: er.top >= tr.top - 1 && er.top <= tr.top + 40, prompt: fr.top >= tr.top - 1 && fr.bottom <= tr.bottom + 1, top: Math.round(t.scrollTop), max: t.scrollHeight - t.clientHeight };
  });
  const type = async (p, s, wait = 700) => {
    await p.keyboard.type(s);
    await p.keyboard.press('Enter');
    await sleep(wait);
  };
  // What's on the screen, for the eye: the text of the terminal that shows, top to bottom.
  const onScreen = (p) => p.evaluate(() => {
    const t = document.querySelector('[data-term]');
    const tr = t.getBoundingClientRect();
    const out = [];
    const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || el.closest('.sr-only, [data-term-measure], [data-term-cursor]')) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > tr.top && r.top < tr.bottom) out.push(n.textContent.trim());
    }
    return out.join(' ');
  });
  const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom), shown: e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) }; }, sel);
  const shot = (p, name) => p.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 85 });
  const clickRun = async (p, name, how = 'mouse', nth = -1) => {
    const loc = p.locator(`[data-term] [data-term-run="${name}"]`);
    const n = await loc.count();
    const el = loc.nth(nth < 0 ? n + nth : nth);
    await el.scrollIntoViewIfNeeded();
    const r = await el.boundingBox();
    const [x, y] = [r.x + r.width / 2, r.y + r.height / 2];
    if (how === 'tap') await p.touchscreen.tap(x, y);
    else if (how === 'dbl') await p.mouse.dblclick(x, y);
    else await p.mouse.click(x, y);
  };
  // Go in from a fresh session (a new context), the way a person does, and wait for the prompt.
  const fresh = async (opts = {}, path = '/?probe') => {
    const p = await page(opts);
    await p.goto(base + path);
    await drawn(p);
    await sleep(400);
    await watch(p);
    await enter(p, opts.touch);
    await reading(p);
    return p;
  };

  // 1. Opening the computer, and the startup: once a session, then the two lines and the prompt, nothing
  //    run on its own; help lists exactly the four commands.
  if (run('startup')) {
    const p = await fresh();
    const t0 = Date.now();
    await booted(p);
    const ms = Date.now() - t0;
    await sleep(300);
    const s = await snap(p);
    const sn = await seen(p);
    const text = await onScreen(p);
    ok('startup: in by the flight (fade, fly, read), the startup plays once, then done', sn.pc.join(',') === 'fade,fly,read' && sn.boot.join(',') === 'pending,play,done', { ...sn, playedMs: ms });
    ok('startup: the screen shows the two lines and the prompt, nothing else run', text === `New terminal started. Type help to look around. The robots are on break. ${PS1}` && s.entries.length === 0, text);
    ok('startup: focus in the prompt (a mouse was used), the title is the terminal\'s, address /?computer', s.focus === 'input' && s.title === 'Terminal · Donald Heddesheimer' && s.at === '/?computer', s);
    const scr = await p.evaluate(() => {
      const d = document.querySelector('[data-pc-dialog]');
      const i = document.querySelector('[data-term-input]');
      return { modal: d.open && d.matches(':modal'), label: d.getAttribute('aria-label'), input: i.getAttribute('aria-label'), hint: document.getElementById(i.getAttribute('aria-describedby'))?.textContent.trim(), status: document.querySelector('[data-term-status]').getAttribute('role'), ps1: document.querySelector('.term-prompt .term-ps1').textContent, cursor: getComputedStyle(document.querySelector('[data-term-cursor]')).animationName };
    });
    ok('startup: a modal dialog labelled, the prompt labelled "Command" and described by the startup\'s hint, a status line', scr.modal && /terminal/i.test(scr.label) && scr.input === 'Command' && /^Type help to look around/.test(scr.hint) && scr.status === 'status' && scr.ps1 === PS1, scr);
    ok('startup: the block cursor blinks while the prompt waits', scr.cursor === 'term-blink', scr.cursor);
    await shot(p, 'startup-1440x900');
    await type(p, 'help');
    const h = await snap(p);
    const help = await p.evaluate(() => [...[...document.querySelectorAll('[data-term] .term-entry')].at(-1).querySelectorAll('.t-help li')].map((li) => ({ cmd: li.querySelector('[data-term-run]')?.dataset.termRun, tag: li.querySelector('[data-term-run]')?.tagName, label: li.querySelector('span')?.textContent })));
    ok('help: exactly four commands, about, work, resume, contact, each a button', help.map((x) => x.cmd).join(',') === 'about,work,resume,contact' && help.every((x) => x.tag === 'BUTTON' && x.label), help);
    ok('help: announced once in the status line, focus stays in the prompt', h.status === 'Commands: about, work, resume, contact.' && h.focus === 'input', { status: h.status, focus: h.focus });
    await shot(p, 'help-1440x900');
    await p.context().close();

    // A second visit in the same session: no startup again.
    const q = await fresh();
    await booted(q);
    await q.keyboard.press('Escape');
    await closed(q);
    await sleep(500);
    await watch(q);
    await enter(q);
    await reading(q);
    await sleep(400);
    ok('startup: once a session (coming back, it doesn\'t play again)', !(await seen(q)).boot.includes('play'), await seen(q));
    await q.context().close();

    // The startup's cursor: it goes once the first line is typed (--n: its length, 18ms a letter), well
    // before the startup ends.
    const c = await fresh();
    await c.waitForFunction(() => document.querySelector('[data-term]').dataset.boot === 'play');
    const cur = await c.evaluate(async () => {
      const k = document.querySelector('.term-boot-cursor');
      const cs = getComputedStyle(k);
      const n = parseFloat(getComputedStyle(k.parentElement).getPropertyValue('--n'));
      const at = { name: cs.animationName, delay: cs.animationDelay, n, typed: getComputedStyle(document.querySelector('.term-type')).animationName };
      await new Promise((r) => setTimeout(r, n * 18 + 110 + 120));
      return { ...at, opacityAfter: getComputedStyle(k).opacity, bootThen: document.querySelector('[data-term]').dataset.boot };
    });
    ok('startup: the cursor after the first line goes once it\'s typed (term-gone, at n x 18ms + 110ms), before the startup ends', cur.name === 'term-gone' && cur.typed === 'term-type' && cur.n === 21 && Math.abs(parseFloat(cur.delay) * (cur.delay.endsWith('ms') ? 1 : 1000) - (cur.n * 18 + 110)) < 1 && cur.opacityAfter === '0' && cur.bootThen === 'play', cur);
    await c.context().close();

    // Typed into during the startup: it ends at once, and what was typed runs.
    const r = await fresh();
    await r.waitForFunction(() => document.querySelector('[data-term]').dataset.boot === 'play');
    await r.keyboard.type('help');
    const mid = await r.evaluate(() => document.querySelector('[data-term]').dataset.boot);
    await r.keyboard.press('Enter');
    await sleep(500);
    const rs = await snap(r);
    ok('startup: a key during it ends it at once; the command typed then runs', mid === 'done' && said(rs).join(',') === 'help', { bootAfterKey: mid, said: said(rs) });
    await r.context().close();
  }

  // 2. Commands, typed: each prints its own output, announced; unusual input.
  if (run('commands')) {
    const p = await fresh();
    await booted(p);
    const want = { about: 'Printed: about me.', work: 'Printed: 11 projects.', resume: 'Printed: the résumé, with the PDF to download.', contact: 'Printed: email, GitHub and LinkedIn.' };
    for (const [c, a] of Object.entries(want)) {
      await type(p, c);
      const s = await snap(p);
      const v = await shown(p);
      ok(`commands: ${c} prints its output, announced ("${a}"), the prompt ready again`, last(s).said === c && last(s).out === a && s.status === a && s.focus === 'input' && s.value === '', { last: last(s), status: s.status, focus: s.focus });
      ok(`commands: ${c} shown ${v.fits ? 'whole, the prompt under it' : 'from its start'}`, (v.fits ? v.whole : v.fromTop) && v.prompt, v);
      await shot(p, `cmd-${c}-1440x900`);
    }
    const content = await p.evaluate(() => {
      const outs = [...document.querySelectorAll('[data-term] .term-entry')].map((e) => e.querySelector('.t-out'));
      const [about, work, resume, contact] = outs;
      return {
        about: about.querySelector('.t-strong')?.textContent,
        work: work.querySelectorAll('.t-work > li').length,
        details: [...work.querySelectorAll('a[data-term-detail]')].map((a) => a.getAttribute('href')),
        resume: [...resume.querySelectorAll('a[download]')].map((a) => [a.getAttribute('href'), a.getAttribute('download')]),
        sections: [...resume.querySelectorAll('.t-section')].map((h) => h.textContent),
        contact: [...contact.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      };
    });
    ok('commands: about names Donald; work lists 11 projects, each with details; resume the PDF, then Experience, Education, Skills; contact email, GitHub, LinkedIn', content.about === 'Donald Heddesheimer' && content.work === 11 && content.details.length === 11 && content.details.every((h) => /^\/projects\/[\w-]+\/$/.test(h)) && content.resume.length === 1 && content.resume[0][0] === '/resume.pdf' && content.sections.join(',') === 'Experience,Education,Skills' && content.contact.join(' ') === `mailto:${EMAIL} https://github.com/donaldheddesheimer https://www.linkedin.com/in/donaldheddesheimer/`, content);

    // Unusual input.
    await type(p, '  WoRk  ');
    let s = await snap(p);
    ok('input: "  WoRk  " (mixed case, spaces) runs work', last(s).out === want.work, last(s));
    await type(p, 'sudo rm -rf /');
    s = await snap(p);
    const nf = await p.evaluate(() => [...document.querySelectorAll('[data-term] .term-entry')].at(-1).querySelector('.t-out').textContent.replace(/\s+/g, ' ').trim());
    ok('input: an unknown command prints exactly the not-found line, with help to run', nf === NOT_FOUND && s.status === NOT_FOUND, { nf, status: s.status });
    const n0 = s.entries.length;
    await type(p, '');
    await type(p, '    ');
    s = await snap(p);
    const blank = await p.evaluate(() => [...document.querySelectorAll('[data-term] .term-entry')].slice(-2).map((e) => ({ tag: e.firstElementChild.tagName, hidden: e.firstElementChild.getAttribute('aria-hidden'), out: !!e.querySelector('.t-out') })));
    ok('input: an empty line, and one of spaces, just give a new prompt (no output, hidden from a screen reader)', s.entries.length === n0 + 2 && blank.every((x) => x.tag === 'P' && x.hidden === 'true' && !x.out), blank);
    await type(p, '<img src=x onerror="window.__owned=1"><b>bold</b>');
    s = await snap(p);
    const inj = await p.evaluate(() => ({ owned: window.__owned ?? null, imgs: document.querySelectorAll('[data-term] .term-log img, [data-term] .term-log b').length, echo: [...document.querySelectorAll('[data-term] .term-entry')].at(-1).querySelector('.term-echo').textContent }));
    ok('input: markup typed is shown as text, never parsed or run', inj.owned === null && inj.imgs === 0 && inj.echo.endsWith('<b>bold</b>') && last(s).out === NOT_FOUND, inj);
    await p.keyboard.type('x'.repeat(260));
    const long = await p.evaluate(() => { const t = document.querySelector('[data-term]'); const i = t.querySelector('[data-term-input]'); const c = t.querySelector('[data-term-cursor]').getBoundingClientRect(); const f = i.getBoundingClientRect(); return { len: i.value.length, sideways: t.scrollWidth - t.clientWidth, cursorIn: c.left >= f.left - 1 && c.right <= f.right + 1 }; });
    ok('input: a very long line stops at 200 characters, the terminal never scrolls sideways, the cursor stays in the field', long.len === 200 && long.sideways <= 0 && long.cursorIn, long);
    await p.keyboard.press('Enter');
    await sleep(500);
    const wrap = await p.evaluate(() => { const t = document.querySelector('[data-term]'); return t.scrollWidth - t.clientWidth; });
    ok('input: run, the long line wraps in the history (no sideways scroll)', wrap <= 0, { sideways: wrap });
    // Repeated and rapid.
    const n1 = (await snap(p)).entries.length;
    for (let i = 0; i < 3; i++) { await p.keyboard.type('help'); await p.keyboard.press('Enter'); }
    await p.keyboard.type('about'); await p.keyboard.press('Enter');
    await p.keyboard.type('contact'); await p.keyboard.press('Enter');
    await sleep(900);
    s = await snap(p);
    ok('input: repeated and rapid commands each run once, in order', said(s).slice(n1).join(',') === 'help,help,help,about,contact' && last(s).out === want.contact && s.status === want.contact, said(s).slice(n1));
    // Up and Down: earlier commands, the line being typed kept.
    await p.keyboard.type('draft');
    const rec = [];
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown']) { await p.keyboard.press(k); rec.push(await p.evaluate(() => document.querySelector('[data-term-input]').value)); }
    ok('input: Up and Down recall earlier commands (repeats once), and Down again gives back the line being typed', rec.join('|') === 'contact|about|help|about|contact|draft', rec);
    await p.keyboard.press('Control+a');
    await p.keyboard.press('Backspace');
    // The history is text: only the newest output moves, and what was typed is kept for the session.
    const saved = await p.evaluate(() => JSON.parse(sessionStorage.getItem('lab:terminal')));
    ok('input: the session keeps what was run (lab:terminal) and that the startup has played', saved.boot === true && saved.log.length === s.entries.length && saved.log.at(-1) === 'contact', { boot: saved.boot, n: saved.log.length, entries: s.entries.length });
    const ids = await p.evaluate(() => { const all = [...document.querySelectorAll('[id]')].map((e) => e.id); return all.filter((x, i) => all.indexOf(x) !== i); });
    ok('input: no id repeats in the page, however many commands have run', ids.length === 0, ids);
    await p.context().close();
  }

  // 3. Commands tapped or clicked: once, even on a double click; the focus to the prompt (a mouse, the
  //    keyboard) or to the command's heading (a touch screen, below).
  if (run('tap')) {
    const p = await fresh();
    await booted(p);
    await clickRun(p, 'help');
    await sleep(700);
    let s = await snap(p);
    ok('tap: help, clicked in the startup\'s line, runs once; focus in the prompt; announced', said(s).join(',') === 'help' && s.focus === 'input' && s.status.startsWith('Commands:'), { said: said(s), focus: s.focus, status: s.status });
    await clickRun(p, 'about', 'dbl');
    await sleep(700);
    s = await snap(p);
    ok('tap: a double click on about runs it once', said(s).join(',') === 'help,about' && s.focus === 'input', said(s));
    // From the keyboard: a command's button, Enter.
    await p.focus('[data-term] .term-entry:last-child [data-term-run="contact"]');
    await p.keyboard.press('Enter');
    await sleep(700);
    s = await snap(p);
    ok('tap: Enter on a command\'s button runs it once; focus back in the prompt', said(s).join(',') === 'help,about,contact' && s.focus === 'input', { said: said(s), focus: s.focus });
    // A letter typed with the focus on a link goes to the prompt.
    await p.focus('[data-term] [data-term-email]');
    await p.keyboard.type('he');
    s = await snap(p);
    ok('tap: typing with the focus on a link in the output goes to the prompt', s.focus === 'input' && s.value === 'he', { focus: s.focus, value: s.value });
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Backspace');
    await p.context().close();
  }

  // 4. Scrolling: long output scrolls inside the monitor, the room and the window don't; nothing pulls the
  //    view from what's being read.
  if (run('scroll')) {
    const p = await fresh();
    await booted(p);
    await type(p, 'work', 900);
    let s = await snap(p);
    let v = await shown(p);
    ok('scroll: work, longer than the screen, is shown from its start, the prompt at the screen\'s foot', !v.fits && v.fromTop && v.prompt && s.top > 0 && s.winY === 0, { ...v, winY: s.winY });
    const az0 = await p.evaluate(() => window.__lab.stats().lookAz);
    const tb = await box(p, '[data-term]');
    await p.mouse.move(tb.x + tb.w / 2, tb.y + tb.h / 2);
    await p.mouse.wheel(0, 700);
    await sleep(600);
    const s2 = await snap(p);
    const az1 = await p.evaluate(() => window.__lab.stats().lookAz);
    ok('scroll: the wheel scrolls the terminal, not the window or the room', s2.top > s.top && s2.winY === 0 && Math.abs(az1 - az0) < 1e-4, { before: s.top, after: s2.top, winY: s2.winY, lookAz: [az0, az1] });
    await shot(p, 'scroll-work-1440x900');
    await p.mouse.wheel(0, -300);
    await sleep(600);
    const y0 = (await snap(p)).top;
    await sleep(2000);
    await p.keyboard.type('abc');
    await sleep(300);
    const y1 = (await snap(p)).top;
    ok('scroll: left where it\'s being read, it stays (and typing at the prompt doesn\'t move it)', y1 === y0, { reading: y0, after: y1 });
    for (let i = 0; i < 3; i++) await p.keyboard.press('Backspace');
    await type(p, 'about', 900);
    v = await shown(p);
    ok('scroll: about, which fits, is shown whole with the prompt under it', v.fits && v.whole && v.prompt && Math.abs(v.top - v.max) <= 2, v);
    await type(p, 'resume', 900);
    v = await shown(p);
    ok('scroll: resume, longer than the screen, from its start', !v.fits && v.fromTop && v.prompt, v);
    await p.context().close();
  }

  // 5. Links: a project's details in the frame (and back, by Escape and by its link), from one project to
  //    the next; source and demo in a new tab; the résumé PDF; email, GitHub, LinkedIn; copy.
  if (run('links')) {
    // (The test origin isn't a secure context, so it has no clipboard: one is stubbed in, then refused.)
    const p = await fresh({ init: () => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => void (window.__copied = t) } }) });
    await booted(p);
    await type(p, 'work', 900);
    const links = await p.evaluate(() => {
      const out = [...document.querySelectorAll('[data-term] .term-entry')].at(-1);
      const all = [...out.querySelectorAll('.t-links a')];
      return all.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), target: a.target, rel: a.rel, detail: a.dataset.termDetail ?? null }));
    });
    const ext = links.filter((l) => l.detail == null);
    ok('links: each project\'s details link is its /projects/<id>/ page, run in the computer', links.filter((l) => l.detail).length === 11 && links.filter((l) => l.detail).every((l) => l.href === `/projects/${l.detail}/`), links.filter((l) => l.detail).length);
    ok('links: source and demo open in a new tab (noopener), to https addresses', ext.length > 0 && ext.every((l) => l.target === '_blank' && /noopener/.test(l.rel) && /^https:\/\//.test(l.href)), ext.map((l) => `${l.text} ${l.href}`));
    // A source link, clicked: a new tab; the computer stays as it was.
    const src = p.locator('[data-term] .term-entry:last-child .t-links a[target="_blank"]').first();
    await src.scrollIntoViewIfNeeded();
    const [tab] = await Promise.all([p.context().waitForEvent('page'), src.click()]);
    await tab.waitForLoadState();
    ok('links: a source link opens its address in a new tab, the computer stays open', /^https:\/\//.test(tab.url()) && (await p.evaluate(() => document.documentElement.dataset.pc)) === 'read', tab.url());
    await tab.close();
    // Details: in the frame over the terminal, focus on its heading, the terminal inert under it.
    const y0 = (await snap(p)).top;
    const det = p.locator('[data-term] .term-entry:last-child a[data-term-detail]').nth(1);
    const id = await det.getAttribute('data-term-detail');
    await det.scrollIntoViewIfNeeded();
    const y1 = (await snap(p)).top;
    await det.click();
    await detailed(p);
    await sleep(300);
    let d = await p.evaluate(() => ({ at: location.search, inert: document.querySelector('[data-term]').inert, title: document.title, h1: document.querySelector('.pc-detail').contentDocument.querySelector('main h1')?.textContent.trim(), back: document.querySelector('.pc-detail').contentDocument.querySelector('[data-leave]')?.textContent.trim().replace(/\s+/g, ' ') }));
    ok('links: details open over the terminal in the frame (address ?computer=work/<id>), focus on its heading, the terminal inert', d.at === `?computer=work/${id}` && d.inert && d.title.startsWith(d.h1) && /Back to terminal/.test(d.back), d);
    await shot(p, 'details-1440x900');
    // Escape (in the frame): back to the terminal as it was, focus on the link that opened them, ringed.
    await frame(p).locator('body').press('Escape');
    await p.waitForFunction(() => location.search === '?computer' && !document.querySelector('.pc-detail'));
    await sleep(300);
    let s = await snap(p);
    ok('links: Escape in the details goes back to the terminal (address ?computer), focus on the details link (ringed), the terminal where it was', s.focus.startsWith('a:details:') && s.ring && Math.abs(s.top - y1) <= 2 && s.title === 'Terminal · Donald Heddesheimer', { focus: s.focus, ring: s.ring, top: s.top, was: y1, before: y0 });
    // Again, back by its link (a click): no ring.
    await det.click();
    await detailed(p);
    await frame(p).click('[data-leave]');
    await p.waitForFunction(() => location.search === '?computer' && !document.querySelector('.pc-detail'));
    await sleep(300);
    s = await snap(p);
    ok('links: "Back to terminal" clicked goes back, focus on the details link without a ring', s.focus.startsWith('a:details:') && !s.ring, { focus: s.focus, ring: s.ring });
    // From one project to the next, inside the frame; Back to the first; Back to the terminal.
    await det.click();
    await detailed(p);
    const next = await frame(p).evaluate(() => document.querySelector('.cs-pager-link.is-next')?.getAttribute('href'));
    await frame(p).click('.cs-pager-link.is-next');
    await p.waitForFunction((n) => location.search === `?computer=work/${n}`, next.split('/').at(-2));
    await detailed(p);
    const second = where(p);
    await p.goBack();
    await p.waitForFunction((i) => location.search === `?computer=work/${i}`, id);
    await p.goBack();
    await p.waitForFunction(() => location.search === '?computer' && !document.querySelector('.pc-detail'));
    ok('links: the next project from inside the details (a new entry); Back, Back to the terminal', second === `/?computer=work/${next.split('/').at(-2)}` && where(p) === '/?computer', { next, second });
    // The résumé's PDF, and the contact links.
    await p.focus('[data-term-input]');
    await type(p, 'resume', 900);
    const pdf = await p.evaluate(async () => {
      const a = [...document.querySelectorAll('[data-term] .term-entry')].at(-1).querySelector('a[download]');
      const r = await fetch(a.href);
      const buf = await r.arrayBuffer();
      return { href: a.getAttribute('href'), name: a.getAttribute('download'), status: r.status, type: r.headers.get('content-type'), bytes: buf.byteLength, magic: new TextDecoder().decode(buf.slice(0, 5)) };
    });
    ok('links: the résumé\'s PDF downloads as Donald-Heddesheimer-Resume.pdf (a real PDF in the build)', pdf.href === '/resume.pdf' && pdf.name === 'Donald-Heddesheimer-Resume.pdf' && pdf.status === 200 && pdf.magic === '%PDF-' && pdf.bytes > 10000, pdf);
    await type(p, 'contact', 900);
    const ct = await p.evaluate(() => [...[...document.querySelectorAll('[data-term] .term-entry')].at(-1).querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, label: a.getAttribute('aria-label') })));
    ok('links: email is a mailto: link; GitHub and LinkedIn open in a new tab (noopener), labelled', ct[0].href === `mailto:${EMAIL}` && ct.slice(1).every((l) => l.target === '_blank' && /noopener/.test(l.rel) && /opens in a new tab/.test(l.label)) && ct.length === 3, ct);
    const [li] = await Promise.all([p.context().waitForEvent('page'), p.locator('[data-term] .term-entry:last-child a[href*="linkedin"]').click()]);
    ok('links: LinkedIn opens in a new tab', li.url() === 'https://www.linkedin.com/in/donaldheddesheimer/', li.url());
    await li.close();
    const copy = p.locator('[data-term] .term-entry:last-child [data-term-copy]');
    await copy.click();
    await sleep(200);
    const cp = await p.evaluate(() => ({ clip: window.__copied, label: [...document.querySelectorAll('[data-term] [data-term-copy]')].at(-1).textContent, status: document.querySelector('[data-term-status]').textContent }));
    ok('links: copy puts the address on the clipboard, says so', cp.clip === EMAIL && cp.label === 'copied' && cp.status === 'Copied.', cp);
    await sleep(1800);
    await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } }));
    await copy.click();
    await sleep(200);
    const sel = await p.evaluate(() => ({ selected: document.getSelection().toString().trim(), label: [...document.querySelectorAll('[data-term] [data-term-copy]')].at(-1).textContent, status: document.querySelector('[data-term-status]').textContent }));
    ok('links: copy refused, the address is selected for copying by hand', sel.selected === EMAIL && sel.label === 'selected' && sel.status === 'Selected, to copy.', sel);
    await p.context().close();
  }

  // 6. Leaving and coming back: Escape, exit, and on a touch screen the power button; the history, the
  //    reading position and the finished startup kept, and through a reload.
  if (run('leave')) {
    const p = await fresh();
    await booted(p);
    await type(p, 'help');
    await type(p, 'work', 900);
    await p.mouse.wheel(0, -200);
    await sleep(600);
    const before = await snap(p);
    await p.keyboard.press('Escape');
    await closed(p);
    await sleep(300);
    let s = await snap(p);
    ok('leave: Escape leaves for the opening (the address it was opened from), focus on the monitor\'s link, ringed', s.at === '/?probe' && s.focus === 'monitor' && s.ring && s.title !== 'Terminal · Donald Heddesheimer', { at: s.at, focus: s.focus, ring: s.ring });
    await watch(p);
    await enter(p);
    await reading(p);
    await sleep(900);
    s = await snap(p);
    ok('leave: back in, the history and the reading position as they were, no startup again', said(s).join(',') === said(before).join(',') && Math.abs(s.top - before.top) <= 2 && !(await seen(p)).boot.includes('play'), { said: said(s), top: s.top, was: before.top });
    // With a mouse and a keyboard, Esc is the way out: no power button on the bezel.
    const none = await p.evaluate(() => { const e = document.querySelector('[data-pc-exit]'); return { display: getComputedStyle(e).display, shown: e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) }; });
    ok('leave: with a mouse, no power button (Esc leaves)', none.display === 'none' && !none.shown, none);
    await type(p, 'EXIT', 0);
    await closed(p);
    s = await snap(p);
    ok('leave: exit (a hidden alias, any case) leaves too', s.at === '/?probe' && s.focus === 'monitor' && last(s).said === 'EXIT' && last(s).out === null, { at: s.at, last: last(s) });
    // A reload at /?computer: at once (no flight), as it was.
    await enter(p);
    await reading(p);
    await sleep(900);
    const was = await snap(p);
    await p.reload();
    await p.evaluate(() => { window.__pcs = [document.documentElement.dataset.pc]; });
    await reading(p);
    await sleep(900);
    s = await snap(p);
    ok('leave: a reload opens the terminal at once, the history, the reading position and the finished startup kept', s.at === '/?computer' && s.boot === 'done' && said(s).join(',') === said(was).join(',') && Math.abs(s.top - was.top) <= 2, { said: said(s).length, top: s.top, was: was.top, boot: s.boot });
    // Escape during the flight in: it lands, then leaves.
    const q = await page();
    await q.goto(base + '/?probe');
    await drawn(q);
    await sleep(400);
    await enter(q);
    await q.waitForFunction(() => document.documentElement.dataset.pc === 'fly');
    await q.keyboard.press('Escape');
    await closed(q);
    await sleep(300);
    const qs = await snap(q);
    ok('leave: Escape during the flight in leaves once it has landed', qs.at === '/?probe' && qs.pc === null && !(await q.evaluate(() => document.querySelector('[data-pc-dialog]').open)), qs.at);
    await q.context().close();
    await p.context().close();

    // A touch screen with the room round the monitor (a tablet, landscape): the power button on the
    // bezel under the screen, at its right, in view; tapped, it leaves, the focus back without a ring.
    const t = await fresh({ w: 1180, h: 820, touch: true });
    await booted(t);
    const pw = await box(t, '[data-pc-exit]');
    const sc = await box(t, '[data-pc-screen]');
    const icon = await box(t, '[data-pc-exit] svg');
    ok('leave: on a touch screen, the power button sits on the bezel under the screen, at its right, in view', !(await snap(t)).full && pw.shown && icon.y >= sc.b && icon.b <= sc.b + 40 && icon.x > sc.x + sc.w * 0.8 && icon.r <= sc.r && pw.b <= 820, { power: pw, icon, screen: sc });
    await t.touchscreen.tap(pw.x + pw.w / 2, pw.y + pw.h / 2);
    await closed(t);
    await sleep(300);
    s = await snap(t);
    ok('leave: the power button, tapped, leaves; focus on the monitor\'s link without a ring', s.at === '/?probe' && s.focus === 'monitor' && !s.ring, { at: s.at, focus: s.focus, ring: s.ring });
    await t.context().close();
  }

  // 7. The address: Back and Forward; old addresses open the terminal and run their command.
  if (run('history')) {
    const p = await page();
    await p.goto(base + '/');
    await drawn(p);
    await sleep(400);
    await enter(p);
    await reading(p);
    await booted(p);
    await type(p, 'work', 900);
    const det = p.locator('[data-term] .term-entry:last-child a[data-term-detail]').first();
    const id = await det.getAttribute('data-term-detail');
    await det.click();
    await detailed(p);
    const steps = [where(p)];
    await p.goBack();
    await p.waitForFunction(() => location.search === '?computer' && !document.querySelector('.pc-detail'));
    steps.push(where(p));
    await p.goBack();
    await closed(p);
    steps.push(where(p));
    await p.goForward();
    await reading(p);
    await sleep(300);
    steps.push(where(p));
    const kept = (await snap(p)).entries.length;
    await p.goForward();
    await detailed(p);
    steps.push(where(p));
    ok('history: details, Back to the terminal, Back to the room, Forward to the terminal (as it was), Forward to the details', steps.join(' ') === `/?computer=work/${id} /?computer / /?computer /?computer=work/${id}` && kept === 1, { steps, kept });
    await p.context().close();

    const legacy = async (path, cmd, what = '/?computer') => {
      const q = await page({ reduced: true });
      await q.goto(base + path);
      if (what === '/') {
        await sleep(1500);
        const s = await snap(q);
        ok(`history: ${path} is not the computer's: the room, the address cleaned`, s.at === '/' && s.pc === null, s.at);
      } else {
        await q.waitForFunction(() => document.documentElement.dataset.pc === 'read' && location.pathname === '/', null, { timeout: 15000 });
        await sleep(700);
        const s = await snap(q);
        ok(`history: ${path} opens the terminal${cmd ? ` running ${cmd}` : ''} (address ${what})`, s.at === what && (cmd ? said(s).join(',') === cmd && last(s).out != null : s.entries.length === 0), { at: s.at, said: said(s) });
        if (cmd) {
          await q.reload();
          await reading(q);
          await sleep(500);
          const r = await snap(q);
          ok(`history: ${path}, reloaded, doesn't run ${cmd} again`, said(r).join(',') === cmd, said(r));
        }
      }
      await q.context().close();
    };
    for (const c of ['about', 'work', 'resume', 'contact']) {
      await legacy(`/?computer=${c}`, c);
      await legacy(`/#${c}`, c);
      await legacy(`/computer/${c}/`, c);
      await legacy(`/computer/#${c}`, c);
    }
    await legacy('/computer/', null);
    await legacy(`/?computer=work/${id}`, null, `/?computer=work/${id}`);
    await legacy('/?computer=bogus', null, '/');
    await legacy('/?computer=work/no-such-project', null, '/');
    await legacy('/prototype/?computer=about', 'about');
    await legacy('/?sel=layer:gpu', 'work');
    {
      const q = await page({ reduced: true });
      await q.goto(base + `/?sel=project:${id}`);
      await q.waitForURL(`**/projects/${id}/`);
      ok(`history: /?sel=project:${id} goes to its case study`, where(q) === `/projects/${id}/`);
      await q.goto(base + '/computer/work/');
      await q.waitForFunction(() => document.documentElement.dataset.pc === 'read' && location.pathname === '/', null, { timeout: 15000 });
      await sleep(500);
      ok('history: /computer/work/ (the old Work page) opens the terminal running work', last(await snap(q))?.said === 'work');
      // A project's address with a section: the details open at that section.
      await q.goto(base + '/computer/work/fluxion/#approach');
      await q.waitForURL('**/?computer=work/fluxion#approach', { timeout: 8000 }).catch(() => {});
      await detailed(q);
      await sleep(600);
      const sec = await q.evaluate(() => { const d = document.querySelector('.pc-detail').contentDocument; const h = d.getElementById('approach'); return { at: location.pathname + location.search + location.hash, frame: d.location.pathname + d.location.hash, top: h ? Math.round(h.getBoundingClientRect().top) : null, y: Math.round(d.defaultView.scrollY) }; });
      ok('history: /computer/work/fluxion/#approach opens the lab at that project\'s Approach', sec.at === '/?computer=work/fluxion#approach' && sec.frame === '/computer/work/fluxion/#approach' && sec.y > 0 && sec.top != null && sec.top >= 0 && sec.top < 200, sec);
      // An old anchor followed on the opening.
      await q.goto(base + '/');
      await drawn(q);
      await q.evaluate(() => (location.hash = 'contact'));
      await reading(q);
      await sleep(600);
      const s = await snap(q);
      ok('history: #contact set on the opening opens the terminal running contact', s.at === '/?computer' && last(s).said === 'contact', { at: s.at, last: last(s) });
      await q.context().close();
    }
  }

  // 8. A phone: across the window, touch; the startup not covered by a keyboard; commands tapped; a
  //    keyboard up (a stubbed visualViewport); the power button in the strip under the screen.
  if (run('phone')) {
    for (const [w, h] of [[390, 844], [360, 640]]) {
      const tag = `${w}x${h}`;
      const p = await fresh({ w, h, touch: true });
      await booted(p);
      await sleep(300);
      let s = await snap(p);
      const lay = await p.evaluate(() => { const t = document.querySelector('[data-term]'); return { fs: parseFloat(getComputedStyle(t).fontSize), touch: getComputedStyle(t).touchAction }; });
      const sc = await box(p, '[data-pc-screen]');
      const pw = await box(p, '[data-pc-exit]');
      ok(`phone ${tag}: across the window, focus on the terminal (no keyboard raised), type at least 16px`, s.full && s.focus === 'terminal' && sc.x === 0 && sc.w === w && sc.y === 0 && lay.fs >= 16 && lay.touch !== 'none', { full: s.full, focus: s.focus, screen: sc, ...lay });
      ok(`phone ${tag}: the power button in the strip under the screen, in view, clear of the screen`, pw.shown && pw.y >= sc.b - 1 && pw.b <= h && pw.r <= w, { power: pw, screenBottom: sc.b });
      if (pw.w < 44 || pw.h < 44) note(`phone ${tag}: the power button's target is ${pw.w}x${pw.h}px (under 44px)`);
      await shot(p, `phone-startup-${tag}`);
      await clickRun(p, 'help', 'tap');
      await sleep(700);
      s = await snap(p);
      ok(`phone ${tag}: help tapped runs once; focus to its heading, not the prompt (no keyboard)`, said(s).join(',') === 'help' && s.focus === 'echo:help (newest)', { said: said(s), focus: s.focus });
      await clickRun(p, 'work', 'tap');
      await sleep(900);
      s = await snap(p);
      const v = await shown(p);
      ok(`phone ${tag}: work tapped runs once, shown from its start, focus on its heading`, said(s).join(',') === 'help,work' && s.focus === 'echo:work (newest)' && v.fromTop && v.prompt && s.winY === 0, { said: said(s), focus: s.focus, v });
      await shot(p, `phone-work-${tag}`);
      // A finger's swipe scrolls the terminal, not the window.
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(w / 2), y: Math.round(h / 2), yDistance: -300, gestureSourceType: 'touch', speed: 1200 });
      await sleep(600);
      const s2 = await snap(p);
      ok(`phone ${tag}: a swipe scrolls the terminal, not the window`, s2.top > s.top && s2.winY === 0, { before: s.top, after: s2.top, winY: s2.winY });
      // The prompt, tapped: a keyboard comes up over the bottom of the window (stubbed here). The terminal
      // keeps above it, its prompt in view; the power button goes; typed commands run.
      const ib = await box(p, '[data-term-input]');
      await p.touchscreen.tap(ib.x + 20, ib.y + ib.h / 2);
      const kb = Math.round(h * 0.4);
      await p.evaluate((k) => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => innerHeight - k }); visualViewport.dispatchEvent(new Event('resize')); }, kb);
      await sleep(400);
      const up = await p.evaluate(() => ({ kb: document.documentElement.hasAttribute('data-pc-kb'), focus: document.activeElement?.matches('[data-term-input]') }));
      const sk = await box(p, '[data-pc-screen]');
      const fk = await box(p, '[data-term-form]');
      const pk = await box(p, '[data-pc-exit]');
      ok(`phone ${tag}: with a keyboard up, the terminal fits above it, the prompt in view, the power button gone`, up.kb && up.focus && sk.b <= h - kb + 1 && fk.b <= h - kb + 1 && fk.y >= 0 && !pk.shown, { up, screen: sk, prompt: fk, keyboardTop: h - kb });
      await p.keyboard.type('about');
      await p.keyboard.press('Enter');
      await sleep(900);
      s = await snap(p);
      const fk2 = await box(p, '[data-term-form]');
      ok(`phone ${tag}: typed with the keyboard up, about runs, the prompt still above the keyboard`, last(s).said === 'about' && s.focus === 'input' && fk2.b <= h - kb + 1, { last: last(s), prompt: fk2 });
      await shot(p, `phone-keyboard-${tag}`);
      await p.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
      await sleep(400);
      const down = await box(p, '[data-pc-exit]');
      ok(`phone ${tag}: the keyboard down, the power button back`, down.shown && !(await p.evaluate(() => document.documentElement.hasAttribute('data-pc-kb'))), down);
      await p.touchscreen.tap(down.x + down.w / 2, down.y + down.h / 2);
      await closed(p);
      await sleep(300);
      s = await snap(p);
      ok(`phone ${tag}: the power button tapped leaves for the opening, no ring`, s.at === '/?probe' && !s.ring, { at: s.at, focus: s.focus, ring: s.ring });
      await p.context().close();
    }
    // A tablet, upright: across the window too (narrower than the desk).
    const t = await fresh({ w: 820, h: 1180, touch: true });
    await booted(t);
    const ts = await snap(t);
    ok('phone 820x1180 (tablet): across the window, focus on the terminal', ts.full && ts.focus === 'terminal', { full: ts.full, focus: ts.focus });
    await shot(t, 'tablet-startup-820x1180');
    await t.context().close();
  }

  // 9. Reduced motion, and Motion off: no flight, no startup animation, no output animation, a steady cursor.
  if (run('motion')) {
    const anims = (p) => p.evaluate(() => { const t = document.querySelector('[data-term]'); return document.getAnimations().filter((a) => a.effect?.target && t.contains(a.effect.target)).length; });
    {
      const p = await fresh();
      await booted(p);
      await p.keyboard.type('help');
      await p.keyboard.press('Enter');
      const n = await anims(p);
      ok('motion on: help\'s lines come in one after another (the check below can see animations)', n >= 4, { animations: n });
      await p.context().close();
    }
    for (const [how, opts] of [['reduced motion', { reduced: true }], ['Motion off (Settings)', { init: () => localStorage.setItem('motion', 'off') }]]) {
      const p = await fresh(opts);
      await sleep(300);
      const sn = await seen(p);
      await p.keyboard.type('help');
      await p.keyboard.press('Enter');
      const n = await anims(p);
      await type(p, 'work', 200);
      const v = await shown(p);
      await sleep(1300);
      const cur = await p.evaluate(() => getComputedStyle(document.querySelector('[data-term-cursor]')).animationName);
      ok(`${how}: in without the flight, the startup all at once, no output animation, a steady cursor`, !sn.pc.includes('fly') && !sn.boot.includes('play') && n === 0 && cur === 'none' && v.fromTop, { pcs: sn.pc, boots: sn.boot, animations: n, cursor: cur, scrolledAtOnce: v.fromTop });
      await p.context().close();
    }
  }

  // 10. The keyboard alone: in from the monitor's link, commands' buttons and links all ringed, no power
  //     button, Escape out.
  if (run('keyboard')) {
    const p = await page();
    await p.goto(base + '/?probe');
    await drawn(p);
    await p.keyboard.press('Tab');
    const first = await snap(p);
    await p.keyboard.press('Enter');
    await reading(p);
    await booted(p);
    let s = await snap(p);
    ok('keyboard: Tab to the monitor\'s link (ringed), Enter goes in, focus in the prompt', first.focus === 'monitor' && first.ring && s.focus === 'input', { first: first.focus, ring: first.ring, now: s.focus });
    await type(p, 'help');
    await p.keyboard.press('Shift+Tab');
    const back = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { run: a.dataset.termRun, ring: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}` }; });
    ok('keyboard: Shift+Tab from the prompt reaches the newest command button, ringed', back.run === 'contact' && back.ring && back.outline.startsWith('solid'), back);
    await p.keyboard.press('Enter');
    await sleep(700);
    s = await snap(p);
    ok('keyboard: Enter on it runs contact once; focus back in the prompt', last(s).said === 'contact' && s.focus === 'input', { last: last(s), focus: s.focus });
    await p.keyboard.press('Shift+Tab');
    await p.keyboard.press('Shift+Tab');
    await p.keyboard.press('Shift+Tab');
    const lk = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { el: a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent.trim()), ring: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}` }; });
    ok('keyboard: the output\'s links take the focus, ringed', lk.ring && lk.outline.startsWith('solid'), lk);
    // Tab down through work's links: each scrolls clear of the prompt at the screen's foot (not under it).
    await p.focus('[data-term-input]');
    await type(p, 'work');
    await p.evaluate(() => { const t = document.querySelector('[data-term]'); t.scrollTop = 0; [...t.querySelectorAll('.t-work a')].shift().focus({ preventScroll: true }); });
    const under = [];
    for (let i = 0; i < 40; i++) {
      await p.keyboard.press('Tab');
      await sleep(40);
      const u = await p.evaluate(() => { const a = document.activeElement; if (!a.closest('[data-term-log]')) return null; return a.getBoundingClientRect().bottom > document.querySelector('[data-term-form]').getBoundingClientRect().top ? a.textContent.trim() : null; });
      if (u) under.push(u);
    }
    ok('keyboard: Tab down through work\'s links, none is left under the prompt', under.length === 0, under);
    // No power button to Tab to: Esc is the way out.
    await p.focus('[data-term-input]');
    await p.keyboard.press('Tab');
    const next = await p.evaluate(() => { const a = document.activeElement; return { power: !!a?.matches('[data-pc-exit]'), inDialog: !!a?.closest('[data-pc-dialog]'), el: a ? a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent.trim()).replace(/\s+/g, ' ').slice(0, 40) : null }; });
    ok('keyboard: Tab from the prompt reaches no power button (there\'s none with a keyboard)', !next.power, next);
    await p.keyboard.press('Escape');
    await closed(p);
    await sleep(300);
    s = await snap(p);
    ok('keyboard: Escape leaves, focus on the monitor\'s link, ringed', s.focus === 'monitor' && s.ring, { focus: s.focus, ring: s.ring });
    await p.context().close();
  }

  // 11b. No WebGL (the context refused): the still, its monitor a link over the pictured monitor (the
  // stills were retaken for the terminal; the --still-* fractions are unchanged), and the terminal across
  // the window. (The lab-computer pass's check, for the terminal's addresses.)
  if (run('nowebgl')) {
    const noGL = () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; };
    for (const [w, h, touch] of [[1440, 900], [390, 844, true], [1440, 400], [2560, 900], [3840, 950]]) {
      const p = await page({ w, h, touch, init: noGL });
      await p.goto(base + '/');
      await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-failed'), null, { timeout: 15000 });
      await sleep(400);
      const r = await p.evaluate(() => {
        const m = document.querySelector('[data-lab-monitor]').getBoundingClientRect();
        const img = document.querySelector('.still img');
        // Where the picture puts the monitor: the still covers the window at its object-position.
        const cs = getComputedStyle(document.documentElement);
        const v = (k) => parseFloat(cs.getPropertyValue(k));
        const k = Math.max(innerWidth / img.naturalWidth, innerHeight / img.naturalHeight);
        const [iw, ih] = [img.naturalWidth * k, img.naturalHeight * k];
        const [px, py] = getComputedStyle(img).objectPosition.split(' ').map((q) => parseFloat(q) / 100);
        const [ox, oy] = [(innerWidth - iw) * px, (innerHeight - ih) * py];
        const pic = [ox + iw * v('--still-ml'), oy + ih * v('--still-mt'), iw * (v('--still-mr') - v('--still-ml')), ih * (v('--still-mb') - v('--still-mt'))];
        const link = [m.x, m.y, m.width, m.height];
        return { still: img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1', src: img.currentSrc.split('/').pop(), link: link.map(Math.round), pictured: pic.map(Math.round), onPicture: link.every((x, i) => Math.abs(x - pic[i]) <= 1.5), inView: m.left >= 0 && m.right <= innerWidth && m.top - 7 >= 0 && m.bottom + 7 <= innerHeight, hit: document.elementFromPoint(m.x + m.width / 2, m.y + m.height / 2)?.matches('[data-lab-monitor]') };
      });
      ok(`no WebGL ${w}x${h}: the still shows, its monitor a link over the pictured monitor, in view with room for the ring`, r.still && r.onPicture && r.inView && r.hit, r);
      await shot(p, `nowebgl-opening-${w}x${h}`);
      await enter(p, touch);
      await reading(p);
      await booted(p);
      ok(`no WebGL ${w}x${h}: the still's monitor opens the terminal (across the window)`, where(p) === '/?computer' && (await p.evaluate(() => document.documentElement.hasAttribute('data-pc-full'))), where(p));
      await p.keyboard.press('Escape');
      await closed(p);
      await sleep(300);
      const f = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      await p.keyboard.press('Enter');
      await reading(p);
      ok(`no WebGL ${w}x${h}: Escape returns focus to the link, and Enter on it goes in again`, f === 'Explore my work' && where(p) === '/?computer', { focus: f });
      await p.context().close();
    }
  }

  // 11. Without JavaScript: the monitor is a link to the terminal's transcript (/computer/), which stands
  //     alone; the old pages forward there.
  if (run('nojs')) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const p = await page({ w, h, js: false });
      await p.goto(base + '/');
      await sleep(300);
      const href = await p.evaluate(() => document.querySelector('[data-lab-monitor]').getAttribute('href'));
      await Promise.all([p.waitForURL('**/computer/'), enter(p)]);
      await p.waitForLoadState();
      await sleep(300);
      const r = await p.evaluate(() => ({
        at: location.pathname + location.hash,
        h1: document.querySelector('h1')?.textContent,
        sections: [...document.querySelectorAll('main section.term-entry')].map((s) => `${s.id}:${s.querySelector('h2')?.textContent.replace('donald@lab:~$', '').trim()}`),
        cmds: [...document.querySelectorAll('main a.t-cmd')].map((a) => a.getAttribute('href')).filter((x, i, a) => a.indexOf(x) === i).sort(),
        buttons: document.querySelectorAll('main button').length,
        details: document.querySelectorAll('main a[href^="/projects/"]').length,
        back: document.querySelector('.t-static-back a')?.getAttribute('href'),
        robots: document.querySelector('meta[name=robots]')?.content,
        canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
        sideways: document.scrollingElement.scrollWidth - innerWidth,
      }));
      ok(`no JS ${w}x${h}: the monitor links to /computer/, the transcript: help and the four commands, each a section with its heading`, href === '/computer/' && r.at === '/computer/' && r.sections.join(',') === 'help:help,about:about,work:work,resume:resume,contact:contact' && /terminal/.test(r.h1), r);
      ok(`no JS ${w}x${h}: commands link to their place, no buttons, details to /projects/, a way back, out of search, no sideways scroll`, r.cmds.join(',') === '#about,#contact,#help,#resume,#work' && r.buttons === 0 && r.details === 11 && r.back === '/' && /noindex/.test(r.robots) && /\/computer\/$/.test(r.canonical) && r.sideways <= 0, r);
      await p.screenshot({ path: `${shots}/nojs-transcript-${w}x${h}.jpg`, type: 'jpeg', quality: 85 });
      await p.context().close();
    }
    const p = await page({ js: false });
    await p.goto(base + '/computer/about/');
    await p.waitForURL('**/computer/#about', { timeout: 5000 }).catch(() => {});
    ok('no JS: /computer/about/ forwards to /computer/#about', where(p) === '/computer/#about', where(p));
    await p.context().close();
  }

  // 12. A lab script that fails to load: the terminal's transcript instead (for the session), or the
  //     project's page; the opening itself untouched.
  if (run('failed')) {
    const p = await page({ fail: true });
    await p.goto(base + '/');
    await sleep(1500);
    ok('failed script: the opening stays the opening', where(p) === '/', where(p));
    await p.goto(base + '/?computer');
    await p.waitForURL('**/computer/?static', { timeout: 8000 }).catch(() => {});
    const r = await p.evaluate(() => ({ at: location.pathname + location.search, flag: sessionStorage.getItem('lab:static'), sections: document.querySelectorAll('main section.term-entry').length }));
    ok('failed script: /?computer goes to the transcript (/computer/?static), remembered for the session', r.at === '/computer/?static' && r.flag === '1' && r.sections === 5, r);
    await p.goto(base + '/?computer=about');
    await p.waitForURL('**/computer/?static#about', { timeout: 8000 }).catch(() => {});
    ok('failed script: /?computer=about goes to the transcript at about', where(p) === '/computer/?static#about', where(p));
    await p.goto(base + '/');
    await sleep(800);
    await Promise.all([p.waitForURL('**/computer/'), p.click('[data-lab-monitor]')]);
    await sleep(1500);
    ok('failed script: the monitor\'s link then stays on the transcript (no loop back to the lab)', where(p) === '/computer/', where(p));
    const ids = await p.evaluate(() => [...document.querySelectorAll('main a[href^="/projects/"]')].map((a) => a.getAttribute('href').split('/')[2]));
    await p.goto(base + `/?computer=work/${ids[0]}`);
    await p.waitForURL(`**/projects/${ids[0]}/`, { timeout: 8000 }).catch(() => {});
    ok('failed script: a project\'s address goes to its page', where(p) === `/projects/${ids[0]}/`, where(p));
    // The script loads again (the network's back): the lab runs, and the old addresses come to it again.
    await p.context().unrouteAll({ behavior: 'ignoreErrors' });
    await routeDist(p.context());
    await p.goto(base + '/?computer');
    await reading(p);
    await booted(p);
    const flag = await p.evaluate(() => sessionStorage.getItem('lab:static'));
    await p.goto(base + '/computer/#about');
    await p.waitForURL('**/?computer', { timeout: 8000 }).catch(() => {});
    await reading(p);
    await sleep(700);
    const again = await snap(p);
    ok('failed script, then working: the lab runs, the flag goes, and /computer/#about opens the lab running about', flag === null && again.at === '/?computer' && last(again)?.said === 'about', { flag, at: again.at, last: last(again) });
    await p.context().close();
  }

  // 13. Sizes: on the monitor at desktop sizes; enlarged text and short windows, nothing clipped.
  if (run('fit')) {
    for (const [w, h, zoom, touch] of [[1440, 900, 1], [1920, 1080, 1], [1280, 800, 1], [1024, 768, 1], [1180, 820, 1, true], [1280, 800, 2], [390, 844, 1, true], [390, 844, 2, true], [360, 640, 2, true], [1024, 400, 1], [740, 360, 1, true], [568, 320, 1.5, true]]) {
      const tag = `${w}x${h}${zoom !== 1 ? `-text${zoom * 100}` : ''}`;
      const p = await fresh({ w, h, touch, reduced: true, init: zoom !== 1 ? `document.addEventListener('DOMContentLoaded', () => document.documentElement.style.fontSize = '${zoom * 100}%')` : null });
      await booted(p);
      await p.evaluate(() => document.fonts.ready);
      if (touch) await clickRun(p, 'help', 'tap');
      else await type(p, 'help', 300);
      await sleep(300);
      const s = await snap(p);
      const r = await p.evaluate(() => {
        const t = document.querySelector('[data-term]');
        const rr = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const sc = rr(document.querySelector('[data-pc-screen]'));
        const f = rr(t.querySelector('[data-term-form]'));
        const e = document.querySelector('[data-pc-exit]');
        const pw = rr(e);
        const shown = e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
        return { fs: parseFloat(getComputedStyle(t).fontSize), screen: [sc.x, sc.y, sc.w, sc.h].map(Math.round), inView: sc.x >= 0 && sc.y >= 0 && sc.r <= innerWidth + 0.5 && sc.b <= innerHeight + 0.5, prompt: f.y >= sc.y - 0.5 && f.b <= sc.b + 0.5, power: shown && pw.x >= 0 && pw.r <= innerWidth && pw.y >= 0 && pw.b <= innerHeight, noPower: getComputedStyle(e).display === 'none', sideways: t.scrollWidth - t.clientWidth, outer: document.scrollingElement.scrollHeight - innerHeight };
      });
      const onMonitor = !s.full;
      // The power button: a touch screen's, in view; with a mouse, none (Esc leaves).
      ok(`fit ${tag}: ${onMonitor ? 'on the monitor' : 'across the window'}, the screen in view${touch ? ' and the power button' : ', no power button'}, the prompt in the screen, nothing sideways`, r.inView && r.prompt && (touch ? r.power : r.noPower) && r.sideways <= 0 && r.outer <= 0 && (w >= 1024 && h >= 576 ? onMonitor : !onMonitor), { ...r, full: s.full });
      if (zoom === 1 && !touch && (r.fs < 13 || r.fs > 17)) note(`fit ${tag}: terminal type ${r.fs}px`);
      await shot(p, `fit-${tag}`);
      // On the monitor, a touch screen's power button: its box (and ring) under the screen, never over it,
      // its icon on the bezel (computer.ts BEZEL).
      if (onMonitor && touch) {
        const pb = await p.evaluate(() => {
          const sc = document.querySelector('[data-pc-screen]').getBoundingClientRect();
          const e = document.querySelector('[data-pc-exit]');
          const x = e.getBoundingClientRect();
          const i = e.querySelector('svg').getBoundingClientRect();
          const bezel = (sc.width * 0.018) / 0.68;
          const reach = getComputedStyle(e, '::before').content !== 'none' ? parseFloat(getComputedStyle(e, '::before').height) : x.height;
          return { screenBottom: Math.round(sc.bottom), box: [x.x, x.y, x.width, x.height].map(Math.round), icon: [Math.round(i.top - sc.bottom), Math.round(i.bottom - sc.bottom)], bezel: Math.round(bezel), reach, off: x.top >= sc.bottom - 0.5, onBezel: i.top >= sc.bottom && i.bottom <= sc.bottom + bezel + 1, hit: document.elementFromPoint(x.x + x.width / 2, sc.bottom - 2)?.closest('[data-pc-exit]') == null };
        });
        ok(`fit ${tag}: the power button's box under the screen (not over it), its icon on the bezel, a finger's reach of 44px`, pb.off && pb.onBezel && pb.hit && pb.reach >= 44, pb);
      }
      // What the commands print, at this size: nothing sideways, the prompt's field a usable width, the
      // email on one line (not a column a few letters wide), links a finger can find on a touch screen.
      for (const cmd of ['contact', 'work']) {
        if (touch) await clickRun(p, cmd, 'tap');
        else await type(p, cmd, 300);
        await sleep(300);
      }
      const ran = said(await snap(p)).slice(-2).join(',');
      ok(`fit ${tag}: contact and work ${touch ? 'tapped' : 'typed'}, each ran`, ran === 'contact,work', ran);
      const o = await p.evaluate(() => {
        const t = document.querySelector('[data-term]');
        const field = t.querySelector('.term-field').getBoundingClientRect();
        const fs = parseFloat(getComputedStyle(t).fontSize);
        const mail = [...t.querySelectorAll('a[href^="mailto:"]')].pop();
        const links = [...t.querySelectorAll('.t-links a')].slice(-6).map((a) => Math.round(a.getBoundingClientRect().height));
        // The email on one line, or, where a line can't hold it, across the whole width (not a column).
        const dd = mail.closest('dd') ?? mail.parentElement;
        const across = dd.getBoundingClientRect().width / t.querySelector('[data-term-log]').getBoundingClientRect().width;
        return { sideways: t.scrollWidth - t.clientWidth, fieldCh: +(field.width / (fs * 0.6)).toFixed(1), mailLines: mail.getClientRects().length, across: +across.toFixed(2), mailH: Math.round(mail.getClientRects()[0].height), linkH: links, fs };
      });
      ok(`fit ${tag}: contact and work print with nothing sideways, the prompt's field at least 7 characters, the email on one line (or across the width)${touch ? ', links 30px or more tall' : ''}`, o.sideways <= 0 && o.fieldCh >= 7 && (o.mailLines === 1 || o.across >= 0.9) && (!touch || Math.min(o.mailH, ...o.linkH) >= 30), o);
      await shot(p, `fit-${tag}-work`);
      await p.context().close();
    }
  }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
