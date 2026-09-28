// Pointer input on the homepage's opening, at W (default 1440x900), each case on a fresh page:
//   parallax   the mouse moved across the stage with no button held turns the view a little (|lookAz| <=
//              0.03, |lookEl| <= 0.015) and doesn't count as a drag
//   cursor     'grab' over the room, 'pointer' over the monitor, 'grabbing' while dragging, back to 'grab'
//              after letting go (root.style.cursor, and the computed cursor of the element under the pointer)
//   click      a plain click on the monitor (the centre of __lab.quad()) enters (html[data-pc='read']);
//              a press on the monitor that moves 4 px, or 5 px, and lets go also enters
//   drag       a drag from the room let go over the monitor doesn't enter, nor does one that starts on the
//              monitor and moves away, nor one that starts on the monitor and moves 8 or 30 px and ends on
//              it; after a drag, a plain click on the monitor still enters
//   links      a drag that starts on Resume, or on "Explore the lab", doesn't turn the view (and opens no
//              tab, and doesn't enter)
//   enter      clicking "Explore the lab" enters; Tab to it and Enter enters
//   pen        a pen drag (CDP pointerType 'pen') turns the view like the mouse
// NODE_PATH=<playwright shim or $(npm root -g)> BASE=http://127.0.0.1:4322 node look-click-input.cjs
const L = require('./look-click-lib.cjs');

const [W, H] = (process.env.W || '1440x900').split('x').map(Number);
const wh = `${W}x${H}`;

(async () => {
  const lg = L.logger(process.env.NAME || 'look-click-input');
  const browser = await L.launch();
  const results = [];
  const check = (id, ok, detail) => {
    results.push([id, ok ? 'PASS' : 'FAIL']);
    lg.log(`${ok ? 'PASS' : 'FAIL'} ${id}`, detail);
  };
  const fresh = async () => {
    const o = await L.open(browser, { width: W, height: H });
    o.popups = [];
    o.ctx.on('page', (p) => o.popups.push(p.url()));
    const rend = await L.renderer(o.page);
    lg.header(rend);
    return o;
  };
  const room = async (page) => {
    const box = await page.locator('[data-lab-root]').boundingBox();
    return [box.x + box.width * 0.62, box.y + box.height * 0.72];
  };
  const quadC = async (page) => L.centre(await page.evaluate(() => window.__lab.quad()));
  const settleLook = async (page) => {
    // Wait for any look to ease back (a new page: nothing to wait for).
    await page.waitForFunction(() => Math.abs(window.__lab.stats().lookAz) < 0.012 && Math.abs(window.__lab.stats().lookEl) < 0.012, null, { timeout: 8000 }).catch(() => {});
  };
  const pcAfter = async (page, ms) => {
    const t0 = Date.now();
    let first = null;
    let read = null;
    while (Date.now() - t0 < ms) {
      const pc = await page.evaluate(() => document.documentElement.dataset.pc ?? null);
      if (pc && first == null) first = [Date.now() - t0, pc];
      if (pc === 'read') {
        read = Date.now() - t0;
        break;
      }
      await page.waitForTimeout(50);
    }
    const url = await page.evaluate(() => location.pathname + location.search);
    return { firstPc: first, readMs: read, url };
  };
  const drag = async (page, from, to, n = 12) => {
    await page.mouse.move(from[0], from[1], { steps: 3 });
    await page.waitForTimeout(300);
    await page.mouse.down();
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n);
      await page.waitForTimeout(16);
    }
  };

  lg.log(`== ${wh}`);

  // --- parallax and cursor --------------------------------------------------------------------------
  {
    const { ctx, page, errors } = await fresh();
    lg.log('renderer', await L.renderer(page));
    const box = await page.locator('[data-lab-root]').boundingBox();
    const path = [];
    let maxAz = 0;
    let maxEl = 0;
    // Across at 60% height (under the text, over the monitor), then down at 62% width.
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push([box.x + box.width * (0.02 + (0.96 * i) / 12), box.y + box.height * 0.6]);
    for (let i = 0; i <= 8; i++) pts.push([box.x + box.width * 0.62, box.y + box.height * (0.12 + (0.84 * i) / 8)]);
    for (const [x, y] of pts) {
      await page.mouse.move(x, y, { steps: 4 });
      await page.waitForTimeout(700);
      const s = await L.state(page, x, y);
      maxAz = Math.max(maxAz, Math.abs(s.lookAz));
      maxEl = Math.max(maxEl, Math.abs(s.lookEl));
      path.push([L.r1(x), L.r1(y), L.r4(s.lookAz), L.r4(s.lookEl), s.rootCursor]);
    }
    const st = await L.state(page);
    lg.log('parallax path [x, y, lookAz, lookEl, cursor]', path);
    check('parallax: moving the mouse turns the view slightly', maxAz > 0.015 && maxAz <= 0.0305 && maxEl <= 0.0155 && st.dragged === false && !st.pc, { maxAbsAz: L.r4(maxAz), maxAbsEl: L.r4(maxEl), dragged: st.dragged, pc: st.pc });

    // Cursor over the room, the monitor, while dragging, after.
    const [rx, ry] = await room(page);
    await page.mouse.move(rx, ry, { steps: 4 });
    await page.waitForTimeout(400);
    const overRoom = await L.state(page, rx, ry);
    const [mx, my] = await quadC(page);
    await page.mouse.move(mx, my, { steps: 4 });
    await page.waitForTimeout(400);
    const overMon = await L.state(page, mx, my);
    await drag(page, [rx, ry], [rx - 200, ry - 40], 8);
    const dragging = await L.state(page, rx - 200, ry - 40);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterUp = await L.state(page, rx - 200, ry - 40);
    const textBox = await page.locator('#hero-name').boundingBox();
    await page.mouse.move(textBox.x + 30, textBox.y + textBox.height / 2, { steps: 4 });
    await page.waitForTimeout(300);
    const overText = await L.state(page, textBox.x + 30, textBox.y + textBox.height / 2);
    const c = (s) => ({ root: s.rootCursor, computed: s.cursorAt });
    check("cursor: 'grab' over the room", overRoom.rootCursor === 'grab' && overRoom.cursorAt === 'grab', c(overRoom));
    check("cursor: 'pointer' over the monitor", overMon.rootCursor === 'pointer' && overMon.cursorAt === 'pointer', c(overMon));
    check("cursor: 'grabbing' while dragging", dragging.rootCursor === 'grabbing' && dragging.cursorAt === 'grabbing', c(dragging));
    check("cursor: back to 'grab' after letting go over the room", afterUp.rootCursor === 'grab', c(afterUp));
    lg.log('info cursor over the name (outside the stage)', { ...c(overText), lookAz: L.r4(overText.lookAz) });
    if (errors.length) lg.log('errors', errors);
    await ctx.close();
  }

  // --- a plain click on the monitor -----------------------------------------------------------------
  {
    const { ctx, page } = await fresh();
    const [mx, my] = await quadC(page);
    await page.mouse.move(mx, my, { steps: 3 });
    await page.waitForTimeout(200);
    const pick = await page.evaluate(([x, y]) => window.__lab.pick(x, y), [mx, my]);
    await page.mouse.click(mx, my);
    const r = await pcAfter(page, 6000);
    check('click: a plain click on the monitor enters', r.readMs != null && /computer=work/.test(r.url), { at: [L.r1(mx), L.r1(my)], pick, ...r });
    await ctx.close();
  }

  // --- a press on the monitor that moves under DRAG_PX (6) ------------------------------------------
  for (const [dx, dy] of [
    [4, 0],
    [3, 4],
  ]) {
    const { ctx, page } = await fresh();
    const [mx, my] = await quadC(page);
    await page.mouse.move(mx, my, { steps: 3 });
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.mouse.move(mx + dx, my + dy, { steps: 2 });
    await page.waitForTimeout(150);
    const mid = await L.state(page);
    await page.mouse.up();
    const r = await pcAfter(page, 6000);
    check(`click: a press on the monitor that moves ${Math.hypot(dx, dy)} px still enters`, r.readMs != null, { move: [dx, dy], cursorWhilePressed: mid.rootCursor, ...r });
    await ctx.close();
  }

  // --- drags that must not enter ----------------------------------------------------------------------
  {
    const { ctx, page, popups } = await fresh();
    // From the room, let go over the monitor (where it is by then: the view turns while dragging).
    const [rx, ry] = await room(page);
    let [mx, my] = await quadC(page);
    await drag(page, [rx, ry], [mx, my], 12);
    await page.waitForTimeout(600);
    for (let k = 0; k < 3; k++) {
      [mx, my] = await quadC(page);
      await page.mouse.move(mx, my, { steps: 2 });
      await page.waitForTimeout(250);
    }
    const before = await L.state(page, mx, my);
    const pick = await page.evaluate(([x, y]) => window.__lab.pick(x, y), [mx, my]);
    await page.mouse.up();
    let r = await pcAfter(page, 3000);
    const after = await L.state(page);
    check('drag: from the room, let go over the monitor, does not enter', r.firstPc == null && pick === true && after.dragged === true, { releasedAt: [L.r1(mx), L.r1(my)], pickAtRelease: pick, lookAzAtRelease: L.r4(before.lookAz), cursorAtRelease: before.rootCursor, dragged: after.dragged, ...r });

    // Then a plain click on the monitor enters (the drag is forgotten at the next press).
    await settleLook(page);
    [mx, my] = await quadC(page);
    await page.mouse.move(mx, my, { steps: 2 });
    await page.waitForTimeout(150);
    await page.mouse.click(mx, my);
    r = await pcAfter(page, 6000);
    check('click: after a drag, a plain click on the monitor enters', r.readMs != null, r);
    if (popups.length) lg.log('popups', popups);
    await ctx.close();
  }
  for (const [label, dx, dy] of [
    ['starts on the monitor and moves away (150 px right)', 150, 0],
    ['starts on the monitor, moves 8 px and ends on it', 8, 0],
    ['starts on the monitor, moves 30 px and ends on it', 30, 0],
  ]) {
    const { ctx, page } = await fresh();
    const [mx, my] = await quadC(page);
    await drag(page, [mx, my], [mx + dx, my + dy], dx > 20 ? 10 : 4);
    await page.waitForTimeout(300);
    const s = await L.state(page, mx + dx, my + dy);
    const pick = await page.evaluate(([x, y]) => window.__lab.pick(x, y), [mx + dx, my + dy]);
    await page.mouse.up();
    const r = await pcAfter(page, 3000);
    const after = await L.state(page);
    check(`drag: ${label}, does not enter`, r.firstPc == null && after.dragged === true, { from: [L.r1(mx), L.r1(my)], pickAtRelease: pick, lookAzAtRelease: L.r4(s.lookAz), cursorWhileDragging: s.rootCursor, dragged: after.dragged, ...r });
    await ctx.close();
  }

  // --- drags that start on a link --------------------------------------------------------------------
  for (const [label, sel] of [
    ['Resume', '.lab-copy a[target=_blank]'],
    ['Explore the lab', '[data-lab-enter]'],
  ]) {
    const { ctx, page, popups } = await fresh();
    const b = await page.locator(sel).first().boundingBox();
    const from = [b.x + b.width / 2, b.y + b.height / 2];
    const to = [from[0] + 360, from[1] + 220];
    await page.mouse.move(from[0], from[1], { steps: 3 });
    await page.waitForTimeout(700);
    const pre = await L.state(page);
    await page.mouse.down();
    let maxAz = 0;
    let maxEl = 0;
    let cursors = new Set();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 12, from[1] + ((to[1] - from[1]) * i) / 12);
      await page.waitForTimeout(60);
      const s = await L.state(page);
      maxAz = Math.max(maxAz, Math.abs(s.lookAz));
      maxEl = Math.max(maxEl, Math.abs(s.lookEl));
      cursors.add(s.rootCursor);
    }
    await page.waitForTimeout(800);
    const held = await L.state(page, to[0], to[1]);
    await page.mouse.up();
    const r = await pcAfter(page, 2500);
    const after = await L.state(page);
    const ok = maxAz <= 0.0305 && maxEl <= 0.0155 && !cursors.has('grabbing') && after.dragged === false && r.firstPc == null && popups.length === 0;
    check(`links: a drag that starts on ${label} does not turn the view`, ok, {
      from: from.map(L.r1),
      to: to.map(L.r1),
      pre: { lookAz: L.r4(pre.lookAz), lookEl: L.r4(pre.lookEl) },
      maxAbsAz: L.r4(maxAz),
      maxAbsEl: L.r4(maxEl),
      heldAz: L.r4(held.lookAz),
      rootCursors: [...cursors],
      dragged: after.dragged,
      rootPointerEvents: after.seen && (await page.evaluate(() => window.__seen.rootTypes)),
      popups,
      ...r,
    });
    await ctx.close();
  }

  // --- "Explore the lab": click, and the keyboard -----------------------------------------------------
  {
    const { ctx, page } = await fresh();
    await page.click('[data-lab-enter]');
    const r = await pcAfter(page, 6000);
    check('enter: clicking "Explore the lab" enters', r.readMs != null && /computer=work/.test(r.url), r);
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    let tabs = 0;
    const order = [];
    for (; tabs < 20; tabs++) {
      await page.keyboard.press('Tab');
      const a = await page.evaluate(() => {
        const e = document.activeElement;
        return { enter: !!e?.matches('[data-lab-enter]'), name: (e?.textContent || e?.getAttribute('aria-label') || e?.tagName || '').trim().replace(/\s+/g, ' ').slice(0, 24) };
      });
      order.push(a.name);
      if (a.enter) break;
    }
    const lookBefore = await L.state(page);
    await page.keyboard.press('Enter');
    const r = await pcAfter(page, 6000);
    const focus = await page.evaluate(() => document.activeElement?.tagName + (document.activeElement?.className ? '.' + document.activeElement.className : ''));
    check('enter: Tab to "Explore the lab" and Enter enters', r.readMs != null, { tabs: tabs + 1, order, lookAzBefore: L.r4(lookBefore.lookAz), focusAfter: focus, ...r });
    await ctx.close();
  }

  // --- a pen drag --------------------------------------------------------------------------------------
  {
    const { ctx, page } = await fresh();
    const cdp = await ctx.newCDPSession(page);
    const [rx, ry] = await room(page);
    const ev = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    await ev('mouseMoved', rx, ry, { buttons: 0, button: 'none' });
    await page.waitForTimeout(300);
    await ev('mousePressed', rx, ry);
    for (let i = 1; i <= 12; i++) {
      await ev('mouseMoved', rx - 60 * i, ry);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1500);
    const s = await L.state(page);
    await ev('mouseReleased', rx - 720, ry);
    const r = await pcAfter(page, 2000);
    check('pen: a pen drag turns the view like the mouse', s.lookAz > 0.04 && s.seen?.type === 'pen' && r.firstPc == null, { lookAz: L.r4(s.lookAz), lookAzMax: L.r4(s.lookAzMax), cursor: s.rootCursor, pointerType: s.seen?.type, ...r });
    await ctx.close();
  }

  const failed = results.filter((r) => r[1] === 'FAIL').map((r) => r[0]);
  lg.log('SUMMARY', { checks: results.length, failed: failed.length, result: failed.length ? 'FAIL' : 'PASS', ...(failed.length ? { failures: failed } : {}) });
  lg.write();
  await browser.close();
})();
