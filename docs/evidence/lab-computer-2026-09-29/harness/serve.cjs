// Serve the built site (dist/) to a Playwright context without a server: every request to BASE is
// answered from disk, the way GitHub Pages would (directory index, 404.html).
const fs = require('fs');
const path = require('path');
const BASE = 'http://lab.test';
// The repository's dist/ (this file is docs/evidence/<pass>/harness/serve.cjs), or DIST.
const DIST = path.resolve(process.env.DIST || path.join(__dirname, '../../../../dist'));
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', txt: 'text/plain', xml: 'application/xml', webmanifest: 'application/manifest+json' };
async function routeDist(ctx) {
  await ctx.route(BASE + '/**', async (route) => {
    const u = new URL(route.request().url());
    let p = path.join(DIST, decodeURIComponent(u.pathname));
    if (!p.startsWith(DIST)) return route.fulfill({ status: 403, body: '' });
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
}
module.exports = { BASE, routeDist };
