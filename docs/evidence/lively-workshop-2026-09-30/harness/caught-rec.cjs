// node caught-rec.cjs [out.webm] — the opening's caught moment, from a fresh session (motion on) at the
// first draw, through the wave and back into the routine: about 9 s at 1280×800, the Mac's GPU. Frames
// come from Chrome's screencast (CDP); a blank page replays them onto a canvas at their own timing and
// MediaRecorder encodes the WebM (no ffmpeg). (The terminal-workshop pass's robots-rec.cjs, shortened.)
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require(process.env.SERVE || '../../lab-terminal-2026-09-29/harness/serve.cjs');
const file = process.argv[2] || require('path').join(__dirname, '../video/caught-1280x800.webm');
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
  await sleep(9000);
  // Start at the first draw (the page before it is blank).
  while (frames.length > 1 && frames[1].t <= drawnAt) frames.shift();
  rolling = false;
  if (process.env.LAST) fs.writeFileSync(process.env.LAST, Buffer.from(frames.at(-1).data, 'base64'));
  await cdp.send('Page.stopScreencast');
  await ctx.close();
  // Replay at the frames' own timing, and encode.
  const enc = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await enc.goto('about:blank');
  const t0 = frames[0].t;
  const list = frames.map((f) => ({ data: f.data, at: (f.t - t0) * 1000 }));
  const b64 = await enc.evaluate(async (list) => {
    const c = Object.assign(document.createElement('canvas'), { width: 1280, height: 800 });
    document.body.append(c);
    const g = c.getContext('2d');
    const imgs = await Promise.all(list.map((f) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/jpeg;base64,' + f.data; })));
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 600_000 });
    const parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    g.drawImage(imgs[0], 0, 0, 1280, 800);
    rec.start(250);
    const start = performance.now();
    for (let i = 0; i < imgs.length; i++) {
      const wait = list[i].at - (performance.now() - start);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      g.drawImage(imgs[i], 0, 0, 1280, 800);
    }
    await new Promise((r) => setTimeout(r, 400));
    rec.stop();
    await done;
    const blob = new Blob(parts, { type: 'video/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, list);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(require('path').basename(file), frames.length, 'frames over', (frames.at(-1).t - t0).toFixed(1), 's');
  await b.close();
})();
