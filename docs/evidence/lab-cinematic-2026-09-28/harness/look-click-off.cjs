// Where the look-around must be off on /prototype/'s opening, each on a fresh page; in each a mouse
// hover across the stage and a 12 x 30 px drag from the room (ending short of the monitor) must leave lookAz/lookEl at 0 and the
// drawn view where it was (__lab.quad() read without stats(), so no extra frame is drawn), with no
// 'grab' cursor:
//   reduce     reducedMotion 'reduce' at 1440x900 (and a click on the monitor still enters, as a cut)
//   switch     the header's Motion switch turned off at 1440x900 (then on again: the drag turns the view);
//              and the switch turned off just after a drag is let go, while the view is still easing back
//   reading    the computer open (after "Explore the lab") at 1440x900: drags beside and over the page
//   stacked    1024x768 (not data-pc-able): drag and hover over the stage band; a click on the monitor
// With the look off (reduce, switch, stacked) it also drags from the room onto the monitor and lets go
// there: like the same drag with the look on, that must not enter (or, stacked, scroll to #work).
//   touch      hasTouch + isMobile at 390x844, and hasTouch at 1440x900: a vertical touch drag on the
//              stage scrolls the page and doesn't turn the view; a sideways one doesn't turn it either
//              (CDP Input.dispatchTouchEvent, then Input.synthesizeScrollGesture as a second source)
// NODE_PATH=<playwright shim or $(npm root -g)> BASE=http://127.0.0.1:4322 node look-click-off.cjs
const L = require('./look-click-lib.cjs');

(async () => {
  const lg = L.logger(process.env.NAME || 'look-click-off');
  const browser = await L.launch();
  const results = [];
  const check = (id, ok, detail) => {
    results.push([id, ok ? 'PASS' : 'FAIL']);
    lg.log(`${ok ? 'PASS' : 'FAIL'} ${id}`, detail);
  };
  const fresh = async (opts) => {
    const o = await L.open(browser, opts);
    const rend = await L.renderer(o.page);
    lg.header(rend);
    return o;
  };
  const quadNow = (page) => page.evaluate(() => window.__lab?.quad() ?? null);
  const qd = (a, b) => (a && b ? L.r1(Math.max(...a.flatMap((p, i) => [Math.abs(p[0] - b[i][0]), Math.abs(p[1] - b[i][1])]))) : null);
  const room = async (page) => {
    const box = await page.locator('[data-lab-root]').boundingBox();
    return [box.x + box.width * 0.62, box.y + box.height * 0.72, box];
  };
  // Hover across the stage, then a drag from the room (12 moves of `step` px sideways; the default ends
  // in the room, short of the monitor); the most |lookAz|/|lookEl| seen, the cursors seen, and how far
  // the drawn screen quad moved.
  async function tryLook(page, { label, rx, ry, box, step = -30, stats = true }) {
    const q0 = await quadNow(page);
    let maxAz = 0;
    let maxEl = 0;
    const cursors = new Set();
    const read = async (x, y) => {
      const s = stats ? await L.state(page, x, y) : await page.evaluate(() => ({ rootCursor: document.querySelector('[data-lab-root]').style.cursor }));
      if (stats) {
        maxAz = Math.max(maxAz, Math.abs(s.lookAz ?? 0));
        maxEl = Math.max(maxEl, Math.abs(s.lookEl ?? 0));
      }
      cursors.add(s.rootCursor);
    };
    for (let i = 0; i <= 6; i++) {
      const x = box.x + box.width * (0.05 + (0.9 * i) / 6);
      const y = box.y + box.height * 0.6;
      await page.mouse.move(x, y, { steps: 3 });
      await page.waitForTimeout(250);
      await read(x, y);
    }
    const qHover = await quadNow(page);
    await page.mouse.move(rx, ry, { steps: 3 });
    await page.waitForTimeout(300);
    await read(rx, ry);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(rx + step * i, ry);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1200);
    const qDrag = await quadNow(page);
    await read(rx + step * 12, ry);
    const pickAtRelease = await page.evaluate(([x, y]) => window.__lab.pick(x, y), [rx + step * 12, ry]);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await L.state(page);
    return {
      label,
      drag: [L.r1(rx), L.r1(ry), '->', L.r1(rx + step * 12), L.r1(ry)],
      pickAtRelease,
      maxAbsAz: L.r4(maxAz),
      maxAbsEl: L.r4(maxEl),
      rootCursors: [...cursors],
      quadMovedHoverPx: qd(q0, qHover),
      quadMovedDragPx: qd(q0, qDrag),
      dragged: after.dragged,
      running: after.running,
      pc: after.pc,
    };
  }
  // `drifting`: the scene runs (motion on), so the quad moves with the drift whatever the look does.
  // No turn, no grab cursors, the view where it was. `dragged` isn't asked: a mouse press that moves is a
  // drag with the look off too (so letting go over the monitor isn't a click on it), and it's logged.
  const noLook = (r, drifting = false) => r.maxAbsAz === 0 && r.maxAbsEl === 0 && !r.rootCursors.includes('grab') && !r.rootCursors.includes('grabbing') && (drifting || (r.quadMovedDragPx ?? 0) < 0.5);
  // With the look off: a press in the room, moved across onto the monitor and let go there. It's still a
  // drag (the same gesture that doesn't enter with the look on); it shouldn't enter, or scroll to #work.
  async function dragOntoMonitor(page, rx, ry) {
    const [mx, my] = L.centre(await quadNow(page));
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.move(rx, ry, { steps: 3 });
    await page.waitForTimeout(300);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(rx + ((mx - rx) * i) / 12, ry + ((my - ry) * i) / 12);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(300);
    const pick = await page.evaluate(([x, y]) => window.__lab.pick(x, y), [mx, my]);
    await page.mouse.up();
    await page.waitForTimeout(2500);
    const s = await L.state(page);
    return { from: [L.r1(rx), L.r1(ry)], releasedAt: [L.r1(mx), L.r1(my)], distancePx: L.r1(Math.hypot(mx - rx, my - ry)), pickAtRelease: pick, dragged: s.dragged, pc: s.pc, url: await page.evaluate(() => location.pathname + location.search + location.hash), scrolledPx: s.scrollY - y0 };
  }
  const stayed = (d) => d.pickAtRelease === true && !d.pc && Math.abs(d.scrolledPx) < 2;

  // --- reduced motion --------------------------------------------------------------------------------
  {
    const { ctx, page, errors } = await fresh({ width: 1440, height: 900, reducedMotion: 'reduce' });
    lg.log('== reduce 1440x900 renderer', await L.renderer(page));
    const [rx, ry, box] = await room(page);
    const env = await page.evaluate(() => ({ motion: document.documentElement.dataset.motion, able: document.documentElement.hasAttribute('data-pc-able'), running: document.querySelector('[data-lab-root]').dataset.running }));
    const r = await tryLook(page, { label: 'reduce', rx, ry, box });
    check('off: reducedMotion reduce', noLook(r) && !r.pc, { env, ...r });
    const d = await dragOntoMonitor(page, rx, ry);
    check('reduce: a drag from the room let go over the monitor does not enter', stayed(d), d);
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await fresh({ width: 1440, height: 900, reducedMotion: 'reduce' });
    const [mx, my] = L.centre(await quadNow(page));
    await page.mouse.move(mx, my, { steps: 3 });
    await page.waitForTimeout(200);
    const cur = await L.state(page, mx, my);
    await page.evaluate(() => {
      window.__pcSeen = [];
      new MutationObserver(() => window.__pcSeen.push(document.documentElement.dataset.pc ?? null)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pc'] });
    });
    await page.mouse.click(mx, my);
    await page.waitForTimeout(2500);
    const pcs = await page.evaluate(() => window.__pcSeen);
    check('reduce: a click on the monitor still enters, without a flight', pcs.includes('read') && !pcs.includes('fly'), { cursorOverMonitor: cur.rootCursor, pcSequence: pcs });
    if (errors.length) lg.log('errors', errors);
    await ctx.close();
  }

  // --- the Motion switch -------------------------------------------------------------------------------
  {
    const { ctx, page, errors } = await fresh({ width: 1440, height: 900 });
    lg.log('== switch 1440x900');
    const [rx, ry, box] = await room(page);
    const sw = page.locator('[data-motion-toggle]:visible').first();
    await sw.click();
    await page.waitForTimeout(400);
    const env = await page.evaluate(() => ({ motion: document.documentElement.dataset.motion, stored: localStorage.getItem('motion'), aria: document.querySelector('[data-motion-toggle]').getAttribute('aria-checked'), running: document.querySelector('[data-lab-root]').dataset.running }));
    const r = await tryLook(page, { label: 'switch off', rx, ry, box });
    check('off: the Motion switch turned off', env.motion === 'off' && noLook(r) && !r.pc, { env, ...r });
    await sw.click();
    await page.waitForTimeout(600);
    const on = await tryLook(page, { label: 'switch on again', rx, ry, box });
    check('on again: the drag turns the view', on.maxAbsAz > 0.04 && on.rootCursors.includes('grabbing') && !on.pc, on);
    await page.waitForTimeout(2500);
    await sw.click();
    await page.waitForTimeout(400);
    const d = await dragOntoMonitor(page, rx, ry);
    check('switch off: a drag from the room let go over the monitor does not enter', stayed(d), { motion: await page.evaluate(() => document.documentElement.dataset.motion), ...d });
    if (errors.length) lg.log('errors', errors);
    await ctx.close();
  }
  // Turned off just after a drag is let go (the view still easing back), at once or a second later: what
  // the canvas holds, and what happens at the next frame something else draws (hovering the monitor
  // changes its light, which draws one). Run 1 also takes both pictures, side by side, to OUT.
  for (const [run, delay] of [
    [1, 0],
    [2, 0],
    [3, 1000],
  ]) {
    const { ctx, page } = await fresh({ width: 1440, height: 900 });
    const [rx, ry] = await room(page);
    const rest = await L.state(page);
    await page.mouse.move(rx, ry, { steps: 3 });
    await page.waitForTimeout(300);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(rx - 60 * i, ry);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1500);
    await page.mouse.up();
    const t0 = Date.now();
    if (delay) await page.waitForTimeout(delay);
    const sw = page.locator('[data-motion-toggle]:visible').first();
    await sw.click(); // moves the pointer to the bar and clicks
    const clickMs = Date.now() - t0;
    await page.waitForTimeout(800);
    const qHeld = await quadNow(page);
    const running = await page.evaluate(() => document.querySelector('[data-lab-root]').dataset.running);
    await page.waitForTimeout(1500);
    const qLater = await quadNow(page);
    const shotA = require('path').join(L.OUT, 'look-click-switchoff-held.jpg');
    const shotB = require('path').join(L.OUT, 'look-click-switchoff-after-hover.jpg');
    if (run === 1) await page.screenshot({ path: shotA, type: 'jpeg', quality: 86 });
    // Hovering the monitor (its light changes) draws a frame at the current look (0).
    const [mx, my] = L.centre(qLater);
    await page.mouse.move(mx, my, { steps: 3 });
    await page.waitForTimeout(300);
    const qHover = await quadNow(page);
    if (run === 1) await page.screenshot({ path: shotB, type: 'jpeg', quality: 86 });
    const st = await L.state(page);
    lg.log(`info switch off ${delay} ms after letting go (run ${run})`, {
      clickMs,
      running,
      restQuadLeftX: L.r1(rest.quad[0][0]),
      heldQuadLeftX: L.r1(qHeld[0][0]),
      heldVsRestPx: qd(qHeld, rest.quad),
      stillHeldAfter2300ms: qd(qLater, qHeld),
      afterHoverQuadLeftX: L.r1(qHover[0][0]),
      afterHoverVsRestPx: qd(qHover, rest.quad),
      jumpOnHoverPx: qd(qHover, qLater),
      lookAzVar: L.r4(st.lookAz),
    });
    if (run === 1) {
      // Side by side at half size: held (left), after hovering the monitor (right).
      const fs = require('fs');
      const p2 = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
      const out = await p2.evaluate(
        async ([a, b]) => {
          const load = async (s) => {
            const i = new Image();
            i.src = 'data:image/jpeg;base64,' + s;
            await i.decode();
            return i;
          };
          const [ia, ib] = await Promise.all([load(a), load(b)]);
          const c = document.createElement('canvas');
          c.width = ia.width + 8;
          c.height = ia.height / 2;
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          g.drawImage(ia, 0, 0, ia.width / 2, ia.height / 2);
          g.drawImage(ib, ia.width / 2 + 8, 0, ib.width / 2, ib.height / 2);
          return c.toDataURL('image/jpeg', 0.86).split(',')[1];
        },
        [fs.readFileSync(shotA).toString('base64'), fs.readFileSync(shotB).toString('base64')],
      );
      fs.writeFileSync(require('path').join(L.OUT, 'look-click-switchoff-pair.jpg'), Buffer.from(out, 'base64'));
      await p2.context().close();
    }
    await ctx.close();
  }

  // --- reading: the computer open --------------------------------------------------------------------
  {
    const { ctx, page, errors } = await fresh({ width: 1440, height: 900 });
    lg.log('== reading 1440x900');
    await page.click('[data-lab-enter]');
    await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      window.__seen.rootTypes = {};
    });
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [30, 450]);
    const res = [];
    for (const [label, from, to] of [
      ['beside the page', [30, 450], [30 + 400, 470]],
      ['over the page', [720, 450], [720 - 500, 450]],
    ]) {
      await page.mouse.move(from[0], from[1], { steps: 3 });
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 12, from[1] + ((to[1] - from[1]) * i) / 12);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(600);
      const s = await L.state(page, to[0], to[1]);
      await page.mouse.up();
      res.push({ label, lookAz: L.r4(s.lookAz), lookEl: L.r4(s.lookEl), rootCursor: s.rootCursor, pc: s.pc });
    }
    const rootEvents = await page.evaluate(() => window.__seen.rootTypes);
    const pcNow = await page.evaluate(() => document.documentElement.dataset.pc ?? null);
    check('off: while the computer is open', res.every((r) => r.lookAz === 0 && r.lookEl === 0 && r.rootCursor === '') && pcNow === 'read', { elementAtLeftMargin: top, drags: res, rootPointerEvents: rootEvents, pcAfter: pcNow });
    if (errors.length) lg.log('errors', errors);
    await ctx.close();
  }

  // --- stacked: 1024x768 -------------------------------------------------------------------------------
  {
    const { ctx, page, errors } = await fresh({ width: 1024, height: 768 });
    lg.log('== stacked 1024x768');
    const env = await page.evaluate(() => ({ able: document.documentElement.hasAttribute('data-pc-able'), running: document.querySelector('[data-lab-root]').dataset.running, drawn: document.querySelector('[data-lab-root]').dataset.drawn != null }));
    const [rx, ry, box] = await room(page);
    const r = await tryLook(page, { label: 'stacked', rx: box.x + box.width * 0.62, ry: box.y + box.height * 0.6, box, step: 30 });
    check('off: a window that is not data-pc-able (1024x768)', !env.able && noLook(r, true) && !r.pc, { env, stage: [L.r1(box.x), L.r1(box.y), L.r1(box.width), L.r1(box.height)], ...r });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    const d = await dragOntoMonitor(page, box.x + box.width * 0.75, box.y + box.height * 0.7);
    check('stacked: a drag from the room let go over the monitor does not scroll to #work', stayed(d), d);
    // The monitor: pointer cursor, and a click scrolls to the Work section instead of entering.
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    const q = await quadNow(page);
    const [mx, my] = L.centre(q);
    const b2 = await page.locator('[data-lab-root]').boundingBox();
    const inStage = mx > b2.x && mx < b2.x + b2.width && my > b2.y && my < b2.y + b2.height;
    let info = { quadCentre: [L.r1(mx), L.r1(my)], inStage };
    if (inStage) {
      await page.mouse.move(mx, my, { steps: 3 });
      await page.waitForTimeout(200);
      const c = await L.state(page, mx, my);
      await page.mouse.click(mx, my);
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => ({ y: scrollY, pc: document.documentElement.dataset.pc ?? null, work: Math.round(document.getElementById('work').getBoundingClientRect().top) }));
      info = { ...info, cursorOverMonitor: c.rootCursor, afterClick: after };
    }
    lg.log('info stacked monitor click', info);
    if (errors.length) lg.log('errors', errors);
    await ctx.close();
  }

  // --- touch -------------------------------------------------------------------------------------------
  for (const [label, opts] of [
    ['390x844 hasTouch isMobile', { width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
    ['1440x900 hasTouch', { width: 1440, height: 900, hasTouch: true }],
  ]) {
    const { ctx, page, errors } = await fresh(opts);
    lg.log(`== touch ${label}`);
    const cdp = await ctx.newCDPSession(page);
    const env = await page.evaluate(() => ({ able: document.documentElement.hasAttribute('data-pc-able'), coarse: matchMedia('(pointer: coarse)').matches, drawn: document.querySelector('[data-lab-root]').dataset.drawn != null, scrollH: document.documentElement.scrollHeight }));
    const box = await page.locator('[data-lab-root]').boundingBox();
    const x0 = box.x + box.width * 0.62;
    const y0 = box.y + box.height * 0.72;
    const touch = async (dx, dy) => {
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(400);
      const q0 = await quadNow(page);
      await page.evaluate(() => {
        window.__seen.rootTypes = {};
      });
      const y00 = await page.evaluate(() => scrollY);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      let maxAz = 0;
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * i, y: y0 + dy * i }] });
        await page.waitForTimeout(30);
        const s = await L.state(page);
        maxAz = Math.max(maxAz, Math.abs(s.lookAz ?? 0), Math.abs(s.lookEl ?? 0));
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(800);
      const s = await L.state(page);
      return { scrolledPx: s.scrollY - y00, maxAbsLook: L.r4(maxAz), rootCursor: s.rootCursor, dragged: s.dragged, pc: s.pc, rootPointerEvents: await page.evaluate(() => window.__seen.rootTypes), quadMovedPx: qd(q0, s.quad) };
    };
    const vert = await touch(0, -30);
    const side = await touch(-30, 0);
    // A second source of touch input: Chrome's synthetic touch scroll gesture.
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__seen.rootTypes = {};
    });
    await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(x0), y: Math.round(y0), yDistance: -300, gestureSourceType: 'touch', speed: 800 });
    await page.waitForTimeout(600);
    const g = await L.state(page);
    const gesture = { scrolledPx: g.scrollY, lookAz: L.r4(g.lookAz), lookEl: L.r4(g.lookEl), dragged: g.dragged, rootPointerEvents: await page.evaluate(() => window.__seen.rootTypes) };
    const ok = vert.scrolledPx > 50 && vert.maxAbsLook === 0 && side.maxAbsLook === 0 && vert.dragged === false && side.dragged === false && !vert.pc && !side.pc && gesture.scrolledPx > 50 && gesture.lookAz === 0;
    check(`off: touch (${label}): a touch drag scrolls the page, not the view`, ok, { env, vertical: vert, sideways: side, synthesizeScrollGesture: gesture });
    if (errors.length) lg.log('errors', errors);
    await ctx.close();
  }

  const failed = results.filter((r) => r[1] === 'FAIL').map((r) => r[0]);
  lg.log('SUMMARY', { checks: results.length, failed: failed.length, result: failed.length ? 'FAIL' : 'PASS', ...(failed.length ? { failures: failed } : {}) });
  lg.write();
  await browser.close();
})();
