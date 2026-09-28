// The released pages, pixel by pixel and style by style, against a baseline build of origin/main (cc1a6c4):
// a full-page screenshot of each page from both servers, with reduced motion so the home page's opening
// shows its still (RobotStage.astro loads no scene under reduced motion) and every image decoded eagerly
// first. Adapted from docs/evidence/lab-prototype-2026-09-27/harness/release-diff.cjs, with the controls
// built in: each page and size is loaded REPS times from each build (A1 B1 A2 B2 ...), and compared as
//   AiBj       every baseline capture against every candidate capture,
//   AiAj, BiBj each build against itself (the capture's noise floor).
// The verdict per page and size: "identical" when some A/B pair matches to the pixel; "noise only" when
// none does but every A/B region also shows in a control, no stronger there; else "DIFFERENT".
// Each comparison is made twice: "raw", as served (A1B1 and A2B2 only), and "norm", after the footer /
// status bar's BUILD stamp (the commit the build was made from, src/lib/build.ts) is set to the same
// placeholder on both sides, so the stamp can't hide anything else. Differing pixels are grouped into
// regions (16 px cells) with a bounding box, a pixel count and the largest channel difference; the raw
// A1B1 regions are cropped from both captures, side by side (A left, B right), into OUT. Every element's
// computed style (and ::before/::after with content) and box is compared too, A1 against B1 and A2
// against B2 (A1 against A2 as the control): that catches cascade changes the pixels might not show.
// Env: BASE_A (baseline, default :4330), BASE_B (candidate, default :4322), JOBS ("WxH:path,path;WxH:*",
// * = every released page: /, /systems/, /systems/screen/, a missing path, and each /projects/<id>/ the
// baseline's home page links to), TOUCH=1 (isMobile + hasTouch, so (pointer: coarse) rules apply), REPS
// (captures per build, default 2), OUT (crops), LOG (the log file), WAIT (ms after decoding, default
// 1500), CLOCK (the fixed time every page sees, so the console header's minute clock can't differ),
// KNOWN (custom properties tallied apart).
// NODE_PATH=<pwshim>/node_modules node release-diff-pixels.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const A = process.env.BASE_A || 'http://127.0.0.1:4330';
const B = process.env.BASE_B || 'http://127.0.0.1:4322';
const JOBS = process.env.JOBS || '1440x900:*;390x844:*;1024x768:/,/projects/cucadence/';
const TOUCH = process.env.TOUCH === '1';
const OUT = process.env.OUT || '.';
const LOG = process.env.LOG || '';
const WAIT = +(process.env.WAIT || 1500);
// Captures per build and per page and size (at least 2).
const REPS = Math.max(2, +(process.env.REPS || 2));
// Custom properties the candidate adds on :root (every element inherits them): tallied apart, as `known`.
const KNOWN = (process.env.KNOWN ?? '--text-2xl').split(',').filter(Boolean);
// The console header's Atlanta clock (Base.astro) shows the minute: every capture gets the same one.
const CLOCK = new Date(process.env.CLOCK || '2026-09-27T20:24:00-04:00');
const lines = [];
let header = null;
const say = (s) => {
  const t = typeof s === 'string' ? s : JSON.stringify(s);
  lines.push(t);
  console.log(t);
  if (LOG) fs.writeFileSync(LOG, [header, ...lines].filter(Boolean).map((l) => l.replace(/[ \t]+$/g, '')).join('\n') + '\n');
};
const slug = (p) => p.replace(/\W+/g, '_');

// Every element's computed style (deduplicated into a table of distinct style strings) and its box.
function snapshot() {
  const table = [];
  const index = new Map();
  const id = (s) => {
    let k = index.get(s);
    if (k === undefined) index.set(s, (k = table.push(s) - 1));
    return k;
  };
  const ser = (cs) => {
    let s = '';
    for (let i = 0; i < cs.length; i++) s += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
    return s;
  };
  const rows = [];
  for (const el of [document.documentElement, ...document.documentElement.querySelectorAll('body, body *')]) {
    const r = el.getBoundingClientRect();
    const b = getComputedStyle(el, '::before');
    const a = getComputedStyle(el, '::after');
    rows.push([
      el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\s+/).join('.') : ''),
      id(ser(getComputedStyle(el))),
      b.content && b.content !== 'none' ? id(ser(b)) : -1,
      a.content && a.content !== 'none' ? id(ser(a)) : -1,
      [r.x, r.y + scrollY, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(','),
    ]);
  }
  return { table, rows };
}
const props = (s) => new Map(s.split(';').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf(':')), kv.slice(kv.indexOf(':') + 1)]));
function styleDiff(x, y) {
  const out = { elements: x.rows.length, same: true, count: 0, byProp: {}, examples: [] };
  if (x.rows.length !== y.rows.length) {
    out.same = false;
    out.lengths = [x.rows.length, y.rows.length];
  }
  const known = {};
  const n = Math.min(x.rows.length, y.rows.length);
  for (let i = 0; i < n; i++) {
    const [pa, sa, ba, aa, ra] = x.rows[i];
    const [pb, sb, bb, ab, rb] = y.rows[i];
    const d = [];
    if (pa !== pb) d.push(`element ${pa} | ${pb}`);
    if (ra !== rb) d.push(`box ${ra} | ${rb}`);
    for (const [label, ia, ib] of [['', sa, sb], ['::before ', ba, bb], ['::after ', aa, ab]]) {
      const ta = ia < 0 ? '' : x.table[ia];
      const tb = ib < 0 ? '' : y.table[ib];
      if (ta === tb) continue;
      const ma = props(ta);
      const mb = props(tb);
      for (const k of new Set([...ma.keys(), ...mb.keys()])) {
        if (ma.get(k) === mb.get(k)) continue;
        const line = `${label}${k}: ${ma.get(k) ?? '(none)'} | ${mb.get(k) ?? '(none)'}`;
        if (KNOWN.includes(k)) known[line] = (known[line] || 0) + 1;
        else d.push(line);
      }
    }
    if (d.length) {
      out.same = false;
      out.count++;
      for (const line of d) out.byProp[line.split(':')[0]] = (out.byProp[line.split(':')[0]] || 0) + 1;
      if (out.examples.length < 8) out.examples.push({ i, el: pa.slice(0, 90), d: d.slice(0, 6) });
    }
  }
  if (Object.keys(known).length) out.known = known;
  return out;
}

// In the comparison page: differing pixels grouped into regions, and optional side-by-side crops.
async function compare(cmp, a, b, crops) {
  return cmp.evaluate(
    async ([a, b, crops]) => {
      const load = (s) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + s; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const px = (i) => { const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, w, h).data; };
      const [da, db] = [px(ia), px(ib)];
      const C = 16;
      const cw = Math.ceil(w / C);
      const cells = new Map();
      let diff = 0, max = 0;
      for (let k = 0, p = 0; k < da.length; k += 4, p++) {
        const d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]));
        if (!d) continue;
        diff++;
        max = Math.max(max, d);
        const x = p % w, y = (p - x) / w;
        const key = Math.floor(y / C) * cw + Math.floor(x / C);
        const c = cells.get(key);
        if (c) { c.n++; c.m = Math.max(c.m, d); c.x0 = Math.min(c.x0, x); c.y0 = Math.min(c.y0, y); c.x1 = Math.max(c.x1, x); c.y1 = Math.max(c.y1, y); }
        else cells.set(key, { n: 1, m: d, x0: x, y0: y, x1: x, y1: y });
      }
      // Regions: cells within two cells of each other.
      const seen = new Set();
      const regions = [];
      for (const key of cells.keys()) {
        if (seen.has(key)) continue;
        const r = { px: 0, max: 0, box: [1e9, 1e9, -1, -1] };
        const stack = [key];
        seen.add(key);
        while (stack.length) {
          const k = stack.pop();
          const c = cells.get(k);
          r.px += c.n; r.max = Math.max(r.max, c.m);
          r.box = [Math.min(r.box[0], c.x0), Math.min(r.box[1], c.y0), Math.max(r.box[2], c.x1), Math.max(r.box[3], c.y1)];
          const cx = k % cw, cy = (k - cx) / cw;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= cw || ny < 0) continue;
            const nk = ny * cw + nx;
            if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
          }
        }
        regions.push(r);
      }
      regions.sort((p, q) => q.px - p.px);
      const out = { same: diff === 0 && ia.width === ib.width && ia.height === ib.height, size: ia.width === ib.width && ia.height === ib.height ? `${w}x${h}` : [`${ia.width}x${ia.height}`, `${ib.width}x${ib.height}`], diffPixels: diff, maxChannelDiff: max, regions: regions.slice(0, 8) };
      if (regions.length > 8) out.moreRegions = regions.length - 8;
      if (crops && diff) {
        out.crops = regions.slice(0, crops).map((r) => {
          const pad = 40;
          const cx = (r.box[0] + r.box[2]) / 2;
          const half = Math.max((r.box[2] - r.box[0]) / 2 + pad, 170);
          const x0 = Math.max(0, Math.round(cx - half)), y0 = Math.max(0, r.box[1] - pad);
          const x1 = Math.min(w, Math.round(cx + half)), y1 = Math.min(h, r.box[3] + 1 + pad);
          const cw2 = x1 - x0, ch = y1 - y0, label = 40, gap = 12;
          const c = new OffscreenCanvas(cw2 * 2 + gap, ch + label);
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.fillStyle = '#000'; g.font = '12px sans-serif';
          g.fillText('A: baseline cc1a6c4', 4, 15);
          g.fillText('B: this branch', cw2 + gap + 4, 15);
          g.fillText(`region [${r.box.join(', ')}], ${r.px} px`, 4, 32);
          g.drawImage(ia, x0, y0, cw2, ch, 0, label, cw2, ch);
          g.drawImage(ib, x0, y0, cw2, ch, cw2 + gap, label, cw2, ch);
          g.strokeStyle = '#e0245e'; g.lineWidth = 1;
          for (const ox of [0, cw2 + gap]) g.strokeRect(ox + r.box[0] - x0 - 2.5, label + r.box[1] - y0 - 2.5, r.box[2] - r.box[0] + 6, r.box[3] - r.box[1] + 6);
          return c.convertToBlob({ type: 'image/jpeg', quality: 0.86 }).then((bl) => bl.arrayBuffer()).then((ab) => { let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); });
        });
        out.crops = await Promise.all(out.crops);
      }
      return out;
    },
    [a.toString('base64'), b.toString('base64'), crops || 0],
  );
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const cmp = await (await browser.newContext()).newPage();
  const capture = async (base, path, width, height) => {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1, isMobile: TOUCH, hasTouch: TOUCH });
    await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
    const page = await ctx.newPage();
    await page.clock.setFixedTime(CLOCK);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const resp = await page.goto(base + path, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.querySelector('canvas') || document.querySelector('[data-drawn], [data-failed]'), null, { timeout: 60000 }).catch(() => errors.push('canvas never drew'));
    // Lazy images below the fold load or not depending on timing: load and decode every one first.
    await page.evaluate(() => Promise.all([...document.images].map((i) => ((i.loading = 'eager'), i.decode().catch(() => {})))));
    await page.evaluate(() => document.fonts.ready.then(() => 0));
    await page.waitForTimeout(WAIT);
    const info = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no WebGL',
        motion: document.documentElement.dataset.motion,
        coarse: matchMedia('(pointer: coarse)').matches,
        height: document.documentElement.scrollHeight,
        canvases: document.querySelectorAll('canvas').length,
        videos: [...document.querySelectorAll('video')].map((v) => `${v.paused ? 'paused' : 'playing'}@${v.currentTime.toFixed(2)}`),
        stamp: [...document.querySelectorAll('span.text-muted')].filter((s) => /^BUILD/.test(s.parentElement?.textContent.trim() ?? '')).map((s) => s.textContent.trim()),
      };
    });
    const raw = await page.screenshot({ fullPage: true, timeout: 180000 });
    await page.evaluate(() => {
      for (const s of document.querySelectorAll('span.text-muted')) if (/^BUILD/.test(s.parentElement?.textContent.trim() ?? '')) s.textContent = 'xxxxxxx 0000-00-00';
    });
    await page.waitForTimeout(100);
    const styles = await page.evaluate(snapshot);
    const norm = await page.screenshot({ fullPage: true, timeout: 180000 });
    await ctx.close();
    return { status: resp?.status(), info, errors, raw, norm, styles };
  };

  // Every released page: from the baseline's home page links.
  const home = await (await fetch(A + '/')).text();
  const projects = [...new Set([...home.matchAll(/href="(\/projects\/[a-z0-9-]+\/)"/g)].map((m) => m[1]))].sort();
  const all = ['/', '/systems/', '/systems/screen/', '/no-such-page/', ...projects];

  {
    const probe = await browser.newContext();
    await probe.route(/^https:\/\/fonts\./, (r) => r.abort());
    const p = await probe.newPage();
    await p.goto(A + '/systems/', { waitUntil: 'load' });
    const rend = await p.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no WebGL';
    });
    await probe.close();
    header = `# release-diff-pixels ${new Date().toISOString()} renderer="${rend}" server=A ${A} (origin/main cc1a6c4) vs B ${B} (cinematic-lab-prototype) · reduced motion, full page, DPR 1${TOUCH ? ', isMobile+hasTouch' : ''} · JOBS=${JOBS}`;
  }
  say(`# released pages (${all.length}): ${all.join(' ')}`);

  const tally = [];
  for (const job of JOBS.split(';')) {
    const [wh, list] = job.split(':');
    const [width, height] = wh.split('x').map(Number);
    const paths = list === '*' ? all : list.split(',');
    for (const path of paths) {
      const t0 = Date.now();
      const As = [], Bs = [];
      for (let k = 0; k < REPS; k++) {
        As.push(await capture(A, path, width, height));
        Bs.push(await capture(B, path, width, height));
      }
      const [A1, B1] = [As[0], Bs[0]];
      const res = { size: wh, path, status: [A1.status, B1.status], height: [A1.info.height, B1.info.height] };
      const renderers = new Set([...As, ...Bs].map((c) => c.info.renderer));
      if (renderers.size !== 1) res.renderers = [...renderers];
      res.stamp = [A1.info.stamp.join(' / '), B1.info.stamp.join(' / ')];
      if (A1.info.videos.length || B1.info.videos.length) res.videos = [A1.info.videos, B1.info.videos];
      if (A1.info.canvases || B1.info.canvases) res.canvases = [A1.info.canvases, B1.info.canvases];
      res.motion = A1.info.motion + '/' + B1.info.motion;
      if (TOUCH) res.coarse = A1.info.coarse;
      const errs = [...As, ...Bs].flatMap((c) => c.errors);
      if (errs.length) res.pageErrors = [...new Set(errs)].slice(0, 4);
      say(res);
      const cmpLine = (name, r) => say(`  ${name} ${JSON.stringify(r)}`);
      const ab1 = await compare(cmp, A1.raw, B1.raw, 3);
      if (ab1.crops) {
        ab1.cropFiles = ab1.crops.map((b64, i) => {
          const f = `${OUT}/release-diff-${TOUCH ? 'touch-' : ''}${wh}${slug(path)}-r${i}.jpg`;
          fs.writeFileSync(f, Buffer.from(b64, 'base64'));
          return f.split('/').pop();
        });
        delete ab1.crops;
      }
      cmpLine('AB1 raw ', ab1);
      cmpLine('AB2 raw ', await compare(cmp, As[1].raw, Bs[1].raw));
      // Normalized: every A capture against every B capture, and each build against itself.
      const cross = [];
      for (let i = 0; i < REPS; i++) for (let j = 0; j < REPS; j++) cross.push({ name: `A${i + 1}B${j + 1}`, r: await compare(cmp, As[i].norm, Bs[j].norm) });
      const ctrl = [];
      for (let i = 0; i < REPS; i++) for (let j = i + 1; j < REPS; j++) {
        ctrl.push({ name: `A${i + 1}A${j + 1}`, r: await compare(cmp, As[i].norm, As[j].norm) });
        ctrl.push({ name: `B${i + 1}B${j + 1}`, r: await compare(cmp, Bs[i].norm, Bs[j].norm) });
      }
      for (const { name, r } of [...cross, ...ctrl]) cmpLine(`${name} norm`, r);
      // Verdict: an A/B pair that matches exactly; else every A/B region inside a region the controls also
      // show, no stronger than the controls there; else different.
      const exact = cross.filter(({ r }) => r.same).map(({ name }) => name);
      const overlap = (p, q) => p[0] <= q[2] + 16 && q[0] <= p[2] + 16 && p[1] <= q[3] + 16 && q[1] <= p[3] + 16;
      const ctrlRegions = ctrl.flatMap(({ r }) => r.regions);
      const unexplained = cross.flatMap(({ name, r }) => r.regions.filter((g) => !ctrlRegions.some((c) => overlap(g.box, c.box) && g.max <= Math.max(...ctrlRegions.filter((d) => overlap(g.box, d.box)).map((d) => d.max)))).map((g) => `${name} ${JSON.stringify(g)}`));
      const sizes = new Set(cross.map(({ r }) => JSON.stringify(r.size)));
      const verdict = exact.length ? `identical: ${exact.join(' ')} match to the pixel` : sizes.size > 1 || unexplained.length ? `DIFFERENT: ${unexplained.slice(0, 3).join(' ; ')}` : `noise only: no A/B pair matched exactly, and every A/B region is also in a control (${ctrl.filter(({ r }) => !r.same).map(({ name, r }) => `${name} ${r.diffPixels} px max ${r.maxChannelDiff}`).join(', ')})`;
      say(`  verdict (norm): ${verdict}`);
      const st = [styleDiff(As[0].styles, Bs[0].styles), styleDiff(As[1].styles, Bs[1].styles), styleDiff(As[0].styles, As[1].styles)];
      cmpLine('styles A1B1', st[0]);
      cmpLine('styles A2B2', st[1]);
      cmpLine('styles A1A2', st[2]);
      tally.push({ at: `${wh} ${path}`, verdict: verdict.split(':')[0], styles: st[0].count + st[1].count, ctrlStyles: st[2].count });
      say(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
  }
  // One line per verdict, and the style differences A/B (beyond KNOWN) over every page and size.
  const kinds = ['identical', 'noise only', 'DIFFERENT'];
  say(`# summary: ${tally.length} page/size pairs: ${kinds.map((k) => `${k} ${tally.filter((t) => t.verdict === k).length}`).join(', ')}; computed-style differences A/B beyond ${KNOWN.join(',') || 'nothing'}: ${tally.reduce((n, t) => n + t.styles, 0)} (controls ${tally.reduce((n, t) => n + t.ctrlStyles, 0)})`);
  for (const k of kinds.slice(1)) { const at = tally.filter((t) => t.verdict === k).map((t) => t.at); if (at.length) say(`# ${k}: ${at.join(' ; ')}`); }
  await browser.close();
})().catch((e) => {
  say('# harness error: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  process.exit(1);
});
