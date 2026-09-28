// The baseline's answer to a drag let go over the monitor, for comparison with look-click-off.cjs: on the
// build of origin/main cc1a6c4 (before the cinematic branch; no look-around, no __lab probe), at 1440x900,
// with motion on and with reducedMotion 'reduce'. It finds the monitor by hovering a grid over the stage
// and reading the cursor the page sets there ('pointer'), then presses in the room at 62%/72% of
// [data-lab-root], moves in 12 steps onto the monitor, lets go, and logs html[data-pc] 2.5 s later. A plain
// click on the monitor is logged too.
// NODE_PATH=<playwright shim or $(npm root -g)> BASE=http://127.0.0.1:4330 node look-click-baseline.cjs
process.env.BASE ||= 'http://127.0.0.1:4330';
const L = require('./look-click-lib.cjs');

(async () => {
  const lg = L.logger(process.env.NAME || 'look-click-baseline', process.env.BASE);
  const browser = await L.launch();
  for (const reduce of [false, true]) {
    for (const how of ['drag from the room onto the monitor', 'plain click on the monitor']) {
      const { ctx, page, errors } = await L.open(browser, { width: 1440, height: 900, query: '', reducedMotion: reduce ? 'reduce' : 'no-preference' });
      const rend = await L.renderer(page);
      lg.header(rend);
      const box = await page.locator('[data-lab-root]').boundingBox();
      // The monitor: the first grid point (left half, lower half) where the page shows a pointer cursor.
      let mon = null;
      for (let gy = 0.45; gy <= 0.95 && !mon; gy += 0.05)
        for (let gx = 0.02; gx <= 0.6 && !mon; gx += 0.03) {
          const x = box.x + box.width * gx;
          const y = box.y + box.height * gy;
          await page.mouse.move(x, y);
          await page.waitForTimeout(40);
          const c = await page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y)).cursor, [x, y]);
          if (c === 'pointer' && (await page.evaluate(([x, y]) => !document.elementFromPoint(x, y).closest('a, button'), [x, y]))) mon = [x + 12, y + 8];
        }
      if (!mon) {
        lg.log({ reduce, how, result: 'monitor not found by cursor' });
        await ctx.close();
        continue;
      }
      const rx = box.x + box.width * 0.62;
      const ry = box.y + box.height * 0.72;
      if (how.startsWith('drag')) {
        await page.mouse.move(rx, ry, { steps: 3 });
        await page.waitForTimeout(300);
        await page.mouse.down();
        for (let i = 1; i <= 12; i++) {
          await page.mouse.move(rx + ((mon[0] - rx) * i) / 12, ry + ((mon[1] - ry) * i) / 12);
          await page.waitForTimeout(16);
        }
        await page.waitForTimeout(300);
        await page.mouse.up();
      } else {
        await page.mouse.click(mon[0], mon[1]);
      }
      await page.waitForTimeout(2500);
      const pc = await page.evaluate(() => ({ pc: document.documentElement.dataset.pc ?? null, url: location.pathname + location.search + location.hash }));
      lg.log({ reduce, how, monitorAt: mon.map(L.r1), from: how.startsWith('drag') ? [L.r1(rx), L.r1(ry)] : null, ...pc });
      if (errors.length) lg.log('errors', errors);
      await ctx.close();
    }
  }
  lg.write();
  await browser.close();
})();
