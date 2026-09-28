// Shared helpers for the look-click-*.cjs harnesses (look-around and click versus drag on /prototype/'s
// opening). Not run on its own. Each harness requires it next to itself:
//   const L = require('./look-click-lib.cjs');
// It gives: a browser launch (SwiftShader flags, as the other harnesses; a GPU shim on NODE_PATH may swap
// them), a page on /prototype/?probe with fonts aborted (offline), the page's own WebGL renderer string,
// a log that starts with a header line (ISO time, renderer, server) and is written without trailing
// whitespace, the look state (window.__lab stats() and quad(), the cursor), the screen quad's margins to
// the window with the bezel allowed for, and a copy of a screenshot with the quad drawn on it.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:4322';
const SCREEN_W = 0.68; // scene.ts SCREEN (metres)
const SCREEN_H = 0.425;
const BEZEL = 0.018; // scene.ts bezelCorners: the bezel is this much wider than the screen on each side
const OUT = process.env.OUT || '.';
const LOGDIR = process.env.LOGDIR || path.join(__dirname, '..', 'logs');

const launch = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(browser, { width, height, query = '?probe', wait = true, ...ctxOpts }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...ctxOpts });
  await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await page.goto(BASE + '/prototype/' + query, { waitUntil: 'load' });
  if (wait) {
    await page.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 90000 });
    await page.waitForFunction(() => !!window.__lab, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  // Where the page last saw the pointer, and what kind it was (for moves that leave the window).
  await page.evaluate(() => {
    window.__seen = { x: null, y: null, type: null, rootTypes: {} };
    addEventListener('pointermove', (e) => Object.assign(window.__seen, { x: e.clientX, y: e.clientY, type: e.pointerType }), true);
    const root = document.querySelector('[data-lab-root]');
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
      root?.addEventListener(t, (e) => {
        const k = `${t}:${e.pointerType}`;
        window.__seen.rootTypes[k] = (window.__seen.rootTypes[k] || 0) + 1;
      });
  });
  return { ctx, page, errors };
}

// The renderer of the scene's own context (three.js asks for webgl2), else of a new context.
const renderer = (page) =>
  page.evaluate(() => {
    const read = (gl) => {
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    };
    const c = document.querySelector('[data-lab-root] canvas');
    const own = c && (c.getContext('webgl2') || c.getContext('webgl'));
    if (own) return read(own) + ' (scene canvas)';
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    return (read(gl) || 'no WebGL') + ' (new canvas; no scene canvas)';
  });

function logger(name, server = BASE) {
  const lines = [];
  let header = null;
  return {
    header(rend) {
      header ??= `# ${name} ${new Date().toISOString()} renderer="${rend}" server=${server}`;
    },
    log(...parts) {
      const s = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
      console.log(s);
      lines.push(s);
    },
    write() {
      fs.mkdirSync(LOGDIR, { recursive: true });
      const file = path.join(LOGDIR, `${name}.log`);
      const text = [header ?? `# ${name} ${new Date().toISOString()} renderer="(no page loaded)" server=${server}`, ...lines].map((l) => l.replace(/[ \t]+$/g, '')).join('\n') + '\n';
      fs.writeFileSync(file, text);
      console.log('wrote', file);
    },
  };
}

const r4 = (v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
const r1 = (v) => Math.round(v * 10) / 10;

// The look state: stats() (which draws a frame first), quad(), the cursor, the page's state.
const state = (page, x = null, y = null) =>
  page.evaluate(
    ([x, y]) => {
      const s = window.__lab?.stats?.() ?? null;
      const q = window.__lab?.quad?.() ?? null;
      const root = document.querySelector('[data-lab-root]');
      const el = x != null ? document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, x)), Math.min(innerHeight - 1, Math.max(0, y))) : null;
      return {
        lookAz: s?.lookAz,
        lookEl: s?.lookEl,
        lookAzMax: s?.lookAzMax,
        frames: s?.frames,
        quad: q,
        rootCursor: root?.style.cursor ?? null,
        cursorAt: el ? getComputedStyle(el).cursor : null,
        pc: document.documentElement.dataset.pc ?? null,
        running: root?.dataset.running ?? null,
        hint: root?.dataset.hint ?? null,
        dragged: window.__lab?.dragged?.() ?? null,
        seen: window.__seen ? { x: window.__seen.x, y: window.__seen.y, type: window.__seen.type } : null,
        W: innerWidth,
        H: innerHeight,
        scrollY,
      };
    },
    [x, y],
  );

// The screen quad's distance to each window edge, less the bezel (scaled from the screen's own size in
// pixels), in px. Negative: that edge of the bezel is outside the window.
function margins(quad, W, H) {
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const top = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
  const bottom = Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1]);
  const left = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]);
  const right = Math.hypot(quad[2][0] - quad[1][0], quad[2][1] - quad[1][1]);
  const bx = (Math.max(top, bottom) / SCREEN_W) * BEZEL;
  const by = (Math.max(left, right) / SCREEN_H) * BEZEL;
  return {
    screen: { minX: r1(Math.min(...xs)), maxX: r1(Math.max(...xs)), minY: r1(Math.min(...ys)), maxY: r1(Math.max(...ys)), widthTop: r1(top) },
    bezelPx: { x: r1(bx), y: r1(by) },
    left: r1(Math.min(...xs) - bx),
    right: r1(W - Math.max(...xs) - bx),
    top: r1(Math.min(...ys) - by),
    bottom: r1(H - Math.max(...ys) - by),
  };
}

const centre = (q) => [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];

// A copy of a JPEG with the screen quad (and its bezel, and the 1.5% margin the code keeps) drawn on it,
// composited on a canvas in a blank page (PIL isn't available).
async function mark(browser, file, quad, W, out) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const b64 = fs.readFileSync(file).toString('base64');
  const data = await p.evaluate(
    async ([b64, quad, W, SW, BZ]) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const k = img.width / W;
      g.lineWidth = 2;
      g.strokeStyle = '#39ff88';
      g.beginPath();
      quad.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
      g.closePath();
      g.stroke();
      g.setLineDash([6, 4]);
      g.strokeStyle = '#ff4df0';
      g.beginPath();
      g.moveTo(W * 0.015 * k, 0);
      g.lineTo(W * 0.015 * k, img.height);
      g.stroke();
      return c.toDataURL('image/jpeg', 0.86).split(',')[1];
    },
    [b64, quad, W, SCREEN_W, BEZEL],
  );
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  await ctx.close();
}

module.exports = { BASE, OUT, launch, open, renderer, logger, state, margins, centre, mark, r4, r1 };
