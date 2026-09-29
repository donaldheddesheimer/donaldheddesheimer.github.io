// Serve the built site (dist/) to a Playwright context without a server: every request to BASE is
// answered from disk, the way GitHub Pages would (directory index, 404.html).
//
// FONTS=<dir>: answer Google Fonts from a local copy too (fonts.sh makes one), for a machine whose
// browser can't reach them. Without it they load from Google as on the live site.
const fs = require('fs');
const path = require('path');
const BASE = 'http://lab.test';
// The repository's dist/ (this file is docs/evidence/<pass>/harness/serve.cjs), or DIST.
const DIST = path.resolve(process.env.DIST || path.join(__dirname, '../../../../dist'));
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', txt: 'text/plain', xml: 'application/xml', webmanifest: 'application/manifest+json' };
async function routeDist(ctx, { failScripts = false } = {}) {
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    let p = path.join(DIST, decodeURIComponent(u.pathname));
    if (!p.startsWith(DIST)) return route.fulfill({ status: 403, body: '' });
    // A script that fails to load (the lab's fallback check).
    if (failScripts && /\.m?js$/.test(u.pathname)) return route.fulfill({ status: 503, body: '' });
    let status = 200;
    try {
      if (fs.statSync(p).isDirectory()) {
        if (!u.pathname.endsWith('/')) return route.fulfill({ status: 301, headers: { location: u.pathname + '/' + u.search + u.hash } });
        p = path.join(p, 'index.html');
      }
      fs.accessSync(p);
    } catch {
      p = path.join(DIST, '404.html');
      status = 404;
    }
    const ext = path.extname(p).slice(1).toLowerCase();
    return route.fulfill({ status, body: fs.readFileSync(p), headers: { 'content-type': TYPES[ext] || 'application/octet-stream' } });
  });
  const fonts = process.env.FONTS;
  if (!fonts) return;
  await ctx.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: fs.readFileSync(path.join(fonts, 'css.css'), 'utf8'), headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' } }));
  await ctx.route('https://fonts.gstatic.com/**', (route) => {
    const f = path.join(fonts, new URL(route.request().url()).pathname.slice(1).replaceAll('/', '_'));
    return fs.existsSync(f) ? route.fulfill({ body: fs.readFileSync(f), headers: { 'content-type': 'font/woff2', 'access-control-allow-origin': '*' } }) : route.fulfill({ status: 404, body: '' });
  });
}
module.exports = { BASE, DIST, routeDist };
