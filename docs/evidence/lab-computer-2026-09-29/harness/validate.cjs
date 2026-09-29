// node validate.cjs [base] [only] [--swiftshader] — the full-screen lab's checks, against the production
// build: installed Chrome, WebGL through ANGLE Metal on the Mac it runs on (or SwiftShader). `base` is
// 'dist' (the default: the built site straight from disk, no server) or a server's address; `only` runs
// the groups whose names start with it. Playwright isn't a dependency: PW=<its module path>, or NODE_PATH.
// Screenshots of the checks go to SHOTS (default: a folder in the system's temp directory).
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
// 'dist' (the default): the built site straight from disk, no server; or a server's address.
const base = !process.argv[2] || process.argv[2] === 'dist' ? BASE : process.argv[2];
const only = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const SW = process.argv.includes('--swiftshader');
const shots = process.env.SHOTS || require('path').join(require('os').tmpdir(), 'lab-validate-shots');
require('fs').mkdirSync(shots, { recursive: true });
let fails = 0;
const ok = (name, cond, info = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: SW ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = async ({ w = 1440, h = 900, reduced = false, js = true, touch = false, init = null, headers = null } = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference', javaScriptEnabled: js, hasTouch: touch, isMobile: touch, extraHTTPHeaders: headers ?? undefined });
    if (base === BASE) await routeDist(ctx);
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  pageerror:', e.message));
    return p;
  };
  {
    // What it ran on: the browser, and the renderer WebGL reports.
    const p = await (await b.newContext()).newPage();
    const gl = await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c?.getExtension('WEBGL_debug_renderer_info'); return c ? c.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : c.RENDERER) : 'no WebGL'; });
    console.log(`# Chrome ${b.version()}, ${process.platform} ${require('os').release()}, ${require('os').cpus()[0].model}; WebGL: ${gl}`);
    await p.context().close();
  }
  const drawn = (p) => p.waitForFunction(() => document.querySelector('[data-lab-root]')?.matches('[data-drawn], [data-failed]'), null, { timeout: 30000 });
  // Reading: the page loaded in the frame, and the focus in it (the lab focuses it on the frame's load).
  const reading = (p) => p.waitForFunction(() => document.documentElement.dataset.pc === 'read' && document.querySelector('.pc-frame')?.contentDocument?.readyState === 'complete' && document.querySelector('.pc-frame').contentDocument.hasFocus(), null, { timeout: 15000 });
  const closed = (p) => p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
  const frame = (p) => p.frames().find((f) => f.url().includes('/computer/'));
  const where = (p) => new URL(p.url()).pathname + new URL(p.url()).search + new URL(p.url()).hash;
  const run = (name) => !only || name.startsWith(only);
  // The monitor's link, and going in the way a person does: a click (or tap) on the drawn monitor, which
  // the scene picks; without the scene, on the link over the still's monitor.
  const linkRect = (p) => p.evaluate(() => (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
  const enter = async (p, touch = false) => {
    const r = await linkRect(p);
    const [x, y] = [r.x + r.w / 2, r.y + r.h / 2];
    if (touch) await p.touchscreen.tap(x, y);
    else await p.mouse.click(x, y);
  };
  // Mean brightness of the monitor's screen, as the canvas draws it now (the monitor where it is now).
  const lum = (p) => p.evaluate(async () => {
    const s = window.__lab.stats();
    const m = { x: s.monX, y: s.monY, w: s.monW, h: s.monH };
    const c = document.querySelector('[data-lab-stage] canvas');
    const bmp = await createImageBitmap(c);
    const o = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
    o.drawImage(bmp, 0, 0);
    const k = bmp.width / innerWidth;
    const d = o.getImageData(Math.round((m.x + m.w * 0.1) * k), Math.round((m.y + m.h * 0.1) * k), Math.round(m.w * 0.8 * k), Math.round(m.h * 0.8 * k)).data;
    let t = 0; for (let i = 0; i < d.length; i += 4) t += d[i] + d[i + 1] + d[i + 2];
    return +(t / (d.length / 4) / 3).toFixed(1);
  });

  // 1. The opening: what's there and what isn't, at desktop, tablet and phone sizes.
  if (run('opening')) {
    for (const [w, h, touch] of [[1440, 900], [1920, 1080], [1280, 800], [1024, 768], [820, 1180, true], [390, 844, true], [360, 640, true]]) {
      const p = await page({ w, h, touch, reduced: true });
      await p.goto(base + '/?probe');
      await drawn(p);
      await p.evaluate(() => document.fonts.ready);
      await sleep(600);
      const r = await p.evaluate(() => {
        const rect = (el) => el && (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height) }))(el.getBoundingClientRect());
        const vis = (el) => !!el && el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
        const link = document.querySelector('[data-lab-monitor]');
        const name = document.querySelector('.home-id').getBoundingClientRect();
        const set = document.querySelector('[data-settings-toggle]').getBoundingClientRect();
        const texts = [...document.querySelectorAll('a, button')].filter(vis).map((e) => (e.getAttribute('aria-label') || e.textContent).trim().replace(/\s+/g, ' '));
        const s = window.__lab?.stats?.() ?? {};
        const mon = { x: s.monX, y: s.monY, w: s.monW, h: s.monH };
        const e = link.getBoundingClientRect();
        const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        return {
          h1: document.querySelector('h1')?.textContent.trim(),
          title: document.querySelector('.home-title')?.textContent.trim(),
          controls: texts,
          link: rect(link),
          mon: Object.fromEntries(Object.entries(mon).map(([k, v]) => [k, Math.round(v)])),
          onMonitor: Math.abs(e.x - mon.x) <= 2 && Math.abs(e.y - mon.y) <= 2 && Math.abs(e.width - mon.w) <= 2 && Math.abs(e.height - mon.h) <= 2,
          clear: !hit(e, name) && !hit(e, set),
          label: link.getAttribute('aria-label'),
          href: link.getAttribute('href'),
          monitorInView: mon.x >= 0 && mon.y >= 0 && mon.x + mon.w <= innerWidth && mon.y + mon.h <= innerHeight,
          monShare: +(mon.w / innerWidth).toFixed(2),
          outerScroll: document.scrollingElement.scrollHeight - innerHeight,
          outerScrollX: document.scrollingElement.scrollWidth - innerWidth,
          sections: document.querySelectorAll('main section, footer, nav, .tabbar, [id="work"], [id="about"], [id="resume"], [id="contact"]').length,
          skip: /skip to|open ordinary|ordinary page/i.test(document.body.innerText),
        };
      });
      const tag = `${w}x${h}`;
      ok(`opening ${tag}: name and title`, r.h1 === 'Donald Heddesheimer' && r.title === 'Software engineer', `${r.h1} / ${r.title}`);
      ok(`opening ${tag}: the monitor's link ("Explore my work") and Settings are the only controls`, r.controls.length === 2 && r.controls[0] === 'Explore my work' && r.controls[1] === 'Settings' && r.label === 'Explore my work' && r.href === '/computer/work/', r.controls);
      ok(`opening ${tag}: no sections, nav, footer, tab bar, anchors or skip/ordinary links`, r.sections === 0 && !r.skip, { sections: r.sections, skip: r.skip });
      ok(`opening ${tag}: monitor wholly in view without looking around`, r.monitorInView, { monShare: r.monShare });
      ok(`opening ${tag}: the link lies on the drawn monitor, clear of the name and Settings`, r.onMonitor && r.clear, { link: r.link, mon: r.mon });
      ok(`opening ${tag}: no outer scrolling`, r.outerScroll <= 0 && r.outerScrollX <= 0, { dy: r.outerScroll, dx: r.outerScrollX });
      await p.screenshot({ path: `${shots}/opening-${tag}.jpg`, type: 'jpeg', quality: 85 });
      await p.context().close();
    }
  }

  // 2. Keyboard: Tab to the monitor's link (a ring round the monitor, which brightens), Enter goes in on
  //    Work with focus inside; Escape comes back to the room with focus on the link, and the address to /.
  if (run('keyboard')) {
    const p = await page({ reduced: false });
    await p.goto(base + '/?probe');
    await drawn(p);
    const order = [];
    for (let i = 0; i < 3; i++) {
      await p.keyboard.press('Tab');
      order.push(await p.evaluate(() => { const a = document.activeElement; return (a.getAttribute('aria-label') || a.textContent).trim().replace(/\s+/g, ' ') + (a.matches(':focus-visible') ? ' [ring]' : ''); }));
    }
    ok('keyboard: tab order is the monitor\'s link, then Settings', /^Explore my work \[ring\]/.test(order[0]) && /^Settings/.test(order[1]), order);
    const landmark = await p.evaluate(() => {
      const l = document.querySelector('[data-lab-monitor]');
      const h = document.querySelector('h1');
      const s = document.querySelector('[data-settings-toggle]');
      return { inMain: !!l.closest('main'), afterH1: !!(h.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING), beforeSettings: !!(l.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING), outside: [...document.body.children].filter((e) => !e.matches('main, script, style, astro-dev-toolbar') && e.checkVisibility()).map((e) => e.tagName) };
    });
    ok('landmark: the monitor\'s link is in main, after the h1 and before Settings; nothing shown outside main', landmark.inMain && landmark.afterH1 && landmark.beforeSettings && landmark.outside.length === 0, landmark);
    await p.evaluate(() => document.activeElement.blur());
    await sleep(1200);
    const l0 = await lum(p);
    await p.keyboard.press('Tab');
    await sleep(900);
    const l1 = await lum(p);
    const ring = await p.evaluate(() => {
      const a = document.activeElement;
      const cs = getComputedStyle(a);
      const s = window.__lab.stats();
      const e = a.getBoundingClientRect();
      return { el: a.getAttribute('aria-label'), fv: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}`, onMonitor: Math.abs(e.x - s.monX) <= 3 && Math.abs(e.y - s.monY) <= 3 && Math.abs(e.width - s.monW) <= 3 && Math.abs(e.height - s.monH) <= 3, link: [e.x, e.y, e.width, e.height].map(Math.round), mon: [s.monX, s.monY, s.monW, s.monH].map(Math.round) };
    });
    ok('keyboard: the link rings the monitor where it is drawn', ring.el === 'Explore my work' && ring.fv && ring.outline.startsWith('solid') && ring.onMonitor, ring);
    ok('keyboard: focus brightens the monitor', l1 > l0 + 1, { before: l0, focused: l1 });
    const t0 = Date.now();
    await p.keyboard.press('Enter');
    await reading(p);
    ok('keyboard: Enter goes in on Work', where(p) === '/?computer=work' && (await frame(p)?.url())?.endsWith('/computer/work/'), { at: where(p), ms: Date.now() - t0 });
    await sleep(300);
    const inside = await p.evaluate(() => document.activeElement?.closest?.('[data-pc-dialog]') != null || document.activeElement?.tagName === 'IFRAME');
    ok('keyboard: focus is inside the computer', inside);
    const hidden = await p.evaluate(() => [...document.querySelectorAll('.home-id, .home-settings')].map((e) => getComputedStyle(e).visibility));
    const inert = await p.evaluate(() => { const d = document.querySelector('[data-pc-dialog]'); return d.open && d.matches(':modal'); });
    ok('reading: the name and Settings hidden, the room (and its link) inert behind the modal', hidden.length === 2 && hidden.every((v) => v === 'hidden') && inert, { hidden, inert });
    const f = frame(p);
    const bar = await f.evaluate(() => ({ nav: [...document.querySelectorAll('.scr-nav a')].map((a) => a.textContent.trim()), back: document.querySelector('[data-leave]')?.textContent.trim().replace(/\s+/g, ' '), leads: [...document.querySelectorAll('main h2, main h3')].slice(0, 4).map((h) => h.textContent.trim()), pdf: [...document.querySelectorAll('a')].some((a) => /resume\.pdf$/.test(a.getAttribute('href') || '')) }));
    ok('computer: four places and "Back to room"', bar.nav.join(',') === 'Work,About,Résumé,Contact' && /Back\s*to room/.test(bar.back), bar);
    await p.keyboard.press('Escape');
    await closed(p);
    await sleep(200);
    const back = await p.evaluate(() => ({ at: location.pathname + location.search, focus: document.activeElement?.getAttribute('aria-label'), fv: document.activeElement?.matches(':focus-visible') }));
    ok('keyboard: Escape back to the room, focus on the monitor\'s link (ringed), the address it was opened from', back.at === '/?probe' && back.focus === 'Explore my work' && back.fv, back);
    await p.screenshot({ path: `${shots}/keyboard-after-escape-1440x900.jpg`, type: 'jpeg', quality: 85 });
    await p.context().close();
  }

  // 2b. Keyboard before the room: Tab to the link while the scene is still loading (held back here); once
  //     it draws, the ring follows the monitor and the monitor brightens.
  if (run('keyboard')) {
    const p = await page({ reduced: false });
    let release;
    const held = new Promise((r) => (release = r));
    await p.route(/\/_astro\/scene\.[^/]*\.js$/, async (route) => { await held; await route.fallback(); });
    await p.goto(base + '/?probe');
    await p.keyboard.press('Tab');
    const early = await p.evaluate(() => ({ drawn: document.querySelector('[data-lab-root]').hasAttribute('data-drawn'), focus: document.activeElement?.getAttribute('aria-label'), ring: document.activeElement?.matches(':focus-visible') }));
    release();
    await drawn(p);
    await sleep(1500);
    const off = await p.evaluate(async () => {
      let worst = 0;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 120));
        const s = window.__lab.stats();
        const e = document.querySelector('[data-lab-monitor]').getBoundingClientRect();
        worst = Math.max(worst, Math.abs(e.x - s.monX), Math.abs(e.y - s.monY), Math.abs(e.width - s.monW), Math.abs(e.height - s.monH));
      }
      return +worst.toFixed(1);
    });
    const lit = await lum(p);
    await p.evaluate(() => document.activeElement.blur());
    await sleep(900);
    const unlit = await lum(p);
    ok('keyboard before the room draws: once it has, the ring follows the monitor and the monitor brightens', !early.drawn && early.focus === 'Explore my work' && early.ring && off <= 3 && lit > unlit + 1, { early, worstOffPx: off, focused: lit, blurred: unlit });
    await p.context().close();
  }

  // 3. Pointer: a drag that ends on the monitor looks, a click goes in; hovering the monitor brightens it.
  if (run('pointer')) {
    const p = await page({ reduced: false });
    await p.goto(base + '/?probe');
    await drawn(p);
    await sleep(800);
    const mon = await p.evaluate(() => { const s = window.__lab.stats(); return { x: s.monX, y: s.monY, w: s.monW, h: s.monH }; });
    const cx = mon.x + mon.w / 2, cy = mon.y + mon.h / 2;
    await p.mouse.move(cx - 120, cy);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(cx - 120 + i * 12, cy, { steps: 2 });
    await p.mouse.up();
    await sleep(700);
    const afterDrag = await p.evaluate(() => ({ pc: document.documentElement.dataset.pc ?? null, az: window.__lab.stats().lookAz }));
    ok('pointer: a drag ending on the monitor looks around and does not go in', afterDrag.pc === null && Math.abs(afterDrag.az) > 0.001, afterDrag);
    await sleep(1500);
    await p.mouse.move(5, 5);
    await sleep(900);
    const l0 = await lum(p);
    const m1 = await p.evaluate(() => { const s = window.__lab.stats(); return { x: s.monX + s.monW / 2, y: s.monY + s.monH / 2 }; });
    await p.mouse.move(m1.x, m1.y, { steps: 4 });
    await sleep(900);
    const l1 = await lum(p);
    const cur = await p.evaluate(() => document.querySelector('[data-lab-root]').style.cursor);
    ok('pointer: hovering the monitor brightens it (pointer cursor)', l1 > l0 + 1 && cur === 'pointer', { before: l0, hover: l1, cursor: cur });
    // Cmd-click (Ctrl elsewhere; on a Mac Ctrl-click is a right click) and a middle click on the drawn
    // monitor: its address in a new tab, the lab closed here.
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    for (const how of [`${mod === 'Meta' ? 'Cmd' : 'Ctrl'}-click`, 'middle click']) {
      const m2 = await p.evaluate(() => { const s = window.__lab.stats(); return { x: s.monX + s.monW / 2, y: s.monY + s.monH / 2 }; });
      const opened = p.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
      if (how !== 'middle click') {
        await p.keyboard.down(mod);
        await p.mouse.click(m2.x, m2.y);
        await p.keyboard.up(mod);
      } else await p.mouse.click(m2.x, m2.y, { button: 'middle' });
      const tab = await opened;
      if (tab) await tab.waitForLoadState().catch(() => {});
      const r = { tab: tab ? new URL(tab.url()).pathname + new URL(tab.url()).search : null, here: await p.evaluate(() => document.documentElement.dataset.pc ?? null) };
      ok(`pointer: ${how} on the drawn monitor opens its address in a new tab, the lab stays closed`, /^\/computer\/work\/$|^\/\?computer=work$/.test(r.tab ?? '') && r.here === null, r);
      await tab?.close();
      await sleep(300);
    }
    await p.mouse.move(5, 5);
    await sleep(1200);
    await p.mouse.click(cx, cy);
    await reading(p);
    ok('pointer: a click on the drawn monitor goes in', where(p) === '/?computer=work');
    await p.context().close();
  }

  // 4. Inside: navigate, the camera doesn't move; scroll only inside; Back/Forward; refresh; "Back to room".
  if (run('inside')) {
    const p = await page({ reduced: false });
    await p.goto(base + '/');
    await drawn(p);
    await enter(p);
    await reading(p);
    await sleep(500);
    const xf = () => p.evaluate(() => { const f = document.querySelector('.pc-frame'); return f.style.transform + '|' + f.style.width + 'x' + f.style.height; });
    const x0 = await xf();
    const stats0 = await p.evaluate(() => document.querySelector('[data-lab-root]').dataset.running);
    await frame(p).click('.scr-nav a[href$="/about/"]');
    await p.waitForFunction(() => location.search === '?computer=about');
    await p.waitForFunction(() => document.querySelector('.pc-frame').contentWindow.location.pathname.endsWith('/computer/about/'));
    await sleep(400);
    ok('inside: About from the bar: address ?computer=about, camera and frame unmoved', (await xf()) === x0, { running: stats0 });
    // Scroll: the wheel over the page scrolls the page's document, not the window.
    const f = frame(p);
    const box = await p.locator('.pc-frame').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    await p.mouse.wheel(0, 600);
    await sleep(500);
    const sc = { inner: await frame(p).evaluate(() => scrollY), outer: await p.evaluate(() => scrollY) };
    ok('inside: the wheel scrolls inside the computer only', sc.inner > 0 && sc.outer === 0, sc);
    await p.screenshot({ path: `${shots}/reading-about-scrolled-1440x900.jpg`, type: 'jpeg', quality: 85 });
    // (Activated where it is: a pointer click would first scroll the bar back into view.)
    await frame(p).evaluate(() => document.querySelector('.scr-nav a[href$="/resume/"]').click());
    await p.waitForFunction(() => location.search === '?computer=resume');
    await sleep(500);
    const pdf = await frame(p).evaluate(() => [...document.querySelectorAll('a')].filter((a) => /resume\.pdf$/.test(a.getAttribute('href') || '')).map((a) => a.textContent.trim()));
    ok('inside: Résumé has a PDF download', pdf.length > 0, pdf);
    await p.goBack();
    await p.waitForFunction(() => location.search === '?computer=about');
    await p.waitForFunction(() => document.querySelector('.pc-frame').contentWindow.location.pathname.endsWith('/computer/about/'));
    await sleep(300);
    const restored = await frame(p).evaluate(() => scrollY);
    ok('inside: Back returns to About, where it was scrolled', restored > 0 && Math.abs(restored - sc.inner) <= 1, { left: sc.inner, restored });
    await p.goForward();
    await p.waitForFunction(() => location.search === '?computer=resume');
    ok('inside: Forward returns to Résumé', true);
    await p.reload();
    await reading(p);
    ok('inside: refresh reopens Résumé on the monitor', where(p) === '/?computer=resume' && (await p.evaluate(() => !document.documentElement.hasAttribute('data-pc-full'))));
    await frame(p).click('[data-leave]');
    await closed(p);
    ok('inside: "Back to room" closes (refreshed entry: address /)', where(p) === '/', where(p));
    const clickedBack = await p.evaluate(() => ({ focus: document.activeElement?.getAttribute('aria-label'), fv: document.activeElement?.matches(':focus-visible'), outline: getComputedStyle(document.activeElement).outlineStyle }));
    ok('inside: "Back to room" clicked gives the focus back to the monitor\'s link, without the keyboard\'s ring', clickedBack.focus === 'Explore my work' && !clickedBack.fv && clickedBack.outline === 'none', clickedBack);
    // History from the room: go in, open a case study, Back twice to the room.
    await sleep(600);
    await enter(p);
    await reading(p);
    const card = await frame(p).evaluate(() => [...document.querySelectorAll('a[href*="/computer/work/"]')].map((a) => a.getAttribute('href')).find((h) => /\/computer\/work\/[\w-]+\/$/.test(h)));
    await frame(p).click(`a[href="${card}"]`);
    await p.waitForFunction(() => /\?computer=work\/[\w-]+$/.test(location.search));
    const cs = where(p);
    await p.goBack();
    await p.waitForFunction(() => location.search === '?computer=work');
    await p.goBack();
    await closed(p);
    ok('inside: case study, Back to Work, Back to the room', /^\/\?computer=work\/[\w-]+$/.test(cs) && where(p) === '/', { cs, now: where(p) });
    await p.goForward();
    await reading(p);
    ok('inside: Forward from the room opens Work again', where(p) === '/?computer=work');
    await p.context().close();
  }

  // 5. Resizing while reading: to a narrow window (reads across it), and back to the monitor.
  if (run('resize')) {
    const p = await page({ reduced: false });
    await p.goto(base + '/?computer=about');
    await reading(p);
    await sleep(800);
    await p.setViewportSize({ width: 700, height: 900 });
    await sleep(900);
    const narrow = await p.evaluate(() => ({ full: document.documentElement.hasAttribute('data-pc-full'), fr: (({ x, y, width, height }) => [x, y, width, height].map(Math.round))(document.querySelector('.pc-frame').getBoundingClientRect()), outer: document.scrollingElement.scrollHeight - innerHeight }));
    ok('resize: narrowed while reading, it reads across the window', narrow.full && narrow.fr[0] === 0 && narrow.fr[2] === 700 && narrow.outer <= 0, narrow);
    await p.screenshot({ path: `${shots}/resize-narrow-700x900.jpg`, type: 'jpeg', quality: 85 });
    await p.setViewportSize({ width: 1440, height: 900 });
    await sleep(1200);
    const wide = await p.evaluate(() => ({ full: document.documentElement.hasAttribute('data-pc-full'), pc: document.documentElement.dataset.pc, at: location.search }));
    ok('resize: widened again, back on the monitor, same page', !wide.full && wide.pc === 'read' && wide.at === '?computer=about', wide);
    await p.screenshot({ path: `${shots}/resize-back-1440x900.jpg`, type: 'jpeg', quality: 85 });
    await p.context().close();
  }

  // 6. Phone: the reader across the window, "Back to room", scroll inside; touch not captured.
  if (run('phone')) {
    for (const [w, h] of [[390, 844], [360, 640]]) {
      const p = await page({ w, h, touch: true, reduced: false });
      await p.goto(base + '/');
      await drawn(p);
      await sleep(400);
      await enter(p, true);
      await reading(p);
      await sleep(500);
      const r = await p.evaluate(() => ({ full: document.documentElement.hasAttribute('data-pc-full'), outer: document.scrollingElement.scrollHeight - innerHeight }));
      const inner = await frame(p).evaluate(() => ({ scrollable: document.scrollingElement.scrollHeight > innerHeight, touch: getComputedStyle(document.documentElement).touchAction, back: !!document.querySelector('[data-leave]')?.checkVisibility() }));
      ok(`phone ${w}x${h}: reads across the window, scrolls inside, "Back to room" shown`, r.full && r.outer <= 0 && inner.scrollable && inner.touch !== 'none' && inner.back, { ...r, ...inner });
      await p.screenshot({ path: `${shots}/phone-work-${w}x${h}.jpg`, type: 'jpeg', quality: 85 });
      await frame(p).tap('[data-leave]');
      await closed(p);
      ok(`phone ${w}x${h}: "Back to room" returns to the opening`, where(p) === '/');
      await p.context().close();
    }
  }

  // 7. Legacy addresses and redirects.
  if (run('legacy')) {
    const p = await page({ reduced: true });
    const go = async (path, wait = 1200) => { await p.goto(base + path); await sleep(wait); return where(p); };
    for (const a of ['work', 'about', 'resume', 'contact']) {
      const at = await go('/#' + a);
      const pc = await p.evaluate(() => document.documentElement.dataset.pc);
      ok(`legacy: /#${a} opens the computer on it`, at === '/?computer=' + a && pc === 'read', { at, pc });
    }
    const ids = await p.evaluate(() => JSON.parse(document.querySelector('[data-pc-dialog]').dataset.projects));
    const id = ids[0];
    ok(`legacy: /?computer=work/${id} opens the case study`, (await go(`/?computer=work/${id}`)) === `/?computer=work/${id}` && (await p.evaluate(() => document.documentElement.dataset.pc)) === 'read');
    ok('legacy: /?computer=bogus is dropped (the room, no dead address)', (await go('/?computer=bogus')) === '/');
    ok(`legacy: /?sel=project:${id} goes to its case study`, (await go(`/?sel=project:${id}`)) === `/projects/${id}/`);
    ok('legacy: /?sel=anything-else goes to Work', (await go('/?sel=layer:gpu')) === '/?computer=work');
    ok('legacy: /systems/ goes to /', (await go('/systems/')) === '/');
    ok('legacy: /prototype/?computer=about keeps the address', (await go('/prototype/?computer=about')) === '/?computer=about');
    ok(`legacy: /prototype/work/${id}/ goes to the case study`, (await go(`/prototype/work/${id}/`)) === `/projects/${id}/`);
    ok('legacy: /computer/about/ opened on its own goes to the lab reading it', (await go('/computer/about/')) === '/?computer=about');
    ok(`legacy: /projects/${id}/ stays (shareable, indexable)`, (await go(`/projects/${id}/`)) === `/projects/${id}/` && (await p.evaluate(() => !document.querySelector('meta[name=robots][content*=noindex]'))));
    const links = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/')));
    ok('legacy: the case study links nowhere dead (no /#… anchors)', !links.some((h) => /^\/#/.test(h)), links.slice(0, 8));
    await p.context().close();
  }

  // 8. Reduced motion, and the Motion setting.
  if (run('motion')) {
    const p = await page({ reduced: true });
    await p.goto(base + '/?probe');
    await drawn(p);
    await sleep(IDLE_WAIT);
    const still = await p.evaluate(() => ({ running: document.querySelector('[data-lab-root]').dataset.running, hint: window.__lab.stats().hint }));
    ok('reduced motion: the room holds still, no idle hint', still.running === 'false' && still.hint === 0, still);
    const t0 = Date.now();
    await enter(p);
    const seen = await p.evaluate(() => document.documentElement.dataset.pc);
    await reading(p);
    ok('reduced motion: going in cuts (no flight)', seen === 'read' || seen === 'fade', { first: seen, ms: Date.now() - t0 });
    await p.context().close();
    const q = await page({ reduced: false });
    await q.goto(base + '/?probe');
    await drawn(q);
    await q.click('[data-settings-toggle]');
    await q.click('[data-motion-toggle]');
    await sleep(300);
    const off = await q.evaluate(() => ({ motion: document.documentElement.dataset.motion, stored: localStorage.getItem('motion'), running: document.querySelector('[data-lab-root]').dataset.running }));
    ok('Motion setting: off stops the room and is remembered', off.motion === 'off' && off.stored === 'off' && off.running === 'false', off);
    await q.reload();
    await drawn(q);
    ok('Motion setting: off survives a reload', (await q.evaluate(() => document.documentElement.dataset.motion)) === 'off');
    await q.context().close();
  }

  // 9. The idle hint: once, after IDLE_MS with nothing touched; never after an interaction.
  if (run('hint')) {
    const p = await page({ reduced: false });
    await p.goto(base + '/?probe');
    await drawn(p);
    let peak = 0;
    for (let i = 0; i < 20; i++) { await sleep(500); peak = Math.max(peak, await p.evaluate(() => window.__lab.stats().hint)); }
    ok('hint: shows once when left idle', peak > 0.2, { peak });
    await p.context().close();
    const q = await page({ reduced: false });
    await q.goto(base + '/?probe');
    await drawn(q);
    await q.mouse.down(); await q.mouse.up();
    let peak2 = 0;
    for (let i = 0; i < 20; i++) { await sleep(500); peak2 = Math.max(peak2, await q.evaluate(() => window.__lab.stats().hint)); }
    ok('hint: a press cancels it', peak2 === 0, { peak: peak2 });
    await q.context().close();
  }

  // 10. No WebGL: the still, the link over its monitor; a click (tap) goes in, and so does Enter on it.
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
        const [px, py] = getComputedStyle(img).objectPosition.split(' ').map((p) => parseFloat(p) / 100);
        const [ox, oy] = [(innerWidth - iw) * px, (innerHeight - ih) * py];
        const pic = [ox + iw * v('--still-ml'), oy + ih * v('--still-mt'), iw * (v('--still-mr') - v('--still-ml')), ih * (v('--still-mb') - v('--still-mt'))];
        const link = [m.x, m.y, m.width, m.height];
        return { still: img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1', src: img.currentSrc.split('/').pop(), link: link.map(Math.round), pictured: pic.map(Math.round), onPicture: link.every((x, i) => Math.abs(x - pic[i]) <= 1.5), inView: m.left >= 0 && m.right <= innerWidth && m.top - 7 >= 0 && m.bottom + 7 <= innerHeight, hit: document.elementFromPoint(m.x + m.width / 2, m.y + m.height / 2)?.matches('[data-lab-monitor]') };
      });
      ok(`no WebGL ${w}x${h}: the still shows, its monitor a link over the pictured monitor, in view with room for the ring`, r.still && r.onPicture && r.inView && r.hit, r);
      await p.screenshot({ path: `${shots}/nowebgl-opening-${w}x${h}.jpg`, type: 'jpeg', quality: 85 });
      await enter(p, touch);
      await reading(p);
      ok(`no WebGL ${w}x${h}: the still's monitor opens the computer (across the window)`, where(p) === '/?computer=work' && (await p.evaluate(() => document.documentElement.hasAttribute('data-pc-full'))));
      await p.keyboard.press('Escape');
      await closed(p);
      await sleep(300);
      const f = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      await p.keyboard.press('Enter');
      await reading(p);
      ok(`no WebGL ${w}x${h}: Escape returns focus to the link, and Enter on it goes in again`, f === 'Explore my work' && where(p) === '/?computer=work', { focus: f });
      await p.context().close();
    }
  }

  // 11. No JavaScript: the still's monitor is a link to a usable page.
  if (run('nojs')) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const p = await page({ w, h, js: false });
      await p.goto(base + '/');
      await sleep(400);
      const r = await p.evaluate(() => ({ href: document.querySelector('[data-lab-monitor]').getAttribute('href'), vis: [...document.querySelectorAll('a, button')].filter((e) => e.checkVisibility({ visibilityProperty: true })).map((e) => (e.getAttribute('aria-label') || e.textContent).trim()) }));
      ok(`no JS ${w}x${h}: the monitor, a link to the Work page, is the one control (Settings not offered)`, r.href === '/computer/work/' && r.vis.length === 1, r);
      await p.screenshot({ path: `${shots}/nojs-opening-${w}x${h}.jpg`, type: 'jpeg', quality: 85 });
      await Promise.all([p.waitForURL('**/computer/work/'), enter(p)]);
      await p.waitForLoadState();
      const pg = await p.evaluate(() => ({ at: location.pathname, nav: [...document.querySelectorAll('.scr-nav a')].map((a) => a.textContent.trim()), back: document.querySelector('[data-leave]')?.getAttribute('href'), cards: document.querySelectorAll('main a[href*="/computer/work/"]').length }));
      ok(`no JS ${w}x${h}: the Work page stands alone, with its places and the way back`, pg.at === '/computer/work/' && pg.nav.length === 4 && pg.back === '/' && pg.cards > 2, pg);
      await p.screenshot({ path: `${shots}/nojs-work-${w}x${h}.jpg`, type: 'jpeg', quality: 85 });
      await p.context().close();
    }
  }

  // 12. Enlarged text and short windows: nothing essential clipped.
  if (run('fit')) {
    for (const [w, h, zoom, touch] of [[1280, 800, 2], [390, 844, 2, true], [1024, 400, 1], [740, 360, 1, true], [568, 320, 1.5, true]]) {
      const p = await page({ w, h, touch, reduced: true, init: zoom !== 1 ? `document.addEventListener('DOMContentLoaded', () => document.documentElement.style.fontSize = '${zoom * 100}%')` : null });
      await p.goto(base + '/?probe');
      await drawn(p);
      await p.evaluate(() => document.fonts.ready);
      await sleep(700);
      const r = await p.evaluate(() => {
        const box = (s) => { const e = document.querySelector(s).getBoundingClientRect(); return { l: e.left, t: e.top + scrollY, r: e.right, b: e.bottom + scrollY }; };
        const parts = { name: box('.home-id'), settings: box('[data-settings-toggle]') };
        const mon = box('[data-lab-monitor]');
        const W = document.scrollingElement.scrollWidth, H = document.scrollingElement.scrollHeight;
        const within = Object.values(parts).every((p) => p.l >= 0 && p.r <= W && p.t >= 0 && p.b <= H);
        const hit = (a, b) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
        const inView = mon.l >= 0 && mon.r <= innerWidth && mon.t - scrollY >= 0 && mon.b - scrollY <= innerHeight;
        return { within, overlap: hit(parts.name, parts.settings), monUnder: hit(parts.name, mon) || hit(parts.settings, mon), inView, scroll: H - innerHeight, scrollX: W - innerWidth };
      });
      ok(`fit ${w}x${h} text ${zoom * 100}%: name and Settings reachable, apart, no sideways scroll; the monitor in view`, r.within && !r.overlap && r.scrollX <= 0 && r.inView, r);
      if (r.monUnder) console.log(`  note: at ${w}x${h} text ${zoom * 100}% the name or Settings covers part of the monitor`);
      await p.screenshot({ path: `${shots}/fit-${w}x${h}-text${zoom * 100}.jpg`, type: 'jpeg', quality: 85, fullPage: true });
      await enter(p, touch);
      await reading(p);
      const rd = await frame(p).evaluate(() => { const b = document.querySelector('[data-leave]').getBoundingClientRect(); return { back: b.top >= 0 && b.bottom <= innerHeight && b.width > 0, scroll: document.scrollingElement.scrollHeight > innerHeight }; });
      ok(`fit ${w}x${h} text ${zoom * 100}%: reading, "Back to room" in view`, rd.back, rd);
      await p.context().close();
    }
  }

  // 13. Save-Data: the scene waits; the still and its monitor's link work.
  if (run('savedata')) {
    const p = await page({ init: () => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }) });
    await p.goto(base + '/');
    await sleep(2500);
    const r = await p.evaluate(() => ({ canvas: !!document.querySelector('[data-lab-stage] canvas'), still: document.querySelector('.still img').complete }));
    ok('Save-Data: no scene until asked for, the still shows', !r.canvas && r.still, r);
    await enter(p);
    await reading(p);
    ok('Save-Data: the still\'s monitor opens the computer', where(p) === '/?computer=work');
    await p.context().close();
  }

  // 14. Settings: a press inside (on its note) keeps it open; Escape closes it wherever the focus is (a
  //     click leaves it on the page in Safari); a press elsewhere, or the focus moving out, closes it.
  if (run('settings')) {
    const p = await page();
    await p.goto(base + '/');
    await drawn(p);
    const isOpen = () => p.evaluate(() => !document.getElementById('settings').hidden);
    await p.click('[data-settings-toggle]');
    const note = await p.locator('.settings-note').boundingBox();
    await p.mouse.click(note.x + 12, note.y + note.height / 2);
    const afterNote = await isOpen();
    await p.evaluate(() => document.activeElement.blur());
    await p.keyboard.press('Escape');
    const afterEsc = { open: await isOpen(), focus: await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) };
    await p.click('[data-settings-toggle]');
    await p.mouse.click(700, 120);
    const afterElsewhere = await isOpen();
    await p.focus('[data-settings-toggle]');
    await p.keyboard.press('Enter');
    const openedByKey = await isOpen();
    await p.keyboard.press('Shift+Tab');
    const afterShiftTab = { open: await isOpen(), focus: await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) };
    ok('settings: a press on its note keeps it open; Escape (focus on the page) closes it, focus on its button', afterNote && !afterEsc.open && afterEsc.focus === 'Settings', { afterNote, afterEsc });
    ok('settings: a press elsewhere closes it; so does the focus moving out', !afterElsewhere && openedByKey && !afterShiftTab.open && afterShiftTab.focus === 'Explore my work', { afterElsewhere, openedByKey, afterShiftTab });
    await p.context().close();
  }

  // 15. Leaving and close requests, from a case study (two entries in): Escape in the page leaves for the
  //     room; a close request with no Escape behind it (Android's Back; here dialog.requestClose()) goes
  //     back one page; the browser shutting the dialog leaves at once, one history step; a resize in
  //     flight lands in the layout the window has now; focus comes back to the link if what had it can't.
  if (run('close')) {
    const caseStudy = async (p) => {
      const card = await frame(p).evaluate(() => [...document.querySelectorAll('a[href*="/computer/work/"]')].map((a) => a.getAttribute('href')).find((h) => /\/computer\/work\/[\w-]+\/$/.test(h)));
      await frame(p).click(`a[href="${card}"]`);
      await p.waitForFunction(() => /\?computer=work\/[\w-]+$/.test(location.search));
      await p.waitForFunction(() => /\/computer\/work\/[\w-]+\/$/.test(document.querySelector('.pc-frame').contentWindow.location.pathname));
      await sleep(300);
    };
    let p = await page({ reduced: false });
    await p.goto(base + '/');
    await drawn(p);
    await enter(p);
    await reading(p);
    await caseStudy(p);
    await frame(p).locator('body').press('Escape');
    await closed(p);
    ok('close: Escape in a case study (two pages in) leaves for the room', where(p) === '/', where(p));
    await sleep(600);
    await enter(p);
    await reading(p);
    await caseStudy(p);
    const rc = await p.evaluate(() => typeof HTMLDialogElement.prototype.requestClose === 'function');
    await p.evaluate(() => document.querySelector('[data-pc-dialog]').requestClose());
    await p.waitForFunction(() => location.search === '?computer=work');
    await p.waitForFunction(() => document.querySelector('.pc-frame')?.contentWindow.location.pathname.endsWith('/computer/work/'));
    await sleep(300);
    const one = await p.evaluate(() => ({ pc: document.documentElement.dataset.pc, open: document.querySelector('[data-pc-dialog]').open }));
    await p.evaluate(() => document.querySelector('[data-pc-dialog]').requestClose());
    await closed(p);
    ok('close: a close request with no Escape (platform Back) goes back one page, then to the room', rc && one.pc === 'read' && one.open && where(p) === '/', { requestClose: rc, one, now: where(p) });
    await p.context().close();

    // The browser shutting the dialog: at once (no return flight), one step back to the opening, not past it.
    p = await page({ reduced: false });
    await p.goto(base + '/computer/about/');
    await p.waitForURL('**/?computer=about');
    await reading(p);
    await p.goto(base + '/');
    await drawn(p);
    await enter(p);
    await reading(p);
    await caseStudy(p);
    // (Every state the page goes through from here, to tell a cut from a flight.)
    await p.evaluate(() => {
      window.__pcs = [];
      new MutationObserver(() => window.__pcs.push(document.documentElement.dataset.pc ?? '-')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pc'] });
      document.querySelector('[data-pc-dialog]').close();
    });
    await closed(p);
    await sleep(800);
    const shut = await p.evaluate(() => ({ at: location.pathname + location.search, pcs: window.__pcs, dialog: document.querySelector('[data-pc-dialog]').open }));
    ok('close: shut by the browser, it leaves at once for the opening, one step back', shut.at === '/' && shut.pcs.length > 0 && !shut.pcs.includes('return') && !shut.dialog, shut);
    await p.context().close();

    // Resized in flight: from the monitor to a narrow window while the camera flies in.
    p = await page({ reduced: false });
    await p.goto(base + '/');
    await drawn(p);
    await sleep(400);
    await enter(p);
    await p.waitForFunction(() => document.documentElement.dataset.pc === 'fly');
    await p.setViewportSize({ width: 700, height: 900 });
    await reading(p);
    await sleep(300);
    const rs = await p.evaluate(() => ({ full: document.documentElement.hasAttribute('data-pc-full'), fr: (({ x, width }) => [x, width].map(Math.round))(document.querySelector('.pc-frame').getBoundingClientRect()) }));
    ok('close: narrowed during the flight in, it lands across the window', rs.full && rs.fr[0] === 0 && rs.fr[1] === 700, rs);
    await p.context().close();

    // The focus came from a Settings switch (its panel shuts as the lab opens): back to the monitor's link.
    p = await page({ reduced: false });
    await p.goto(base + '/');
    await drawn(p);
    await p.focus('[data-settings-toggle]');
    await p.keyboard.press('Enter');
    await p.focus('[data-motion-toggle]');
    await p.evaluate(() => (location.hash = 'about'));
    await reading(p);
    await frame(p).locator('body').press('Escape');
    await closed(p);
    await sleep(200);
    const fb = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    ok('close: opened with the focus on a Settings switch, it comes back to the monitor\'s link', fb === 'Explore my work', { focus: fb });
    await p.context().close();

    // Reduced motion with the scene not yet loaded (Save-Data): it cuts in without waiting for the scene.
    p = await page({ reduced: true, init: () => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }) });
    await p.goto(base + '/');
    await sleep(500);
    const t0 = Date.now();
    await enter(p);
    await reading(p);
    const cut = { ms: Date.now() - t0, scene: await p.evaluate(() => !!document.querySelector('[data-lab-stage] canvas')) };
    ok('close: reduced motion, the scene not loaded: it cuts in without loading it first', !cut.scene, cut);
    await p.context().close();
  }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
const IDLE_WAIT = 6500;
