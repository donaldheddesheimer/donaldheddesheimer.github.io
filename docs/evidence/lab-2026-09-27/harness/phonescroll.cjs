// Phone opening, through scrolling: the caption and controls row sits under the picture (never over it),
// its distance to the tab bar at the first view, and at every scroll position (16 px steps, to two screens
// down) where a control's centre is between the top bar and the tab bar, that control is what a tap there
// hits. Then taps pause/play twice and Enter the lab once (phones get the /systems/ page, no lab).
// Runs against the production build (npm run preview on :4321), or BASE. S lists the sizes; RM=1
// requests reduced motion; OUT=<dir> also saves a JPEG of each first view. Ends with "FAILS n".
// Playwright is not a project dependency: run with a global install, NODE_PATH=$(npm root -g) node <script>.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const sizes = (process.env.S || '360x640,390x844').split(',');
const out = process.env.OUT;
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let fails = 0;
  for (const s of sizes) {
    const [width, height] = s.split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await p.waitForTimeout(1800);
    const geo = () => p.evaluate(() => {
      const R = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { t: r.top, b: r.bottom } : null; };
      const tab = document.querySelector('.tabbar');
      const tabTop = tab && getComputedStyle(tab).display !== 'none' && getComputedStyle(tab).position === 'fixed' ? tab.getBoundingClientRect().top : innerHeight;
      const barB = document.querySelector('.home-bar')?.getBoundingClientRect().bottom ?? 0;
      const hit = (sel) => {
        const e = document.querySelector(sel); const r = e.getBoundingClientRect();
        const at = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return at && (at === e || e.contains(at)) ? 'hit' : `blocked by ${at?.className || at?.tagName}`;
      };
      return { tabTop, barB, max: document.documentElement.scrollHeight - innerHeight, stage: R('[data-robot-stage]'), cap: R('.robots-cap'), enter: R('[data-lab-enter]'), toggle: R('[data-robot-root] [data-robot-toggle]'), hitEnter: hit('[data-lab-enter]'), hitToggle: hit('[data-robot-root] [data-robot-toggle]') };
    });
    const g0 = await geo();
    const f = (x) => x && `${Math.round(x.t)}–${Math.round(x.b)}`;
    const rowTop = Math.min(g0.cap.t, g0.enter.t, g0.toggle.t), rowBot = Math.max(g0.cap.b, g0.enter.b, g0.toggle.b);
    const over = rowTop < g0.stage.b - 0.5 || g0.stage.b - g0.stage.t < 100;
    console.log(`${s}${process.env.RM ? ' RM' : ''}: picture ${f(g0.stage)}, caption ${f(g0.cap)}, enter ${f(g0.enter)}, toggle ${f(g0.toggle)}, tab bar top ${Math.round(g0.tabTop)}; row ${over ? 'OVER THE PICTURE (or no picture)' : 'under the picture'}; first view: row bottom ${Math.round(g0.tabTop - rowBot)} px above the bar`);
    if (over) fails++;
    if (out) await p.screenshot({ path: `${out}/first-${s}${process.env.RM ? '-rm' : ''}.jpg`, type: 'jpeg', quality: 70 });
    const end = Math.min(g0.max, height * 2);
    const bad = [];
    let seen = 0;
    for (let y = 0; y <= end; y += 16) {
      await p.evaluate((y) => scrollTo(0, y), y);
      await p.waitForTimeout(30);
      const g = await geo();
      for (const [k, r, h] of [['enter', g.enter, g.hitEnter], ['toggle', g.toggle, g.hitToggle]]) {
        const c = (r.t + r.b) / 2;
        if (c <= g.barB || c >= g.tabTop) continue;
        seen++;
        if (h !== 'hit') bad.push(`${k}@${y}: ${h}`);
        if (r.t < g.stage.b - 0.5) bad.push(`${k}@${y}: over the picture`);
      }
    }
    console.log(`  scroll 0..${end}: ${seen} control positions between the bars, ${bad.length} not hittable${bad.length ? ': ' + bad.slice(0, 6).join('; ') : ''}`);
    fails += bad.length;
    // The row just above the tab bar, then tap pause/play twice and Enter the lab once.
    await p.evaluate(() => { const r = document.querySelector('.robots-ctl').getBoundingClientRect(); scrollBy(0, r.bottom - (document.querySelector('.tabbar')?.getBoundingClientRect().top ?? innerHeight) + 24); });
    await p.waitForTimeout(200);
    const state = () => p.getAttribute('[data-robot-root] [data-robot-toggle]', 'data-state');
    const st0 = await state();
    await p.tap('[data-robot-root] [data-robot-toggle]');
    await p.waitForTimeout(200);
    const st1 = await state();
    await p.tap('[data-robot-root] [data-robot-toggle]');
    await p.waitForTimeout(200);
    const st2 = await state();
    const flip = st0 !== st1 && st2 === st0;
    console.log(`  pause/play taps: ${st0} → ${st1} → ${st2} ${flip ? 'ok' : 'FAIL'}`);
    if (!flip) fails++;
    await Promise.all([p.waitForURL('**/systems/', { timeout: 10000 }).catch(() => {}), p.tap('[data-lab-enter]')]);
    const u = new URL(p.url()).pathname;
    console.log(`  Enter the lab tap → ${u} ${u === '/systems/' ? 'ok' : 'FAIL'}; errors ${errs.length ? errs.join(' | ') : 'none'}`);
    if (u !== '/systems/') fails++;
    fails += errs.length;
    await ctx.close();
  }
  console.log(`FAILS ${fails}`);
  await b.close();
})();
