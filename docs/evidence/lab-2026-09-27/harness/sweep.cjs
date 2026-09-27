// TEST-ONLY pose/drift sweep on the probe build: pause, then set the dance clock over 0..T s and record
// clearances between the introduction's text, the desk and the robots, and robots vs the canvas edges.
// Needs the probe build: DIST=$(sh probe-build.sh), then python3 -m http.server 4331 --bind 127.0.0.1 --directory "$DIST".
// Playwright is not a project dependency: run with a global install, NODE_PATH=$(npm root -g) node <script>.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4331/';
const widths = (process.env.W || '1024x768,1280x800,1440x900,1920x1080,390x844').split(',');
const T = +(process.env.T || 95), STEP = +(process.env.STEP || 0.25);
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const wh of widths) {
    const [width, height] = wh.split('x').map(Number);
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    if (process.env.CSS) await page.addStyleTag({ content: process.env.CSS });
    await page.waitForSelector('[data-robot-root][data-drawn]', { timeout: 30000 });
    await page.waitForTimeout(300);
    await page.click('[data-robot-root] .robots-stage ~ * [data-robot-toggle], [data-robot-root] [data-robot-toggle]');
    const r = await page.evaluate(({ T, STEP }) => {
      const copy = document.querySelector('.hero-copy');
      const boxes = [];
      const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode()); ) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const c of rg.getClientRects()) if (c.width) boxes.push([c.left, c.top, c.right, c.bottom]);
      }
      for (const a of copy.querySelectorAll('a, button')) { const c = a.getBoundingClientRect(); boxes.push([c.left, c.top, c.right, c.bottom]); }
      // Clearance from text: horizontal gap to text boxes overlapping vertically; on phones (stacked) vertical gap below.
      const clear = ([x0, y0, x1, y1]) => {
        let g = 1e9;
        for (const [a0, b0, a1, b1] of boxes) {
          if (b1 > y0 && b0 < y1 && a1 > x0 - 2000 && a0 < x1) g = Math.min(g, x0 >= a1 - 1 ? x0 - a1 : -Math.min(x1, a1) + Math.max(x0, a0));
        }
        return g;
      };
      const out = { edgeAt: '', desk: 1e9, robots: 1e9, edge: 1e9, deskRobotOverlapSamples: 0, samples: 0, deskHidden: false, worstDeskT: 0, worstRobotT: 0 };
      for (let t = 0; t <= T; t += STEP) {
        window.__at(t);
        const b = window.__bounds();
        const [cx0, cy0, cx1, cy1] = b.canvas;
        out.samples++;
        if (b.desk[0] > 1e8 || b.desk[2] < cx0 || b.desk[0] > cx1) out.deskHidden = true;
        else {
          const d = clear(b.desk);
          if (d < out.desk) { out.desk = d; out.worstDeskT = t; }
        }
        b.robots.forEach((rb, i) => {
          const g = clear(rb);
          if (g < out.robots) { out.robots = g; out.worstRobotT = t; }
          const e = { left: rb[0] - cx0, right: cx1 - rb[2], top: rb[1] - cy0, bottom: cy1 - rb[3] };
          for (const k in e) if (e[k] < out.edge) { out.edge = e[k]; out.edgeAt = `robot ${i} ${k} t=${t.toFixed(2)}`; }
        });
        for (const rb of b.robots) {
          const [dx0, dy0, dx1, dy1] = b.desk;
          if (dx1 > rb[0] && dx0 < rb[2] && dy1 > rb[1] && dy0 < rb[3]) { out.deskRobotOverlapSamples++; break; }
        }
      }
      return out;
    }, { T, STEP });
    const f = (v) => (v > 1e8 ? 'n/a' : Math.round(v));
    console.log(`${width}x${height}: ${r.samples} samples t=0..${T}s; desk↔text min ${f(r.desk)} px (t=${r.worstDeskT.toFixed(2)})${r.deskHidden ? ' [desk off-canvas/hidden in some samples]' : ''}; robots↔text min ${f(r.robots)} px (t=${r.worstRobotT.toFixed(2)}); robots↔canvas edge min ${f(r.edge)} px (${r.edgeAt}); desk overlaps a robot box in ${r.deskRobotOverlapSamples} samples`);
    await page.close();
  }
  await browser.close();
})();
