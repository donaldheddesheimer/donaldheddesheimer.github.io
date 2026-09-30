// node stills.cjs [outdir] — the opening's stills (public/lab/opening-{wide,tall}), rendered from the
// built site (dist/, served from disk) with reduced motion (the held moment) on the GPU, and the
// monitor's bezel in each as fractions of its width and height: LabStage.astro's --still-ml/mt/mr/mb.
// Then: PNG to WebP (quality 72, method 6), into public/lab/, and rebuild.
// (From the lab-computer pass's harness, with one fix: the room is inside .home now, so only the name
// and Settings are hidden, not .home.)
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
(async () => {
  const out = process.argv[2] || '.';
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const [name, w, h] of [['opening-wide', 1600, 1000], ['opening-tall', 720, 1440]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await routeDist(ctx);
    const p = await ctx.newPage();
    await p.goto(BASE + '/?probe');
    await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1500);
    const s = await p.evaluate(() => window.__lab.stats());
    // The room bare: the mood (LabStage.astro) goes over the still as it does over the scene.
    await p.addStyleTag({ content: '.home-id, .home-settings, .mood, .grain { opacity: 0 !important } [data-lab-stage] canvas { filter: none !important }' });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${name}.png`, clip: { x: 0, y: 0, width: w, height: h } });
    const f = (v) => +v.toFixed(4);
    const gl = await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(d.UNMASKED_RENDERER_WEBGL); });
    console.log(name, JSON.stringify({ gl, aspect: +(w / h).toFixed(4), ml: f(s.monX / w), mt: f(s.monY / h), mr: f((s.monX + s.monW) / w), mb: f((s.monY + s.monH) / h) }));
    await ctx.close();
  }
  await b.close();
})();
