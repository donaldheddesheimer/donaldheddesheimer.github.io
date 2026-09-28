// A long hold at the look-around's tight side on /prototype/'s opening, to catch the camera's slow drift
// pushing the monitor out of frame: at each size in W (default 1440x900, 1680x1050), from the room at
// 62%/72% of [data-lab-root], a mouse drag of 12 x 60 px to the left (positive az, which swings the
// monitor toward the left edge; aabec24 limits this side from the drift each frame), held for HOLD ms
// (default 20000), sampling __lab.stats() and __lab.quad() every 250 ms. It logs each sample
// [ms, lookAz, lookAzMax, lookEl, bezel margin left/bottom px], the extremes, and whether the monitor's
// bezel ever left the window or came nearer the left edge than the code's own 1.5% margin, then lets go
// and logs how long lookAz takes to come back within 0.01. A JPEG of the end of the hold goes to OUT.
// NODE_PATH=<playwright shim or $(npm root -g)> BASE=http://127.0.0.1:4322 OUT=<shots dir> node look-click-drift.cjs
const L = require('./look-click-lib.cjs');
const path = require('path');

const sizes = (process.env.W || '1440x900,1680x1050').split(',');
const HOLD = Number(process.env.HOLD || 20000);
const EVERY = 250;

(async () => {
  const lg = L.logger(process.env.NAME || 'look-click-drift');
  const browser = await L.launch();
  const fails = [];
  for (const wh of sizes) {
    const [W, H] = wh.split('x').map(Number);
    const { ctx, page, errors } = await L.open(browser, { width: W, height: H });
    const rend = await L.renderer(page);
    lg.header(rend);
    lg.log(`== ${wh} renderer="${rend}" hold=${HOLD}ms every=${EVERY}ms`);
    const box = await page.locator('[data-lab-root]').boundingBox();
    const cx = box.x + box.width * 0.62;
    const cy = box.y + box.height * 0.72;
    const rest = await L.state(page);
    lg.log('rest', { lookAzMax: L.r4(rest.lookAzMax), margins: L.margins(rest.quad, W, H) });
    await page.mouse.move(cx, cy, { steps: 4 });
    await page.waitForTimeout(700);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(cx - 60 * i, cy);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1000); // reach the limit first
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < HOLD) {
      const next = t0 + (samples.length + 1) * EVERY;
      const s = await L.state(page);
      const m = L.margins(s.quad, W, H);
      samples.push([Date.now() - t0, L.r4(s.lookAz), L.r4(s.lookAzMax), L.r4(s.lookEl), m.left, m.bottom, s.frames]);
      const wait = next - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
    }
    const file = path.join(L.OUT, `look-click-drift-${wh}-end.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
    const endState = await L.state(page);
    await L.mark(browser, file, endState.quad, W, file.replace(/\.jpg$/, '-marked.jpg'));
    const col = (i) => samples.map((s) => s[i]);
    const minLeft = Math.min(...col(4));
    const minBottom = Math.min(...col(5));
    const over = Math.max(...samples.map((s) => s[1] - s[2]));
    const codeMargin = L.r1(W * 0.015);
    const fps = samples.length > 1 ? L.r1(((samples.at(-1)[6] - samples[0][6]) / (samples.at(-1)[0] - samples[0][0])) * 1000) : null;
    const summary = {
      samples: samples.length,
      lookAz: [Math.min(...col(1)), Math.max(...col(1))],
      lookAzMax: [Math.min(...col(2)), Math.max(...col(2))],
      maxAzMinusMax: L.r4(over),
      bezelLeftPx: [minLeft, Math.max(...col(4))],
      bezelBottomMinPx: minBottom,
      codeMarginPx: codeMargin,
      framesPerSecond: fps,
      inside: minLeft >= 0 && minBottom >= 0 ? 'PASS' : 'FAIL',
    };
    if (summary.inside !== 'PASS') fails.push(`${wh}: bezel left the window (left ${minLeft}px, bottom ${minBottom}px)`);
    lg.log('hold', summary);
    lg.log('samples [ms, lookAz, lookAzMax, lookEl, bezelLeftPx, bezelBottomPx, frames]');
    for (let i = 0; i < samples.length; i += 8) lg.log(samples.slice(i, i + 8));
    await page.mouse.up();
    const r0 = Date.now();
    let back = null;
    while (Date.now() - r0 < 6000) {
      const s = await L.state(page);
      if (back == null && Math.abs(s.lookAz) < 0.01 && Math.abs(s.lookEl) < 0.01) back = Date.now() - r0;
      if (back != null) break;
      await page.waitForTimeout(100);
    }
    const end = await L.state(page);
    lg.log('release', { backWithin001ms: back, lookAz: L.r4(end.lookAz), lookEl: L.r4(end.lookEl), pc: end.pc });
    if (back == null) fails.push(`${wh}: did not ease back within 6 s`);
    if (errors.length) lg.log('errors', errors);
    await ctx.close();
  }
  lg.log('SUMMARY', fails.length ? { result: 'FAIL', fails } : { result: 'PASS' });
  lg.write();
  await browser.close();
})();
