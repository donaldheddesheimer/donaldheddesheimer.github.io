// Per-state rendering cost of /prototype/, measured from outside the code. Before the page loads, the
// WebGL draw calls are wrapped (calls and triangles, shadow pass included) and so is requestAnimationFrame
// (how long each frame's callbacks run on the main thread, and the interval between frames). For each
// state it reports the frames the scene drew in a fixed window, the frame interval (p50, p95, max, and how
// many intervals ran past 25 ms), the main-thread time of a frame's callbacks, draw calls and triangles
// per drawn frame, the canvas buffer and the JS heap. It prints the machine and the page's WebGL renderer
// first: whether these are GPU or software numbers depends on the browser it ran in, and the log says which.
// GPU time on the GPU itself isn't measured (Chrome exposes no timer query to pages by default).
// W=1440x900 DPR=1 WINDOW=5000 REDUCE=1 BASE=... NODE_PATH=<dir with playwright> node measure.cjs
const { chromium } = require('playwright');
const os = require('os');
const BASE = process.env.BASE || 'http://127.0.0.1:4321/prototype/';
const [width, height] = (process.env.W || '1440x900').split('x').map(Number);
const dpr = +(process.env.DPR || 1);
const WINDOW = +(process.env.WINDOW || 5000);
const reduce = process.env.REDUCE === '1';
function hook() {
  const gl = { calls: 0, tris: 0 };
  const tri = (mode, count, n = 1) => (mode === 4 ? (count / 3) * n : mode === 5 || mode === 6 ? Math.max(0, count - 2) * n : 0);
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    for (const [name, f] of [
      ['drawArrays', (m, first, count) => tri(m, count)],
      ['drawElements', (m, count) => tri(m, count)],
      ['drawArraysInstanced', (m, first, count, n) => tri(m, count, n)],
      ['drawElementsInstanced', (m, count, type, offset, n) => tri(m, count, n)],
    ]) {
      const orig = p[name];
      if (!orig) continue;
      p[name] = function (...a) {
        gl.calls++;
        gl.tris += f(...a);
        return orig.apply(this, a);
      };
    }
  }
  // Every rAF callback is timed; a frame's cost is the sum of the callbacks run for it (same timestamp).
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
  let last = { calls: 0, tris: 0 };
  const tick = (now) => {
    const d = { calls: gl.calls - last.calls, tris: gl.tris - last.tris };
    last = { calls: gl.calls, tris: gl.tris };
    frames.push({ at: now, ...d });
    raf(tick);
  };
  raf(tick);
  window.__m = { frames, cost };
}
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);
const r1 = (x) => Math.round(x * 10) / 10;
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
  await ctx.addInitScript(hook);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  const renderer = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    const d = g && g.getExtension('WEBGL_debug_renderer_info');
    return g ? g.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : g.RENDERER) : 'no WebGL';
  });
  console.log(`# ${new Date().toISOString()} · ${os.cpus()[0].model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB · ${os.type()} ${os.release()}`);
  console.log(`# browser ${browser.version()} · WebGL renderer: ${renderer} · viewport ${width}x${height} @${dpr}x · reduced motion ${reduce} · window ${WINDOW} ms`);
  await page.waitForSelector('[data-lab-root][data-drawn]', { timeout: 60000 });
  await page.waitForTimeout(2000);
  const sample = async (label, ms = WINDOW) => {
    const r = await page.evaluate(async (ms) => {
      const { frames, cost } = window.__m;
      const n0 = frames.length;
      const from = performance.now();
      await new Promise((res) => setTimeout(res, ms));
      const f = frames.slice(n0);
      const gaps = f.slice(1).map((x, i) => x.at - f[i].at);
      const drawn = f.filter((x) => x.calls > 0);
      const c = document.querySelector('[data-lab-root] canvas');
      return {
        secs: (performance.now() - from) / 1000,
        ticks: f.length,
        gaps,
        drawn: drawn.length,
        calls: drawn.map((x) => x.calls),
        tris: drawn.map((x) => x.tris),
        cpu: drawn.map((x) => cost.get(x.at) || 0),
        buffer: c ? `${c.width}x${c.height}` : null,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        pc: document.documentElement.dataset.pc ?? 'opening',
      };
    }, ms);
    console.log(
      JSON.stringify({
        label,
        state: r.pc,
        drawnPerSec: r1(r.drawn / r.secs),
        rafPerSec: r1(r.ticks / r.secs),
        intervalMs: { p50: r1(pct(r.gaps, 0.5)), p95: r1(pct(r.gaps, 0.95)), max: r1(Math.max(0, ...r.gaps)), over25: r.gaps.filter((g) => g > 25).length },
        frameCpuMs: { p50: r1(pct(r.cpu, 0.5)), p95: r1(pct(r.cpu, 0.95)), max: r1(Math.max(0, ...r.cpu)) },
        callsPerFrame: { p50: pct(r.calls, 0.5), max: Math.max(0, ...r.calls) },
        trianglesPerFrame: { p50: Math.round(pct(r.tris, 0.5)), max: Math.round(Math.max(0, ...r.tris)) },
        buffer: r.buffer,
        jsHeapMB: r.heapMB,
      }),
    );
  };
  const able = await page.evaluate(() => document.documentElement.hasAttribute('data-pc-able'));
  await sample(reduce ? 'opening (still)' : 'opening, dancing');
  if (able && !reduce) {
    // A slow drag across the room, then held at the rightward limit.
    const box = await page.locator('[data-lab-root]').boundingBox();
    const [cx, cy] = [box.x + box.width * 0.62, box.y + box.height * 0.72];
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const drag = (async () => {
      for (let i = 1; i <= 40; i++) {
        await page.mouse.move(cx - i * 18, cy);
        await page.waitForTimeout(50);
      }
    })();
    await sample('opening, dragging to look', 2000);
    await drag;
    await page.mouse.up();
    await page.waitForTimeout(2500);
  }
  if (able) {
    await page.click('[data-lab-enter]');
    await sample(reduce ? 'entering (no flight)' : 'flying in (1.9 s)', 1900);
    await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
    await sample('reading, 0-3 s (robots easing to rest)', 3000);
    await sample('reading, settled');
    await page.keyboard.press('Escape');
    await sample(reduce ? 'leaving (no flight)' : 'flying out (1.5 s)', 1500);
    await page.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 30000 });
    await page.mouse.move(5, height - 5);
    await page.waitForTimeout(1500);
    await sample('opening again');
  }
  const toggle = await page.$('[data-motion-toggle]');
  if (toggle && !reduce) {
    await toggle.click();
    await page.waitForTimeout(1000);
    await sample('opening, Motion off');
    await toggle.click();
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => scrollTo(0, innerHeight * 2));
  await page.waitForTimeout(1500);
  await sample('scrolled past the opening');
  await browser.close();
})();
