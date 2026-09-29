// node rec.cjs [out.webm] — a short recording: the opening, the monitor hovered and clicked, the flight in,
// the terminal's startup, help and work typed, a scroll, Esc and the flight out, then the monitor clicked
// again: back in, the history kept, no startup again. 1280×800, the Mac's GPU.
// Frames come from Chrome's screencast (CDP); a blank page replays them onto a canvas at their own
// timing and MediaRecorder encodes the WebM (no ffmpeg).
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require('./serve.cjs');
const file = process.argv[2] || require('path').join(__dirname, '../video/terminal-1280x800.webm');
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
  const at = (sel) => p.evaluate((s) => (({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 }))(document.querySelector(s).getBoundingClientRect()), sel);
  const reading = () => p.waitForFunction(() => document.documentElement.dataset.pc === 'read' && document.querySelector('[data-term]')?.dataset.boot === 'done', null, { timeout: 20000 });
  const type = async (s) => { await p.keyboard.type(s, { delay: 110 }); await sleep(250); await p.keyboard.press('Enter'); };
  await p.goto(BASE + '/');
  await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'), null, { timeout: 30000 });
  await p.evaluate(() => document.fonts.ready);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800 });
  rolling = true;
  await sleep(1500);
  // In: the monitor hovered, then clicked; the flight, and the startup.
  let m = await at('[data-lab-monitor]');
  await p.mouse.move(m.x - 260, m.y - 120, { steps: 20 });
  await sleep(400);
  await p.mouse.move(m.x, m.y, { steps: 30 });
  await sleep(700);
  await p.mouse.click(m.x, m.y);
  await reading();
  await sleep(900);
  // help, then work (the output longer than the screen, shown from its start), and a scroll through it.
  await type('help');
  await sleep(1400);
  await type('work');
  await sleep(1600);
  const t = await at('[data-term]');
  await p.mouse.move(t.x, t.y, { steps: 10 });
  for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 120); await sleep(120); }
  await sleep(1000);
  // Out by Esc (a desktop has no power button), and the flight back to the room.
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
  await sleep(1400);
  // In again: the history and where it was being read, as they were.
  m = await at('[data-lab-monitor]');
  await p.mouse.move(m.x, m.y, { steps: 20 });
  await sleep(500);
  await p.mouse.click(m.x, m.y);
  await reading();
  await sleep(2000);
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
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 1_200_000 });
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
