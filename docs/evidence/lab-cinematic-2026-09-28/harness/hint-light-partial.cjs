// The idle hint with the monitor partly out of the window: scrolled so the screen's top is cut, no input
// for 10 s (expect no hint), then scrolled back so it's whole (expect the hint ~5 s later, once).
// hint-light-idle.cjs covers the monitor wholly out of the window; this is the half-seen case.
// Run: NODE_PATH=<dir with playwright> BASE=http://127.0.0.1:4322 node hint-light-partial.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4322';
(async () => {
  const b = await chromium.launch();
  for (let run = 1; run <= 2; run++) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route((u) => /^fonts\./.test(u.hostname), (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(BASE + '/prototype/?probe', { waitUntil: 'load' });
    await page.waitForSelector('[data-lab-root][data-drawn]');
    if (run === 1) console.log(`# hint-light-partial ${new Date().toISOString()} renderer: ${await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); return g ? g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) : 'none'; })} browser ${b.version()} server: ${BASE} viewport 1440x900`);
    await page.evaluate(() => {
      const root = document.querySelector('[data-lab-root]');
      window.__seq = root.dataset.hint ? [[root.dataset.hint, Math.round(performance.now())]] : [];
      new MutationObserver(() => { const v = root.dataset.hint; if (v && window.__seq.at(-1)?.[0] !== v) window.__seq.push([v, performance.now()]); })
        .observe(root, { attributes: true, attributeFilter: ['data-hint'] });
    });
    const q0 = await page.evaluate(() => window.__lab.quad());
    const top = Math.min(...q0.map((p) => p[1] ?? p.y));
    const bottom = Math.max(...q0.map((p) => p[1] ?? p.y));
    const y = Math.round(top + (bottom - top) * 0.4); // 40% of the screen's height above the window
    await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(300);
    const q1 = await page.evaluate(() => window.__lab.quad());
    const t1 = await page.evaluate(() => performance.now());
    await page.waitForTimeout(10000);
    const partial = await page.evaluate(() => ({ seq: window.__seq.slice(), hint: document.querySelector('[data-lab-root]').dataset.hint ?? null }));
    await page.evaluate(() => scrollTo(0, 0));
    const t2 = await page.evaluate(() => performance.now());
    await page.waitForTimeout(9000);
    const whole = await page.evaluate(() => window.__seq.slice());
    const ok = partial.seq.length === 0 && whole.length === 2 && whole[0][0] === 'on' && whole[1][0] === 'done' && whole[0][1] - t2 > 4500;
    console.log(`${ok ? 'PASS' : 'FAIL'} run ${run}`, JSON.stringify({ scrollY: y, screenTopBefore: Math.round(top), screenYAfterScroll: q1.map((p) => Math.round(p[1] ?? p.y)), partialFor: 10000, seqWhilePartial: partial.seq, hintWhilePartial: partial.hint, seqAfterScrollBack: whole.map(([v, t]) => [v, Math.round(t - t2)]), hintAtEnd: await page.evaluate(() => document.querySelector('[data-lab-root]').dataset.hint ?? null), stats: await page.evaluate(() => { const s = window.__lab.stats(); return { running: document.querySelector('[data-lab-root]').dataset.running, hint: s.hint }; }) }));
    await ctx.close();
  }
  await b.close();
})();
