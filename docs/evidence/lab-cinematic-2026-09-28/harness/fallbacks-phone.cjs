// /prototype/ on phones and in the stacked layout. Checks, at 390x844 (DPR 3) and 360x640 (DPR 2), both
// isMobile + hasTouch: the page scrolls by touch (CDP touch drags, started on the room and on the text,
// and a synthesized touch scroll gesture), no camera gesture follows a touch (__lab look stays 0,
// dragged() false), no horizontal overflow (scrollWidth <= innerWidth, plus the elements whose boxes pass
// the right edge), the four sections (Work, About, Résumé, Contact) at full width with their smallest text
// sizes, what "Explore the lab" and a tap on the monitor do, and where the computer's addresses send a
// phone. At 1024x768 (stacked, not data-pc-able): what the opening shows, that the lab can't be entered
// (link, monitor click, direct address), that a mouse drag doesn't look around; and a lab opened at
// 1440x900 then resized to 1024x768 (data-pc-full), and narrowed to 800, 600 and 390 wide: does the
// computer's bar (Screen.astro) fit, with "Leave computer" in view. Every page's errors and failed
// requests are logged.
// Screenshots (CSS-pixel scale) go to SHOTS; the log to ../logs/fallbacks-phone.log.
// NODE_PATH=<dir with the playwright shim> node fallbacks-phone.cjs   (BASE defaults to http://127.0.0.1:4322)
const { chromium } = require('playwright');
const C = require('./fallbacks-common.cjs');

const L = C.makeLog('fallbacks-phone');
const log = L.log;
const SECTIONS = ['work', 'about', 'resume', 'contact'];
const waitRoom = (page) => page.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 60000 });
const look = (page) => page.evaluate(() => (window.__lab ? { az: +window.__lab.stats().lookAz.toFixed(4), el: +window.__lab.stats().lookEl.toFixed(4), dragged: window.__lab.dragged() } : null));

async function touchDrag(cdp, page, x, y, dy, steps = 10) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// Where the page's boxes pass the window's right edge (the first few), and the document's own width.
const overflow = (page) =>
  page.evaluate(() => {
    const iw = innerWidth;
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.right > iw + 1 && getComputedStyle(el).visibility !== 'hidden') out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} right=${Math.round(r.right)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: iw, bodyScrollWidth: document.body.scrollWidth, pastRight: out.length, first: out.slice(0, 6) };
  });

async function phone(browser, width, height, dpr) {
  const tag = `${width}x${height}`;
  log(`\n== phone ${tag} DPR ${dpr} (isMobile, hasTouch) ==`);
  const ctx = await C.newCtx(browser, { viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const w = C.watch(page, tag);
  await page.addInitScript(() => {
    window.__ptr = [];
    addEventListener('pointerdown', (e) => window.__ptr.push(e.pointerType), true);
  });
  await page.goto(`${C.SERVER}/prototype/?probe`, { waitUntil: 'load' });
  await waitRoom(page);
  await page.waitForTimeout(1500);
  const r = await C.rendererOf(page);
  L.setRenderer(r);
  log('renderer', r);
  log('state', await C.labState(page));
  log(
    'layout',
    await page.evaluate(() => {
      const box = (s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), shown: getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' };
      };
      const sw = [...document.querySelectorAll('[data-motion-toggle]')].map((b) => ({ cls: b.className.split(' ').slice(-1)[0], shown: !!b.offsetParent && b.getBoundingClientRect().width > 0 }));
      const q = window.__lab?.quad();
      return { bar: box('[data-home-bar]'), copy: box('.lab-copy'), stage: box('[data-lab-stage]'), cap: box('.lab-cap'), tabbar: box('.tabbar'), motionSwitches: sw, monitorQuad: q ? q.map(([x, y]) => [Math.round(x), Math.round(y)]) : null };
    }),
  );
  log('overflow at the top', await overflow(page));
  await page.screenshot({ path: `${C.SHOTS}/fallbacks-phone-opening-${tag}.jpg`, type: 'jpeg', quality: 86, scale: 'css' });

  // Touch: a drag that starts on the room, then one on the text, then back down; twice each.
  const cdp = await ctx.newCDPSession(page);
  const stage = await page.locator('[data-lab-stage]').boundingBox();
  const copy = await page.locator('.lab-copy').boundingBox();
  for (let run = 1; run <= 2; run++) {
    for (const [where, x, y] of [
      ['room', stage.x + stage.width / 2, Math.min(stage.y + stage.height / 2, height - 60)],
      ['text', copy.x + copy.width / 2, Math.min(copy.y + copy.height / 2, height - 60)],
    ]) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(400);
      const before = { y: await page.evaluate(() => Math.round(scrollY)), look: await look(page) };
      await page.evaluate(() => (window.__ptr = []));
      await touchDrag(cdp, page, Math.round(x), Math.round(y), -300);
      await page.waitForTimeout(900);
      const after = { y: await page.evaluate(() => Math.round(scrollY)), look: await look(page), pointerTypes: [...new Set(await page.evaluate(() => window.__ptr))], cursor: await page.evaluate(() => document.querySelector('[data-lab-root]').style.cursor), pc: await page.evaluate(() => document.documentElement.dataset.pc ?? null) };
      await touchDrag(cdp, page, Math.round(x), 200, 250);
      await page.waitForTimeout(900);
      const back = await page.evaluate(() => Math.round(scrollY));
      log(`touch drag run ${run} from ${where} (${Math.round(x)},${Math.round(y)}) up 300px`, { before, after, afterDragDown250: back });
    }
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  const y0 = await page.evaluate(() => scrollY);
  await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(stage.x + stage.width / 2), y: Math.round(Math.min(stage.y + stage.height / 2, height - 60)), yDistance: -400, gestureSourceType: 'touch', speed: 1200 });
  await page.waitForTimeout(900);
  log('synthesized touch scroll gesture on the room, 400px', { from: Math.round(y0), to: await page.evaluate(() => Math.round(scrollY)), look: await look(page) });

  // A tap on the monitor, then on "Explore the lab" (which reads "See the work" where the lab can't open).
  for (let run = 1; run <= 2; run++) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(500);
    const q = await page.evaluate(() => window.__lab?.quad());
    if (q) {
      const cx = q.reduce((s, p) => s + p[0], 0) / 4;
      const cy = q.reduce((s, p) => s + p[1], 0) / 4;
      const picked = await page.evaluate(([x, y]) => window.__lab.pick(x, y), [cx, cy]);
      await page.touchscreen.tap(cx, cy);
      await page.waitForTimeout(1500);
      log(`tap on the monitor run ${run} at (${Math.round(cx)},${Math.round(cy)})`, { pickHit: picked, ...(await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, y: Math.round(scrollY), workTop: Math.round(document.getElementById('work').getBoundingClientRect().top), dialogOpen: document.querySelector('[data-pc-dialog]').open, pc: document.documentElement.dataset.pc ?? null }))) });
    }
    await page.evaluate(() => {
      history.replaceState(null, '', '/prototype/?probe');
      scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    await page.locator('[data-lab-enter]').tap();
    await page.waitForTimeout(1500);
    log(`tap on the enter link run ${run}`, await page.evaluate(() => ({ label: [...document.querySelectorAll('[data-lab-enter] span')].find((s) => getComputedStyle(s).display !== 'none')?.textContent, url: location.pathname + location.search + location.hash, y: Math.round(scrollY), workTop: Math.round(document.getElementById('work').getBoundingClientRect().top), dialogOpen: document.querySelector('[data-pc-dialog]').open, pc: document.documentElement.dataset.pc ?? null })));
  }
  await page.screenshot({ path: `${C.SHOTS}/fallbacks-phone-after-enter-${tag}.jpg`, type: 'jpeg', quality: 86, scale: 'css' });

  // The four sections: in the page's width, their headings, their smallest text.
  for (const id of SECTIONS) {
    const s = await page.evaluate((id) => {
      const el = document.getElementById(id);
      el.scrollIntoView({ block: 'start' });
      const r = el.getBoundingClientRect();
      const sizes = [];
      let outside = 0;
      for (const n of el.querySelectorAll('*')) {
        const hasText = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
        const b = n.getBoundingClientRect();
        if (!b.width || getComputedStyle(n).display === 'none') continue;
        if (b.left < -1 || b.right > innerWidth + 1) outside++;
        if (hasText) sizes.push(parseFloat(getComputedStyle(n).fontSize));
      }
      const p = el.querySelector('p');
      return {
        heading: el.querySelector('h1, h2')?.textContent.trim(),
        box: { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) },
        textNodes: sizes.length,
        minFontPx: Math.min(...sizes),
        under12px: sizes.filter((x) => x < 12).length,
        firstParagraphPx: p ? parseFloat(getComputedStyle(p).fontSize) : null,
        boxesPastEdges: outside,
      };
    }, id);
    log(`section #${id}`, s);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${C.SHOTS}/fallbacks-phone-${id}-${tag}.jpg`, type: 'jpeg', quality: 86, scale: 'css' });
  }
  log('overflow, whole page', await overflow(page));

  // The computer's addresses, on a phone: the ordinary page with the same content.
  for (const u of ['/prototype/?computer=about', '/prototype/?computer=work/cucadence', '/computer/resume/', '/computer/work/cucadence/']) {
    await page.goto(C.SERVER + u, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    log(`address ${u} ->`, await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, y: Math.round(scrollY), pc: document.documentElement.dataset.pc ?? null, sw: document.documentElement.scrollWidth, iw: innerWidth })));
  }
  log('errors', w.summary());
  await ctx.close();
  return w.clean();
}

async function stacked(browser) {
  const tag = '1024x768';
  log(`\n== stacked ${tag} (mouse, DPR 1) ==`);
  const ctx = await C.newCtx(browser, { viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const w = C.watch(page, tag);
  await page.goto(`${C.SERVER}/prototype/?probe`, { waitUntil: 'load' });
  await waitRoom(page);
  await page.waitForTimeout(1500);
  const r = await C.rendererOf(page);
  L.setRenderer(r);
  log('renderer', r);
  log('state', await C.labState(page));
  log(
    'layout',
    await page.evaluate(() => {
      const box = (s) => {
        const b = document.querySelector(s)?.getBoundingClientRect();
        return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
      };
      const q = window.__lab?.quad();
      return { copy: box('.lab-copy'), stage: box('[data-lab-stage]'), work: box('#work'), monitorQuad: q ? q.map(([x, y]) => [Math.round(x), Math.round(y)]) : null, sw: document.documentElement.scrollWidth, iw: innerWidth };
    }),
  );
  await page.screenshot({ path: `${C.SHOTS}/fallbacks-stacked-opening-${tag}.jpg`, type: 'jpeg', quality: 86 });

  // A mouse drag over the room: no look-around here. One ends off the monitor, one over it (a drag is
  // not a click: in the full opening scene.dragged() suppresses the click that ends it).
  await page.evaluate(() => {
    window.__ev = [];
    document.querySelector('[data-lab-root]').addEventListener('click', (e) => window.__ev.push(`click ${e.target.tagName} ${Math.round(e.clientX)},${Math.round(e.clientY)}`));
  });
  for (let run = 1; run <= 2; run++) {
    for (const endOn of ['off the monitor', 'on the monitor']) {
      await page.mouse.move(5, 5);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => scrollY === 0);
      await page.waitForTimeout(300);
      const stage = await page.locator('[data-lab-stage]').boundingBox();
      const q = await page.evaluate(() => window.__lab.quad());
      const from = [stage.x + stage.width * 0.6, stage.y + stage.height * 0.5];
      const to = endOn === 'on the monitor' ? [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4] : [stage.x + stage.width * 0.8, from[1] + 60];
      await page.evaluate(() => (window.__ev = []));
      await page.mouse.move(...from);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 12, from[1] + ((to[1] - from[1]) * i) / 12);
      await page.waitForTimeout(500);
      const during = { look: await look(page), cursor: await page.evaluate(() => document.querySelector('[data-lab-root]').style.cursor) };
      await page.mouse.up();
      await page.waitForTimeout(1500);
      log(`mouse drag run ${run}, ${Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]))}px, released ${endOn}`, { during, after: await look(page), clicks: await page.evaluate(() => window.__ev), y: await page.evaluate(() => Math.round(scrollY)), url: (await C.labState(page)).url });
    }
  }
  await page.mouse.move(5, 5);

  for (let run = 1; run <= 2; run++) {
    await page.evaluate(() => {
      history.replaceState(null, '', '/prototype/?probe');
      scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    await page.click('[data-lab-enter]');
    await page.waitForTimeout(1200);
    log(`click on the enter link run ${run}`, await C.labState(page), await page.evaluate(() => ({ workTop: Math.round(document.getElementById('work').getBoundingClientRect().top) })));
    await page.evaluate(() => {
      history.replaceState(null, '', '/prototype/?probe');
      scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
    const q = await page.evaluate(() => window.__lab?.quad());
    const cx = q.reduce((s, p) => s + p[0], 0) / 4;
    const cy = q.reduce((s, p) => s + p[1], 0) / 4;
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(200);
    const cursor = await page.evaluate(() => document.querySelector('[data-lab-root]').style.cursor);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1500);
    log(`click on the monitor run ${run} at (${Math.round(cx)},${Math.round(cy)})`, { cursorOver: cursor, ...(await C.labState(page)), workTop: await page.evaluate(() => Math.round(document.getElementById('work').getBoundingClientRect().top)) });
  }
  for (const u of ['/prototype/?computer=about', '/prototype/?computer=work/cucadence', '/computer/contact/']) {
    await page.goto(C.SERVER + u, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    log(`address ${u} ->`, await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, y: Math.round(scrollY), pc: document.documentElement.dataset.pc ?? null, dialogOpen: document.querySelector('[data-pc-dialog]')?.open ?? null })));
  }
  log('errors', w.summary());
  await ctx.close();

  // A lab opened at 1440x900, then the window made 1024x768: the page across the window (data-pc-full).
  log('\n== lab opened at 1440x900, resized to 1024x768 and back ==');
  const ctx2 = await C.newCtx(browser, { viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  const w2 = C.watch(p2, 'resize');
  const frameBox = () => p2.evaluate(() => {
    const f = document.querySelector('.pc-frame');
    if (!f) return null;
    const b = f.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), opacity: getComputedStyle(f).opacity };
  });
  for (let run = 1; run <= 2; run++) {
    await p2.goto(`${C.SERVER}/prototype/?computer=about&probe`, { waitUntil: 'load' });
    await p2.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
    await p2.waitForTimeout(2500);
    log(`run ${run} at 1440x900`, await C.labState(p2), { frame: await frameBox() });
    await p2.setViewportSize({ width: 1024, height: 768 });
    await p2.waitForTimeout(1200);
    log(`run ${run} at 1024x768`, await C.labState(p2), { frame: await frameBox() });
    if (run === 1) await p2.screenshot({ path: `${C.SHOTS}/fallbacks-stacked-full-1024x768.jpg`, type: 'jpeg', quality: 86 });
    await p2.setViewportSize({ width: 1440, height: 900 });
    await p2.waitForTimeout(1200);
    log(`run ${run} back at 1440x900`, await C.labState(p2), { frame: await frameBox() });
    await p2.keyboard.press('Escape');
    await p2.waitForTimeout(2500);
    log(`run ${run} after Escape`, await C.labState(p2), { active: await p2.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)) });
  }
  // Narrower than the computer's bar: the lab in full mode at 600x900 and 390x844 (a desktop window
  // narrowed, or zoomed in, while reading). Does the bar fit, and is "Leave computer" in view?
  log('\n== lab opened at 1440x900, narrowed to 800, 600 and 390 wide (full mode): the computer bar ==');
  for (let run = 1; run <= 2; run++) {
    for (const path of ['about', 'work/cucadence']) {
      await p2.setViewportSize({ width: 1440, height: 900 });
      await p2.goto(`${C.SERVER}/prototype/?computer=${path}&probe`, { waitUntil: 'load' });
      await p2.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
      await p2.waitForTimeout(1500);
      for (const [vw, vh] of [
        [800, 900],
        [600, 900],
        [390, 844],
      ]) {
        await p2.setViewportSize({ width: vw, height: vh });
        await p2.waitForTimeout(800);
        const f = p2.frames().find((fr) => fr.url().includes('/computer/'));
        const inner = await f.evaluate(() => {
          const q = (s) => {
            const e = document.querySelector(s);
            const b = e.getBoundingClientRect();
            return { display: getComputedStyle(e).display, left: Math.round(b.left), right: Math.round(b.right) };
          };
          return { innerWidth, scrollWidth: document.documentElement.scrollWidth, under44rem: matchMedia('(width < 44rem)').matches, name: q('.scr-name').display, ordinaryLink: q('.scr-quiet'), leave: q('.scr-leave') };
        });
        log(`run ${run} ${path} ${vw}x${vh}`, { full: (await C.labState(p2)).pcFull, ...inner, leaveInView: inner.leave.right <= inner.innerWidth });
        if (run === 1 && path === 'about' && vw === 390) await p2.screenshot({ path: `${C.SHOTS}/fallbacks-full-bar-390x844.jpg`, type: 'jpeg', quality: 86 });
      }
    }
  }
  log('errors', w2.summary());
  await ctx2.close();
  return w.clean() && w2.clean();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await phone(browser, 390, 844, 3);
    await phone(browser, 360, 640, 2);
    await stacked(browser);
  } catch (e) {
    log('HARNESS ERROR', e.stack.split('\n').slice(0, 4).join(' | '));
  } finally {
    await browser.close();
    L.save();
  }
})();
