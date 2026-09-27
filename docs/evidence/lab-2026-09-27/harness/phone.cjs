// Phone first view: where the opening's copy, stage, caption and controls land against the bottom tab
// bar. Each is "clear" (above the bar), "COVERED n px" (under it) or "below fold" (wholly under it).
// Runs against the production build (npm run preview on :4321), or BASE. S lists the sizes; RM=1
// requests reduced motion; OUT=<dir> also saves a JPEG of each first view.
// Playwright is not a project dependency: run with a global install, NODE_PATH=$(npm root -g) node <script>.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const sizes = (process.env.S || '360x640,375x667,360x740,375x812,390x844,393x852,412x915,414x736,430x932,700x900,768x1024').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const s of sizes) {
    const [width, height] = s.split('x').map(Number);
    const p = await (await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' })).newPage();
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const g = await p.evaluate(() => {
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [Math.round(b.top), Math.round(b.bottom)] : null; };
      const tab = document.querySelector('.tabbar'); const tb = tab && getComputedStyle(tab).display !== 'none' ? Math.round(tab.getBoundingClientRect().top) : innerHeight;
      return { tabTop: tb, copy: r('.hero-copy'), stage: r('.hero .hero-stage'), cap: r('.robots-cap'), enter: r('[data-lab-enter]'), toggle: r('[data-robot-root] [data-robot-toggle]'), social: r('.hero-social'), actions: r('.hero-actions') };
    });
    const cov = (x) => (x ? (x[1] <= g.tabTop ? 'clear' : x[0] >= g.tabTop ? 'below fold' : `COVERED ${x[1] - g.tabTop}px`) : 'n/a');
    console.log(`${s}: tabbar top ${g.tabTop}; copy ${g.copy}; stage ${g.stage}; caption ${g.cap} ${cov(g.cap)}; enter ${g.enter} ${cov(g.enter)}; toggle ${g.toggle} ${cov(g.toggle)}; actions ${g.actions}; social ${g.social}`);
    if (process.env.OUT) await p.screenshot({ path: `${process.env.OUT}/m-${s}.jpg`, type: 'jpeg', quality: 70 });
    await p.close();
  }
  await b.close();
})();
