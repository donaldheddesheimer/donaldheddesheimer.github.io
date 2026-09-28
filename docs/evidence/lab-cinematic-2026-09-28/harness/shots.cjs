// Screenshots of /prototype/ for review, from a running `npm run preview -- --host 127.0.0.1 --port 4321`.
// STEPS picks what to take, at each size in W:
//   hero      the opening, 1.5 s after the room has drawn (the dance is not frozen: poses vary a little run to run)
//   look      the opening dragged to each limit of the look-around (left, right, up, down)
//   read      "Explore the lab", then the computer's Work page, flat
//   about, resume, contact, case   the computer's other pages (a case study: cuCadence)
//   work      the ordinary page's Work section (stacked windows)
// REDUCE=1 emulates reduced motion. OUT is the folder, EXT png or jpg, TAG a file-name prefix.
// NODE_PATH=$(npm root -g) node shots.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const sizes = (process.env.W || '1440x900').split(',');
const steps = (process.env.STEPS || 'hero').split(',');
const out = process.env.OUT || '.';
const ext = process.env.EXT || 'png';
const tag = process.env.TAG || '';
const reduce = process.env.REDUCE === '1';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const wh of sizes) {
    const [width, height] = wh.split('x').map(Number);
    const phone = width < 600;
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduce ? 'reduce' : 'no-preference', deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
    await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    const shot = async (name) => {
      const file = `${out}/${tag}${name}-${wh}.${ext}`;
      await page.screenshot({ path: file, ...(ext === 'jpg' ? { type: 'jpeg', quality: 86 } : {}) });
      console.log(file);
    };
    await page.goto(BASE + '/prototype/?probe', { waitUntil: 'load' });
    await page.waitForSelector('[data-lab-root][data-drawn], [data-lab-root][data-failed]', { timeout: 90000 });
    await page.waitForTimeout(1500);
    const roomy = await page.evaluate(() => document.documentElement.hasAttribute('data-pc-able'));
    for (const step of steps) {
      if (step === 'hero') await shot('opening');
      else if (step === 'look' && roomy) {
        const box = await page.locator('[data-lab-root]').boundingBox();
        const cx = box.x + box.width * 0.62;
        const cy = box.y + box.height * 0.72;
        for (const [name, dx, dy] of [['left', 1, 0], ['right', -1, 0], ['up', 0, -1], ['down', 0, 1]]) {
          await page.mouse.move(cx, cy);
          await page.mouse.down();
          for (let i = 1; i <= 12; i++) await page.mouse.move(cx + dx * i * 60, cy + dy * i * 30);
          await page.waitForTimeout(1600);
          const look = await page.evaluate(() => window.__lab?.stats());
          console.log(JSON.stringify({ look: name, az: look?.lookAz, el: look?.lookEl }));
          await shot(`look-${name}`);
          await page.mouse.up();
          await page.mouse.move(cx, cy);
          await page.waitForTimeout(2500);
        }
      } else if (step === 'read' && roomy) {
        await page.click('[data-lab-enter]');
        await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
        await page.waitForTimeout(1500);
        await shot('reading-work');
      } else if (['about', 'resume', 'contact', 'case'].includes(step) && roomy) {
        const path = step === 'case' ? 'work/cucadence' : step;
        await page.goto(`${BASE}/prototype/?probe&computer=${path}`, { waitUntil: 'load' });
        await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
        await page.waitForTimeout(2500);
        await shot(`reading-${step}`);
      } else if (step === 'work') {
        await page.evaluate(() => document.getElementById('work').scrollIntoView());
        await page.waitForTimeout(800);
        await shot('page-work');
        await page.evaluate(() => scrollTo(0, 0));
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
