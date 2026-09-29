// node frames.cjs video.webm out.png — a contact sheet of the recording as it plays (six frames, taken
// while it plays at its own speed: a MediaRecorder WebM carries no index to seek by).
const fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');
(async () => {
  const [src, out] = process.argv.slice(2);
  const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 540 } })).newPage();
  await p.route('http://v.test/**', (r) => r.fulfill({ body: fs.readFileSync(src), headers: { 'content-type': 'video/webm' } }));
  await p.route('http://page.test/', (r) => r.fulfill({ body: '<body style="margin:0;background:#000"><video id=v src="http://v.test/a.webm" muted playsinline style="position:absolute;left:-9999px"></video><canvas id=c width=1280 height=540></canvas>', headers: { 'content-type': 'text/html' } }));
  await p.goto('http://page.test/');
  const info = await p.evaluate(async () => {
    const v = document.getElementById('v');
    const c = document.getElementById('c').getContext('2d');
    const at = [1, 4.5, 8, 12, 15, 20.5];
    const got = [];
    await v.play();
    await new Promise((done) => {
      const tick = (_, meta) => {
        const t = meta.mediaTime;
        while (got.length < at.length && t >= at[got.length]) {
          const i = got.length;
          c.drawImage(v, (i % 3) * 426, Math.floor(i / 3) * 270, 426, 266);
          got.push(+t.toFixed(2));
        }
        if (got.length < at.length && !v.ended) v.requestVideoFrameCallback(tick);
        else done();
      };
      v.requestVideoFrameCallback(tick);
      v.addEventListener('ended', done, { once: true });
    });
    return { got, w: v.videoWidth, h: v.videoHeight, end: v.currentTime };
  });
  console.log(JSON.stringify(info));
  await p.screenshot({ path: out });
  await b.close();
})();
