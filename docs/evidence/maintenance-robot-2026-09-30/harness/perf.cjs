// node perf.cjs <outdir> [tag] — the opening at the handoff's sizes (GPU): held (reduced motion), with
// the draw calls, triangles, the monitor's rect and whether the pointer finds it at its centre and
// corners; then a frame-cost sample at 1440x900, DPR 1 and 2. DIST=<a build> measures another build (the
// same script on main's, for the comparison). SIZES=1440x900,... MOTION=0 skips the moving shots;
// PERF=0 skips timing; PERF_AT=<ms> waits that long after the first draw before sampling (9000: the
// first weld and the inspection, on this branch; the copycat's start, on main).
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require(require('path').join(__dirname, '../../lab-terminal-2026-09-29/harness/serve.cjs'));
const out = process.argv[2] || '.';
const tag = process.argv[3] || 'x';
const SIZES = (process.env.SIZES || '1440x900,1920x1080,390x844,1920x640').split(',').map((s) => s.split('x').map(Number));
function hook() {
  const gl = { calls: 0 };
  for (const C of [window.WebGL2RenderingContext]) {
    const p = C.prototype;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const orig = p[name];
      p[name] = function (...a) {
        gl.calls++;
        return orig.apply(this, a);
      };
    }
  }
  const raf = window.requestAnimationFrame.bind(window);
  const cost = new Map();
  window.requestAnimationFrame = (cb) =>
    raf((now) => {
      const t0 = performance.now();
      try {
        cb(now);
      } finally {
        cost.set(now, (cost.get(now) || 0) + performance.now() - t0);
      }
    });
  const frames = [];
  let last = 0;
  const tick = (now) => {
    frames.push({ at: now, calls: gl.calls - last });
    last = gl.calls;
    raf(tick);
  };
  raf(tick);
  window.__m = { frames, cost };
}
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);
const r1 = (x) => Math.round(x * 100) / 100;
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const reduce of [true, process.env.MOTION !== '0' && false].filter((x) => x !== false)) {
    for (const [w, h] of SIZES) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: reduce ? 'reduce' : 'no-preference', hasTouch: w < 500, isMobile: w < 500 });
      await routeDist(ctx);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log('pageerror', e.message));
      await p.goto(BASE + '/?probe');
      await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(1200);
      const s = await p.evaluate(() => window.__lab.stats());
      // Is the monitor's centre and each corner (inset) the monitor, to the pointer?
      const hit = await p.evaluate(({ monX, monY, monW, monH }) => {
        const pts = [[0.5, 0.5], [0.08, 0.1], [0.92, 0.1], [0.08, 0.9], [0.92, 0.9]];
        return pts.map(([fx, fy]) => window.__lab.pick(monX + fx * monW, monY + fy * monH));
      }, s);
      await p.screenshot({ path: `${out}/${tag}-held-${w}x${h}.png` });
      console.log(JSON.stringify({ size: `${w}x${h}`, reduce, calls: s.calls, tris: s.triangles, lights: s.lights, casters: s.shadowCasters, programs: s.programs, textures: s.textures, heroDist: r1(s.heroDist), mon: [s.monX, s.monY, s.monW, s.monH].map(Math.round), pick: hit }));
      await ctx.close();
    }
  }
  if (process.env.MOTION !== '0') {
    for (const [w, h] of SIZES) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
      await routeDist(ctx);
      const p = await ctx.newPage();
      await p.goto(BASE + '/?probe');
      await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
      await p.waitForTimeout(3000);
      await p.screenshot({ path: `${out}/${tag}-dance-${w}x${h}.png` });
      await ctx.close();
    }
  }
  if (process.env.PERF !== '0') {
    for (const dpr of [1, 2]) {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
      await routeDist(ctx);
      await ctx.addInitScript(hook);
      const p = await ctx.newPage();
      await p.goto(BASE + '/?probe');
      await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
      await p.waitForTimeout(+(process.env.PERF_AT || 2500));
      const r = await p.evaluate(async () => {
        const { frames, cost } = window.__m;
        const n0 = frames.length;
        await new Promise((res) => setTimeout(res, 6000));
        const f = frames.slice(n0);
        const gaps = f.slice(1).map((x, i) => x.at - f[i].at);
        const drawn = f.filter((x) => x.calls > 0);
        // GPU-synced: render and read one pixel back, 120 times (the pixel read waits for the frame).
        const c = document.querySelector('[data-lab-root] canvas');
        const gl = c.getContext('webgl2');
        const px = new Uint8Array(4);
        const ts = [];
        for (let i = 0; i < 130; i++) {
          const t0 = performance.now();
          window.__lab.stats();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          if (i >= 10) ts.push(performance.now() - t0);
        }
        return { gaps, cpu: drawn.map((x) => cost.get(x.at) || 0), calls: drawn.map((x) => x.calls), synced: ts, buffer: `${c.width}x${c.height}` };
      });
      console.log(JSON.stringify({ perf: `1440x900@${dpr}`, buffer: r.buffer, intervalMs: { p50: r1(pct(r.gaps, 0.5)), p95: r1(pct(r.gaps, 0.95)), max: r1(Math.max(...r.gaps)), over25: r.gaps.filter((g) => g > 25).length }, callbackMs: { p50: r1(pct(r.cpu, 0.5)), p95: r1(pct(r.cpu, 0.95)) }, callsPerFrame: pct(r.calls, 0.5), syncedFrameMs: { p50: r1(pct(r.synced, 0.5)), p95: r1(pct(r.synced, 0.95)) } }));
      await ctx.close();
    }
  }
  const gl = await (async () => {
    const p = await b.newPage();
    const v = await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(d.UNMASKED_RENDERER_WEBGL); });
    await p.close();
    return v;
  })();
  console.log(`# Chrome ${b.version()} · ${gl}`);
  await b.close();
})();
