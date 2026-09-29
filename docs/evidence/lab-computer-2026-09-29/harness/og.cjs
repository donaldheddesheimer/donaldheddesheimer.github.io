// node og.cjs [out.png] — the link-preview card: the opening at 1200×630 at 2x (downsampled afterwards),
// as the page shows it (name, title, Settings, the monitor), served from dist/ without a server. GPU,
// reduced motion (the held moment).
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
(async () => {
  const [out = 'og.png'] = process.argv.slice(2);
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await routeDist(ctx);
  const p = await ctx.newPage();
  await p.goto(BASE + '/?probe');
  await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out });
  console.log(out, JSON.stringify(await p.evaluate(() => ({ heroDist: window.__lab.stats().heroDist, gl: window.__lab.stats().renderer, monitor: (({ x, y, width, height }) => [x, y, width, height].map(Math.round))(document.querySelector('[data-lab-monitor]').getBoundingClientRect()) }))));
  await b.close();
})();
