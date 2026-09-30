// node rigcheck.cjs <outdir> — the maintenance robot, mid-weld (sparks flying) at 1440x900 on the GPU:
// Motion off (the held pose, no glow, no sparks, the loop stopped), back on; into the terminal and out
// (the loop stops once settled; the robot eases back after Escape). Crops of the robot at each step.
const { chromium } = require(process.env.PW || 'playwright');
const { BASE, routeDist } = require(require('path').join(__dirname, '../../lab-terminal-2026-09-29/harness/serve.cjs'));
const out = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await routeDist(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/');
  await p.waitForFunction(() => document.querySelector('[data-lab-root]')?.hasAttribute('data-drawn'));
  const t0 = Date.now();
  const at = (s) => sleep(Math.max(0, s * 1000 - (Date.now() - t0)));
  const clip = { x: 380, y: 0, width: 300, height: 240 };
  const shot = (n) => p.screenshot({ path: `${out}/${n}.png`, clip });
  await at(10.2);
  await shot('1-welding');
  await p.evaluate(() => (document.documentElement.dataset.motion = 'off'));
  await sleep(400);
  await shot('2-motion-off-mid-weld');
  const run = await p.evaluate(() => document.querySelector('[data-lab-root]').dataset.running);
  await sleep(1500);
  await shot('3-motion-off-later');
  await p.evaluate(() => delete document.documentElement.dataset.motion);
  await sleep(1200);
  await shot('4-motion-back');
  const m = await p.evaluate(() => (({ x, y, width, height }) => [x + width / 2, y + height / 2])(document.querySelector('[data-lab-monitor]').getBoundingClientRect()));
  await p.mouse.click(m[0], m[1]);
  await p.waitForFunction(() => document.documentElement.dataset.pc === 'read', null, { timeout: 20000 });
  await sleep(2500);
  const reading = await p.evaluate(() => document.querySelector('[data-lab-root]').dataset.running);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 15000 });
  await sleep(300);
  await shot('5-after-escape');
  await sleep(2500);
  await shot('6-eased-back');
  console.log({ runningWithMotionOff: run, runningWhileReading: reading, errs });
  await b.close();
})();
