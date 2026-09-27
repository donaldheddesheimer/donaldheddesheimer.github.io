// Enter the lab at each size and record where the screen frame and the robots' bodies land (T=95 also sweeps the dance).
// Needs the probe build: DIST=$(sh probe-build.sh), then python3 -m http.server 4331 --bind 127.0.0.1 --directory "$DIST".
// Playwright is not a project dependency: run with a global install, NODE_PATH=$(npm root -g) node <script>.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4331/';
const widths = (process.env.W || '1024x768,1280x800,1440x900,1920x1080').split(',');
const desks = (process.env.DESKS || '').split(';').filter(Boolean);
const out = process.env.OUT;
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const d of desks.length ? desks : ['']) for (const wh of widths) {
    const [width, height] = wh.split('x').map(Number);
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    await page.goto(BASE + (d ? `?desk=${d}` : ''), { waitUntil: 'load' });
    await page.waitForSelector('[data-robot-root][data-drawn]', { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.click('[data-lab-enter]');
    await page.waitForSelector('html[data-lab="open"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const f = document.querySelector('.lab-frame').getBoundingClientRect();
      const b = window.__bounds();
      return { frame: [f.left, f.top, f.right, f.bottom].map(Math.round), robots: b.robots, url: location.pathname + location.search };
    });
    const vis = r.robots.map(([x0, y0, x1, y1]) => {
      const visW = Math.max(0, Math.min(x1, width) - Math.max(x0, r.frame[2]));
      return Math.round((100 * visW) / (x1 - x0));
    });
    console.log(`${d || 'src'} @${width}x${height}: frame ${r.frame}, robots ${JSON.stringify(r.robots)}, % visible right of frame ${vis}, url ${r.url}`);
    // With T set: sweep the dance clock in the lab (0..T s every STEP s) for the worst case of each robot:
    // least visible share right of the frame, least room to the window's right edge and to the bar.
    if (process.env.T) {
      const s = await page.evaluate(({ T, STEP, width, fr }) => {
        const bar = document.querySelector('.lab-bar')?.getBoundingClientRect().bottom ?? 0;
        const out = [0, 1, 2].map(() => ({ vis: 101, right: 1e9, top: 1e9, height: 0, reach: [0, 0, -1e9] }));
        for (let t = 0; t <= T; t += STEP) {
          window.__at(t);
          window.__reach(0.4).forEach((q, i) => { if (q[2] > out[i].reach[2]) out[i].reach = q; });
          window.__bounds().robots.forEach(([x0, y0, x1, y1], i) => {
            const o = out[i];
            o.vis = Math.min(o.vis, Math.round((100 * Math.max(0, Math.min(x1, width) - Math.max(x0, fr))) / (x1 - x0)));
            o.right = Math.min(o.right, width - x1);
            o.top = Math.min(o.top, y0 - bar);
            o.height = Math.max(o.height, y1 - y0);
          });
        }
        return out;
      }, { T: +process.env.T, STEP: +(process.env.STEP || 0.5), width, fr: r.frame[2] });
      console.log(`  dance 0..${process.env.T}s: ` + s.map((o, i) => `robot ${i + 1}: min ${o.vis}% visible, min ${o.right} px to the right edge, min ${o.top} px below the bar, max ${o.height} px tall, furthest right at X ${o.reach[0]} m, Z ${o.reach[1]} m`).join('; '));
    }
    if (out) await page.screenshot({ path: `${out}/lab-${(d || 'src').replace(/,/g, '_')}-${width}x${height}.png`, timeout: 180000 });
    await page.close();
  }
  await browser.close();
})();
