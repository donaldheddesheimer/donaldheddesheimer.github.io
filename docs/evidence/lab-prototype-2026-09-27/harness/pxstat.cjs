// How far two PNG screenshots differ: the pixels that differ, the largest and mean channel difference, and a
// histogram. Sized the release diff at 390x844 on /. NODE_PATH=$(npm root -g) node pxstat.cjs a.png b.png
const { chromium } = require('playwright');
const fs = require('fs');
const [,, a, b] = process.argv;
(async () => {
  const br = await chromium.launch();
  const p = await (await br.newContext()).newPage();
  const r = await p.evaluate(async ([a, b]) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const px = (i) => { const c = new OffscreenCanvas(i.width, i.height); const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const [da, db] = [px(ia), px(ib)];
    const hist = {};
    let max = 0, n = 0, sum = 0;
    for (let k = 0; k < da.length; k += 4) {
      const d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]));
      if (d) { n++; sum += d; max = Math.max(max, d); const bucket = d <= 2 ? '1-2' : d <= 8 ? '3-8' : d <= 32 ? '9-32' : '>32'; hist[bucket] = (hist[bucket] || 0) + 1; }
    }
    return { differing: n, maxChannelDiff: max, meanDiff: +(sum / n).toFixed(2), hist };
  }, [fs.readFileSync(a).toString('base64'), fs.readFileSync(b).toString('base64')]);
  console.log(JSON.stringify(r));
  await br.close();
})();
