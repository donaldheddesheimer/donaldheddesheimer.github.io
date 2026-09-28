// Per-state rendering cost of /prototype/, counted from outside the code: the WebGL draw calls are wrapped
// before the page loads, and a requestAnimationFrame loop groups them into frames. For each state it
// reports how many frames the scene drew in a fixed window, the draw calls and triangles in a drawn frame
// (shadow passes included), the canvas's buffer size and the JS heap. Software rendering (SwiftShader) here:
// the frame rate is this machine's CPU, not a GPU. NODE_PATH=$(npm root -g) node measure.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321/prototype/';
const [width, height] = (process.env.W || '1440x900').split('x').map(Number);
const WINDOW = +(process.env.WINDOW || 6000);
const reduce = process.env.REDUCE === '1';
function hook() {
  const gl = { calls: 0, tris: 0 };
  window.__gl = gl;
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
  const frames = [];
  window.__frames = frames;
  let last = { calls: 0, tris: 0 };
  const tick = (now) => {
    if (gl.calls !== last.calls) frames.push({ at: now, calls: gl.calls - last.calls, tris: gl.tris - last.tris });
    last = { calls: gl.calls, tris: gl.tris };
    window.__ticks = (window.__ticks || 0) + 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  console.log('browser', browser.version(), '| viewport', `${width}x${height}`, '| reduced motion', reduce);
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(hook);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-drawn]', { timeout: 60000 });
  await page.waitForTimeout(2000);
  const sample = async (label) => {
    const r = await page.evaluate(async (ms) => {
      const from = performance.now();
      const n0 = window.__frames.length;
      const t0 = window.__ticks;
      await new Promise((r) => setTimeout(r, ms));
      const f = window.__frames.slice(n0);
      const c = document.querySelector('[data-lab-root] canvas');
      return { secs: (performance.now() - from) / 1000, ticks: window.__ticks - t0, frames: f.length, calls: f.map((x) => x.calls), tris: f.map((x) => x.tris), buffer: c ? `${c.width}x${c.height}` : null, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, pc: document.documentElement.dataset.pc ?? 'opening' };
    }, WINDOW);
    console.log(JSON.stringify({ label, state: r.pc, drawnFramesPerSec: +(r.frames / r.secs).toFixed(2), rafPerSec: +(r.ticks / r.secs).toFixed(1), drawnFrames: r.frames, callsPerFrame: { median: median(r.calls), max: Math.max(0, ...r.calls) }, trianglesPerFrame: { median: Math.round(median(r.tris)), max: Math.round(Math.max(0, ...r.tris)) }, buffer: r.buffer, jsHeapMB: r.heapMB }));
  };
  await sample(reduce ? 'opening (still)' : 'opening, dancing');
  await page.click('[data-lab-enter]');
  await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await sample('workstation');
  await page.click('[data-pc-use]');
  await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
  await page.waitForTimeout(500);
  // The robots ease to rest over 0.9 s of animation time, but a frame advances it by at most 0.1 s: at
  // software frame rates that is about nine drawn frames, so it spans more than one window here.
  await sample('reading, 0-6 s (robots easing to rest)');
  await sample('reading, 6-12 s');
  await sample('reading, 12-18 s (settled)');
  await page.keyboard.press('Escape');
  await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await sample('opening again');
  const toggle = await page.$('.lab-ctl [data-robot-toggle]');
  if (toggle && !reduce) {
    await toggle.click();
    await page.waitForTimeout(1000);
    await sample('opening, paused');
  }
  await page.evaluate(() => scrollTo(0, innerHeight * 2));
  await page.waitForTimeout(1500);
  await sample('scrolled past the opening');
  await browser.close();
})();
