// The temporary behaviour's validation list, where a headless browser can check it, at 1440x900: the
// address and history while in the lab, Back then Forward, a reload inside, links out of the monitor
// (external, new tab, the résumé PDF), the contact's clipboard button, scroll and focus on leaving, the
// monitor's page keeping its place between reading and the workstation, the back-forward cache, and a
// monitor page opened on its own.
// NODE_PATH=$(npm root -g) node validate.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321/prototype/';
const origin = new URL(BASE).origin;
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  // Nothing leaves the machine: external addresses are answered here.
  await ctx.route(/^https:\/\/(github\.com|fonts\.)/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>external</title>' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const log = (label, extra = {}) =>
    page
      .evaluate(() => ({ url: location.pathname + location.search + location.hash, pc: document.documentElement.dataset.pc ?? null, history: history.length, state: history.state, y: scrollY, focus: document.activeElement?.matches('[data-lab-enter]') ? 'entry link' : document.activeElement?.className || document.activeElement?.tagName }))
      .then((s) => console.log(JSON.stringify({ label, ...s, ...extra })));
  const frame = () => page.frames().find((f) => f.url().includes('/computer/'));
  const toRead = async () => {
    await page.click('[data-lab-enter]');
    await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
    await page.click('[data-pc-use]');
    await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
    await page.waitForTimeout(800);
  };
  const closed = () => page.waitForFunction(() => !document.documentElement.dataset.pc, null, { timeout: 30000 });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-drawn]', { timeout: 60000 });
  await log('loaded');

  // Scroll and focus: enter from a scrolled opening, leave, and land where we were.
  await page.evaluate(() => scrollTo(0, 120));
  await page.waitForTimeout(300);
  await toRead();
  await log('reading (address unchanged, one entry)');
  // The monitor's page keeps its place between reading and the workstation.
  await frame().evaluate(() => scrollTo(0, 700));
  await page.keyboard.press('Escape');
  await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
  await page.click('[data-pc-use]');
  await page.waitForSelector('html[data-pc="read"]', { timeout: 30000 });
  console.log(JSON.stringify({ label: 'frame scroll after read -> desk -> read', frameY: await frame().evaluate(() => scrollY) }));
  await page.keyboard.press('Escape');
  await page.waitForSelector('html[data-pc="desk"]', { timeout: 30000 });
  await page.keyboard.press('Escape');
  await closed();
  await log('left with Escape (scroll 120 and the entry focused expected)');

  // Back, then Forward: Forward returns to the lab's entry with the lab closed; entering reuses it.
  await page.evaluate(() => scrollTo(0, 0));
  await toRead();
  await page.goBack();
  await closed();
  await log('Back');
  await page.goForward();
  await page.waitForTimeout(1500);
  await log('Forward');
  await toRead();
  await log('entered again after Forward (no new entry)');

  // Links out of the monitor. The résumé opens in a new tab and the lab stays.
  const f = frame();
  // Headless Chromium has no PDF viewer: the new tab hands the PDF over as a download.
  const [resume] = await Promise.all([page.waitForEvent('popup'), f.click('.scr-bar a[href="/resume.pdf"]')]);
  const download = await resume.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  console.log(JSON.stringify({ label: 'résumé from the monitor', popupUrl: resume.url(), download: download && new URL(download.url()).pathname, labStill: await page.evaluate(() => document.documentElement.dataset.pc) }));
  await resume.close();
  // A project's repository link: a new tab too.
  await f.click('a[href="/projects/cucadence/"]');
  await page.waitForFunction(() => document.querySelector('.pc-frame')?.contentWindow?.location.pathname.includes('cucadence'), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const cf = page.frames().find((x) => x.url().includes('cucadence'));
  const [repo] = await Promise.all([page.waitForEvent('popup'), cf.click('a[href^="https://github.com/"] >> nth=0')]);
  console.log(JSON.stringify({ label: 'repository link from the monitor', popup: repo.url(), labStill: await page.evaluate(() => document.documentElement.dataset.pc) }));
  await repo.close();
  // Same-origin links on the monitor's pages that the computer has no version of (they would leave the lab).
  const leaving = await cf.evaluate(() => {
    const has = (p) => p === '/' || /^\/(computer\/|projects\/[^/]+\/?$|systems\/?$)/.test(p);
    return [...document.querySelectorAll('a[href]:not([target="_blank"]):not([download])')].map((a) => new URL(a.href)).filter((u) => u.origin === location.origin && !has(u.pathname)).map((u) => u.pathname);
  });
  console.log(JSON.stringify({ label: 'same-origin links the computer has no page for (case study)', count: leaving.length, sample: [...new Set(leaving)].slice(0, 6) }));

  // Clipboard: the contact section's "Copy address".
  await cf.click('.scr-bar a[href="/computer/#contact"]');
  await page.waitForFunction(() => document.querySelector('.pc-frame')?.contentWindow?.location.pathname === '/computer/', null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const hf = frame();
  await hf.click('[data-copy]');
  await page.waitForTimeout(300);
  console.log(JSON.stringify({ label: 'Copy address in the monitor', button: await hf.evaluate(() => document.querySelector('[data-copy] span')?.textContent), clipboard: await page.evaluate(() => navigator.clipboard.readText()) }));

  // Reload inside the lab: back to the opening, no extra entry.
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-lab-root][data-drawn]', { timeout: 60000 });
  await log('reloaded while reading');

  // The back-forward cache: leave the page from inside the lab, come back.
  await toRead();
  await page.evaluate(() => (window.__kept = true));
  await page.goto(origin + '/systems/', { waitUntil: 'load' });
  await page.goBack({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await log('Back from another page, left from inside the lab', { restoredFromCache: await page.evaluate(() => window.__kept === true) });

  // A monitor page opened on its own (a copied frame address) goes to its ordinary page.
  const own = await ctx.newPage();
  for (const path of ['/computer/', '/computer/projects/cucadence/#objective', '/computer/systems/?sel=project:cucadence']) {
    await own.goto(origin + path, { waitUntil: 'load' });
    await own.waitForTimeout(500);
    console.log(JSON.stringify({ label: 'opened on its own', from: path, to: await own.evaluate(() => location.pathname + location.search + location.hash) }));
  }
  await browser.close();
})();
