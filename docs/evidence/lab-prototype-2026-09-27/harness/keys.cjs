// Keyboard and history through the lab at 1440x900: Tab to the entry, Enter in, Enter on "Use the
// computer", Escape from inside the page (read -> desk -> out), focus back on the entry; then in again and
// out with the browser's Back. NODE_PATH=$(npm root -g) node keys.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321/prototype/';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-drawn]', { timeout: 60000 });
  const s = (label) => page.evaluate((label) => {
    const a = document.activeElement;
    return { label, pc: document.documentElement.dataset.pc ?? null, focus: a?.matches('[data-lab-enter]') ? 'enter link' : (a?.textContent?.trim() || a?.className || a?.tagName), history: history.length, state: history.state, title: document.title };
  }, label).then((r) => console.log(JSON.stringify(r)));
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.matches('[data-lab-enter]'))) break;
  }
  await s('tabbed to entry');
  await page.keyboard.press('Enter');
  await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
  await page.waitForTimeout(400);
  await s('desk');
  await page.keyboard.press('Enter');
  await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await s('read');
  const frame = page.frames().find((f) => f.url().includes('/computer/'));
  console.log('frame focused', await frame.evaluate(() => document.hasFocus()));
  await page.keyboard.press('Tab');
  console.log('tab inside frame', await frame.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40)));
  await page.keyboard.press('Escape');
  await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
  await page.waitForTimeout(400);
  await s('escape from page');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await s('escape from desk');
  await page.keyboard.press('Enter');
  await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
  await page.waitForTimeout(600);
  await s('in again');
  // Inside the monitor: overview -> cuCadence -> back to the overview, by the page's own links.
  const f1 = page.frames().find((f) => f.url().includes('/computer/'));
  await f1.click('a[href="/projects/cucadence/"]');
  await page.waitForFunction(() => document.querySelector('.pc-frame')?.contentWindow?.location.pathname.includes('cucadence'), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await s('cuCadence in the monitor');
  console.log('ordinary', await page.getAttribute('[data-pc-ordinary]', 'href'));
  const f2 = page.frames().find((f) => f.url().includes('cucadence'));
  await f2.click('.scr-home');
  await page.waitForFunction(() => document.querySelector('.pc-frame')?.contentWindow?.location.pathname === '/computer/', null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await s('overview again');
  await page.goBack();
  await page.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await s('browser Back');
  await browser.close();
})();
