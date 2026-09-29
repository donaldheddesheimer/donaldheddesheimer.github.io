// node rec.cjs [out.webm] — a short recording: the opening, the monitor hovered and clicked, the flight in,
// About from the computer's bar, a scroll, Résumé, "Back to room" and the flight out. 1280×800, GPU.
// Frames come from Chrome's screencast (CDP); a blank page replays them onto a canvas at their own
// timing and MediaRecorder encodes the WebM (no ffmpeg).
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
const file = process.argv[2] || require('path').join(__dirname, '../video/lab-1280x800.webm');
const fs = require('fs');
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
  const frame = () => p.frames().find((f) => f.url().includes('/computer/'));
  await p.goto(BASE + '/');
  await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
  await p.evaluate(() => document.fonts.ready);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800 });
  rolling = true;
  await sleep(1800);
  const m = await p.evaluate(() => (({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 }))(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
  await p.mouse.move(m.x - 260, m.y - 120, { steps: 20 });
  await sleep(500);
  await p.mouse.move(m.x, m.y, { steps: 30 });
  await sleep(900);
  await p.mouse.click(m.x, m.y);
  await p.waitForFunction(() => document.documentElement.dataset.pc === 'read' && document.querySelector('.pc-frame')?.contentDocument?.readyState === 'complete', null, { timeout: 15000 });
  await sleep(1400);
  // A real click (the bounding box is in the window's coordinates, through the frame's transform): a
  // scripted click() has no pointer, and "Back to room" would come back with the keyboard's ring.
  const nav = async (sel) => { const r = await frame().locator(sel).boundingBox(); const x = r.x + r.width / 2, y = r.y + r.height / 2; await p.mouse.move(x, y, { steps: 12 }); await sleep(250); await p.mouse.click(x, y); };
  await nav('.scr-nav a[href$="/about/"]');
  await sleep(1300);
  const fr = await p.locator('.pc-frame').boundingBox();
  await p.mouse.move(fr.x + fr.width / 2, fr.y + fr.height * 0.6, { steps: 10 });
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 120); await sleep(120); }
  await sleep(1000);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -120); await sleep(120); }
  await sleep(600);
  await nav('.scr-nav a[href$="/resume/"]');
  await sleep(1500);
  await nav('[data-leave]');
  await p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
  await sleep(2200);
  rolling = false;
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
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 1_500_000 });
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
  console.log(file, frames.length, 'frames over', ((frames.at(-1).t - t0)).toFixed(1), 's');
  await b.close();
})();
