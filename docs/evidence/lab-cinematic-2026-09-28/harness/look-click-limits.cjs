// The look-around's limits on the homepage's opening, at each size in W (default 1280x800, 1440x900,
// 1920x1080): from the room at 62%/72% of [data-lab-root], a mouse drag of 12 moves of 60 px (sideways) or
// 30 px (up/down) in each direction, and two diagonals toward the monitor's corner of the frame (left+down,
// left+up), held 2.5 s. At each limit it logs __lab.stats() lookAz/lookEl/lookAzMax, __lab.quad() (the
// monitor's screen corners), the quad's margins to the window with the bezel allowed for, where the page
// last saw the pointer, and takes a JPEG (plus a copy with the quad drawn on it). Then it lets go and logs
// how long lookAz and lookEl take to come back within 0.01 of the composed view (the pointer stays still,
// so its parallax stays at the press point's value, about -0.007/+0.007).
// Names are the mouse's direction: drag-left turns to positive az, which swings the monitor toward the left
// edge (the side aabec24 limits).
// NODE_PATH=<playwright shim or $(npm root -g)> BASE=http://127.0.0.1:4322 OUT=<shots dir> node look-click-limits.cjs
const L = require('./look-click-lib.cjs');
const path = require('path');

const sizes = (process.env.W || '1280x800,1440x900,1920x1080').split(',');
const DIRS = [
  ['drag-left', -60, 0],
  ['drag-right', 60, 0],
  ['drag-up', 0, -30],
  ['drag-down', 0, 30],
  ['drag-left-down', -60, 30],
  ['drag-left-up', -60, -30],
];
const HOLD = Number(process.env.HOLD || 2500);

(async () => {
  const lg = L.logger(process.env.NAME || 'look-click-limits');
  const browser = await L.launch();
  const fails = [];
  for (const wh of sizes) {
    const [W, H] = wh.split('x').map(Number);
    const { ctx, page, errors } = await L.open(browser, { width: W, height: H });
    const rend = await L.renderer(page);
    lg.header(rend);
    lg.log(`== ${wh} renderer="${rend}"`);
    const box = await page.locator('[data-lab-root]').boundingBox();
    const cx = box.x + box.width * 0.62;
    const cy = box.y + box.height * 0.72;
    const rest = await L.state(page);
    lg.log('rest', { able: await page.evaluate(() => document.documentElement.hasAttribute('data-pc-able')), lookAz: L.r4(rest.lookAz), lookEl: L.r4(rest.lookEl), lookAzMax: L.r4(rest.lookAzMax), margins: L.margins(rest.quad, W, H) });
    for (const [name, dx, dy] of DIRS) {
      await page.mouse.move(cx, cy, { steps: 4 });
      await page.waitForTimeout(700);
      const pre = await L.state(page, cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(cx + dx * i, cy + dy * i);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(HOLD);
      const s = await L.state(page, cx + dx * 12, cy + dy * 12);
      const m = L.margins(s.quad, W, H);
      const file = path.join(L.OUT, `look-click-${wh}-${name}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
      const after = await L.state(page);
      const m2 = L.margins(after.quad, W, H);
      const inside = Math.min(m.left, m.right, m.top, m.bottom, m2.left, m2.right, m2.top, m2.bottom);
      const ok = inside >= 0;
      if (!ok) fails.push(`${wh} ${name}: bezel ${inside}px outside`);
      lg.log(name, {
        pre: { lookAz: L.r4(pre.lookAz), lookEl: L.r4(pre.lookEl), cursor: pre.rootCursor },
        lookAz: L.r4(s.lookAz),
        lookEl: L.r4(s.lookEl),
        lookAzMax: L.r4(s.lookAzMax),
        azOverMax: L.r4(s.lookAz - s.lookAzMax),
        quad: s.quad.map((p) => p.map(L.r1)),
        margins: m,
        afterShot: { lookAz: L.r4(after.lookAz), lookEl: L.r4(after.lookEl), left: m2.left, bottom: m2.bottom },
        codeMarginPx: L.r1(W * 0.015),
        cursor: s.rootCursor,
        pointerSeen: s.seen,
        insideWithBezel: ok ? 'PASS' : 'FAIL',
      });
      await L.mark(browser, file, s.quad, W, file.replace(/\.jpg$/, '-marked.jpg'));
      // Let go where the pointer is (no move: its parallax stays at the press point's value).
      await page.mouse.up();
      const t0 = Date.now();
      let back = null;
      const trace = [];
      while (Date.now() - t0 < 6000) {
        const b = await page.evaluate(() => {
          const s = window.__lab.stats();
          return [s.lookAz, s.lookEl];
        });
        const t = Date.now() - t0;
        if (trace.length < 70) trace.push([t, L.r4(b[0]), L.r4(b[1])]);
        if (back == null && Math.abs(b[0]) < 0.01 && Math.abs(b[1]) < 0.01) back = t;
        if (back != null && t > back + 300) break;
        await page.waitForTimeout(100);
      }
      const end = await L.state(page);
      lg.log(name + ' release', { backWithin001ms: back, end: { lookAz: L.r4(end.lookAz), lookEl: L.r4(end.lookEl), dragged: end.dragged, pc: end.pc }, trace });
      if (back == null) fails.push(`${wh} ${name}: did not ease back within 6 s`);
      if (end.pc) fails.push(`${wh} ${name}: the drag entered the computer (data-pc=${end.pc})`);
    }
    if (errors.length) lg.log('errors', errors);
    await ctx.close();
  }
  lg.log('SUMMARY', fails.length ? { result: 'FAIL', fails } : { result: 'PASS' });
  lg.write();
  await browser.close();
})();
