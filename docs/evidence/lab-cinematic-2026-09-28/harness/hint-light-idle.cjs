// The idle hint on /?probe (scene.ts hint(), endHint(), idleEvents), from a running build (BASE,
// default :4322), at 1440x900. Every case is a fresh page. An init script timestamps (performance.now, in
// the page) each change of [data-lab-root] data-hint / data-drawn, html data-pc / data-motion, and each
// pointermove, pointerdown, keydown, wheel and scroll the window sees, so timings come from the page's
// own clock; all times below are ms after data-drawn. Expected, from the brief:
//   the hint fires once, ~5 s after the room drew with no pointermove/scroll/wheel/keydown/pointerdown
//   (data-hint 'on', then 'done' ~2.2 s later) and never again; pointerdown or keydown during it ->
//   'stopped', before it -> 'cancelled' and it never fires; a drag ends it; pointermove, scroll and wheel
//   only restart the idle wait; never with reduced motion, Motion off, the computer open or the opening
//   scrolled out of view. Also: after it stops, the screen goes back to its resting light (stats().hint 0).
// CASES (comma list, default all) picks cases; RUNS (default 2) repeats each; POOL (default 5) runs that many
// pages at once. Waits of 20+ s after each case's last event check it never (re)fires.
// Run: NODE_PATH=<dir with playwright> OUT=<image dir> LOG=<log file> node hint-light-idle.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:4322';
const OUT = process.env.OUT || '.';
const LOG = process.env.LOG || '';
const RUNS = +(process.env.RUNS || 2);
const POOL = +(process.env.POOL || 5);
const ONLY = process.env.CASES ? process.env.CASES.split(',') : null;
const VW = 1440;
const VH = 900;
const ROOM = [1000, 780]; // a point on the floor: not the monitor, the text, a link or the caption
const QUIET = 20000; // how long "never" is watched for

function recorder() {
  window.__ev = [];
  const rec = (k, v) => window.__ev.push([performance.now(), k, v]);
  addEventListener('load', () => rec('load'));
  for (const t of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll']) addEventListener(t, () => rec(t), { capture: true, passive: true });
  // The document from the start (html may not exist yet): html's data-pc / data-motion, the root's data-hint etc.
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target;
      const html = el === document.documentElement;
      const root = !html && el.hasAttribute && el.hasAttribute('data-lab-root');
      if ((html && ['data-pc', 'data-motion'].includes(m.attributeName)) || (root && ['data-hint', 'data-drawn', 'data-failed'].includes(m.attributeName))) rec(m.attributeName, el.getAttribute(m.attributeName));
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-pc', 'data-motion', 'data-hint', 'data-drawn', 'data-failed'] });
}

const now = (p) => p.evaluate(() => performance.now());
const evs = (p) => p.evaluate(() => window.__ev);
const stat = (p) => p.evaluate(() => (window.__lab ? window.__lab.stats() : null));
const hintAttr = (p) => p.evaluate(() => document.querySelector('[data-lab-root]').dataset.hint ?? null);
async function until(p, t) {
  const n = await now(p);
  if (t > n) await p.waitForTimeout(t - n);
}
async function waitHint(p, v, timeout = 15000) {
  await p.waitForSelector(`[data-lab-root][data-hint="${v}"]`, { timeout });
  const e = await evs(p);
  return e.find((x) => x[1] === 'data-hint' && x[2] === v)[0];
}
async function renderer(p) {
  return p.evaluate(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl');
    if (!g) return 'no WebGL';
    const e = g.getExtension('WEBGL_debug_renderer_info');
    const s = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return s;
  });
}
async function click(p, [x, y]) {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.up();
}
async function drag(p, [x, y]) {
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x - i * 20, y);
  await p.mouse.up();
}
// Samples of stats().hint (the light's hint term) for `ms`, every `step`.
async function sampleK(p, ms, step = 100) {
  const out = [];
  const t0 = await now(p);
  for (;;) {
    const [t, k] = await p.evaluate(() => [performance.now(), window.__lab.stats().hint]);
    out.push([Math.round(t - t0), +k.toFixed(3)]);
    if (t - t0 >= ms) break;
    await p.waitForTimeout(step);
  }
  return out;
}
const motionSwitch = async (p) => {
  const b = await p.locator('[data-motion-toggle]:visible').first().boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};

// Each case acts on a loaded page (`d` = the page's data-drawn time) and returns notes; `check` judges the
// timeline `T` (hint transitions and input times relative to data-drawn) plus those notes.
const CASES = [
  {
    id: 'fires-once',
    what: 'no input at all: on ~5 s after drawn, done ~2.2 s later, never again (20+ s watched)',
    async act(p, d, n) {
      const on = await waitHint(p, 'on');
      n.curve = await sampleK(p, 2300, 100);
      await waitHint(p, 'done', 5000);
      n.kAfter = (await stat(p)).hint;
      await until(p, (await now(p)) + 22000);
    },
    // idleFrom (scene.ts render()) is taken before the first, shader-compiling render and data-drawn after it,
    // so 'on' can come a little under 5000 ms after data-drawn.
    check: (T, n) => T.seq === 'on,done' && T.on >= 4500 && T.on <= 5400 && T.done - T.on >= 2150 && T.done - T.on <= 2400 && n.kAfter === 0,
  },
  {
    id: 'press-during',
    what: 'pointerdown (a click on the floor) 0.6 s into the hint: stopped, light back to rest, never again',
    async act(p, d, n) {
      const on = await waitHint(p, 'on');
      await p.mouse.move(...ROOM);
      await until(p, on + 600);
      await p.mouse.down();
      await p.mouse.up();
      n.decay = await sampleK(p, 1200, 150);
      await until(p, (await now(p)) + QUIET);
    },
    check: (T, n) => T.seq === 'on,stopped' && Math.abs(T.stopped - T.pointerdownLast) < 60 && n.decay.at(-1)[1] === 0,
  },
  {
    id: 'key-during',
    what: 'keydown (Shift) 0.6 s into the hint: stopped, light back to rest, never again',
    async act(p, d, n) {
      const on = await waitHint(p, 'on');
      await until(p, on + 600);
      await p.keyboard.press('Shift');
      n.decay = await sampleK(p, 1200, 150);
      await until(p, (await now(p)) + QUIET);
    },
    check: (T, n) => T.seq === 'on,stopped' && Math.abs(T.stopped - T.keydownLast) < 60 && n.decay.at(-1)[1] === 0,
  },
  {
    id: 'drag-during',
    what: 'a drag (press, 10 x 20 px left, release) 0.6 s into the hint: stopped, never again',
    async act(p, d, n) {
      const on = await waitHint(p, 'on');
      await p.mouse.move(...ROOM);
      await until(p, on + 600);
      await drag(p, ROOM);
      n.dragged = await p.evaluate(() => window.__lab.dragged());
      await p.waitForTimeout(1500);
      n.kAfter = (await stat(p)).hint;
      await until(p, (await now(p)) + QUIET);
    },
    check: (T, n) => T.seq === 'on,stopped' && n.dragged === true && n.kAfter === 0,
  },
  {
    id: 'move-during',
    what: 'pointermove only, every 200 ms through the hint: it plays to done (moves only restart the idle wait)',
    async act(p, d, n) {
      const on = await waitHint(p, 'on');
      for (let i = 0; i < 10; i++) {
        await until(p, on + 200 + i * 200);
        await p.mouse.move(ROOM[0] + (i % 2) * 30, ROOM[1]);
      }
      await waitHint(p, 'done', 5000);
      await until(p, (await now(p)) + QUIET);
    },
    check: (T) => T.seq === 'on,done' && T.pointermoveN >= 10,
  },
  {
    id: 'press-before',
    what: 'pointerdown (a click on the floor) 2 s after drawn: cancelled, never fires',
    async act(p, d) {
      await until(p, d + 2000);
      await click(p, ROOM);
      await until(p, d + 2000 + 25000);
    },
    check: (T) => T.seq === 'cancelled',
  },
  {
    id: 'key-before',
    what: 'keydown (Shift) 2 s after drawn: cancelled, never fires',
    async act(p, d) {
      await until(p, d + 2000);
      await p.keyboard.press('Shift');
      await until(p, d + 2000 + 25000);
    },
    check: (T) => T.seq === 'cancelled',
  },
  {
    id: 'drag-before',
    what: 'a drag 2 s after drawn: cancelled, never fires',
    async act(p, d) {
      await until(p, d + 2000);
      await drag(p, ROOM);
      await until(p, d + 2000 + 25000);
    },
    check: (T) => T.seq === 'cancelled',
  },
  {
    id: 'move-delays',
    what: 'steady pointermove, one a second from 1 s to 13 s: nothing meanwhile, on ~5 s after the last move',
    async act(p, d) {
      for (let i = 0; i <= 12; i++) {
        await until(p, d + 1000 + i * 1000);
        await p.mouse.move(ROOM[0] + (i % 2) * 30, ROOM[1] - (i % 3) * 10);
      }
      await waitHint(p, 'done', 12000);
      await until(p, (await now(p)) + QUIET);
    },
    check: (T) => T.seq === 'on,done' && T.on - T.pointermoveLast >= 4900 && T.on - T.pointermoveLast <= 5400,
  },
  {
    id: 'wheel-delays',
    what: 'one pointermove at 0.5 s, then a sideways wheel (deltaX 40, no scroll) each second from 2 s to 12 s: on ~5 s after the last wheel',
    async act(p, d, n) {
      await until(p, d + 500);
      await p.mouse.move(...ROOM);
      for (let i = 0; i <= 10; i++) {
        await until(p, d + 2000 + i * 1000);
        await p.mouse.wheel(40, 0);
      }
      n.scrollX = await p.evaluate(() => scrollX);
      await waitHint(p, 'done', 12000);
      await until(p, (await now(p)) + QUIET);
    },
    check: (T) => T.seq === 'on,done' && T.wheelN >= 10 && T.scrollN === 0 && T.on - T.wheelLast >= 4900 && T.on - T.wheelLast <= 5400,
  },
  {
    id: 'scroll-delays',
    what: 'scrollTo(0, 2) and back each second from 1 s to 11 s (no pointer, key or wheel): on ~5 s after the last scroll',
    async act(p, d) {
      for (let i = 0; i <= 10; i++) {
        await until(p, d + 1000 + i * 1000);
        await p.evaluate((y) => scrollTo(0, y), i % 2 ? 0 : 2);
      }
      await waitHint(p, 'done', 12000);
      await until(p, (await now(p)) + QUIET);
    },
    check: (T) => T.seq === 'on,done' && T.scrollN >= 8 && T.pointermoveN === 0 && T.wheelN === 0 && T.on - T.scrollLast >= 4900 && T.on - T.scrollLast <= 5400,
  },
  {
    id: 'reduced-motion',
    what: "reducedMotion 'reduce': the hint never runs (25 s watched)",
    reduce: true,
    async act(p, d, n) {
      n.running = await p.evaluate(() => document.querySelector('[data-lab-root]').dataset.running);
      await until(p, d + 25000);
      n.k = (await stat(p)).hint;
    },
    check: (T, n) => T.seq === '' && n.k === 0,
  },
  {
    id: 'motion-off-stored',
    what: "Motion switch off (localStorage motion='off' before load): the hint never runs (25 s watched)",
    init: () => localStorage.setItem('motion', 'off'),
    async act(p, d, n) {
      n.motion = await p.evaluate(() => document.documentElement.dataset.motion);
      n.aria = await p.evaluate(() => document.querySelector('[data-motion-toggle]:not([hidden])')?.getAttribute('aria-checked'));
      await until(p, d + 25000);
      n.k = (await stat(p)).hint;
    },
    check: (T, n) => T.seq === '' && n.motion === 'off' && n.k === 0,
  },
  {
    id: 'motion-off-wait',
    what: "html data-motion set 'off' at 2 s (what the switch does, without its click), 'on' again at 4 s: cancelled, never fires",
    async act(p, d) {
      await until(p, d + 2000);
      await p.evaluate(() => (document.documentElement.dataset.motion = 'off'));
      await until(p, d + 4000);
      await p.evaluate(() => (document.documentElement.dataset.motion = 'on'));
      await until(p, d + 4000 + QUIET);
    },
    check: (T) => T.seq === 'cancelled',
  },
  {
    id: 'motion-click-during',
    what: 'a mouse click on the Motion switch 0.9 s into the hint: stopped, and the screen should go back to rest (stats().hint 0)',
    shots: true,
    async act(p, d, n, shoot) {
      await until(p, d + 1500);
      n.rest = await shoot('rest');
      const sw = await motionSwitch(p);
      const on = await waitHint(p, 'on');
      await p.mouse.move(...sw);
      await until(p, on + 900);
      await p.mouse.down();
      await p.waitForTimeout(80);
      await p.mouse.up();
      n.motion = await p.evaluate(() => document.documentElement.dataset.motion);
      n.after = await sampleK(p, 3000, 500);
      n.stuck = await shoot('after-motion-off');
      // Motion on again: the loop runs, and the light should settle.
      await click(p, sw);
      await p.waitForTimeout(1500);
      n.kOnAgain = (await stat(p)).hint;
      await until(p, (await now(p)) + QUIET);
    },
    check: (T, n) => T.seq === 'on,stopped' && n.motion === 'off' && n.after.at(-1)[1] === 0,
  },
  {
    id: 'motion-key-during',
    what: 'Enter on the (focused) Motion switch 0.9 s into the hint: stopped, and the screen should go back to rest (stats().hint 0)',
    shots: true,
    async act(p, d, n, shoot) {
      await until(p, d + 1500);
      n.rest = await shoot('rest');
      await p.evaluate(() => document.querySelector('[data-motion-toggle]:not([hidden])') && [...document.querySelectorAll('[data-motion-toggle]')].find((b) => b.offsetParent)?.focus({ preventScroll: true }));
      const on = await waitHint(p, 'on');
      await until(p, on + 900);
      await p.keyboard.press('Enter');
      n.motion = await p.evaluate(() => document.documentElement.dataset.motion);
      n.after = await sampleK(p, 3000, 500);
      n.stuck = await shoot('after-motion-off');
      await until(p, (await now(p)) + QUIET);
    },
    check: (T, n) => T.seq === 'on,stopped' && n.motion === 'off' && n.after.at(-1)[1] === 0,
  },
  {
    id: 'reduce-during',
    what: "the system's reduced motion switched on 0.9 s into the hint (emulateMedia; no pointer or key event): stopped, and the screen should go back to rest (stats().hint 0)",
    shots: true,
    async act(p, d, n, shoot) {
      await until(p, d + 1500);
      n.rest = await shoot('rest');
      const on = await waitHint(p, 'on');
      await until(p, on + 900);
      await p.emulateMedia({ reducedMotion: 'reduce' });
      n.after = await sampleK(p, 3000, 500);
      n.stuck = await shoot('after-reduce');
      // Hovering the monitor now re-lights it from the same stale hint term.
      const q = await p.evaluate(() => window.__lab.quad());
      await p.mouse.move(q.reduce((a, c) => a + c[0], 0) / 4, q.reduce((a, c) => a + c[1], 0) / 4);
      await p.waitForTimeout(300);
      await p.mouse.move(...ROOM);
      await p.waitForTimeout(300);
      n.kAfterHover = (await stat(p)).hint;
      await until(p, (await now(p)) + QUIET);
    },
    check: (T, n) => T.seq === 'on,stopped' && n.after.at(-1)[1] === 0,
  },
  {
    id: 'pc-direct',
    what: '/?probe&computer=work (the computer open from load): the hint never runs (25 s watched)',
    url: '/?probe&computer=work',
    async act(p, d, n) {
      n.pc = await p.evaluate(() => document.documentElement.dataset.pc);
      await until(p, d + 25000);
      n.pcEnd = await p.evaluate(() => document.documentElement.dataset.pc);
    },
    check: (T, n) => !T.seq.includes('on') && n.pcEnd === 'read',
  },
  {
    id: 'pc-enter-leave',
    what: '"Explore the lab" activated at 2 s with no pointer or key event (element.click()), history.back() once reading: cancelled on entering, never fires after leaving (20 s watched)',
    async act(p, d, n) {
      await until(p, d + 2000);
      await p.evaluate(() => document.querySelector('[data-lab-enter]').click());
      await p.waitForSelector('html[data-pc="read"]', { timeout: 20000 });
      n.hintInside = await hintAttr(p);
      await p.waitForTimeout(500);
      await p.evaluate(() => history.back());
      await p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 20000 });
      const e = await evs(p);
      n.leftAt = Math.round(e.filter((x) => x[1] === 'data-pc').at(-1)[0] - d);
      await until(p, (await now(p)) + QUIET + 2000);
    },
    check: (T, n) => T.seq === 'cancelled' && T.pcN > 0,
  },
  {
    id: 'scrolled-out',
    what: 'scrolled 1.5 windows down at 1 s: never fires while out of view (20 s); scrolled back: (by the code) fires ~5 s later',
    async act(p, d, n) {
      await until(p, d + 1000);
      await p.evaluate(() => scrollTo(0, innerHeight * 1.5));
      await until(p, d + 1000 + QUIET);
      n.outSeq = (await evs(p)).filter((x) => x[1] === 'data-hint').map((x) => x[2]).join(',');
      await p.evaluate(() => scrollTo(0, 0));
      n.backAt = Math.round((await now(p)) - d);
      await p.waitForSelector('[data-lab-root][data-hint="done"]', { timeout: 12000 }).catch(() => {});
      await p.waitForTimeout(1000);
    },
    check: (T, n) => n.outSeq === '',
  },
  {
    id: 'scrolled-mostly',
    what: 'scrolled so ~13% of the opening shows (the IntersectionObserver still counts it in view) and the monitor is above the window: does the hint play where it cannot be seen?',
    async act(p, d, n) {
      const q0 = await p.evaluate(() => window.__lab.quad());
      const box = await p.evaluate(() => {
        const r = document.querySelector('[data-lab-stage]').getBoundingClientRect();
        return { top: r.top + scrollY, h: r.height };
      });
      const y = Math.round(box.top + box.h * 0.87);
      await until(p, d + 1000);
      await p.evaluate((y) => scrollTo(0, y), y);
      await p.waitForTimeout(300);
      n.scrollY = await p.evaluate(() => scrollY);
      n.visible = await p.evaluate(() => {
        const r = document.querySelector('[data-lab-stage]').getBoundingClientRect();
        return +((Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / r.height).toFixed(3);
      });
      n.screenBottomNow = Math.round(Math.max(...q0.map((c) => c[1])) - n.scrollY);
      await until(p, d + 1000 + 12000);
    },
    check: (T) => !T.seq.includes('on'),
  },
];

// A clip of the monitor, and the mean luma (Rec. 709, 8-bit sRGB) of its screen (quad shrunk 6%), by canvas.
async function screenLuma(an, file, clip, q) {
  const b64 = fs.readFileSync(file).toString('base64');
  return an.evaluate(async ([b64, clip, q]) => {
    const i = new Image();
    await new Promise((ok) => {
      i.onload = ok;
      i.src = 'data:image/png;base64,' + b64;
    });
    const c = new OffscreenCanvas(i.width, i.height);
    const g = c.getContext('2d');
    g.drawImage(i, 0, 0);
    const { data, width } = g.getImageData(0, 0, i.width, i.height);
    const cx = q.reduce((a, p) => a + p[0], 0) / 4;
    const cy = q.reduce((a, p) => a + p[1], 0) / 4;
    const P = q.map(([x, y]) => [cx + (x - cx) * 0.94 - clip.x, cy + (y - cy) * 0.94 - clip.y]);
    const inside = (x, y) => {
      let a = false;
      for (let k = 0, j = 3; k < 4; j = k++) if (P[k][1] > y !== P[j][1] > y && x < ((P[j][0] - P[k][0]) * (y - P[k][1])) / (P[j][1] - P[k][1]) + P[k][0]) a = !a;
      return a;
    };
    let s = 0;
    let n = 0;
    for (let y = 0; y < i.height; y++) for (let x = 0; x < i.width; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const k = (y * width + x) * 4;
      s += 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
      n++;
    }
    return +(s / n).toFixed(1);
  }, [b64, clip, q]);
}

// Two clips side by side, labelled, as a JPEG (q .86), for review.
async function pairJpeg(an, files, labels, out) {
  const b64s = files.map((f) => fs.readFileSync(path.join(OUT, f)).toString('base64'));
  const j = await an.evaluate(async ([b64s, labels]) => {
    const imgs = await Promise.all(b64s.map((b) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b; })));
    const gap = 8;
    const top = 26;
    const c = new OffscreenCanvas(imgs.reduce((a, i) => a + i.width, 0) + gap, Math.max(...imgs.map((i) => i.height)) + top);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    let x = 0;
    imgs.forEach((i, n) => {
      g.drawImage(i, x, top);
      g.fillStyle = '#ddd';
      g.font = '600 13px system-ui, sans-serif';
      g.fillText(labels[n], x + 4, 17);
      x += i.width + gap;
    });
    const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 })).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, [b64s, labels]);
  fs.writeFileSync(path.join(OUT, out), Buffer.from(j, 'base64'));
}

async function runCase(browser, an, c, run) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, reducedMotion: c.reduce ? 'reduce' : 'no-preference' });
  await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
  await ctx.addInitScript(recorder);
  if (c.init) await ctx.addInitScript(c.init);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const n = {};
  let res;
  try {
    await p.goto(BASE + (c.url || '/?probe'), { waitUntil: 'load' });
    await p.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 60000 });
    const e0 = await evs(p);
    const d = e0.find((x) => x[1] === 'data-drawn')[0];
    const load = e0.find((x) => x[1] === 'load')?.[0];
    const f0 = (await stat(p))?.frames ?? 0;
    const t0 = await now(p);
    const shoot = async (name) => {
      const file = path.join(OUT, `hint-light-idle-${c.id}-${name}-run${run}.png`);
      await stat(p);
      const q = await p.evaluate(() => window.__lab.quad());
      const xs = q.map((v) => v[0]);
      const ys = q.map((v) => v[1]);
      const clip = { x: Math.max(0, Math.floor(Math.min(...xs) - 20)), y: Math.max(0, Math.floor(Math.min(...ys) - 20)) };
      clip.width = Math.min(VW, Math.ceil(Math.max(...xs) + 20)) - clip.x;
      clip.height = Math.min(VH, Math.ceil(Math.max(...ys) + 20)) - clip.y;
      await p.screenshot({ path: file, clip });
      return { file: path.basename(file), luma: await screenLuma(an, file, clip, q), k: +(await stat(p)).hint.toFixed(3) };
    };
    await c.act(p, d, n, shoot);
    const after = n.stuck;
    if (n.rest && after) await pairJpeg(an, [n.rest.file, after.file], [`rest: luma ${n.rest.luma}, hint ${n.rest.k}`, `3 s after motion off: luma ${after.luma}, hint ${after.k}`], `hint-light-idle-${c.id}-pair-run${run}.jpg`);
    const e = await evs(p);
    const f1 = (await stat(p))?.frames ?? 0;
    const t1 = await now(p);
    const rel = (t) => Math.round(t - d);
    const hint = e.filter((x) => x[1] === 'data-hint');
    const T = { seq: hint.map((x) => x[2]).join(','), load: load != null ? rel(load) : null };
    for (const [t, , v] of hint) T[v] = rel(t);
    for (const k of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll']) {
      const xs = e.filter((x) => x[1] === k && x[0] >= d);
      T[k + 'N'] = xs.length;
      if (xs.length) T[k + 'Last'] = rel(xs.at(-1)[0]);
    }
    T.pcN = e.filter((x) => x[1] === 'data-pc').length;
    T.watchedTo = rel(t1);
    T.framesPerS = Math.round(((f1 - f0) / (t1 - t0)) * 1000);
    n.renderer = await renderer(p);
    res = { id: c.id, run, T, n, pass: !!c.check(T, n), errors };
  } catch (err) {
    res = { id: c.id, run, T: {}, n, pass: false, errors: [...errors, String(err.message || err).split('\n')[0]] };
  }
  await ctx.close();
  return res;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const anCtx = await browser.newContext();
  const an = await anCtx.newPage();
  await an.setContent('<!doctype html><title>stats</title>');
  const cases = CASES.filter((c) => !ONLY || ONLY.includes(c.id));
  const jobs = [];
  for (let run = 1; run <= RUNS; run++) for (const c of cases) jobs.push([c, run]);
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(POOL, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [c, run] = jobs[next++];
        const r = await runCase(browser, an, c, run);
        console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} run ${r.run} ${JSON.stringify(r.T)}`);
        results.push(r);
      }
    }),
  );
  await browser.close();
  const renderers = [...new Set(results.map((r) => r.n.renderer).filter(Boolean))];
  const lines = [`# hint-light-idle ${new Date().toISOString()} renderer: ${renderers.join(' / ')} server: ${BASE} viewport ${VW}x${VH} dpr 1 runs ${RUNS} pool ${POOL}`];
  lines.push('# times are ms after data-drawn, from performance.now() in the page; seq = data-hint values in order; xN/xLast = count and last time of each input event');
  for (const c of cases) {
    lines.push('');
    lines.push(`## ${c.id}: ${c.what}`);
    for (const r of results.filter((r) => r.id === c.id).sort((a, b) => a.run - b.run)) {
      const { renderer: _, ...notes } = r.n;
      lines.push(`${r.pass ? 'PASS' : 'FAIL'} run ${r.run} ${JSON.stringify(r.T)}`);
      if (Object.keys(notes).length) lines.push(`  notes ${JSON.stringify(notes)}`);
      if (r.errors.length) lines.push(`  errors ${JSON.stringify(r.errors)}`);
    }
  }
  const text = lines.join('\n').replace(/[ \t]+$/gm, '') + '\n';
  if (LOG) fs.writeFileSync(LOG, text);
  console.log(text);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
