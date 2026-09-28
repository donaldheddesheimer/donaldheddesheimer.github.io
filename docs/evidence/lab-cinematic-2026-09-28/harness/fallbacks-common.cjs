// Shared helpers for the fallbacks-*.cjs harnesses (phones, stacked layout, reduced motion, the Motion
// switch, WebGL failure, no JS, Save-Data, the live pages): a plain-text log whose first line names the
// time, the WebGL renderer the page actually got and the server; the page's renderer string
// (WEBGL_debug_renderer_info); a watcher that collects page errors, console errors, 4xx/5xx responses
// and failed requests (Google Fonts are aborted, offline, and counted apart, as are a metadata-only
// video's cancelled download and responses a check expects, such as the 404 page's 404); a pixel diff of two
// screenshots drawn on a canvas. Not run on its own: require('./fallbacks-common.cjs').
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER = process.env.BASE || 'http://127.0.0.1:4322';
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'lab-fallbacks');
const LOGS = process.env.LOGS || path.join(__dirname, '..', 'logs');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

// Lines kept until the end, so the header can name the renderer that ran.
function makeLog(name, server = SERVER) {
  const started = new Date().toISOString();
  const lines = [];
  const renderers = [];
  const log = (...a) => {
    const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    console.log(s);
    lines.push(s);
  };
  return {
    log,
    // Every renderer the log's pages reported, in order (a harness may run more than one browser).
    setRenderer(r) {
      if (r && !renderers.includes(r)) renderers.push(r);
    },
    save() {
      const head = `# ${name} ${started} renderer="${renderers.join(' | ') || 'unknown'}" server=${server}`;
      const body = [head, ...lines].map((l) => l.replace(/[ \t]+$/gm, '')).join('\n') + '\n';
      fs.writeFileSync(path.join(LOGS, `${name}.log`), body);
    },
  };
}

// The WebGL renderer the page got: the scene's own context if it has one, else a probe canvas.
async function rendererOf(page) {
  return page
    .evaluate(() => {
      const info = (gl) => {
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      };
      const c = document.querySelector('[data-lab-stage] canvas');
      let r = null;
      try {
        r = c && (info(c.getContext('webgl2')) || info(c.getContext('webgl')));
      } catch {}
      if (r) return `scene: ${r}`;
      const t = document.createElement('canvas');
      try {
        r = info(t.getContext('webgl2')) || info(t.getContext('webgl'));
      } catch {}
      return r ? `probe: ${r}` : 'none (no WebGL context)';
    })
    .catch((e) => `unavailable (${e.message.split('\n')[0]})`);
}

async function newCtx(browser, opts = {}) {
  const ctx = await browser.newContext(opts);
  await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
  return ctx;
}

// Everything that goes wrong on a page (and its frames): page errors, console.error, 4xx/5xx
// responses, failed requests. `expect` filters out responses a check expects (the 404 page's own 404).
function watch(page, label, expect = () => false) {
  const w = { label, pageerrors: [], consoleErrors: [], badResponses: [], failed: [], fontsAborted: 0, fontsConsole: 0, mediaAborted: [], expected: [] };
  page.on('pageerror', (e) => w.pageerrors.push(e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const at = m.location()?.url ?? '';
    // The harness aborts Google Fonts (offline); Chrome logs each abort as a console error.
    const code = /status of (\d{3})/.exec(m.text())?.[1];
    if (/^https:\/\/fonts\./.test(at)) w.fontsConsole++;
    // Chrome's console line for a response `expect` allows (the 404 page's own 404).
    else if (code && expect({ url: () => at, status: () => +code })) w.expected.push(`console: ${m.text().slice(0, 80)} @ ${at}`);
    else w.consoleErrors.push(`${m.text().slice(0, 200)} @ ${at}`);
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    if (expect(r)) w.expected.push(`response: ${r.status()} ${r.url()}`);
    else w.badResponses.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText;
    if (/^https:\/\/fonts\./.test(r.url())) w.fontsAborted++;
    // A video with preload="metadata": Chrome takes the first bytes (206) and cancels the rest.
    else if (why === 'net::ERR_ABORTED' && /\.(mp4|webm|mov)$/.test(r.url())) w.mediaAborted.push(r.url());
    else w.failed.push(`${why} ${r.url()}`);
  });
  w.summary = () => ({ pageerrors: w.pageerrors, consoleErrors: w.consoleErrors, badResponses: w.badResponses, failed: w.failed, fontsAborted: w.fontsAborted, fontsConsole: w.fontsConsole, mediaAborted: w.mediaAborted, expected: w.expected });
  w.clean = () => !w.pageerrors.length && !w.consoleErrors.length && !w.badResponses.length && !w.failed.length;
  return w;
}

// How two screenshots (PNG buffers of the same size) differ, counted on a canvas in `page`'s browser.
async function pxdiff(page, a, b) {
  return page.evaluate(
    async ([a, b]) => {
      const load = (s) =>
        new Promise((ok, no) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = no;
          i.src = 'data:image/png;base64,' + s;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const px = (i) => {
        const c = new OffscreenCanvas(i.width, i.height);
        const g = c.getContext('2d');
        g.drawImage(i, 0, 0);
        return g.getImageData(0, 0, i.width, i.height).data;
      };
      const [da, db] = [px(ia), px(ib)];
      let max = 0;
      let n = 0;
      let big = 0;
      for (let k = 0; k < da.length; k += 4) {
        const d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]));
        if (d) {
          n++;
          if (d > 32) big++;
          max = Math.max(max, d);
        }
      }
      return { w: ia.width, h: ia.height, differing: n, over32: big, maxChannelDiff: max };
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The lab's state, as the DOM reports it.
const labState = (page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const root = document.querySelector('[data-lab-root]');
    const vis = [...document.querySelectorAll('[data-lab-enter] span')].find((s) => getComputedStyle(s).display !== 'none');
    const still = document.querySelector('[data-lab-root] .still');
    const canvas = document.querySelector('[data-lab-stage] canvas');
    return {
      url: location.pathname + location.search + location.hash,
      y: Math.round(scrollY),
      pc: h.dataset.pc ?? null,
      pcAble: h.hasAttribute('data-pc-able'),
      pcFull: h.hasAttribute('data-pc-full'),
      motion: h.dataset.motion ?? null,
      mounted: root?.hasAttribute('data-mounted') ?? null,
      drawn: root?.hasAttribute('data-drawn') ?? null,
      failed: root?.hasAttribute('data-failed') ?? null,
      running: root?.dataset.running ?? null,
      hint: root?.dataset.hint ?? null,
      enterLabel: vis?.textContent ?? null,
      enterHref: document.querySelector('[data-lab-enter]')?.getAttribute('href') ?? null,
      stillOpacity: still ? getComputedStyle(still).opacity : null,
      canvas: canvas ? { display: getComputedStyle(canvas).display, opacity: getComputedStyle(canvas).opacity } : null,
      dialogOpen: document.querySelector('[data-pc-dialog]')?.open ?? null,
    };
  });

module.exports = { SERVER, SHOTS, LOGS, makeLog, rendererOf, newCtx, watch, pxdiff, sleep, labState };
