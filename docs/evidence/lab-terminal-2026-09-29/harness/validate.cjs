// node validate.cjs [base] [only] [--swiftshader] — the lab terminal's checks, against the production
// build: installed Chrome, WebGL through ANGLE Metal on the Mac it runs on (or SwiftShader). `base` is
// 'dist' (the default: the built site straight from disk, no server) or a server's address; `only` runs
// the groups whose names start with it. Playwright isn't a dependency: PW=<its module path>, or NODE_PATH.
// Screenshots of the checks go to SHOTS (default: a folder in the system's temp directory). Links out of
// the site (source, demo, GitHub, LinkedIn) are answered here with a stub page: nothing is fetched from
// them. Google Fonts load as on the live site, or from a local copy (FONTS, serve.cjs).
//
// The terminal shows one view at a time over its prompt (terminal.ts, since the terminal overhaul of
// 2026-09-30): the startup's lines, help, a section or a project, each a [data-view] element made the
// first time it's asked for and shown again after; a mistake is a line over the prompt, not a view.
// So the checks read the view being shown, the prompt's line and the session's store (lab:terminal:2),
// not a transcript. A group that throws (a wait that times out) is a FAIL with its error, and the run
// goes on to the next group: the count at the end is the whole of it.
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
const base = !process.argv[2] || process.argv[2] === 'dist' ? BASE : process.argv[2];
const only = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const SW = process.argv.includes('--swiftshader');
const shots = process.env.SHOTS || require('path').join(require('os').tmpdir(), 'lab-terminal-shots');
require('fs').mkdirSync(shots, { recursive: true });
let [fails, passes] = [0, 0];
const ok = (name, cond, info = '') => {
  if (!cond) fails++;
  else passes++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`);
};
const note = (msg, info = '') => console.log(`NOTE  ${msg}${info ? '  ' + JSON.stringify(info) : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EMAIL = 'donaldheddes@gmail.com';
const PS1 = 'donald@lab:~$';
const ps1 = (view) => (!view || view === 'help' ? PS1 : `donald@lab:~/${view}$`);
const STORE = 'lab:terminal:2';
const NOT_FOUND = (s) => `${s}: command not found. Run help for available commands.`;

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: SW ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const pages = [];
  const page = async ({ w = 1440, h = 900, reduced = false, js = true, touch = false, init = null, fail = false, perms = null } = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference', javaScriptEnabled: js, hasTouch: touch, isMobile: touch, permissions: perms ?? undefined });
    if (base === BASE) await routeDist(ctx, { failScripts: fail });
    await ctx.route((u) => /^https?:$/.test(u.protocol) && !u.href.startsWith(base) && !/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname), (r) => r.fulfill({ body: '<!doctype html><title>stub</title>', headers: { 'content-type': 'text/html' } }));
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.errors = [];
    p.on('pageerror', (e) => {
      p.errors.push(e.message);
      console.log('  pageerror:', e.message);
    });
    pages.push(p);
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
  // A group: run, and if it throws (a wait timed out), a FAIL with the error; its pages closed either way.
  const group = async (name, fn) => {
    if (!run(name)) return;
    const t0 = Date.now();
    try {
      await fn();
    } catch (e) {
      ok(`${name}: ran to its end`, false, String(e.message ?? e).split('\n')[0]);
    }
    for (const p of pages.splice(0)) await p.context().close().catch(() => {});
    console.log(`# ${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  };
  const where = (p) => { const u = new URL(p.url()); return u.pathname + u.search + u.hash; };
  const drawn = (p) => p.waitForFunction(() => document.querySelector('[data-lab-root]')?.matches('[data-drawn], [data-failed]'), null, { timeout: 30000 });
  const reading = (p) => p.waitForFunction(() => document.documentElement.dataset.pc === 'read', null, { timeout: 20000 });
  const booted = (p) => p.waitForFunction(() => document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 5000 });
  const closed = (p) => p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
  // The view being shown (terminal.ts: one [data-view] unhidden), as its name ('' the startup's).
  const V = '[data-term] [data-view]:not([hidden])';
  // A project shown: its view, and the address its own.
  const printed = (p, id) => p.waitForFunction((i) => document.querySelector('[data-term] [data-view]:not([hidden])')?.dataset.view === `work/${i}` && location.search === `?computer=work/${i}`, id, { timeout: 8000 });
  // The terminal's scroll at rest: the same scrollTop for 250 ms running (a smooth scroll can outlast a
  // fixed wait).
  const settled = (p) =>
    p.evaluate(
      () =>
        new Promise((done) => {
          const el = document.querySelector('[data-term]');
          let [last, since] = [el.scrollTop, performance.now()];
          const tick = (now) => {
            if (el.scrollTop !== last) [last, since] = [el.scrollTop, now];
            if (now - since >= 250) done();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
  const TERM_TITLE = 'Terminal · Donald Heddesheimer';
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
  // The terminal as it is: the view shown and every view made so far, the line over the prompt, the
  // prompt's, the focus, its scroll, the window's, and what the session keeps.
  const snap = (p) => p.evaluate((key) => {
    const h = document.documentElement;
    const t = document.querySelector('[data-term]');
    const input = t.querySelector('[data-term-input]');
    const views = [...t.querySelectorAll('[data-view]')];
    const shownV = views.filter((v) => !v.hidden);
    const note = t.querySelector('[data-term-note]');
    const a = document.activeElement;
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(key));
    } catch {}
    const focus = !a || a === document.body ? 'body' : a === input ? 'input' : a === t ? 'terminal' : a.matches('.t-title') ? `title:${a.closest('[data-view]')?.dataset.view}` : a.matches('[data-lab-monitor]') ? 'monitor' : a.matches('[data-pc-exit]') ? 'power' : a === document.querySelector('[data-pc-dialog]') ? 'dialog' : a.dataset.termRun ? `${a.tagName.toLowerCase()}:${a.dataset.termRun}` : `${a.tagName.toLowerCase()}:${(a.getAttribute('aria-label') || a.textContent).trim().replace(/\s+/g, ' ').slice(0, 48)}`;
    return {
      at: location.pathname + location.search + location.hash,
      pc: h.dataset.pc ?? null,
      full: h.hasAttribute('data-pc-full'),
      boot: t.dataset.boot,
      view: shownV.length === 1 ? shownV[0].dataset.view : shownV.length ? `(${shownV.length} shown)` : null,
      views: views.map((v) => v.dataset.view),
      note: note.hidden ? null : note.innerText.replace(/\s+/g, ' ').trim(),
      ps1: t.querySelector('[data-term-ps1]').textContent,
      focus,
      ring: !!a?.matches(':focus-visible'),
      status: t.querySelector('[data-term-status]').textContent,
      top: Math.round(t.scrollTop),
      max: t.scrollHeight - t.clientHeight,
      winY: scrollY,
      title: document.title,
      value: input.value,
      recall: saved?.recall ?? null,
      saved,
    };
  }, STORE);
  const unique = (s) => new Set(s.views).size === s.views.length;
  // The view being shown, as it's shown: from its start (where it's new, or was left there), the prompt
  // at the screen's foot.
  const shown = (p) => p.evaluate(() => {
    const t = document.querySelector('[data-term]');
    const tr = t.getBoundingClientRect();
    const e = t.querySelector('[data-view]:not([hidden])');
    const er = e.getBoundingClientRect();
    const fr = t.querySelector('[data-term-form]').getBoundingClientRect();
    return { fromTop: er.top >= tr.top - 1 && er.top <= tr.top + 40, prompt: fr.top >= tr.top - 1 && fr.bottom <= tr.bottom + 1, foot: Math.round(tr.bottom - fr.bottom), top: Math.round(t.scrollTop), max: t.scrollHeight - t.clientHeight };
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
  // A command's button or link in the view shown (or in the line over the prompt).
  const runLoc = (p, name) => p.locator(`[data-term] :is([data-view]:not([hidden]), [data-term-note]) [data-term-run="${name}"]`).first();
  const clickRun = async (p, name, how = 'mouse') => {
    const el = runLoc(p, name);
    await el.scrollIntoViewIfNeeded();
    const r = await el.boundingBox();
    const [x, y] = [r.x + r.width / 2, r.y + r.height / 2];
    if (how === 'tap') await p.touchscreen.tap(x, y);
    else if (how === 'dbl') await p.mouse.dblclick(x, y);
    else await p.mouse.click(x, y);
  };
  // A disclosure's line in the view shown, clicked (or tapped).
  const unfold = async (p, sel, how = 'mouse') => {
    const s = p.locator(`${V} ${sel} > summary`).first();
    await s.scrollIntoViewIfNeeded();
    const r = await s.boundingBox();
    if (how === 'tap') await p.touchscreen.tap(r.x + 12, r.y + r.height / 2);
    else await p.mouse.click(r.x + 12, r.y + r.height / 2);
    await sleep(200);
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
  //    shown on its own; help lists exactly the four commands.
  await group('startup', async () => {
    const p = await fresh();
    const t0 = Date.now();
    await booted(p);
    const ms = Date.now() - t0;
    await sleep(300);
    const s = await snap(p);
    const sn = await seen(p);
    const text = await onScreen(p);
    ok('startup: in by the flight (fade, fly, read), the startup plays once, then done', sn.pc.join(',') === 'fade,fly,read' && sn.boot.join(',') === 'pending,play,done', { ...sn, playedMs: ms });
    ok('startup: the screen shows the two lines and the prompt, nothing else shown (the startup the only view, nothing recalled)', text === `New terminal started. Type help to look around. The robots are on break. ${PS1}` && s.view === '' && s.views.join(',') === '' && s.recall?.length === 0 && s.note === null, { text, views: s.views, recall: s.recall });
    ok('startup: focus in the prompt (a mouse was used), the title is the terminal\'s, address /?computer', s.focus === 'input' && s.title === TERM_TITLE && s.at === '/?computer', s);
    const scr = await p.evaluate(() => {
      const d = document.querySelector('[data-pc-dialog]');
      const i = document.querySelector('[data-term-input]');
      return { modal: d.open && d.matches(':modal'), label: d.getAttribute('aria-label'), input: i.getAttribute('aria-label'), hint: document.getElementById(i.getAttribute('aria-describedby'))?.textContent.trim(), status: document.querySelector('[data-term-status]').getAttribute('role'), ps1: document.querySelector('[data-term-ps1]').textContent, cursor: getComputedStyle(document.querySelector('[data-term-cursor]')).animationName };
    });
    ok('startup: a modal dialog labelled, the prompt labelled "Command" and described by the startup\'s hint, a status line', scr.modal && /terminal/i.test(scr.label) && scr.input === 'Command' && /^Type help to look around/.test(scr.hint) && scr.status === 'status' && scr.ps1 === PS1, scr);
    ok('startup: the block cursor blinks while the prompt waits', scr.cursor === 'term-blink', scr.cursor);
    await shot(p, 'startup-1440x900');
    await type(p, 'help');
    const h = await snap(p);
    const help = await p.evaluate(() => [...document.querySelectorAll('[data-term] [data-view="help"] .t-help li')].map((li) => ({ cmd: li.querySelector('[data-term-run]')?.dataset.termRun, tag: li.querySelector('[data-term-run]')?.tagName, label: li.querySelector('span')?.textContent })));
    ok('help: in the startup\'s place (the one view shown), exactly four commands, about, work, resume, contact, each a button', h.view === 'help' && h.views.join(',') === ',help' && help.map((x) => x.cmd).join(',') === 'about,work,resume,contact' && help.every((x) => x.tag === 'BUTTON' && x.label), { view: h.view, views: h.views, help });
    ok('help: announced once in the status line, focus stays in the prompt, the prompt home (~)', h.status === 'Commands: about, work, resume, contact.' && h.focus === 'input' && h.ps1 === PS1, { status: h.status, focus: h.focus, ps1: h.ps1 });
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
    ok('startup: a key during it ends it at once; the command typed then runs', mid === 'done' && rs.view === 'help' && rs.recall.join(',') === 'help', { bootAfterKey: mid, view: rs.view, recall: rs.recall });
  });

  // 2. Commands, typed: each shows its view in the one before's place, announced; the same again leaves
  //    it be (no second copy); mistakes are a line over the prompt; unusual input.
  await group('commands', async () => {
    const p = await fresh();
    await booted(p);
    const want = { about: 'About me.', work: 'Selected work: 2 featured of 11 projects.', resume: 'Résumé, with the PDF to download.', contact: 'Contact: email, GitHub and LinkedIn.' };
    for (const [c, a] of Object.entries(want)) {
      await type(p, c);
      const s = await snap(p);
      const v = await shown(p);
      ok(`commands: ${c} shows its view, the one shown, announced ("${a}"), the prompt ~/${c} and ready again`, s.view === c && s.status === a && s.ps1 === ps1(c) && s.focus === 'input' && s.value === '' && s.note === null && unique(s), { view: s.view, views: s.views, status: s.status, ps1: s.ps1, focus: s.focus });
      ok(`commands: ${c} shown from its start, the prompt at the screen's foot`, v.fromTop && v.prompt && v.top === 0 && v.foot <= 24, v);
      await shot(p, `cmd-${c}-1440x900`);
    }
    // The same again: nothing made twice, nothing moved.
    await p.evaluate(() => document.querySelector('[data-term]').scrollTo({ top: 120, behavior: 'instant' }));
    await sleep(300);
    const a0 = await snap(p);
    await type(p, 'contact');
    await type(p, 'about');
    await type(p, 'about');
    let s = await snap(p);
    ok('commands: a view asked for again is the one made before (no second copy of any view), shown as it was left', s.view === 'about' && unique(s) && s.views.join(',') === ',about,work,resume,contact' && (await p.locator('[data-term] [data-view="contact"]').count()) === 1, { views: s.views, contactTop: a0.top });
    const content = await p.evaluate(() => {
      const v = (n) => document.querySelector(`[data-term] [data-view="${n}"]`);
      const [about, work, resume, contact] = ['about', 'work', 'resume', 'contact'].map(v);
      const row = (li) => { const a = li.querySelector('a.t-open'); return { run: a?.dataset.termRun, href: a?.getAttribute('href'), name: a?.textContent.trim(), line: li.querySelector('.t-work-line')?.textContent.trim(), meta: li.querySelector('.t-work-meta')?.textContent.trim() }; };
      const more = work.querySelector('details.t-more');
      return {
        about: { name: about.querySelector('h2.t-title')?.textContent, bot: !!about.querySelector('svg.t-bot[aria-hidden="true"]'), next: [...about.querySelectorAll('.t-next [data-term-run]')].map((b) => b.dataset.termRun) },
        featured: [...work.querySelectorAll(':scope > .t-work > li')].map(row),
        more: { open: more?.open, label: more?.querySelector('summary')?.innerText.trim(), rows: [...(more?.querySelectorAll('.t-work > li') ?? [])].map(row) },
        resume: [...resume.querySelectorAll('a[download]')].map((a) => [a.getAttribute('href'), a.getAttribute('download')]),
        sections: [...resume.querySelectorAll('.t-section')].map((h) => h.textContent),
        folded: [...resume.querySelectorAll('details')].map((d) => d.open),
        contact: [...contact.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      };
    });
    const rows = [...content.featured, ...content.more.rows];
    const linked = rows.length === 11 && rows.every((w) => /^work [\w-]+$/.test(w.run) && w.href === `/?computer=work/${w.run.slice(5)}` && w.name && w.line && w.meta);
    ok('commands: about is my name beside the pixel robot (decoration), with work, resume and contact to run next', content.about.name === 'Donald Heddesheimer' && content.about.bot && content.about.next.join(',') === 'work,resume,contact', content.about);
    ok('commands: work lists the 2 featured projects, the other 9 folded behind "Show all 11 projects"; each row its name (work <id>, linking to /?computer=work/<id>), a line and its facts', content.featured.length === 2 && content.more.open === false && /Show all 11 projects/.test(content.more.label) && content.more.rows.length === 9 && linked, { featured: content.featured.map((w) => w.run), more: content.more.rows.length, label: content.more.label });
    ok('commands: resume the PDF, then Experience, Education, Skills, each role\'s points and the coursework folded; contact email, GitHub, LinkedIn', content.resume.length === 1 && content.resume[0][0] === '/resume.pdf' && content.sections.join(',') === 'Experience,Education,Skills' && content.folded.length >= 2 && content.folded.every((o) => !o) && content.contact.join(' ') === `mailto:${EMAIL} https://github.com/donaldheddesheimer https://www.linkedin.com/in/donaldheddesheimer/`, { resume: content.resume, sections: content.sections, folded: content.folded, contact: content.contact });

    // A project, typed: shown in the terminal (no frame), the address, the prompt and the title its own.
    await type(p, 'work cucadence', 900);
    s = await snap(p);
    let v = await shown(p);
    const pj = await p.evaluate(() => {
      const out = document.querySelector('[data-term] [data-view="work/cucadence"] > .t-project') ?? document.querySelector('[data-term] [data-view="work/cucadence"]');
      const t = document.querySelector('[data-term]');
      return {
        id: out?.dataset.project,
        name: out?.querySelector('h2.t-title')?.textContent.trim(),
        purpose: !!out.querySelector('.t-purpose')?.textContent.trim(),
        meta: out.querySelector('.t-head .t-sub')?.textContent.trim(),
        outcome: out.querySelector(':scope > .t-outcome')?.textContent.trim(),
        parts: [...out.querySelectorAll(':scope > .t-part > .t-label')].map((h) => h.textContent),
        actions: [...out.querySelectorAll('.t-actions a')].map((a) => [a.target, a.rel]),
        sections: [...out.querySelectorAll('.t-md details.t-sec [data-anchor]')].map((h) => h.dataset.anchor),
        open: out.querySelectorAll('details[open]').length,
        folds: out.querySelectorAll('details').length,
        ids: out.querySelectorAll('.t-md [id]').length,
        code: out.querySelectorAll('pre.t-code').length,
        numbers: !!out.querySelector('.t-detail > details.t-sec .t-kv'),
        related: [...out.querySelectorAll(':scope > .t-links a.t-cmd')].map((a) => a.dataset.termRun),
        frames: document.querySelectorAll('iframe').length,
        sideways: t.scrollWidth - t.clientWidth,
      };
    });
    ok('commands: work cucadence shows the project, announced, the prompt ready again; the address /?computer=work/cucadence, the prompt ~/work/cucadence, the title its own', s.view === 'work/cucadence' && s.status === 'cuCadence.' && s.focus === 'input' && s.value === '' && s.at === '/?computer=work/cucadence' && s.ps1 === 'donald@lab:~/work/cucadence$' && s.title === `cuCadence · ${TERM_TITLE}`, { view: s.view, status: s.status, focus: s.focus, at: s.at, ps1: s.ps1, title: s.title });
    ok('commands: work cucadence shown from its start, the prompt at the foot', v.fromTop && v.prompt && v.top === 0, v);
    ok('commands: the project opens on its brief (name, what it does, its facts, its result, my part and the hard part, source), the write-up\'s sections, figures and numbers folded; related commands; no frame, nothing sideways', pj.id === 'cucadence' && pj.name === 'cuCadence' && pj.purpose && pj.meta.includes(' · ') && !!pj.outcome && pj.parts.join(',') === 'My part,The hard part' && pj.actions.length >= 1 && pj.actions.every(([t, r]) => t === '_blank' && /noopener/.test(r)) && pj.sections.includes('how-it-works') && pj.folds >= 4 && pj.open === 0 && pj.ids === 0 && pj.code >= 1 && pj.numbers && pj.related.length >= 1 && pj.related.every((r) => /^work [\w-]+$/.test(r)) && pj.frames === 0 && pj.sideways <= 0, pj);
    await shot(p, 'cmd-work-cucadence-1440x900');
    // Again, mixed case and spaces: the same view, left be.
    await type(p, 'WORK  CuCadence', 900);
    s = await snap(p);
    ok('commands: "WORK  CuCadence" (case, spaces) is the view already shown: left be, not made again, the address the same', s.view === 'work/cucadence' && unique(s) && s.at === '/?computer=work/cucadence' && s.recall.at(-1) === 'WORK  CuCadence', { view: s.view, views: s.views, at: s.at });
    // Unknown: a line over the prompt says so, and how to list them; the view and the address stay.
    await type(p, 'work nope', 700);
    s = await snap(p);
    const miss = await p.evaluate(() => { const n = document.querySelector('[data-term-note]'); return { run: n.querySelector('[data-term-run]')?.dataset.termRun, guess: !n.querySelector('[data-term-guess]').hidden }; });
    const NO = 'No project called nope. Run work to list them.';
    ok('commands: work nope, said over the prompt: no such project, run work (a command), announced; no guess; the view and the address as they were', s.note === NO && miss.run === 'work' && !miss.guess && s.status === NO && s.view === 'work/cucadence' && s.at === '/?computer=work/cucadence' && unique(s), { note: s.note, miss, status: s.status, view: s.view, at: s.at });
    await shot(p, 'cmd-mistake-1440x900');
    await type(p, 'work flux', 700);
    s = await snap(p);
    const guess = await p.evaluate(() => [...document.querySelectorAll('[data-term-note] [data-term-guess] [data-term-run]')].map((a) => [a.dataset.termRun, a.getAttribute('href')]));
    ok('commands: work flux guesses work fluxion (a command to run), over the prompt', /Did you mean work fluxion\?$/.test(s.note) && guess.length === 1 && guess[0][0] === 'work fluxion' && guess[0][1] === '/?computer=work/fluxion', { note: s.note, guess });
    await clickRun(p, 'work fluxion');
    await printed(p, 'fluxion');
    await sleep(500);
    s = await snap(p);
    ok('commands: the guess clicked shows fluxion; the line over the prompt gone; focus in the prompt', s.view === 'work/fluxion' && s.note === null && s.focus === 'input' && s.status === 'Fluxion.', { view: s.view, note: s.note, focus: s.focus });

    // Unusual input.
    await type(p, '  WoRk  ');
    s = await snap(p);
    ok('input: "  WoRk  " (mixed case, spaces) shows work; the address the terminal\'s again', s.view === 'work' && s.at === '/?computer' && s.title === TERM_TITLE, { view: s.view, at: s.at, title: s.title });
    await type(p, 'sudo rm -rf /');
    s = await snap(p);
    ok('input: an unknown command says exactly the not-found line over the prompt, help to run; the view stays', s.note === NOT_FOUND('sudo rm -rf /') && s.status === s.note && s.view === 'work' && (await p.locator('[data-term-note] [data-term-run="help"]').count()) === 1, { note: s.note, status: s.status, view: s.view });
    const n0 = s.recall.length;
    await type(p, '');
    await type(p, '    ');
    s = await snap(p);
    ok('input: an empty line, and one of spaces, change nothing (no view, nothing recalled), only clearing the line over the prompt', s.view === 'work' && s.views.join(',') === ',about,work,resume,contact,work/cucadence,work/fluxion' && s.recall.length === n0 && s.note === null, { view: s.view, views: s.views, recall: s.recall.length, was: n0, note: s.note });
    await type(p, '<img src=x onerror="window.__owned=1"><b>bold</b>');
    s = await snap(p);
    const inj = await p.evaluate(() => ({ owned: window.__owned ?? null, els: document.querySelectorAll('[data-term-note] img, [data-term-note] b, [data-term] [data-view] img[src="x"]').length }));
    ok('input: markup typed is said back as text, never parsed or run', inj.owned === null && inj.els === 0 && s.note === NOT_FOUND('<img src=x onerror="window.__owned=1"><b>bold</b>'), { ...inj, note: s.note });
    await p.keyboard.type('x'.repeat(260));
    const long = await p.evaluate(() => { const t = document.querySelector('[data-term]'); const i = t.querySelector('[data-term-input]'); const c = t.querySelector('[data-term-cursor]').getBoundingClientRect(); const f = i.getBoundingClientRect(); return { len: i.value.length, sideways: t.scrollWidth - t.clientWidth, cursorIn: c.left >= f.left - 1 && c.right <= f.right + 1 }; });
    ok('input: a very long line stops at 200 characters, the terminal never scrolls sideways, the cursor stays in the field', long.len === 200 && long.sideways <= 0 && long.cursorIn, long);
    await p.keyboard.press('Enter');
    await sleep(500);
    const wrap = await p.evaluate(() => { const t = document.querySelector('[data-term]'); const n = t.querySelector('[data-term-note]').getBoundingClientRect(); return { sideways: t.scrollWidth - t.clientWidth, noteH: Math.round(n.height) }; });
    ok('input: run, the long line wraps in the line over the prompt (no sideways scroll)', wrap.sideways <= 0 && wrap.noteH > 0, wrap);
    // Repeated and rapid.
    const n1 = (await snap(p)).recall.length;
    for (let i = 0; i < 3; i++) { await p.keyboard.type('help'); await p.keyboard.press('Enter'); }
    await p.keyboard.type('about'); await p.keyboard.press('Enter');
    await p.keyboard.type('contact'); await p.keyboard.press('Enter');
    await sleep(900);
    s = await snap(p);
    ok('input: repeated and rapid commands each run once, in order, ending on contact, each view made once', s.recall.slice(n1).join(',') === 'help,help,help,about,contact' && s.view === 'contact' && s.status === want.contact && unique(s), { recall: s.recall.slice(n1), view: s.view, views: s.views });
    // Up and Down: earlier commands, the line being typed kept.
    await p.keyboard.type('draft');
    const rec = [];
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown']) { await p.keyboard.press(k); rec.push(await p.evaluate(() => document.querySelector('[data-term-input]').value)); }
    ok('input: Up and Down recall earlier commands (repeats once), and Down again gives back the line being typed', rec.join('|') === 'contact|about|help|about|contact|draft', rec);
    await p.keyboard.press('Control+a');
    await p.keyboard.press('Backspace');
    const sv = s.saved;
    ok(`input: the session keeps (${STORE}) what was typed (no blank lines), the view being read, each view's place, and that the startup has played`, sv?.v === 2 && sv.boot === true && sv.view === 'contact' && sv.recall.at(-1) === 'contact' && sv.recall.every((x) => x.trim()) && typeof sv.views === 'object' && 'about' in sv.views, { v: sv?.v, boot: sv?.boot, view: sv?.view, n: sv?.recall.length, views: Object.keys(sv?.views ?? {}) });
    const ids = await p.evaluate(() => { const all = [...document.querySelectorAll('[id]')].map((e) => e.id); return all.filter((x, i) => all.indexOf(x) !== i); });
    ok('input: no id repeats in the page, however many commands have run', ids.length === 0, ids);
  });

  // 3. Tab: completes what's typed (a command, a project's id after `work `), never runs it; where there's
  //    nothing (more) to complete, Tab isn't taken and the focus moves on out of the field.
  await group('complete', async () => {
    const p = await fresh();
    await booted(p);
    const st = () => p.evaluate(() => { const t = document.querySelector('[data-term]'); const i = t.querySelector('[data-term-input]'); const m = t.querySelector('[data-term-matches]'); return { v: i.value, focus: document.activeElement === i, list: m.hidden ? null : m.textContent, status: t.querySelector('[data-term-status]').textContent, view: t.querySelector('[data-view]:not([hidden])').dataset.view }; });
    const reset = async () => { await p.focus('[data-term-input]'); await p.fill('[data-term-input]', ''); };
    await p.keyboard.type('wo');
    await p.keyboard.press('Tab');
    await sleep(120);
    let s = await st();
    ok('complete: wo, Tab: "work " (a space for its id), the focus kept, nothing run', s.v === 'work ' && s.focus && s.view === '', s);
    await p.keyboard.type('cu');
    await p.keyboard.press('Tab');
    await sleep(120);
    s = await st();
    ok('complete: work cu, Tab: work cucadence, announced, nothing run', s.v === 'work cucadence' && s.focus && s.view === '' && s.status === 'work cucadence', s);
    await p.keyboard.press('Tab');
    s = await st();
    ok('complete: Tab again, nothing more to complete: the focus leaves the field (Tab isn\'t trapped), what was typed kept', !s.focus && s.v === 'work cucadence', s);
    await reset();
    await p.keyboard.type('work s');
    await p.keyboard.press('Tab');
    await sleep(120);
    s = await st();
    ok('complete: work s, Tab: three ids share it, listed over the prompt and announced', s.list === 'skyblock-bazaar  smart-bin  swerve-drive' && s.focus && /^3 matches/.test(s.status), s);
    await p.keyboard.press('Tab');
    s = await st();
    ok('complete: Tab again with the list up: the focus moves on, the list gone', !s.focus && s.list === null && s.v === 'work s', s);
    await reset();
    await p.keyboard.type('ab');
    await p.keyboard.press('Tab');
    await sleep(120);
    s = await st();
    ok('complete: ab, Tab: about, not run', s.v === 'about' && s.view === '', s);
    await p.keyboard.press('Enter');
    await sleep(600);
    s = await st();
    ok('complete: then Enter runs about, once', s.view === 'about' && s.v === '', s);
    for (const [txt, why] of [['', 'nothing typed'], ['ex', 'exit (not listed)'], ['zz', 'no match']]) {
      await reset();
      if (txt) await p.keyboard.type(txt);
      await p.keyboard.press('Tab');
      s = await st();
      ok(`complete: ${why}, Tab moves on out of the field`, !s.focus && s.v === txt, s);
    }
  });

  // 4. Commands tapped or clicked: once, even on a double click; the focus to the prompt (a mouse, the
  //    keyboard) or to the view's title (a touch screen, below).
  await group('tap', async () => {
    const p = await fresh();
    await booted(p);
    await clickRun(p, 'help');
    await sleep(700);
    let s = await snap(p);
    ok('tap: help, clicked in the startup\'s line, runs once; focus in the prompt; announced', s.view === 'help' && s.recall.join(',') === 'help' && s.focus === 'input' && s.status.startsWith('Commands:'), { view: s.view, recall: s.recall, focus: s.focus, status: s.status });
    await clickRun(p, 'about', 'dbl');
    await sleep(700);
    s = await snap(p);
    // (Its second press lands on about, where help's line was: it selects nothing there.)
    const picked = await p.evaluate(() => document.getSelection().toString());
    ok('tap: a double click on about (in help) runs it once; nothing selected; focus in the prompt', s.view === 'about' && s.recall.join(',') === 'help,about' && s.focus === 'input' && picked === '', { view: s.view, recall: s.recall, focus: s.focus, picked });
    // From the keyboard: a command's button, Enter.
    await runLoc(p, 'contact').focus();
    await p.keyboard.press('Enter');
    await sleep(700);
    s = await snap(p);
    ok('tap: Enter on a command\'s button (about\'s contact) runs it once; focus back in the prompt', s.view === 'contact' && s.recall.join(',') === 'help,about,contact' && s.focus === 'input', { view: s.view, recall: s.recall, focus: s.focus });
    // A letter typed with the focus on a link goes to the prompt.
    await p.focus(`${V} [data-term-email]`);
    await p.keyboard.type('he');
    s = await snap(p);
    ok('tap: typing with the focus on a link in the view goes to the prompt', s.focus === 'input' && s.value === 'he', { focus: s.focus, value: s.value });
  });

  // 5. Scrolling: a long view scrolls inside the monitor, the room and the window don't; nothing pulls the
  //    view from what's being read; each view keeps its own place and what was unfolded in it.
  await group('scroll', async () => {
    const p = await fresh();
    await booted(p);
    await type(p, 'work cucadence', 900);
    let s = await snap(p);
    let v = await shown(p);
    ok('scroll: a project, longer than the screen, is shown from its start, the prompt at the screen\'s foot', v.max > 0 && v.fromTop && v.prompt && v.top === 0 && s.winY === 0, { ...v, winY: s.winY });
    const az0 = await p.evaluate(() => window.__lab.stats().lookAz);
    const tb = await box(p, '[data-term]');
    await p.mouse.move(tb.x + tb.w / 2, tb.y + tb.h / 2);
    await p.mouse.wheel(0, 500);
    await sleep(600);
    const s2 = await snap(p);
    const az1 = await p.evaluate(() => window.__lab.stats().lookAz);
    ok('scroll: the wheel scrolls the terminal, not the window or the room', s2.top > s.top && s2.winY === 0 && Math.abs(az1 - az0) < 1e-4, { before: s.top, after: s2.top, winY: s2.winY, lookAz: [az0, az1] });
    await shot(p, 'scroll-project-1440x900');
    await sleep(1500);
    const y0 = (await snap(p)).top;
    await p.keyboard.type('abc');
    await sleep(300);
    const y1 = (await snap(p)).top;
    ok('scroll: left where it\'s being read, it stays (and typing at the prompt doesn\'t move it)', y1 === y0 && y0 > 0, { reading: y0, after: y1 });
    for (let i = 0; i < 3; i++) await p.keyboard.press('Backspace');
    await sleep(300);
    await type(p, 'resume', 900);
    v = await shown(p);
    ok('scroll: resume, new, from its start', v.fromTop && v.top === 0 && v.prompt, v);
    await p.evaluate(() => document.querySelector('[data-term]').scrollTo({ top: 200, behavior: 'instant' }));
    await sleep(400);
    const yr = (await snap(p)).top;
    await type(p, 'about', 900);
    v = await shown(p);
    ok('scroll: about, which fits, whole, the prompt at the foot under it', v.max === 0 && v.fromTop && v.prompt && v.foot <= 24, v);
    await type(p, 'work cucadence', 900);
    s = await snap(p);
    ok('scroll: the project again: where it was left (not its start), the address its own', s.view === 'work/cucadence' && Math.abs(s.top - y0) <= 2 && s.at === '/?computer=work/cucadence', { top: s.top, was: y0 });
    await type(p, 'resume', 900);
    s = await snap(p);
    ok('scroll: resume again: where it was left', s.view === 'resume' && Math.abs(s.top - yr) <= 2, { top: s.top, was: yr });
    // What was unfolded in a view is kept with it: work's full list, a role's points.
    await type(p, 'work', 900);
    await unfold(p, 'details.t-more');
    await type(p, 'resume', 700);
    await unfold(p, '.t-cv details.t-sec');
    await type(p, 'about', 700);
    await type(p, 'work', 700);
    const w = await p.evaluate(() => document.querySelector('[data-term] [data-view="work"] details.t-more').open);
    await type(p, 'resume', 700);
    const r = await p.evaluate(() => [...document.querySelectorAll('[data-term] [data-view="resume"] details')].map((d) => d.open));
    ok('scroll: what was unfolded in a view (work\'s full list, a role\'s points) is as it was, coming back to it', w && r[0] === true && r.slice(1).every((o) => !o), { work: w, resume: r });
    const sv = (await snap(p)).saved;
    ok('scroll: each view\'s place and unfolded disclosures kept in the session', sv.views.work?.open?.join() === '0' && sv.views.resume?.open?.join() === '0' && sv.views['work/cucadence']?.y > 0, sv.views);
  });

  // 6. Links: a project's name in work's list, clicked, shows it here (with a modifier, the lab showing it
  //    opens in a new tab instead); a related project's, from inside it, and Back; a cover and a section
  //    unfolded, a code block scrolled within itself; source in a new tab; the résumé PDF; email, GitHub,
  //    LinkedIn; copy.
  await group('links', async () => {
    // (The test origin isn't a secure context, so it has no clipboard: one is stubbed in, then refused.)
    const p = await fresh({ init: () => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => void (window.__copied = t) } }) });
    await booted(p);
    await type(p, 'work', 900);
    const cmds = await p.evaluate(() => [...document.querySelectorAll('[data-term] [data-view="work"] a[data-term-run]')].map((a) => ({ run: a.dataset.termRun, href: a.getAttribute('href'), target: a.target })));
    ok('links: each project\'s name links to the lab showing it (/?computer=work/<id>), in this tab', cmds.length === 11 && cmds.every((l) => l.href === `/?computer=${l.run.replace(' ', '/')}` && !l.target), cmds.length);
    // A project's name with a modifier: the lab showing it, in a new tab; nothing runs here.
    const r0 = (await snap(p)).recall.length;
    const cmd = p.locator(`${V} .t-work a.t-open`).nth(1);
    const id = (await cmd.getAttribute('data-term-run')).slice(5);
    await cmd.scrollIntoViewIfNeeded();
    const [nt] = await Promise.all([p.context().waitForEvent('page'), cmd.click({ modifiers: ['ControlOrMeta'] })]);
    await nt.waitForLoadState();
    let s = await snap(p);
    // (A tab the browser opens itself, for a modified click, isn't routed to dist/ by Playwright: its first
    // load fails. What it asked for is in its history; loaded again, now routed, it shows the project.)
    const asked = (await (await p.context().newCDPSession(nt)).send('Page.getNavigationHistory')).entries[0]?.url;
    await nt.goto(asked);
    const opened = await nt.waitForFunction((i) => document.documentElement.dataset.pc === 'read' && document.querySelector('[data-term] [data-view]:not([hidden])')?.dataset.view === `work/${i}`, id, { timeout: 15000 }).then(() => true, () => false);
    ok('links: a project\'s name with a modifier opens /?computer=work/<id> in a new tab (the lab, showing it); nothing runs here', asked === `${base}/?computer=work/${id}` && opened && s.recall.length === r0 && s.view === 'work' && s.at === '/?computer', { asked, opened, view: s.view, at: s.at });
    await nt.close();
    // Clicked: shown here, from its start; the address and the title the project's; focus in the prompt.
    await cmd.click();
    await printed(p, id);
    await sleep(700);
    s = await snap(p);
    let v = await shown(p);
    const name = await p.evaluate(() => document.querySelector('[data-term] [data-view]:not([hidden]) h2.t-title').textContent.trim());
    const frames = await p.evaluate(() => document.querySelectorAll('iframe').length);
    ok('links: a project\'s name clicked shows it in the terminal (from its start), address /?computer=work/<id>, the title its own, focus in the prompt, no frame', s.view === `work/${id}` && s.recall.at(-1) === `work ${id}` && s.status === `${name}.` && s.at === `/?computer=work/${id}` && s.title === `${name} · ${TERM_TITLE}` && s.focus === 'input' && v.fromTop && v.prompt && frames === 0, { view: s.view, at: s.at, title: s.title, focus: s.focus, v, frames });
    await shot(p, 'project-1440x900');
    // Its source: a new tab; the computer stays as it was.
    const ext = await p.evaluate(() => [...document.querySelectorAll('[data-term] [data-view]:not([hidden]) .t-actions a')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel })));
    ok('links: source (and demo, where there is one) open in a new tab (noopener), to https addresses', ext.length > 0 && ext.every((l) => l.target === '_blank' && /noopener/.test(l.rel) && /^https:\/\//.test(l.href)), ext);
    const src = p.locator(`${V} .t-actions a[target="_blank"]`).first();
    const [tab] = await Promise.all([p.context().waitForEvent('page'), src.click()]);
    await tab.waitForLoadState();
    ok('links: a source link opens its address in a new tab, the computer stays open on the project', /^https:\/\//.test(tab.url()) && (await p.evaluate(() => document.documentElement.dataset.pc)) === 'read' && (await snap(p)).view === `work/${id}`, tab.url());
    await tab.close();
    // A related project's command, from inside it: shown in its place; Back to the first, where it was,
    // focus back on the command that was clicked (no ring: a mouse).
    const rel = p.locator(`${V} > .t-links a.t-cmd`).first();
    const rid = (await rel.getAttribute('data-term-run')).slice(5);
    await rel.scrollIntoViewIfNeeded();
    await p.evaluate(() => document.addEventListener('click', () => (window.__y = Math.round(document.querySelector('[data-term]').scrollTop)), { capture: true, once: true }));
    await rel.click();
    const ry = await p.evaluate(() => window.__y);
    await printed(p, rid);
    await sleep(500);
    s = await snap(p);
    ok('links: a related project\'s command shows that one in its place (its address, from its start)', s.view === `work/${rid}` && s.at === `/?computer=work/${rid}` && s.top === 0, { view: s.view, at: s.at, top: s.top });
    await p.goBack();
    await p.waitForFunction((i) => location.search === `?computer=work/${i}`, id);
    await sleep(500);
    s = await snap(p);
    ok('links: Back goes to the first project, where it was, nothing made again, focus on the related command (no ring)', s.view === `work/${id}` && unique(s) && Math.abs(s.top - ry) <= 2 && s.focus === `a:work ${rid}` && !s.ring && s.title === `${name} · ${TERM_TITLE}`, { view: s.view, top: s.top, was: ry, focus: s.focus, ring: s.ring, title: s.title });
    // A cover and a section, unfolded: the picture loads; a code block scrolls within itself, the
    // terminal never sideways.
    await p.focus('[data-term-input]');
    await type(p, 'work cucadence', 900);
    await unfold(p, '.t-detail > details.t-fig');
    await p.waitForFunction(() => { const i = document.querySelector('[data-term] [data-view]:not([hidden]) details.t-fig[open] img'); return i?.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
    const img = await p.evaluate(() => { const d = document.querySelector('[data-term] [data-view]:not([hidden]) details.t-fig'); const i = d.querySelector('img'); const t = document.querySelector('[data-term]'); return { open: d.open, loaded: !!i && i.complete && i.naturalWidth > 0, alt: i?.alt, w: Math.round(i?.getBoundingClientRect().width ?? 0), sideways: t.scrollWidth - t.clientWidth }; });
    ok('links: a cover folded behind its line unfolds on a click, the picture loaded, described, in the terminal\'s width', img.open && img.loaded && img.alt && img.w > 0 && img.sideways <= 0, img);
    await unfold(p, 'details.t-sec:has(pre.t-code)');
    const code = await p.evaluate(() => {
      const d = document.querySelector('[data-term] [data-view]:not([hidden]) details.t-sec:has(pre.t-code)');
      const pre = d.querySelector('pre.t-code');
      const t = document.querySelector('[data-term]');
      const wide = pre.scrollWidth > pre.clientWidth;
      pre.scrollLeft = 80;
      return { open: d.open, heading: d.querySelector('summary .t-section')?.textContent, overflow: getComputedStyle(pre).overflowX, focusable: pre.tabIndex === 0, wide, moved: pre.scrollLeft, sideways: t.scrollWidth - t.clientWidth };
    });
    ok('links: a write-up section unfolds on its line; its code block scrolls sideways within itself (focusable, for the keyboard), the terminal never does', code.open && code.overflow === 'auto' && code.focusable && (!code.wide || code.moved > 0) && code.sideways <= 0, code);
    await shot(p, 'project-unfolded-1440x900');
    // An empty line (Enter, nothing typed) isn't a command: the address and the title stay the project's.
    const was = await p.evaluate(() => ({ at: location.search, title: document.title }));
    await p.focus('[data-term-input]');
    await p.keyboard.press('Enter');
    await sleep(300);
    const now = await p.evaluate(() => ({ at: location.search, title: document.title }));
    ok('links: Enter on an empty prompt while reading a project leaves its address and title be', was.at === '?computer=work/cucadence' && now.at === was.at && now.title === was.title, { was, now });
    // A video folded away: its poster not asked for as its section unfolds, only once its figure does.
    const fetched = [];
    p.on('request', (r) => fetched.push(new URL(r.url()).pathname));
    await type(p, 'work useless-machine', 900);
    await unfold(p, '.t-md details.t-sec:has(video)');
    await sleep(400);
    const early = fetched.filter((u) => u.startsWith('/projects/useless-machine'));
    await unfold(p, 'details.t-sec[open] details.t-fig:has(video)');
    await sleep(800);
    const poster = await p.evaluate(() => document.querySelector('[data-term] [data-view]:not([hidden]) details.t-fig[open] video')?.getAttribute('poster'));
    ok('links: a folded video\'s poster loads only once its own figure is opened (not as its section unfolds)', !early.length && poster === '/projects/useless-machine.jpg' && fetched.includes(poster), { early, poster, fetched: fetched.filter((u) => u.startsWith('/projects/')) });
    // The résumé's PDF, and the contact links.
    await p.focus('[data-term-input]');
    await type(p, 'resume', 900);
    const pdf = await p.evaluate(async () => {
      const a = document.querySelector('[data-term] [data-view]:not([hidden]) a[download]');
      const r = await fetch(a.href);
      const buf = await r.arrayBuffer();
      return { href: a.getAttribute('href'), name: a.getAttribute('download'), text: a.textContent.trim(), status: r.status, bytes: buf.byteLength, magic: new TextDecoder().decode(buf.slice(0, 5)) };
    });
    ok('links: the résumé\'s PDF, its own action, downloads as Donald-Heddesheimer-Resume.pdf (a real PDF in the build)', pdf.href === '/resume.pdf' && pdf.name === 'Donald-Heddesheimer-Resume.pdf' && /Download the PDF/.test(pdf.text) && pdf.status === 200 && pdf.magic === '%PDF-' && pdf.bytes > 10000, pdf);
    await type(p, 'contact', 900);
    const ct = await p.evaluate(() => [...document.querySelectorAll('[data-term] [data-view]:not([hidden]) a')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, label: a.getAttribute('aria-label') })));
    ok('links: email is a mailto: link; GitHub and LinkedIn open in a new tab (noopener), labelled', ct[0].href === `mailto:${EMAIL}` && ct.slice(1).every((l) => l.target === '_blank' && /noopener/.test(l.rel) && /opens in a new tab/.test(l.label)) && ct.length === 3, ct);
    const [li] = await Promise.all([p.context().waitForEvent('page'), p.locator(`${V} a[href*="linkedin"]`).click()]);
    ok('links: LinkedIn opens in a new tab', li.url() === 'https://www.linkedin.com/in/donaldheddesheimer/', li.url());
    await li.close();
    const copy = p.locator(`${V} [data-term-copy]`);
    await copy.click();
    await sleep(200);
    const cp = await p.evaluate(() => ({ clip: window.__copied, label: document.querySelector('[data-term] [data-view]:not([hidden]) [data-term-copy]').textContent, status: document.querySelector('[data-term-status]').textContent }));
    ok('links: copy puts the address on the clipboard, says so', cp.clip === EMAIL && cp.label === 'copied' && cp.status === 'Copied.', cp);
    await sleep(1800);
    await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } }));
    await copy.click();
    await sleep(200);
    const sel = await p.evaluate(() => ({ selected: document.getSelection().toString().trim(), label: document.querySelector('[data-term] [data-view]:not([hidden]) [data-term-copy]').textContent, status: document.querySelector('[data-term-status]').textContent }));
    ok('links: copy refused, the address is selected for copying by hand', sel.selected === EMAIL && sel.label === 'selected' && sel.status === 'Selected, to copy.', sel);
  });

  // 7. Leaving and coming back: Escape, exit, and on a touch screen the power button; the view, its place
  //    and what's unfolded in it, and the finished startup kept, and through a reload.
  await group('leave', async () => {
    const p = await fresh();
    await booted(p);
    await type(p, 'help');
    await type(p, 'work cucadence', 900);
    await p.evaluate(() => document.querySelector('[data-term]').scrollTo({ top: 420, behavior: 'instant' }));
    await sleep(600);
    const before = await snap(p);
    await p.keyboard.press('Escape');
    await closed(p);
    await sleep(300);
    let s = await snap(p);
    ok('leave: Escape leaves for the opening (the address it was opened from), focus on the monitor\'s link, ringed', s.at === '/?probe' && s.focus === 'monitor' && s.ring && s.title !== TERM_TITLE, { at: s.at, focus: s.focus, ring: s.ring });
    await watch(p);
    await enter(p);
    await reading(p);
    await sleep(900);
    s = await snap(p);
    ok('leave: back in, the same view where it was read (its address again), nothing made twice, no startup again', s.view === before.view && Math.abs(s.top - before.top) <= 2 && unique(s) && s.at === '/?computer=work/cucadence' && !(await seen(p)).boot.includes('play'), { view: s.view, top: s.top, was: before.top, at: s.at });
    // With a mouse and a keyboard, Esc is the way out: no power button on the bezel.
    const none = await p.evaluate(() => { const e = document.querySelector('[data-pc-exit]'); return { display: getComputedStyle(e).display, shown: e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) }; });
    ok('leave: with a mouse, no power button (Esc leaves)', none.display === 'none' && !none.shown, none);
    await p.focus('[data-term-input]');
    await type(p, 'EXIT', 0);
    await closed(p);
    s = await snap(p);
    ok('leave: exit (a hidden alias, any case) leaves too, the view left as it was', s.at === '/?probe' && s.focus === 'monitor' && s.recall.at(-1) === 'EXIT' && s.saved.view === 'work/cucadence', { at: s.at, recall: s.recall.at(-1), view: s.saved.view });
    // A reload: at once (no flight), as it was.
    await enter(p);
    await reading(p);
    await type(p, 'resume', 900);
    await p.evaluate(() => document.querySelector('[data-term]').scrollTo({ top: 150, behavior: 'instant' }));
    await sleep(600);
    const was = await snap(p);
    await p.reload();
    await reading(p);
    await sleep(900);
    s = await snap(p);
    ok('leave: a reload opens the terminal at once on the view being read, where it was, the startup still done, only that view made', s.at === '/?computer' && s.boot === 'done' && s.view === 'resume' && s.views.join(',') === ',resume' && Math.abs(s.top - was.top) <= 2 && s.recall.join() === was.recall.join(), { view: s.view, views: s.views, top: s.top, was: was.top, boot: s.boot });
    // A project's figure and section unfolded and read past, then a reload: unfolded again, the same line
    // in view.
    await p.focus('[data-term-input]');
    await type(p, 'work cucadence', 900);
    await unfold(p, '.t-detail > details.t-fig');
    await unfold(p, 'details.t-sec:has(pre.t-code)');
    await p.evaluate(() => { const t = document.querySelector('[data-term]'); const d = t.querySelector('[data-view]:not([hidden]) details.t-sec[open]'); t.scrollTo({ top: d.offsetTop + 40, behavior: 'instant' }); });
    await sleep(500);
    const line = () => p.evaluate(() => {
      const t = document.querySelector('[data-term]');
      const e = t.querySelector('[data-view]:not([hidden])');
      const h = [...e.querySelectorAll('p, pre, .t-section')].find((x) => x.getBoundingClientRect().top > t.getBoundingClientRect().top);
      return { open: [...e.querySelectorAll('details')].flatMap((d, i) => (d.open ? [i] : [])).join(), line: h?.textContent.trim().slice(0, 40), at: Math.round(h?.getBoundingClientRect().top - t.getBoundingClientRect().top) };
    });
    const pre = await line();
    await p.reload();
    await reading(p);
    await sleep(900);
    const post = await line();
    ok('leave: a reload with a figure and a section unfolded unfolds them again, the same line where it was', pre.open.split(',').length === 2 && post.open === pre.open && post.line === pre.line && Math.abs(post.at - pre.at) <= 2, { pre, post });
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
  });

  // 8. The address: Back and Forward between views; old addresses open the terminal on their view.
  await group('history', async () => {
    const p = await page();
    await p.goto(base + '/');
    await drawn(p);
    await sleep(400);
    await enter(p);
    await reading(p);
    await booted(p);
    await type(p, 'work', 900);
    await unfold(p, 'details.t-more');
    const cmd = p.locator(`${V} details.t-more a.t-open`).last();
    const id = (await cmd.getAttribute('data-term-run')).slice(5);
    await cmd.scrollIntoViewIfNeeded();
    await p.evaluate(() => document.addEventListener('click', () => (window.__y = Math.round(document.querySelector('[data-term]').scrollTop)), { capture: true, once: true }));
    await cmd.click();
    await printed(p, id);
    await sleep(600);
    await p.evaluate(() => document.querySelector('[data-term]').scrollTo({ top: 300, behavior: 'instant' }));
    await sleep(500);
    await settled(p);
    const y0 = await p.evaluate(() => window.__y);
    const at = await snap(p);
    const steps = [at.at];
    await p.goBack();
    await p.waitForFunction(() => location.search === '?computer');
    await sleep(500);
    const back = await snap(p);
    steps.push(back.at);
    await p.goBack();
    await closed(p);
    steps.push(where(p));
    await p.goForward();
    await reading(p);
    await sleep(600);
    await settled(p);
    const fwd = await snap(p);
    steps.push(fwd.at);
    await p.goForward();
    await p.waitForFunction((i) => location.search === `?computer=work/${i}`, id);
    await sleep(600);
    await settled(p);
    const fwd2 = await snap(p);
    steps.push(fwd2.at);
    ok('history: a project, Back to the terminal, Back to the room, Forward to the terminal, Forward to the project', steps.join(' ') === `/?computer=work/${id} /?computer / /?computer /?computer=work/${id}` && at.top > 0, steps);
    ok('history: Back to the terminal: work, where it was read (its full list still unfolded), its title, focus on the project\'s name', back.view === 'work' && unique(back) && Math.abs(back.top - y0) <= 2 && back.title === TERM_TITLE && back.focus === `a:work ${id}` && (await p.evaluate(() => document.querySelector('[data-term] [data-view="work"] details.t-more').open)), { view: back.view, top: back.top, was: y0, title: back.title, focus: back.focus });
    ok('history: Forward, and Forward again: work, then the project, each where it was, nothing made again, its title', fwd.view === 'work' && fwd2.view === `work/${id}` && unique(fwd2) && Math.abs(fwd.top - y0) <= 2 && Math.abs(fwd2.top - at.top) <= 2 && fwd2.title === at.title && at.title !== TERM_TITLE, { views: [fwd.view, fwd2.view], tops: [fwd.top, y0, fwd2.top, at.top], title: fwd2.title });
    // An anchor edited into the address while reading (a fragment navigation: an entry of the browser's,
    // without the lab's state): nothing made again, and Escape below still leaves for the opening.
    await p.evaluate(() => (location.hash = 'approach'));
    await sleep(500);
    const hashed = await snap(p);
    ok('history: an anchor edited into a project\'s address changes nothing shown', hashed.view === `work/${id}` && unique(hashed) && where(p) === `/?computer=work/${id}#approach`, { view: hashed.view, at: where(p) });
    // Escape on a project's address leaves the computer at once (not Back through the projects).
    await p.keyboard.press('Escape');
    await closed(p);
    await sleep(300);
    const out = await snap(p);
    ok('history: Escape on a project leaves the computer at once, for the opening, focus on the monitor', out.at === '/' && out.focus === 'monitor' && out.pc === null, { at: out.at, focus: out.focus });

    // Addresses, old and new, each opened fresh: the terminal on that view (the startup's for the
    // terminal's own), and a reload doesn't run it again.
    const legacy = async (path, view, what = '/?computer') => {
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
        ok(`history: ${path} opens the terminal on ${view || 'the startup'} (address ${what})`, s.at === what && s.view === view && unique(s), { at: s.at, view: s.view, views: s.views });
        if (view) {
          await q.reload();
          await reading(q);
          await sleep(500);
          const r = await snap(q);
          ok(`history: ${path}, reloaded, the same view, nothing run again`, r.view === view && r.recall.length === s.recall.length, { view: r.view, recall: r.recall });
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
    await legacy('/computer/', '');
    await legacy(`/?computer=work/${id}`, `work/${id}`, `/?computer=work/${id}`);
    await legacy(`/computer/work/${id}/`, `work/${id}`, `/?computer=work/${id}`);
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
      ok('history: /computer/work/ (the old Work page) opens the terminal on work', (await snap(q)).view === 'work');
      // A project's address with a section: the lab shows it, that section unfolded, its heading in view.
      await q.goto(base + '/computer/work/fluxion/#approach');
      await q.waitForURL('**/?computer=work/fluxion#approach', { timeout: 8000 }).catch(() => {});
      await printed(q, 'fluxion');
      await sleep(600);
      const sec = await q.evaluate(() => {
        const t = document.querySelector('[data-term]');
        const tr = t.getBoundingClientRect();
        const fr = t.querySelector('[data-term-form]').getBoundingClientRect();
        const h = t.querySelector('[data-view]:not([hidden]) [data-anchor="approach"]');
        const r = h?.getBoundingClientRect();
        return { at: location.pathname + location.search + location.hash, heading: h?.textContent.trim(), open: !!h?.closest('details')?.open, others: t.querySelectorAll('[data-view]:not([hidden]) details[open]').length, inView: !!r && r.top >= tr.top - 1 && r.bottom <= fr.top + 1, y: Math.round(t.scrollTop), title: document.title };
      });
      ok('history: /computer/work/fluxion/#approach opens the lab on fluxion, its Approach unfolded (only that), the heading in view', sec.at === '/?computer=work/fluxion#approach' && sec.heading === 'Approach' && sec.open && sec.others === 1 && sec.inView && sec.y > 0 && sec.title === `Fluxion · ${TERM_TITLE}`, sec);
      await shot(q, 'deep-link-fluxion-approach-1440x900');
      // An old anchor followed on the opening.
      await q.goto(base + '/');
      await drawn(q);
      await q.evaluate(() => (location.hash = 'contact'));
      await reading(q);
      await sleep(600);
      const s = await snap(q);
      ok('history: #contact set on the opening opens the terminal on contact', s.at === '/?computer' && s.view === 'contact', { at: s.at, view: s.view });
      await q.context().close();
    }
  });

  // 9. The session as the first version kept it (lab:terminal: the transcript's commands) is read once,
  //    for what was typed and the last view it showed; a store that's been tampered with is checked,
  //    never trusted; nothing throws.
  await group('migrate', async () => {
    const seed = (key, value) => `(() => { try { if (sessionStorage.getItem(${JSON.stringify(key)}) == null && !sessionStorage.getItem('seeded')) { sessionStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}); sessionStorage.setItem('seeded', '1'); } } catch {} })()`;
    const OLD = JSON.stringify({ boot: true, log: ['help', 'about', 'work cucadence', 'sudo make coffee', 'work nope', '', '   '] });
    {
      const p = await page({ init: seed('lab:terminal', OLD) });
      await p.goto(base + '/?computer');
      await reading(p);
      await sleep(700);
      const s = await snap(p);
      const old = await p.evaluate(() => sessionStorage.getItem('lab:terminal'));
      ok('migrate: an old session (lab:terminal) opens on the last view it showed (work cucadence; the mistakes after it aren\'t views), the startup done, nothing replayed', s.view === 'work/cucadence' && s.views.join(',') === ',work/cucadence' && s.boot === 'done' && s.at === '/?computer=work/cucadence' && p.errors.length === 0, { view: s.view, views: s.views, boot: s.boot, at: s.at, errors: p.errors });
      ok('migrate: what it had typed comes back with Up (blank lines dropped); the new store written, the old left as it was', s.recall.join('|') === 'help|about|work cucadence|sudo make coffee|work nope' && s.saved.v === 2 && old === OLD, { recall: s.recall, v: s.saved.v, oldKept: old === OLD });
      await p.focus('[data-term-input]');
      await p.keyboard.press('ArrowUp');
      await p.keyboard.press('ArrowUp');
      const up = await p.evaluate(() => document.querySelector('[data-term-input]').value);
      await p.keyboard.press('Escape');
      await closed(p);
      await enter(p);
      await reading(p);
      await sleep(600);
      const again = await snap(p);
      ok('migrate: Up twice gives sudo make coffee; out and back in, the new store rules (the old isn\'t read again)', up === 'sudo make coffee' && again.view === 'work/cucadence' && again.recall.length === 5, { up, view: again.view, recall: again.recall.length });
      await p.context().close();
    }
    for (const [what, key, value, view] of [
      ['an old session with nothing typed', 'lab:terminal', JSON.stringify({ boot: true, log: [] }), ''],
      ['an old session that isn\'t JSON', 'lab:terminal', '{"log": [', ''],
      ['a store that isn\'t JSON', STORE, '{nope', ''],
      ['a store naming views there aren\'t, with bad places', STORE, JSON.stringify({ v: 2, boot: true, view: 'work/nope', recall: 'help', views: { 'work/nope': { y: 5 }, about: { y: -30, open: ['a', 1, -1] }, '../x': {} } }), ''],
      ['a store on a real view', STORE, JSON.stringify({ v: 2, boot: true, view: 'about', recall: ['about', 7, null], views: { about: { y: 1e9, open: [] } } }), 'about'],
    ]) {
      const p = await page({ init: seed(key, value) });
      await p.goto(base + '/?computer');
      await reading(p);
      await sleep(900);
      const s = await snap(p);
      const cleanViews = Object.keys(s.saved.views ?? {}).every((v) => v === '' || ['help', 'about', 'work', 'resume', 'contact'].includes(v) || /^work\/[\w-]+$/.test(v)) && !('work/nope' in (s.saved.views ?? {}));
      ok(`migrate: ${what}: opens on ${view || 'the startup'}, no error, the store rewritten clean`, s.view === view && p.errors.length === 0 && s.saved.v === 2 && Array.isArray(s.saved.recall) && s.saved.recall.every((x) => typeof x === 'string') && cleanViews && (s.saved.views?.about?.y ?? 0) >= 0, { view: s.view, errors: p.errors, saved: s.saved });
      await p.context().close();
    }
  });

  // 10. A phone: across the window, touch; the startup not covered by a keyboard; commands tapped, the
  //     focus to the view's title; a keyboard up (a stubbed visualViewport); the power button in the strip
  //     under the screen.
  await group('phone', async () => {
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
      ok(`phone ${tag}: help tapped runs once; focus to its title, not the prompt (no keyboard)`, s.view === 'help' && s.recall.join(',') === 'help' && s.focus === 'title:help', { view: s.view, recall: s.recall, focus: s.focus });
      await clickRun(p, 'work', 'tap');
      await sleep(900);
      s = await snap(p);
      let v = await shown(p);
      ok(`phone ${tag}: work tapped runs once, shown from its start, focus on its title`, s.view === 'work' && s.recall.join(',') === 'help,work' && s.focus === 'title:work' && v.fromTop && v.prompt && s.winY === 0, { view: s.view, focus: s.focus, v });
      await shot(p, `phone-work-${tag}`);
      // A project tapped in work's list: shown here, focus on its title (no keyboard); a swipe scrolls
      // the terminal, not the window; its code block, wider than the phone, scrolls sideways under a
      // finger, the terminal doesn't; Back to work's list.
      await clickRun(p, 'work cucadence', 'tap');
      await printed(p, 'cucadence');
      await sleep(900);
      s = await snap(p);
      ok(`phone ${tag}: cuCadence tapped shows it, from its start, focus on its title, the address its own`, s.view === 'work/cucadence' && s.focus === 'title:work/cucadence' && (await shown(p)).fromTop && s.at === '/?computer=work/cucadence' && s.winY === 0, { view: s.view, focus: s.focus, at: s.at });
      await shot(p, `phone-project-${tag}`);
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(w / 2), y: Math.round(h / 2), yDistance: -300, gestureSourceType: 'touch', speed: 1200 });
      await sleep(600);
      const s2 = await snap(p);
      ok(`phone ${tag}: a swipe scrolls the terminal, not the window`, s2.top > s.top && s2.winY === 0, { before: s.top, after: s2.top, winY: s2.winY });
      await unfold(p, 'details.t-sec:has(pre.t-code)', 'tap');
      const pre = p.locator(`${V} details.t-sec[open] pre.t-code`).first();
      await pre.scrollIntoViewIfNeeded();
      const pb = await pre.boundingBox();
      await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(pb.x + pb.width / 2), y: Math.round(pb.y + Math.min(pb.height / 2, 40)), xDistance: -160, gestureSourceType: 'touch', speed: 800 });
      await sleep(500);
      const cx = await p.evaluate(() => { const pr = document.querySelector('[data-term] [data-view]:not([hidden]) details.t-sec[open] pre.t-code'); const t = document.querySelector('[data-term]'); return { wide: pr.scrollWidth > pr.clientWidth, left: Math.round(pr.scrollLeft), sideways: t.scrollWidth - t.clientWidth, tLeft: t.scrollLeft, winX: scrollX }; });
      ok(`phone ${tag}: a section tapped open; its code block, wider than the phone, scrolls sideways under a finger; the terminal and the window don't`, cx.wide && cx.left > 0 && cx.sideways <= 0 && cx.tLeft === 0 && cx.winX === 0, cx);
      await shot(p, `phone-project-open-${tag}`);
      await p.goBack();
      await p.waitForFunction(() => location.search === '?computer');
      await sleep(500);
      s = await snap(p);
      ok(`phone ${tag}: Back goes to work's list where it was read, nothing made again`, s.view === 'work' && unique(s) && s.top === 0, { view: s.view, top: s.top });
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
      ok(`phone ${tag}: typed with the keyboard up, about runs, the prompt still above the keyboard`, s.view === 'about' && s.focus === 'input' && fk2.b <= h - kb + 1, { view: s.view, prompt: fk2 });
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
  });

  // 11. Reduced motion, and Motion off: no flight, no startup animation, no view animation, a steady cursor.
  await group('motion', async () => {
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
      ok(`${how}: in without the flight, the startup all at once, no view animation, a steady cursor`, !sn.pc.includes('fly') && !sn.boot.includes('play') && n === 0 && cur === 'none' && v.fromTop, { pcs: sn.pc, boots: sn.boot, animations: n, cursor: cur, fromTop: v.fromTop });
      // A project: shown at once, no animation, from its start.
      await p.keyboard.type('work fluxion');
      await p.keyboard.press('Enter');
      const pn = await anims(p);
      await sleep(50);
      const pv = await shown(p);
      ok(`${how}: a project shown at once (no animation), from its start`, pn === 0 && pv.fromTop && where(p) === '/?computer=work/fluxion', { animations: pn, v: pv, at: where(p) });
      // Esc and back in: at once, where it was, its first section still open (folded, it fits the screen).
      await unfold(p, 'details.t-sec');
      await p.evaluate(() => document.querySelector('[data-term]').scrollTo({ top: 200, behavior: 'instant' }));
      await sleep(400);
      const y0 = (await snap(p)).top;
      await p.keyboard.press('Escape');
      await closed(p);
      await watch(p);
      await enter(p);
      await reading(p);
      await sleep(400);
      const back = await snap(p);
      const sb = await seen(p);
      const open = await p.evaluate(() => document.querySelector('[data-term] [data-view]:not([hidden]) details.t-sec')?.open);
      ok(`${how}: Esc and back in: no flight either way, the project where it was, its section open`, !sb.pc.includes('fly') && back.view === 'work/fluxion' && y0 > 0 && Math.abs(back.top - y0) <= 2 && open, { pcs: sb.pc, view: back.view, top: back.top, was: y0, open });
      await p.context().close();
    }
  });

  // 12. The keyboard alone: in from the monitor's link, commands' buttons and links all ringed, disclosures
  //     opened with Enter, no power button, Escape out.
  await group('keyboard', async () => {
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
    ok('keyboard: Shift+Tab from the prompt reaches help\'s last command button (nothing in the views hidden), ringed', back.run === 'contact' && back.ring && back.outline.startsWith('solid'), back);
    await p.keyboard.press('Enter');
    await sleep(700);
    s = await snap(p);
    ok('keyboard: Enter on it runs contact once; focus back in the prompt', s.view === 'contact' && s.recall.join(',') === 'help,contact' && s.focus === 'input', { view: s.view, recall: s.recall, focus: s.focus });
    await p.keyboard.press('Shift+Tab');
    await p.keyboard.press('Shift+Tab');
    const lk = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { el: a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent.trim()), ring: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}` }; });
    ok('keyboard: the view\'s links take the focus, ringed', /^A:/.test(lk.el) && lk.ring && lk.outline.startsWith('solid'), lk);
    // A disclosure from the keyboard: resume's first role's points, opened with Enter on its line.
    await p.focus('[data-term-input]');
    await type(p, 'resume');
    await p.focus(`${V} .t-cv details.t-sec > summary`);
    const sm = await p.evaluate(() => { const a = document.activeElement; return { ring: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle }; });
    await p.keyboard.press('Enter');
    await sleep(200);
    const opened = await p.evaluate(() => document.querySelector('[data-term] [data-view]:not([hidden]) .t-cv details.t-sec').open);
    ok('keyboard: a disclosure\'s line takes the focus, ringed, and Enter opens it', opened && sm.outline === 'solid', { ...sm, opened });
    // Tab down through work's links and lines (its full list unfolded): each scrolls clear of the prompt
    // at the screen's foot (not under it).
    await p.focus('[data-term-input]');
    await type(p, 'work');
    await p.evaluate(() => { const d = document.querySelector('[data-term] [data-view="work"] details.t-more'); d.open = true; });
    await p.evaluate(() => { const t = document.querySelector('[data-term]'); t.scrollTop = 0; t.querySelector('[data-view="work"] a').focus({ preventScroll: true }); });
    const under = [];
    for (let i = 0; i < 16; i++) {
      await p.keyboard.press('Tab');
      await sleep(40);
      const u = await p.evaluate(() => { const a = document.activeElement; if (!a.closest('[data-term-views]')) return null; return a.getBoundingClientRect().bottom > document.querySelector('[data-term-form]').getBoundingClientRect().top ? a.textContent.trim() : null; });
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
    await p.keyboard.press('Enter');
    await reading(p);
    await sleep(500);
    s = await snap(p);
    ok('keyboard: Enter on it goes in again, on work, focus in the prompt', s.view === 'work' && s.focus === 'input', { view: s.view, focus: s.focus });
  });
  // 13. No WebGL (the context refused): the still, its monitor a link over the pictured monitor (the
  // stills were retaken for the terminal; the --still-* fractions are unchanged), and the terminal across
  // the window. (The lab-computer pass's check, for the terminal's addresses.)
  await group('nowebgl', async () => {
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
  });

  // 14. Without JavaScript: the monitor is a link to the terminal's transcript (/computer/), which stands
  //     alone, every view under the command that shows it; the old pages forward there.
  await group('nojs', async () => {
    const TITLES = 'help:Commands,about:Donald Heddesheimer,work:Selected work,resume:Résumé,contact:Contact';
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const p = await page({ w, h, js: false });
      await p.goto(base + '/');
      await sleep(300);
      const href = await p.evaluate(() => document.querySelector('[data-lab-monitor]').getAttribute('href'));
      await Promise.all([p.waitForURL('**/computer/'), enter(p)]);
      await p.waitForLoadState();
      await sleep(300);
      const r = await p.evaluate((ps) => ({
        at: location.pathname + location.hash,
        h1: document.querySelector('h1')?.textContent,
        sections: [...document.querySelectorAll('main section.term-entry')].map((s) => `${s.id}:${s.querySelector('.term-echo')?.textContent.replace(ps, '').trim()}`),
        titles: [...document.querySelectorAll('main section.term-entry')].map((s) => `${s.id}:${s.querySelector('h2.t-title')?.textContent.trim()}`),
        cmds: [...document.querySelectorAll('main a.t-cmd')].map((a) => a.getAttribute('href')).filter((x, i, a) => x.startsWith('#') && a.indexOf(x) === i).sort(),
        buttons: document.querySelectorAll('main button').length,
        projects: [...document.querySelectorAll('main .t-work a.t-open')].map((a) => a.getAttribute('href')),
        more: document.querySelector('main details.t-more')?.open,
        back: document.querySelector('.t-static-back a')?.getAttribute('href'),
        robots: document.querySelector('meta[name=robots]')?.content,
        canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
        sideways: document.scrollingElement.scrollWidth - innerWidth,
      }), PS1);
      ok(`no JS ${w}x${h}: the monitor links to /computer/, the transcript: help and the four commands, each a section under the command, headed by its view's title`, href === '/computer/' && r.at === '/computer/' && r.sections.join(',') === 'help:help,about:about,work:work,resume:resume,contact:contact' && r.titles.join(',') === TITLES && /terminal/.test(r.h1), r);
      ok(`no JS ${w}x${h}: commands link to their place, projects' names to their transcripts (/computer/work/<id>/, the rest folded, opening without script), no buttons, a way back, out of search, no sideways scroll`, r.cmds.join(',') === '#about,#contact,#help,#resume,#work' && r.projects.length === 11 && r.projects.every((x) => /^\/computer\/work\/[\w-]+\/$/.test(x)) && r.more === false && r.buttons === 0 && r.back === '/' && /noindex/.test(r.robots) && /\/computer\/$/.test(r.canonical) && r.sideways <= 0, { ...r, projects: r.projects.length });
      await p.locator('main details.t-more > summary').click();
      const all = await p.evaluate(() => document.querySelector('main details.t-more').open);
      ok(`no JS ${w}x${h}: "Show all 11 projects" opens without script`, all, all);
      await p.screenshot({ path: `${shots}/nojs-transcript-${w}x${h}.jpg`, type: 'jpeg', quality: 85 });
      await p.context().close();
    }
    const p = await page({ js: false });
    await p.goto(base + '/computer/about/');
    await p.waitForURL('**/computer/#about', { timeout: 5000 }).catch(() => {});
    ok('no JS: /computer/about/ forwards to /computer/#about', where(p) === '/computer/#about', where(p));
    await p.context().close();
    // A project's transcript, on its own: `work <id>` and what it shows, as a page (the write-up's headings
    // keep their ids, for its anchors); its commands link to pages; the case study's page as it was.
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const q = await page({ w, h, js: false });
      await q.goto(base + '/computer/work/cucadence/#how-it-works');
      await sleep(300);
      const r = await q.evaluate((ps) => {
        const hd = document.getElementById('how-it-works');
        const hr = hd?.getBoundingClientRect();
        const pre = document.querySelector('main pre.t-code');
        return {
          at: location.pathname + location.hash,
          title: document.title,
          echo: document.querySelector('main .term-echo')?.textContent.replace(ps, '').trim(),
          name: document.querySelector('main .t-project h2.t-title')?.textContent.trim(),
          // In view: at the top, or as near as the page scrolls (folded, it may fit the window).
          atHeading: !!hr && hr.top >= -1 && hr.bottom <= innerHeight && (hr.top < 120 || scrollY >= document.scrollingElement.scrollHeight - innerHeight - 1),
          sectionOpen: !!hd?.closest('details')?.open,
          sections: document.querySelectorAll('main details.t-sec').length,
          figs: document.querySelectorAll('main details.t-fig').length,
          code: pre ? getComputedStyle(pre).overflowX : null,
          related: [...document.querySelectorAll('main .t-project > .t-links a.t-cmd')].map((a) => [a.textContent.trim(), a.getAttribute('href')]),
          list: document.querySelector('main .t-hint a.t-cmd')?.getAttribute('href'),
          source: document.querySelector('main .t-actions a[target="_blank"]')?.getAttribute('href'),
          buttons: document.querySelectorAll('main button').length,
          frames: document.querySelectorAll('iframe').length,
          back: document.querySelector('.t-static-back a')?.getAttribute('href'),
          robots: document.querySelector('meta[name=robots]')?.content,
          canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
          sideways: document.scrollingElement.scrollWidth - innerWidth,
        };
      }, PS1);
      ok(`no JS ${w}x${h}: /computer/work/cucadence/ shows work cucadence as a page, at its anchor's section line; related work and work link to pages; no buttons or frames; canonical its case study; no sideways scroll`, r.at === '/computer/work/cucadence/#how-it-works' && r.echo === 'work cucadence' && r.name === 'cuCadence' && /^cuCadence · Terminal/.test(r.title) && r.atHeading && r.sections >= 3 && r.figs >= 1 && r.code === 'auto' && r.related.length >= 1 && r.related.every(([t, hr]) => hr === `/computer/${t.replace(' ', '/')}/`) && r.list === '/computer/#work' && /^https:\/\//.test(r.source) && r.buttons === 0 && r.frames === 0 && r.back === '/' && /noindex/.test(r.robots) && /\/projects\/cucadence\/$/.test(r.canonical) && r.sideways <= 0, r);
      // (Known: without script, an anchor lands on its section's line, still folded: the browser opens a
      // <details> for an anchor inside it, not for one on its summary. The lab unfolds it, `history`.)
      if (!r.sectionOpen) note(`no JS ${w}x${h}: #how-it-works lands on its section's line, folded (a click opens it)`);
      await q.screenshot({ path: `${shots}/nojs-project-${w}x${h}.jpg`, type: 'jpeg', quality: 85 });
      await q.goto(base + '/projects/cucadence/');
      await sleep(300);
      const cs = await q.evaluate(() => ({ h1: document.querySelector('main h1')?.textContent.trim(), sideways: document.scrollingElement.scrollWidth - innerWidth }));
      ok(`no JS ${w}x${h}: /projects/cucadence/, the case study, still stands on its own`, cs.h1 === 'cuCadence' && cs.sideways <= 0, cs);
      await q.context().close();
    }
  });

  // 15. A lab script that fails to load: the terminal's transcript instead (for the session), or the
  //     project's page; the opening itself untouched.
  await group('failed', async () => {
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
    const ids = await p.evaluate(() => [...document.querySelectorAll('main .t-work a.t-open')].map((a) => a.getAttribute('href').split('/')[3]));
    // A project's name in the transcript: its transcript, which stays (no loop back to the lab).
    await Promise.all([p.waitForURL(`**/computer/work/${ids[0]}/`), p.click(`main a[href="/computer/work/${ids[0]}/"]`)]);
    await sleep(1500);
    ok('failed script: a project\'s name in the transcript opens its own transcript, which stays', where(p) === `/computer/work/${ids[0]}/` && (await p.evaluate(() => document.querySelectorAll('main .t-project').length)) === 1, where(p));
    await p.goto(base + `/?computer=work/${ids[0]}#objective`);
    await p.waitForURL(`**/projects/${ids[0]}/#objective`, { timeout: 8000 }).catch(() => {});
    ok('failed script: a project\'s address goes to its page (with its anchor)', where(p) === `/projects/${ids[0]}/#objective`, where(p));
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
    ok('failed script, then working: the lab runs, the flag goes, and /computer/#about opens the lab on about', flag === null && again.at === '/?computer' && again.view === 'about', { flag, at: again.at, view: again.view });
  });

  // 16. Sizes: on the monitor at desktop sizes; enlarged text and short windows, nothing clipped. Each size
  //     on its own: one that can't be entered is a FAIL, and the next size still runs.
  await group('fit', async () => {
    for (const [w, h, zoom, touch] of [[1440, 900, 1], [1920, 1080, 1], [1280, 800, 1], [1024, 768, 1], [1180, 820, 1, true], [1280, 800, 2], [390, 844, 1, true], [390, 844, 2, true], [360, 640, 2, true], [1024, 400, 1], [740, 360, 1, true], [568, 320, 1.5, true]]) {
      const tag = `${w}x${h}${zoom !== 1 ? `-text${zoom * 100}` : ''}`;
      try {
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
        ok(`fit ${tag}: ${onMonitor ? 'on the monitor' : 'across the window'}, help shown, the screen in view${touch ? ' and the power button' : ', no power button'}, the prompt in the screen, nothing sideways`, s.view === 'help' && r.inView && r.prompt && (touch ? r.power : r.noPower) && r.sideways <= 0 && r.outer <= 0 && (w >= 1024 && h >= 576 ? onMonitor : !onMonitor), { ...r, full: s.full, view: s.view });
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
        // What contact and work show, at this size: nothing sideways, the prompt's field a usable width,
        // the email on one line (not a column a few letters wide), links a finger can find on a touch screen.
        // (Tapped where the view shows the command, contact from help; typed where it doesn't, work from contact.)
        const go = async (cmd) => {
          if (touch && (await runLoc(p, cmd).count())) await clickRun(p, cmd, 'tap');
          else {
            await p.focus('[data-term-input]');
            await type(p, cmd, 300);
          }
          await sleep(300);
        };
        await go('contact');
        const c = await p.evaluate(() => {
          const t = document.querySelector('[data-term]');
          const v = t.querySelector('[data-view]:not([hidden])');
          const field = t.querySelector('.term-field').getBoundingClientRect();
          const fs = parseFloat(getComputedStyle(t).fontSize);
          const mail = v.querySelector('a[href^="mailto:"]');
          // The email on one line, or, where a line can't hold it, across the whole width (not a column).
          const dd = mail.closest('dd') ?? mail.parentElement;
          const across = dd.getBoundingClientRect().width / t.querySelector('[data-term-views]').getBoundingClientRect().width;
          const links = [...v.querySelectorAll('a, button')].map((a) => Math.round(a.getBoundingClientRect().height));
          return { view: v.dataset.view, sideways: t.scrollWidth - t.clientWidth, fieldCh: +(field.width / (fs * 0.6)).toFixed(1), mailLines: mail.getClientRects().length, across: +across.toFixed(2), linkH: links, fs };
        });
        await go('work');
        const o = await p.evaluate(() => {
          const t = document.querySelector('[data-term]');
          const v = t.querySelector('[data-view]:not([hidden])');
          return { view: v.dataset.view, sideways: t.scrollWidth - t.clientWidth, linkH: [...v.querySelectorAll('a.t-open, summary')].filter((a) => a.getClientRects().length).map((a) => Math.round(a.getBoundingClientRect().height)) };
        });
        ok(`fit ${tag}: contact and work ${touch ? 'tapped and typed' : 'typed'}, each shown with nothing sideways, the prompt's field at least 7 characters, the email on one line (or across the width)${touch ? ', links 30px or more tall' : ''}`, c.view === 'contact' && o.view === 'work' && c.sideways <= 0 && o.sideways <= 0 && c.fieldCh >= 7 && (c.mailLines === 1 || c.across >= 0.9) && (!touch || Math.min(...c.linkH, ...o.linkH) >= 30), { contact: c, work: o });
        await shot(p, `fit-${tag}-work`);
        await p.context().close();
      } catch (e) {
        ok(`fit ${tag}: entered and checked`, false, String(e.message ?? e).split('\n')[0]);
        for (const q of pages.splice(0)) await q.context().close().catch(() => {});
      }
    }
  });

  await b.close();
  console.log(`\n${passes} passed, ${fails} failed${fails ? '' : ': all passed'}`);
  process.exit(fails ? 1 : 0);
})();
