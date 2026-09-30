// node rec.cjs [out.webm] — one repair cycle and the terminal in one take at 1280x800, the Mac's GPU,
// from a fresh session (motion on): from 8.5 s after the first draw (just before the first weld) through
// the weld, the inspection, the double take, the corrective weld and the look round, then the monitor
// clicked (the startup), Escape, and the room back. About 25 s. Frames come from Chrome's screencast
// (CDP); a blank page replays them onto a canvas at their own timing and MediaRecorder encodes the WebM
// (no ffmpeg). (The playful-workshop pass's rec.cjs, started later.)
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require(process.env.SERVE || require('path').join(__dirname, '../../lab-terminal-2026-09-29/harness/serve.cjs'));
const file = process.argv[2] || require('path').join(__dirname, '../video/repair-cycle-1280x800.webm');
const fs = require('fs');
fs.mkdirSync(require('path').dirname(file), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await routeDist(ctx);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const frames = [];
  let rolling = false;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    if (rolling) frames.push({ data, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800 });
  rolling = true;
  await p.goto(BASE + '/');
  await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
  const drawnAt = Date.now() / 1000;
  // The repair cycle (its look round the room over by about 25 s), then in, a moment, and out.
  await sleep(24800);
  const m = await p.evaluate(() => (({ x, y, width, height }) => [x + width / 2, y + height / 2])(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
  await p.mouse.move(m[0], m[1], { steps: 8 });
  await sleep(500);
  await p.mouse.click(m[0], m[1]);
  await p.waitForFunction(() => document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 8000 });
  await sleep(1200);
  await p.keyboard.press('Escape');
  await p.mouse.move(1200, 120);
  await sleep(3200);
  // Start just before the first weld.
  while (frames.length > 1 && frames[1].t <= drawnAt + 8.5) frames.shift();
  rolling = false;
  if (process.env.LAST) fs.writeFileSync(process.env.LAST, Buffer.from(frames.at(-1).data, 'base64'));
  await cdp.send('Page.stopScreencast');
  await ctx.close();
  // Replay at the frames' own timing, and encode: at most 25 frames a second, handed over in chunks and
  // decoded as they come (all of it at once is more than the page holds).
  const enc = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await enc.goto('about:blank');
  const t0 = frames[0].t;
  const list = [];
  for (const f of frames) if (!list.length || (f.t - t0) * 1000 - list.at(-1).at >= 40) list.push({ data: f.data, at: (f.t - t0) * 1000 });
  await enc.evaluate(() => (window.__f = []));
  for (let i = 0; i < list.length; i += 40) await enc.evaluate((part) => window.__f.push(...part), list.slice(i, i + 40));
  const b64 = await enc.evaluate(async () => {
    const list = window.__f;
    const c = Object.assign(document.createElement('canvas'), { width: 1280, height: 800 });
    document.body.append(c);
    const g = c.getContext('2d');
    const load = (f) => { const i = new Image(); i.src = 'data:image/jpeg;base64,' + f.data; return i.decode().then(() => i); };
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 420_000 });
    const parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    let next = load(list[0]);
    g.drawImage(await next, 0, 0, 1280, 800);
    rec.start(250);
    const start = performance.now();
    for (let i = 0; i < list.length; i++) {
      const img = await next;
      if (i + 1 < list.length) next = load(list[i + 1]);
      const wait = list[i].at - (performance.now() - start);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      g.drawImage(img, 0, 0, 1280, 800);
    }
    await new Promise((r) => setTimeout(r, 400));
    rec.stop();
    await done;
    const blob = new Blob(parts, { type: 'video/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(require('path').basename(file), list.length, 'frames over', (frames.at(-1).t - t0).toFixed(1), 's');
  await b.close();
})();
