// The released pages against a baseline build of origin/main (67f036f): full-page screenshots of each
// page from both servers, with reduced motion so the home page's robots hold one still pose, compared
// pixel by pixel in the browser. BASE_B=BASE_A gives the capture's own noise floor (a build against
// itself). NODE_PATH=$(npm root -g) node release-diff.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const A = process.env.BASE_A || 'http://127.0.0.1:4330';
const B = process.env.BASE_B || 'http://127.0.0.1:4321';
const pages = (process.env.PAGES || '/,/projects/cucadence/,/systems/').split(',');
const sizes = (process.env.W || '1440x900,390x844').split(',');
const out = process.env.OUT || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const cmp = await (await browser.newContext()).newPage();
  for (const wh of sizes) {
    const [width, height] = wh.split('x').map(Number);
    for (const path of pages) {
      const shots = [];
      for (const base of [A, B]) {
        const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        await page.goto(base + path, { waitUntil: 'load' });
        if (await page.$('[data-robot-stage], .hero-robots, [data-drawn]')) await page.waitForTimeout(500);
        await page.waitForFunction(() => !document.querySelector('canvas') || document.querySelector('[data-drawn], [data-failed]'), null, { timeout: 60000 }).catch(() => {});
        // Lazy images below the fold load or not depending on timing: load and decode every one first.
        await page.evaluate(() => Promise.all([...document.images].map((i) => ((i.loading = 'eager'), i.decode().catch(() => {})))));
        await page.waitForTimeout(2500);
        shots.push(await page.screenshot({ fullPage: true, timeout: 180000 }));
        await ctx.close();
      }
      const r = await cmp.evaluate(async ([a, b]) => {
        const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { same: false, size: [`${ia.width}x${ia.height}`, `${ib.width}x${ib.height}`] };
        const px = (i) => { const c = new OffscreenCanvas(i.width, i.height); const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
        const [da, db] = [px(ia), px(ib)];
        let diff = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let k = 0; k < da.length; k += 4) {
          if (da[k] !== db[k] || da[k + 1] !== db[k + 1] || da[k + 2] !== db[k + 2]) {
            diff++;
            const p = k / 4, x = p % ia.width, y = Math.floor(p / ia.width);
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          }
        }
        return { same: diff === 0, size: `${ia.width}x${ia.height}`, diffPixels: diff, box: diff ? [x0, y0, x1, y1] : null };
      }, shots.map((s) => s.toString('base64')));
      console.log(JSON.stringify({ size: wh, path, ...r }));
      if (!r.same) shots.forEach((s, i) => fs.writeFileSync(`${out}/rel-${['base', 'now'][i]}-${wh}-${path.replace(/\W+/g, '_')}.png`, s));
    }
  }
  await browser.close();
})();
