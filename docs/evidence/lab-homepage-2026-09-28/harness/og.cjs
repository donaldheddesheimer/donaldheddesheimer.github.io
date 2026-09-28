// public/og.jpg, the link-preview card: the homepage's opening at 1200x630 (DPR 1), with the page's own
// fonts, under reduced motion so the room holds its one composed moment. Run it from a build whose name,
// headline, status or school changed (src/data/site.ts).
// NODE_PATH=<playwright> BASE=http://127.0.0.1:4322 OUT=<repo>/public/og.jpg node og.cjs
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:4322';
const OUT = process.env.OUT || 'og.jpg';

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/?probe', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-lab-root][data-drawn]', { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({
    fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
    renderer: (() => {
      const c = document.querySelector('[data-lab-stage] canvas');
      const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    })(),
    motion: document.documentElement.dataset.motion,
  }));
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 86 });
  console.log(JSON.stringify({ out: OUT.replace(/.*\/public\//, 'public/'), browser: browser.version(), ...info }));
  await browser.close();
})();
