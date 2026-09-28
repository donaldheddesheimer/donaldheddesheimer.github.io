// The monitor's lighting close up on /prototype/?probe (scene.ts light(), SCREEN_LIT, GLOW, the additive
// `lift` plane), at 1440x900 with deviceScaleFactor 2, from a running build (BASE, default :4322).
// Each run (RUNS, default 2) takes a clip round the monitor (__lab.quad() plus a margin) in four states:
//   rest       1.5 s after the room drew, nothing touched (before the idle hint)
//   peak       ~1.1 s after data-hint became 'on' (the sin^2 curve's top), pointer never moved
//   hover      the pointer resting on the screen (checks the cursor is 'pointer')
//   hoverpeak  a second page: the pointer left on the screen, then the hint's peak (hover + hint together)
// plus full-window shots at rest and hover (is the screen the brightest thing in the picture?), a burst of
// hover clips under motion (shimmer), and, with reduced motion (a still camera), the same frame with and
// without hover, whose per-pixel difference shows exactly what the hover light adds (z-fighting of the lift
// plane would leave dark screen pixels unlifted). Screen statistics are computed with a canvas in a page:
// the screen is the quad shrunk 6% toward its centre; luma is Rec. 709 on 8-bit sRGB (0-255), `lum` the
// linear relative luminance (0-1). JPEGs for review (q .86): the four states side by side, rest vs hover
// with reduced motion, the hover - rest difference map x12, and the full window at rest at DPR 1.
// Run: NODE_PATH=<dir with playwright> OUT=<image dir> LOG=<log file> node hint-light-lighting.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:4322';
const OUT = process.env.OUT || '.';
const LOG = process.env.LOG || '';
const RUNS = +(process.env.RUNS || 2);
const VW = 1440;
const VH = 900;
const DPR = 2;

const lines = [];
const log = (s) => {
  const t = String(s).replace(/[ \t]+$/gm, '');
  lines.push(t);
  console.log(t);
};
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

// Timings of the lab's data attributes, from the page's clock.
function recorder() {
  window.__ev = [];
  const rec = (k, v) => window.__ev.push([performance.now(), k, v]);
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-lab-root]');
    if (!root) return;
    new MutationObserver((ms) => {
      for (const m of ms) rec(m.attributeName, root.getAttribute(m.attributeName));
    }).observe(root, { attributes: true, attributeFilter: ['data-hint', 'data-drawn', 'data-failed'] });
  });
}
const evTime = (page, k, v) => page.evaluate(([k, v]) => (window.__ev.find((e) => e[1] === k && (v == null || e[2] === v)) || [null])[0], [k, v]);

async function renderer(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl');
    if (!g) return 'no WebGL';
    const e = g.getExtension('WEBGL_debug_renderer_info');
    const s = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return s;
  });
}

async function open(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror ' + e.message));
  await page.goto(BASE + '/prototype/?probe', { waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 60000 });
  return page;
}
const quad = (page) => page.evaluate(() => window.__lab.quad());
const hintK = (page) => page.evaluate(() => window.__lab.stats().hint);
// The clip round the monitor: its desk and keyboard below, some room either side.
function clipFor(q) {
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  const sw = Math.max(...xs) - Math.min(...xs);
  const sh = Math.max(...ys) - Math.min(...ys);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - 0.35 * sw));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - 0.4 * sh));
  const x1 = Math.min(VW, Math.ceil(Math.max(...xs) + 0.35 * sw));
  const y1 = Math.min(VH, Math.ceil(Math.max(...ys) + 1.0 * sh));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
async function shot(page, name, clip) {
  const file = path.join(OUT, `hint-light-${name}.png`);
  const q = await quad(page);
  const k0 = await hintK(page);
  const c = clip || clipFor(q);
  await page.screenshot({ path: file, clip: c });
  const k1 = await hintK(page);
  return { name, file, clip: c, quad: q, k: [r3(k0), r3(k1)] };
}
const centre = (q) => [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];
async function cursorAt(page, [x, y]) {
  return page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return { root: document.querySelector('[data-lab-root]').style.cursor, computed: el ? getComputedStyle(el).cursor : null, tag: el?.tagName };
  }, [x, y]);
}
async function waitHintOn(page, timeout = 20000) {
  await page.waitForSelector('[data-lab-root][data-hint="on"]', { timeout });
  return evTime(page, 'data-hint', 'on');
}
async function untilSince(page, t0, ms) {
  const now = await page.evaluate(() => performance.now());
  if (t0 + ms > now) await page.waitForTimeout(t0 + ms - now);
}
async function textRects(page) {
  return page.evaluate(() => {
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    return { copy: r(document.querySelector('[data-lab-avoid]')), header: r(document.querySelector('[data-home-bar]')), cap: r(document.querySelector('.lab-cap')) };
  });
}

// --- Analysis, with a canvas in a page --------------------------------------------------------------
async function analyzer(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent('<!doctype html><title>stats</title>');
  await page.evaluate(() => {
    const load = (b64) =>
      new Promise((ok, no) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = no;
        i.src = 'data:image/png;base64,' + b64;
      });
    const pixels = (img) => {
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, img.width, img.height);
    };
    const lin = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const LIN = Float64Array.from({ length: 256 }, (_, i) => lin(i));
    const inPoly = (x, y, P) => {
      let a = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, yi] = P[i];
        const [xj, yj] = P[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) a = !a;
      }
      return a;
    };
    // Region stats. `poly` in image px.
    const stats = (d, poly) => {
      const { data, width, height } = d;
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      const hist = new Uint32Array(256);
      let n = 0, sl = 0, sL = 0, sr = 0, sg = 0, sb = 0, white = 0, clip = 0;
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(height, Math.ceil(Math.max(...ys))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(width, Math.ceil(Math.max(...xs))); x++) {
          if (!inPoly(x + 0.5, y + 0.5, poly)) continue;
          const k = (y * width + x) * 4;
          const [r, g, b] = [data[k], data[k + 1], data[k + 2]];
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          hist[Math.round(l)]++;
          n++;
          sl += l;
          sL += 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
          sr += r;
          sg += g;
          sb += b;
          if (Math.min(r, g, b) >= 250) white++;
          if (Math.max(r, g, b) === 255) clip++;
        }
      }
      const pct = (p) => {
        let acc = 0;
        for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= p * n) return i;
        return 255;
      };
      return { n, luma: sl / n, lum: sL / n, p1: pct(0.01), p50: pct(0.5), p99: pct(0.99), max: pct(1), white: white / n, clip255: clip / n, rgb: [sr / n, sg / n, sb / n] };
    };
    window.__load = async (b64) => pixels(await load(b64));
    window.__stats = stats;
    window.__imgs = {};
    // Per-pixel difference a - b inside a polygon, for dark pixels of b (luma < 100) and all pixels.
    window.__diff = (ka, kb, poly) => {
      const A = window.__imgs[ka];
      const B = window.__imgs[kb];
      const { width, height } = A;
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      const all = [];
      const dark = [];
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y < Math.min(height, Math.ceil(Math.max(...ys))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(...xs))); x < Math.min(width, Math.ceil(Math.max(...xs))); x++) {
          if (!inPoly(x + 0.5, y + 0.5, poly)) continue;
          const k = (y * width + x) * 4;
          const lb = 0.2126 * B.data[k] + 0.7152 * B.data[k + 1] + 0.0722 * B.data[k + 2];
          const la = 0.2126 * A.data[k] + 0.7152 * A.data[k + 1] + 0.0722 * A.data[k + 2];
          all.push(la - lb);
          if (lb < 100) dark.push(la - lb);
        }
      }
      const summ = (v) => {
        if (!v.length) return { n: 0 };
        v.sort((a, b) => a - b);
        const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
        return { n: v.length, min: +v[0].toFixed(1), p1: +q(0.01).toFixed(1), p50: +q(0.5).toFixed(1), p99: +q(0.99).toFixed(1), max: +v[v.length - 1].toFixed(1), le2: v.filter((d) => d <= 2).length };
      };
      return { all: summ(all), dark: summ(dark) };
    };
    // Outside a polygon: how many pixels changed at all (max channel difference > 2).
    window.__changedOutside = (ka, kb, poly) => {
      const A = window.__imgs[ka];
      const B = window.__imgs[kb];
      let n = 0;
      let changed = 0;
      let max = 0;
      for (let y = 0; y < A.height; y++) {
        for (let x = 0; x < A.width; x++) {
          if (inPoly(x + 0.5, y + 0.5, poly)) continue;
          const k = (y * A.width + x) * 4;
          const d = Math.max(Math.abs(A.data[k] - B.data[k]), Math.abs(A.data[k + 1] - B.data[k + 1]), Math.abs(A.data[k + 2] - B.data[k + 2]));
          n++;
          if (d > 2) changed++;
          max = Math.max(max, d);
        }
      }
      return { n, changed, max };
    };
    // The brightest window the size of `win` (image px), outside `skip` rects, by mean luma (integral image).
    window.__brightest = (key, win, skip, stride) => {
      const { data, width, height } = window.__imgs[key];
      const I = new Float64Array((width + 1) * (height + 1));
      for (let y = 0; y < height; y++) {
        let row = 0;
        for (let x = 0; x < width; x++) {
          const k = (y * width + x) * 4;
          row += 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
          I[(y + 1) * (width + 1) + x + 1] = I[y * (width + 1) + x + 1] + row;
        }
      }
      const sum = (x, y, w, h) => I[(y + h) * (width + 1) + x + w] - I[y * (width + 1) + x + w] - I[(y + h) * (width + 1) + x] + I[y * (width + 1) + x];
      const hits = (x, y) => skip.some((s) => x < s.x + s.w && x + win.w > s.x && y < s.y + s.h && y + win.h > s.y);
      let best = { mean: -1 };
      for (let y = 0; y + win.h <= height; y += stride) {
        for (let x = 0; x + win.w <= width; x += stride) {
          if (hits(x, y)) continue;
          const m = sum(x, y, win.w, win.h) / (win.w * win.h);
          if (m > best.mean) best = { mean: m, x, y };
        }
      }
      return best;
    };
    window.__winMean = (key, r) => {
      const { data, width } = window.__imgs[key];
      let s = 0;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const k = (y * width + x) * 4;
        s += 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
      }
      return s / (r.w * r.h);
    };
    // A JPEG (q .86) of one or more images side by side, with labels, for review.
    window.__jpeg = async (b64s, labels) => {
      const imgs = await Promise.all(b64s.map(load));
      const gap = 12;
      const top = labels ? 44 : 0;
      const W = imgs.reduce((a, i) => a + i.width, 0) + gap * (imgs.length - 1);
      const H = Math.max(...imgs.map((i) => i.height)) + top;
      const c = new OffscreenCanvas(W, H);
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      let x = 0;
      imgs.forEach((i, n) => {
        g.drawImage(i, x, top);
        if (labels) {
          g.fillStyle = '#ddd';
          g.font = '600 26px system-ui, sans-serif';
          g.fillText(labels[n], x + 8, 32);
        }
        x += i.width + gap;
      });
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    };
    // The full window at DPR 1 (half size), as a JPEG, for review.
    window.__jpegHalf = async (b64) => {
      const i = await load(b64);
      const c = new OffscreenCanvas(i.width / 2, i.height / 2);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(i, 0, 0, c.width, c.height);
      const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 })).arrayBuffer());
      let s = '';
      for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
      return btoa(s);
    };
    // The hover frame beside (hover - rest) luma x12, grey: what the hover light adds, pixel by pixel.
    window.__diffMap = async (ka, kh, b64h) => {
      const A = window.__imgs[ka];
      const H = window.__imgs[kh];
      const hi = await load(b64h);
      const c = new OffscreenCanvas(A.width * 2 + 12, A.height + 44);
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(hi, 0, 44);
      const d = g.createImageData(A.width, A.height);
      for (let k = 0; k < A.data.length; k += 4) {
        const la = 0.2126 * A.data[k] + 0.7152 * A.data[k + 1] + 0.0722 * A.data[k + 2];
        const lh = 0.2126 * H.data[k] + 0.7152 * H.data[k + 1] + 0.0722 * H.data[k + 2];
        const v = Math.max(0, Math.min(255, (lh - la) * 12));
        d.data[k] = d.data[k + 1] = d.data[k + 2] = v;
        d.data[k + 3] = 255;
      }
      g.putImageData(d, A.width + 12, 44);
      g.fillStyle = '#ddd';
      g.font = '600 26px system-ui, sans-serif';
      g.fillText('reduced motion, hover', 8, 32);
      g.fillText('(hover - rest) luma x12', A.width + 20, 32);
      const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 })).arrayBuffer());
      let s = '';
      for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
      return btoa(s);
    };
  });
  return {
    page,
    async put(key, file) {
      const b64 = fs.readFileSync(file).toString('base64');
      await page.evaluate(async ([k, b]) => {
        window.__imgs[k] = await window.__load(b);
      }, [key, b64]);
    },
    close: () => ctx.close(),
  };
}

// Polygons in image px, from a shot's CSS-px quad and clip.
const toImg = (s, pts) => pts.map(([x, y]) => [(x - s.clip.x) * DPR, (y - s.clip.y) * DPR]);
function regions(s) {
  const q = s.quad;
  const [cx, cy] = centre(q);
  const inset = q.map(([x, y]) => [cx + (x - cx) * 0.94, cy + (y - cy) * 0.94]);
  const sh = (q[3][1] - q[0][1] + q[2][1] - q[1][1]) / 2;
  const sw = (q[1][0] - q[0][0] + q[2][0] - q[3][0]) / 2;
  // The desk and keyboard in front of the monitor: a band below the screen's bottom edge, clear of the stand.
  const desk = [
    [q[3][0] - 0.1 * sw, q[3][1] + 0.55 * sh],
    [q[2][0] + 0.1 * sw, q[2][1] + 0.55 * sh],
    [q[2][0] + 0.1 * sw, q[2][1] + 0.95 * sh],
    [q[3][0] - 0.1 * sw, q[3][1] + 0.95 * sh],
  ];
  return { screen: toImg(s, inset), full: toImg(s, q), desk: toImg(s, desk) };
}
const fmt = (st) =>
  `luma ${r1(st.luma)} lum ${r3(st.lum)} p1/p50/p99/max ${st.p1}/${st.p50}/${st.p99}/${st.max} flatWhite(min>=250) ${(st.white * 100).toFixed(2)}% any255 ${(st.clip255 * 100).toFixed(2)}% rgb ${st.rgb.map((v) => Math.round(v)).join(',')} R/B ${r3(st.rgb[0] / st.rgb[2])} n ${st.n}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const A = await analyzer(browser);
  let rendererName = '';
  const body = [];
  const summary = { rest: [], peak: [], hover: [], hoverpeak: [] };
  for (let run = 1; run <= RUNS; run++) {
    log(`== run ${run}`);
    // --- Motion on: rest, peak, hover, shimmer burst ------------------------------------------------
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, reducedMotion: 'no-preference' });
    await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
    await ctx.addInitScript(recorder);
    const page = await open(ctx);
    rendererName = await renderer(page);
    log(`renderer ${rendererName}`);
    const tDrawn = await evTime(page, 'data-drawn');
    const st0 = await page.evaluate(() => {
      const s = window.__lab.stats();
      return { buffer: [s.bufferW, s.bufferH], pixelRatio: s.pixelRatio, motion: document.documentElement.dataset.motion, pcAble: document.documentElement.hasAttribute('data-pc-able') };
    });
    log(`page ${JSON.stringify(st0)} drawn at ${Math.round(tDrawn)} ms`);
    await untilSince(page, tDrawn, 1500);
    const shots = {};
    shots.rest = await shot(page, `rest-run${run}`);
    const texts = await textRects(page);
    const fullRest = path.join(OUT, `hint-light-full-rest-run${run}.png`);
    const qFullRest = await quad(page);
    await page.screenshot({ path: fullRest });
    const hintBefore = await page.evaluate(() => document.querySelector('[data-lab-root]').dataset.hint ?? null);
    log(`rest shots at +${Math.round((await page.evaluate(() => performance.now())) - tDrawn)} ms after drawn; data-hint then: ${hintBefore}`);
    const tOn = await waitHintOn(page);
    await untilSince(page, tOn, 1080);
    const tShot = await page.evaluate(() => performance.now());
    shots.peak = await shot(page, `peak-run${run}`);
    log(`peak clip taken ${Math.round(tShot - tOn)} ms after data-hint=on; hint k before/after the screenshot ${shots.peak.k.join('/')}`);
    await page.waitForSelector('[data-lab-root][data-hint="done"]', { timeout: 10000 });
    await page.waitForTimeout(800);
    // Hover: pointer to the screen's centre.
    const qc = centre(await quad(page));
    await page.mouse.move(qc[0] - 200, qc[1] + 120);
    await page.mouse.move(qc[0], qc[1], { steps: 8 });
    await page.waitForTimeout(1400);
    const q2 = await quad(page);
    const c2 = centre(q2);
    await page.mouse.move(c2[0], c2[1]);
    await page.waitForTimeout(600);
    const cur = await cursorAt(page, c2);
    const picked = await page.evaluate(([x, y]) => window.__lab.pick(x, y), c2);
    log(`hover at ${c2.map(Math.round).join(',')}: pick ${picked}, root.style.cursor '${cur.root}', computed cursor '${cur.computed}' on ${cur.tag}`);
    shots.hover = await shot(page, `hover-run${run}`);
    const fullHover = path.join(OUT, `hint-light-full-hover-run${run}.png`);
    const qFullHover = await quad(page);
    await page.screenshot({ path: fullHover });
    // Shimmer: five hover clips 300 ms apart, same clip box.
    const burst = [];
    for (let i = 0; i < 5; i++) {
      burst.push(await shot(page, `burst${i}-run${run}`, shots.hover.clip));
      await page.waitForTimeout(300);
    }
    // Off the monitor again, onto the room: the cursor is 'grab', the light goes back.
    await page.mouse.move(c2[0] + 420, c2[1] - 120, { steps: 6 });
    await page.waitForTimeout(600);
    const curOff = await cursorAt(page, [c2[0] + 420, c2[1] - 120]);
    log(`off the monitor: root.style.cursor '${curOff.root}', computed '${curOff.computed}'`);
    await ctx.close();

    // --- Hover and hint together: the pointer left on the screen until the hint plays ---------------
    const ctxB = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
    await ctxB.route(/^https:\/\/fonts\./, (r) => r.abort());
    await ctxB.addInitScript(recorder);
    const pb = await open(ctxB);
    await pb.waitForTimeout(600);
    const qb = centre(await quad(pb));
    await pb.mouse.move(qb[0], qb[1], { steps: 4 });
    await pb.waitForTimeout(1200);
    const qb2 = centre(await quad(pb));
    await pb.mouse.move(qb2[0], qb2[1]);
    const tOnB = await waitHintOn(pb);
    await untilSince(pb, tOnB, 1080);
    shots.hoverpeak = await shot(pb, `hoverpeak-run${run}`);
    const hovB = await pb.evaluate(([x, y]) => window.__lab.pick(x, y), qb2);
    log(`hover+hint: still over the monitor ${hovB}; hint k before/after the screenshot ${shots.hoverpeak.k.join('/')}`);
    await ctxB.close();

    // --- Reduced motion: a still camera, the same frame with and without hover -----------------------
    const ctxC = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, reducedMotion: 'reduce' });
    await ctxC.route(/^https:\/\/fonts\./, (r) => r.abort());
    await ctxC.addInitScript(recorder);
    const pc = await open(ctxC);
    await pc.waitForTimeout(1500);
    const qs = await quad(pc);
    const clipS = clipFor(qs);
    const still = {};
    still.a = await shot(pc, `still-rest-run${run}`, clipS);
    const cs = centre(qs);
    await pc.mouse.move(cs[0], cs[1], { steps: 4 });
    await pc.waitForTimeout(700);
    const curS = await cursorAt(pc, cs);
    still.h = await shot(pc, `still-hover-run${run}`, clipS);
    await pc.mouse.move(cs[0] + 500, cs[1] - 150, { steps: 4 });
    await pc.waitForTimeout(700);
    still.b = await shot(pc, `still-rest2-run${run}`, clipS);
    const qs2 = await quad(pc);
    log(`reduced motion: quad unchanged across the three shots ${JSON.stringify(qs) === JSON.stringify(qs2)}; hover cursor '${curS.root}'`);
    await ctxC.close();

    // --- Analysis --------------------------------------------------------------------------------------
    for (const k of Object.keys(shots)) {
      const s = shots[k];
      await A.put(k, s.file);
      const R = regions(s);
      const scr = await A.page.evaluate(([k, p]) => window.__stats(window.__imgs[k], p), [k, R.screen]);
      const desk = await A.page.evaluate(([k, p]) => window.__stats(window.__imgs[k], p), [k, R.desk]);
      const clipAll = await A.page.evaluate(([k]) => {
        const d = window.__imgs[k];
        return window.__stats(d, [[0, 0], [d.width, 0], [d.width, d.height], [0, d.height]]);
      }, [k]);
      summary[k].push({ screen: scr, desk });
      log(`${k.padEnd(9)} clip ${JSON.stringify(s.clip)} k ${s.k.join('/')}`);
      log(`  screen  ${fmt(scr)}`);
      log(`  desk    ${fmt(desk)}`);
      log(`  clip    luma ${r1(clipAll.luma)} (whole clip, for scale)`);
    }
    // Is the screen the brightest thing? Brightest window the size of the screen's box, elsewhere in the
    // window (not on the monitor, the opening's text, the bar or the caption).
    for (const [key, file, q] of [['fullRest', fullRest, qFullRest], ['fullHover', fullHover, qFullHover]]) {
      await A.put(key, file);
      const xs = q.map((p) => p[0] * DPR);
      const ys = q.map((p) => p[1] * DPR);
      const box = { x: Math.round(Math.min(...xs)), y: Math.round(Math.min(...ys)), w: Math.round(Math.max(...xs) - Math.min(...xs)), h: Math.round(Math.max(...ys) - Math.min(...ys)) };
      const pad = (r, m) => r && { x: r.x * DPR - m, y: r.y * DPR - m, w: r.w * DPR + 2 * m, h: r.h * DPR + 2 * m };
      const skip = [{ x: box.x - 40, y: box.y - 40, w: box.w + 80, h: box.h + 80 }, pad(texts.copy, 16), pad(texts.header, 0), pad(texts.cap, 8)].filter(Boolean);
      const own = await A.page.evaluate(([k, r]) => window.__winMean(k, r), [key, box]);
      const inset = q.map(([x, y]) => {
        const [cx, cy] = centre(q);
        return [(cx + (x - cx) * 0.94) * DPR, (cy + (y - cy) * 0.94) * DPR];
      });
      const scr = await A.page.evaluate(([k, p]) => window.__stats(window.__imgs[k], p), [key, inset]);
      const best = await A.page.evaluate(([k, w, s]) => window.__brightest(k, w, s, 8), [key, { w: box.w, h: box.h }, skip]);
      const room = await A.page.evaluate(([k, s]) => {
        const d = window.__imgs[k];
        return window.__stats(d, [[0, 0], [d.width, 0], [d.width, d.height], [0, d.height]]);
      }, [key, skip]);
      log(`${key}: screen (inset quad) luma ${r1(scr.luma)} lum ${r3(scr.lum)}; screen's box ${box.w}x${box.h} image px mean luma ${r1(own)}; brightest same-size box elsewhere (text, bar, caption, monitor excluded) mean luma ${r1(best.mean)} at image px ${best.x},${best.y} (CSS ${Math.round(best.x / DPR)},${Math.round(best.y / DPR)}); whole window luma ${r1(room.luma)}`);
    }
    // Shimmer: the dark screen pixels' floor in each hover burst frame (lifted: ~+9 over rest).
    const floors = [];
    for (const [i, b] of burst.entries()) {
      await A.put('b' + i, b.file);
      const st = await A.page.evaluate(([k, p]) => window.__stats(window.__imgs[k], p), ['b' + i, regions(b).screen]);
      floors.push(`p1 ${st.p1} p50 ${st.p50} luma ${r1(st.luma)}`);
    }
    log(`hover burst (5 clips, 300 ms apart, motion on), screen: ${floors.join(' | ')}`);
    // Reduced motion: exactly what hover adds.
    for (const k of ['a', 'h', 'b']) await A.put('s' + k, still[k].file);
    const RS = regions(still.a);
    const same = await A.page.evaluate(([p]) => window.__changedOutside('sa', 'sb', []), [RS.full]);
    log(`still: rest vs rest again (whole clip): ${same.changed} of ${same.n} px differ by >2 (max ${same.max})`);
    const d = await A.page.evaluate(([p]) => window.__diff('sh', 'sa', p), [RS.screen]);
    log(`still: hover - rest, screen (inset) luma difference: all ${JSON.stringify(d.all)}; dark screen pixels (rest luma<100) ${JSON.stringify(d.dark)}`);
    const out = await A.page.evaluate(([p]) => window.__changedOutside('sh', 'sa', p), [RS.full]);
    log(`still: hover vs rest outside the screen quad: ${out.changed} of ${out.n} px differ by >2 (max ${out.max}) (the glow light on the desk and bezel)`);
    const stA = await A.page.evaluate(([p]) => window.__stats(window.__imgs.sa, p), [RS.screen]);
    const stH = await A.page.evaluate(([p]) => window.__stats(window.__imgs.sh, p), [RS.screen]);
    log(`still rest   screen ${fmt(stA)}`);
    log(`still hover  screen ${fmt(stH)}`);
    const dk = await A.page.evaluate(([p]) => window.__diff('sh', 'sa', p), [RS.desk]);
    log(`still: hover - rest, desk band luma difference ${JSON.stringify(dk.all)}`);
    // Review JPEGs: the three states side by side, and each alone.
    const b64 = (f) => fs.readFileSync(f).toString('base64');
    const trio = await A.page.evaluate(([a, l]) => window.__jpeg(a, l), [[b64(shots.rest.file), b64(shots.hover.file), b64(shots.peak.file), b64(shots.hoverpeak.file)], ['rest', 'hover', 'hint peak', 'hover + hint peak']]);
    fs.writeFileSync(path.join(OUT, `hint-light-states-run${run}.jpg`), Buffer.from(trio, 'base64'));
    const stillJ = await A.page.evaluate(([a, l]) => window.__jpeg(a, l), [[b64(still.a.file), b64(still.h.file)], ['reduced motion: rest', 'reduced motion: hover']]);
    fs.writeFileSync(path.join(OUT, `hint-light-still-run${run}.jpg`), Buffer.from(stillJ, 'base64'));
    const half = await A.page.evaluate(([b]) => window.__jpegHalf(b), [b64(fullRest)]);
    fs.writeFileSync(path.join(OUT, `hint-light-full-rest-run${run}-dpr1.jpg`), Buffer.from(half, 'base64'));
    const map = await A.page.evaluate(([b]) => window.__diffMap('sa', 'sh', b), [b64(still.h.file)]);
    fs.writeFileSync(path.join(OUT, `hint-light-still-diff-run${run}.jpg`), Buffer.from(map, 'base64'));
    for (const k of ['rest', 'hover', 'peak']) {
      const j = await A.page.evaluate(([a]) => window.__jpeg(a, null), [[b64(shots[k].file)]]);
      fs.writeFileSync(path.join(OUT, `hint-light-${k}-run${run}.jpg`), Buffer.from(j, 'base64'));
    }
  }
  log('== screen mean luma by state and run (inset quad)');
  for (const k of Object.keys(summary)) log(`${k.padEnd(9)} ${summary[k].map((s) => `luma ${r1(s.screen.luma)} lum ${r3(s.screen.lum)} desk luma ${r1(s.desk.luma)} R/B ${r3(s.desk.rgb[0] / s.desk.rgb[2])}`).join(' | ')}`);
  await A.close();
  await browser.close();
  const head = `# hint-light-lighting ${new Date().toISOString()} renderer: ${rendererName} server: ${BASE} viewport ${VW}x${VH} dpr ${DPR}`;
  if (LOG) fs.writeFileSync(LOG, [head, ...lines].join('\n').replace(/[ \t]+$/gm, '') + '\n');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
