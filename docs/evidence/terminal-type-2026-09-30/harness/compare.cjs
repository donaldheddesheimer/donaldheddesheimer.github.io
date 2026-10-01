// node compare.cjs — the type pass side by side: each still in ../before (the terminal overhaul's own
// shots.cjs at 4018349) beside the same still in ../after (this pass), labelled, as one JPEG per pair in
// ../compare. The desktop stills are cropped to the monitor's screen; the phone stills are whole.
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs');
const path = require('path');
const dir = (d) => path.join(__dirname, '..', d);
const pairs = [
  ['work-1440x900', [115, 72, 1210, 756]],
  ['work-all-1440x900', [115, 72, 1210, 756]],
  ['project-1440x900', [115, 72, 1210, 756]],
  ['project-open-1440x900', [115, 72, 1210, 756]],
  ['phone-work-390x844', null],
  ['phone-project-390x844', null],
];

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ deviceScaleFactor: 1 });
  fs.mkdirSync(dir('compare'), { recursive: true });
  for (const [name, crop] of pairs) {
    const [x, y, w, h] = crop || [0, 0, 390, 844];
    const src = (d) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir(d), name + '.jpg')).toString('base64');
    const pane = (d, label) => `<figure><figcaption>${label}</figcaption><div style="width:${w}px;height:${h}px;overflow:hidden"><img src="${src(d)}" style="margin:-${y}px 0 0 -${x}px"></div></figure>`;
    await p.setViewportSize({ width: 2 * w + 72, height: h + 76 });
    await p.setContent(`<style>body{margin:0;padding:24px;display:flex;gap:24px;background:#0c0b0a;font:500 15px/1 system-ui,sans-serif;color:#d8cfc0}figure{margin:0}figcaption{margin-bottom:12px}img{display:block}</style>${pane('before', 'Before · 4018349')}${pane('after', 'After · type pass')}`);
    await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await p.screenshot({ path: path.join(dir('compare'), name + '.jpg'), type: 'jpeg', quality: 85 });
  }
  console.log(`# Chrome ${b.version()}; ${pairs.length} pairs`);
  await b.close();
})();
