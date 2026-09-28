// /systems/screen/ as the home page's lab monitor shows it, baseline cc1a6c4 (A) against this branch (B).
// The page redirects to /systems/ when it is the top window (its head script: window.top === window.self),
// so release-diff-pixels.cjs's /systems/screen/ capture is really /systems/ again. Here each server's
// /systems/screen/ is loaded in an iframe (about:blank host, as src/scripts/lab.ts frames it on the
// monitor) with reduced motion, DPR 1, fonts aborted and a fixed clock; images in the frame are decoded
// eagerly first. First the top-level redirect is recorded (final URL on both servers); then, per frame
// size, REPS captures from each build (A1 B1 A2 B2 ...) are compared, every A against every B and each
// build against itself as the control: the differing pixel count, the largest channel difference and
// the bounding box. The framed page is taller than the frame, so each capture is a series of frame
// screenshots, the frame's document scrolled one frame height further each time, compared segment by
// segment. The frame's computed styles (every element's box and sorted properties, ::before/::after
// with content, KNOWN custom properties dropped) are compared too: A1/B1, A2/B2 and A1/A2.
// Env: BASE_A (default :4330), BASE_B (default :4322), SIZES ("WxH,WxH": the frame's CSS size, default
// 1384x788,960x660,390x788), REPS (default 2), WAIT (ms, default 1500), KNOWN (default --text-2xl),
// OUT (crops), LOG (the log file).
// NODE_PATH=<pwshim>/node_modules node release-diff-screen.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const A = process.env.BASE_A || 'http://127.0.0.1:4330';
const B = process.env.BASE_B || 'http://127.0.0.1:4322';
const SIZES = (process.env.SIZES || '1384x788,960x660,390x788').split(',').map((s) => s.split('x').map(Number));
const REPS = Math.max(2, +(process.env.REPS || 2));
const WAIT = +(process.env.WAIT || 1500);
const KNOWN = (process.env.KNOWN ?? '--text-2xl').split(',').filter(Boolean);
const OUT = process.env.OUT || '.';
const LOG = process.env.LOG || '';
const CLOCK = new Date('2026-09-27T20:24:00-04:00');
const lines = [];
let header = null;
const say = (s) => {
  lines.push(s);
  console.log(s);
  if (LOG) fs.writeFileSync(LOG, [header, ...lines].filter(Boolean).map((l) => l.replace(/[ \t]+$/g, '')).join('\n') + '\n');
};

const rendererOf = (page) =>
  page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no WebGL';
  });

// Every element's computed style in the frame, one string; KNOWN properties left out.
const styleString = (known) => {
  const els = [document.documentElement, document.body, ...document.body.querySelectorAll('*')];
  // Sorted: Chromium lists custom properties in a different order from one load to the next.
  const one = (cs) => {
    const s = [];
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      if (!known.includes(p)) s.push(p + ':' + cs.getPropertyValue(p));
    }
    return s.sort().join(';');
  };
  return els
    .map((e) => {
      const r = e.getBoundingClientRect();
      let s = e.tagName + '|' + one(getComputedStyle(e)) + '|' + [r.x, r.y, r.width, r.height].map((v) => v.toFixed(2)).join(',');
      for (const pe of ['::before', '::after']) {
        const cs = getComputedStyle(e, pe);
        if (cs.content !== 'none') s += '|' + pe + one(cs);
      }
      return s;
    })
    .join('\n');
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // Top level: where /systems/screen/ ends up.
  const redirects = {};
  let rend = '';
  for (const [name, base] of [['A', A], ['B', B]]) {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(base + '/systems/screen/', { waitUntil: 'load' });
    await p.waitForTimeout(500);
    redirects[name] = p.url().replace(base, '');
    if (!rend) rend = await rendererOf(p);
    await ctx.close();
  }
  header = `# release-diff-screen ${new Date().toISOString()} renderer="${rend}" server=A ${A} (origin/main cc1a6c4) vs B ${B} (cinematic-lab-prototype) · /systems/screen/ in an iframe, reduced motion, DPR 1`;
  say(`# top level /systems/screen/ ends at: A ${redirects.A}, B ${redirects.B}`);

  const cmp = await (await browser.newContext()).newPage();
  const compare = (a, b, crop) =>
    cmp.evaluate(
      async ([a, b, crop]) => {
        const load = async (s) => createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { same: false, size: [[ia.width, ia.height], [ib.width, ib.height]] };
        const w = ia.width, h = ia.height;
        const px = (im) => { const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, w, h).data; };
        const da = px(ia), db = px(ib);
        let n = 0, max = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
          if (!d) continue;
          n++; if (d > max) max = d;
          const x = (i / 4) % w, y = Math.floor(i / 4 / w);
          if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
        }
        const out = { same: n === 0, size: `${w}x${h}`, diffPixels: n, maxChannelDiff: max };
        if (n) out.box = [x0, y0, x1, y1];
        if (n && crop) {
          const pad = 24, cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad);
          const cw = Math.max(340, Math.min(w - cx0, x1 - x0 + 1 + 2 * pad)), ch = Math.min(h - cy0, y1 - y0 + 1 + 2 * pad);
          const c = new OffscreenCanvas(cw * 2 + 8, ch + 40), g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.fillStyle = '#000'; g.font = '12px sans-serif';
          g.fillText('A: baseline cc1a6c4', 4, 15); g.fillText('B: this branch', cw + 12, 15);
          g.fillText(`box [${out.box.join(', ')}], ${n} px`, 4, 32);
          g.drawImage(ia, cx0, cy0, cw, ch, 0, 40, cw, ch);
          g.drawImage(ib, cx0, cy0, cw, ch, cw + 8, 40, cw, ch);
          const ab = await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 })).arrayBuffer();
          let s = ''; const u = new Uint8Array(ab);
          for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
          out.crop = btoa(s);
        }
        return out;
      },
      [a.toString('base64'), b.toString('base64'), crop],
    );

  // Segment by segment (the frame scrolled to each offset); boxes in the frame page's coordinates.
  const compareAll = async (sa, sb, crop) => {
    if (sa.map((x) => x.at).join() !== sb.map((x) => x.at).join()) return { same: false, offsets: [sa.map((x) => x.at), sb.map((x) => x.at)] };
    const out = { same: true, segments: sa.length, offsets: sa.map((x) => x.at), diffPixels: 0, maxChannelDiff: 0, boxes: [] };
    for (let k = 0; k < sa.length; k++) {
      const r = await compare(sa[k].png, sb[k].png, crop);
      if (r.same) continue;
      out.same = false;
      if (!r.box) { out.size = r.size; continue; }
      out.diffPixels += r.diffPixels;
      out.maxChannelDiff = Math.max(out.maxChannelDiff, r.maxChannelDiff);
      out.boxes.push([r.box[0], r.box[1] + sa[k].at, r.box[2], r.box[3] + sa[k].at]);
      if (r.crop && !out.crop) out.crop = r.crop;
    }
    if (!out.boxes.length) delete out.boxes;
    return out;
  };

  const capture = async (base, w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
    const page = await ctx.newPage();
    await page.clock.setFixedTime(CLOCK);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent(`<!doctype html><style>html,body{margin:0}iframe{display:block;border:0;width:${w}px;height:${h}px}</style><iframe title="Systems map" src="${base}/systems/screen/"></iframe>`);
    const el = await page.waitForSelector('iframe');
    const frame = await el.contentFrame();
    await frame.waitForLoadState('load');
    await frame.waitForFunction(() => !document.querySelector('canvas') || document.querySelector('[data-drawn], [data-failed]'), null, { timeout: 60000 }).catch(() => errors.push('canvas never drew'));
    await frame.evaluate(() => Promise.all([...document.images].map((i) => ((i.loading = 'eager'), i.decode().catch(() => {})))));
    await frame.evaluate(() => document.fonts.ready.then(() => 0));
    await page.waitForTimeout(WAIT);
    const info = await frame.evaluate(() => ({
      url: location.pathname,
      embed: document.documentElement.hasAttribute('data-embed'),
      motion: document.documentElement.dataset.motion,
      scrollHeight: document.documentElement.scrollHeight,
      canvases: document.querySelectorAll('canvas').length,
      stamp: [...document.querySelectorAll('span.text-muted')].filter((s) => /^BUILD/.test(s.parentElement?.textContent.trim() ?? '')).map((s) => s.textContent.trim()),
    }));
    // The frame scrolls (its page is taller than the frame): one shot per frame height, top to bottom.
    const styles = await frame.evaluate(styleString, KNOWN);
    const shots = [];
    for (let y = 0; ; y += h) {
      const at = await frame.evaluate((y) => (scrollTo(0, y), scrollY), y);
      await page.waitForTimeout(150);
      shots.push({ at, png: await el.screenshot() });
      if (y + h >= info.scrollHeight) break;
    }
    await ctx.close();
    return { info, errors, shot: shots, styles };
  };

  for (const [w, h] of SIZES) {
    const As = [], Bs = [];
    for (let k = 0; k < REPS; k++) {
      As.push(await capture(A, w, h));
      Bs.push(await capture(B, w, h));
    }
    say(`frame ${w}x${h}  A ${JSON.stringify(As[0].info)}  B ${JSON.stringify(Bs[0].info)}${[...As, ...Bs].some((c) => c.errors.length) ? '  errors ' + JSON.stringify([...new Set([...As, ...Bs].flatMap((c) => c.errors))]) : ''}`);
    const cross = [], ctrl = [];
    for (let i = 0; i < REPS; i++) for (let j = 0; j < REPS; j++) {
      const r = await compareAll(As[i].shot, Bs[j].shot, i === 0 && j === 0);
      if (r.crop) { const f = `release-diff-screen-${w}x${h}.jpg`; fs.writeFileSync(`${OUT}/${f}`, Buffer.from(r.crop, 'base64')); r.crop = f; }
      cross.push([`A${i + 1}B${j + 1}`, r]);
    }
    for (let i = 0; i < REPS; i++) for (let j = i + 1; j < REPS; j++) {
      ctrl.push([`A${i + 1}A${j + 1}`, await compareAll(As[i].shot, As[j].shot)]);
      ctrl.push([`B${i + 1}B${j + 1}`, await compareAll(Bs[i].shot, Bs[j].shot)]);
    }
    for (const [n, r] of [...cross, ...ctrl]) say(`  ${n} ${JSON.stringify(r)}`);
    const exact = cross.filter(([, r]) => r.same).map(([n]) => n);
    say(`  verdict: ${exact.length ? `identical: ${exact.join(' ')} match to the pixel` : `no A/B pair matched exactly (controls: ${ctrl.map(([n, r]) => `${n} ${r.diffPixels ?? 'size'}`).join(', ')})`}`);
    const sd = (x, y) => {
      if (x === y) return 'same';
      const a = x.split('\n'), b = y.split('\n');
      const n = a.length === b.length ? a.filter((l, i) => l !== b[i]).length : `element count ${a.length}/${b.length}`;
      return `DIFFERENT (${n} elements)`;
    };
    say(`  styles A1B1 ${sd(As[0].styles, Bs[0].styles)}, A2B2 ${sd(As[1].styles, Bs[1].styles)}, A1A2 ${sd(As[0].styles, As[1].styles)} (${As[0].styles.split('\n').length} elements, ${KNOWN.join(',')} left out)`);
  }
  await browser.close();
})().catch((e) => {
  say('# harness error: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  process.exit(1);
});
