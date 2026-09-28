// The prototype's fallbacks at 1440x900: no JavaScript, no WebGL, and Save-Data (the scene waits to be
// asked; entering the lab loads it). NODE_PATH=$(npm root -g) node fallback.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321/prototype/';
const out = process.env.OUT || '.';
const viewport = { width: 1440, height: 900 };
const state = (page) => page.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY), pc: document.documentElement.dataset.pc ?? null, able: document.documentElement.hasAttribute('data-pc-able'), failed: document.querySelector('[data-lab-root]')?.hasAttribute('data-failed'), offer: document.querySelector('[data-lab-root]')?.hasAttribute('data-offer'), mounted: document.querySelector('[data-lab-root]')?.hasAttribute('data-mounted'), label: [...document.querySelectorAll('[data-lab-enter] span')].find((s) => getComputedStyle(s).display !== 'none')?.textContent }));
(async () => {
  const gpu = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // No JavaScript: the still and "Selected work".
  let ctx = await gpu.newContext({ viewport, javaScriptEnabled: false });
  let page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.screenshot({ path: `${out}/fallback-nojs-1440x900.jpg`, type: 'jpeg', quality: 85 });
  console.log('nojs', JSON.stringify(await page.evaluate(() => ({ able: document.documentElement.hasAttribute('data-pc-able') }))));
  await ctx.close();
  // Save-Data: nothing loads until asked; "Explore the lab" loads the scene and goes in.
  ctx = await gpu.newContext({ viewport });
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'connection', { get: () => ({ saveData: true }) }));
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  console.log('savedata before', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${out}/fallback-savedata-1440x900.jpg`, type: 'jpeg', quality: 85 });
  await page.click('[data-lab-enter]');
  await page.waitForSelector('html[data-pc="desk"]', { timeout: 60000 });
  console.log('savedata after enter', JSON.stringify(await state(page)));
  await ctx.close();
  await gpu.close();
  // No WebGL: the still stays, and the entry becomes "Selected work".
  const none = await chromium.launch({ args: ['--disable-3d-apis', '--disable-gpu'] });
  ctx = await none.newContext({ viewport });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-failed]', { timeout: 30000 });
  await page.waitForTimeout(500);
  console.log('nowebgl', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${out}/fallback-nowebgl-1440x900.jpg`, type: 'jpeg', quality: 85 });
  await page.click('[data-lab-enter]');
  await page.waitForTimeout(1200);
  console.log('nowebgl after click', JSON.stringify(await state(page)));
  await ctx.close();
  await none.close();
})();
