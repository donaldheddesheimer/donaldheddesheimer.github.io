// The released pages' markup, links, style sheets and files against a baseline build of origin/main
// (cc1a6c4), with no browser: what a pixel diff can't see (head scripts, link targets, the header's
// navigation, the order of the style sheets), and whether anything released still points at the lab
// computer's deleted routes (/computer/, /computer/systems/, /computer/projects/<id>/).
//   pages    every released page from both servers (/, /systems/, /systems/screen/, a missing path, and
//            each /projects/<id>/ the baseline's home page links to, checked against src/content at both
//            commits): status, size, and a line diff of the markup after Astro's hashed asset names
//            (/_astro/Name.<hash>.css) and data-astro-cid-* attributes are normalized. The <body> is also
//            compared as text, with HTML entities decoded and the BUILD stamp (src/lib/build.ts) replaced.
//   links    every href / src / srcset / action / content URL on each page, A against B, and the header
//            and footer navigation in order.
//   css      the page's style sheets in document order (linked and inline), flattened into rules with
//            their @media / @layer context: rules only in A, only in B, and rules present in both whose
//            order changed (a longest-common-subsequence over the rule list).
//   files    every file of the two dist folders by SHA-256: changed, only in A, only in B.
//   routes   the deleted computer routes in the built site: every file that mentions /computer/, whether
//            it is reachable from a released page (the pages plus the scripts and style sheets they load,
//            followed through static and dynamic imports), and any reference to /computer/systems or
//            /computer/projects, or to /computer/ with nothing after it.
// Env: BASE_A, BASE_B (servers), DIST_A, DIST_B (their dist folders), REPO (for git), OUT (scratch folder
// for the diff files), LOG (the log file).
// node release-diff-html.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execSync } = require('child_process');
const A = process.env.BASE_A || 'http://127.0.0.1:4330';
const B = process.env.BASE_B || 'http://127.0.0.1:4322';
const REPO = process.env.REPO || path.resolve(__dirname, '../../../..');
const DIST_A = process.env.DIST_A; // required: the baseline's dist (origin/main cc1a6c4 built into a scratch copy)
if (!DIST_A) throw new Error('DIST_A: the baseline build\'s dist folder');
const DIST_B = process.env.DIST_B || path.join(REPO, 'dist');
const OUT = process.env.OUT || '.';
const LOG = process.env.LOG || '';
const lines = [];
const say = (s = '') => {
  for (const l of String(s).split('\n')) lines.push(l.replace(/[ \t]+$/g, ''));
  console.log(s);
};
const cut = (s, n = 200) => (s.length > n ? s.slice(0, n) + '…' : s);

const normalize = (html) =>
  html
    .replace(/\/_astro\/([A-Za-z0-9_]+(?:\.astro_astro_type_script_index_\d+_lang)?)\.[A-Za-z0-9_-]{8}\.(css|js)/g, '/_astro/$1.#.$2')
    .replace(/ data-astro-cid-[a-z0-9]+(="[^"]*")?/g, '');
const lined = (html) => normalize(html).replace(/></g, '>\n<');
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const body = (html) => {
  const m = normalize(html).match(/<body[\s\S]*<\/body>/);
  return m ? decode(m[0]).replace(/(BUILD <span class="text-muted">)[^<]*/g, '$1STAMP') : '';
};
const stamp = (html) => [...normalize(html).matchAll(/BUILD <span class="text-muted">([^<]*)</g)].map((m) => m[1]).join(' / ');
const urls = (html) => {
  const out = [];
  for (const m of normalize(html).matchAll(/\s(href|src|srcset|action|poster|content)="([^"]*)"/g)) {
    const [, attr, v] = m;
    if (attr === 'content' && !/^(https?:|\/)/.test(v)) continue;
    if (attr === 'srcset') for (const part of v.split(',')) out.push(`${attr} ${part.trim().split(/\s+/)[0]}`);
    else out.push(`${attr} ${v}`);
  }
  return out;
};
const navs = (html) =>
  [...normalize(html).matchAll(/<(nav|footer)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map((m) => {
    const label = (m[2].match(/aria-label="([^"]*)"/) || m[2].match(/class="([^"]*)"/) || [, ''])[1];
    return `${m[1]}[${label}] ${[...m[3].matchAll(/href="([^"]*)"/g)].map((h) => h[1]).join(' ')}`;
  });

// A style sheet flattened into its innermost rules, each with the @-rules around it.
function flatten(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      buf += c;
      if (c === '\\') buf += css[++i];
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      buf += c;
    } else if (c === '{') {
      const parent = stack[stack.length - 1];
      if (parent) {
        // Declarations before a nested block belong to the parent.
        const k = buf.lastIndexOf(';');
        if (k >= 0) {
          parent.decls += buf.slice(0, k + 1);
          buf = buf.slice(k + 1);
        }
      }
      stack.push({ prelude: buf.trim(), decls: '' });
      buf = '';
    } else if (c === '}') {
      const top = stack.pop();
      if (!top) continue;
      const decls = (top.decls + buf).trim();
      buf = '';
      if (decls) rules.push(`${stack.map((s) => s.prelude).join(' » ')}${stack.length ? ' » ' : ''}${top.prelude} {${decls}}`);
      else if (/^@(layer|import|charset)/.test(top.prelude) && !top.hadChild) rules.push(`${stack.map((s) => s.prelude).join(' » ')} ${top.prelude} {}`);
      if (stack.length) stack[stack.length - 1].hadChild = true;
    } else if (c === ';' && !stack.length) {
      rules.push(buf.trim() + ';');
      buf = '';
    } else buf += c;
  }
  return rules;
}
// Longest common subsequence of two rule lists (indices kept in A and B).
function lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Set(), keepB = new Set();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) { keepA.add(i++); keepB.add(j++); }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { keepA, keepB };
}
const get = async (url) => {
  const r = await fetch(url);
  return { status: r.status, text: await r.text() };
};
async function sheets(base, html) {
  const out = [];
  for (const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)"[^>]*>|<style[^>]*>([\s\S]*?)<\/style>/g)) {
    if (m[1]) {
      if (/^https?:/.test(m[1])) { out.push({ name: m[1], rules: [] }); continue; }
      out.push({ name: normalize(m[1]), rules: flatten((await get(base + m[1])).text) });
    } else out.push({ name: `inline <style> ${cut(m[2].trim(), 60)}`, rules: flatten(m[2]) });
  }
  return out;
}
const walk = (dir, root = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), root) : e.name === '.DS_Store' ? [] : [path.relative(root, path.join(dir, e.name))]));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

(async () => {
  const git = (args) => execSync(`git -C "${REPO}" ${args}`).toString().trim();
  const head = git('rev-parse --short HEAD');
  say(`# release-diff-html ${new Date().toISOString()} renderer="none (no browser: HTTP fetches and files only)" server=A ${A} (origin/main cc1a6c4, ${DIST_A}) vs B ${B} (cinematic-lab-prototype HEAD ${head}, ${DIST_B})`);
  const distTime = (d) => fs.statSync(path.join(d, 'index.html')).mtime.toISOString();
  say(`# dist index.html written: A ${distTime(DIST_A)}, B ${distTime(DIST_B)}; last commit touching src/ at HEAD: ${git('log -1 --format=%h\\ %cI -- src')}`);

  // The released pages.
  const homeA = (await get(A + '/')).text;
  const linked = [...new Set([...homeA.matchAll(/href="\/projects\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))].sort();
  const content = (rev) => git(`ls-tree --name-only ${rev} src/content/projects/`).split('\n').map((f) => path.basename(f).replace(/\.mdx?$/, '')).filter(Boolean).sort();
  const [cA, cB] = [content('cc1a6c4'), content('HEAD')];
  say(`# projects linked from A's home page (${linked.length}): ${linked.join(' ')}`);
  say(`# src/content/projects at cc1a6c4 (${cA.length}) ${cA.join(' ') === linked.join(' ') ? 'matches' : 'DIFFERS: ' + cA.join(' ')}; at HEAD (${cB.length}) ${cB.join(' ') === cA.join(' ') ? 'matches' : 'DIFFERS: ' + cB.join(' ')}`);
  const pages = ['/', '/systems/', '/systems/screen/', '/no-such-page/', ...linked.map((id) => `/projects/${id}/`)];

  say('\n## pages: markup after normalizing hashed asset names and data-astro-cid-*');
  const perPage = [];
  for (const p of pages) {
    const [a, b] = [await get(A + p), await get(B + p)];
    perPage.push({ p, a, b });
    const fa = path.join(OUT, 'html-a.txt'), fb = path.join(OUT, 'html-b.txt');
    fs.writeFileSync(fa, lined(a.text) + '\n');
    fs.writeFileSync(fb, lined(b.text) + '\n');
    const d = spawnSync('diff', [fa, fb]).stdout.toString().split('\n').filter((l) => /^[<>]/.test(l));
    const sameBody = body(a.text) === body(b.text);
    say(`${p}  status ${a.status}/${b.status}  bytes ${a.text.length}/${b.text.length}  changed lines ${d.length}  body equal (entities decoded, stamp replaced): ${sameBody ? 'yes' : 'NO'}  stamp "${stamp(a.text)}" -> "${stamp(b.text)}"`);
    for (const l of d) say(`    ${cut(l, 170)}`);
  }

  say('\n## links: every URL attribute, A against B (hashed asset names normalized)');
  for (const { p, a, b } of perPage) {
    const asset = (u) => / \/_astro\//.test(u);
    const [ua, ub] = [urls(a.text).filter((u) => !asset(u)), urls(b.text).filter((u) => !asset(u))];
    const [xa, xb] = [urls(a.text).filter(asset), urls(b.text).filter(asset)];
    const count = (list) => list.reduce((m, u) => m.set(u, (m.get(u) || 0) + 1), new Map());
    const [ca, cb] = [count(ua), count(ub)];
    const onlyA = [...ca].filter(([u, n]) => (cb.get(u) || 0) < n).map(([u, n]) => `${u} x${n - (cb.get(u) || 0)}`);
    const onlyB = [...cb].filter(([u, n]) => (ca.get(u) || 0) < n).map(([u, n]) => `${u} x${n - (ca.get(u) || 0)}`);
    const order = ua.join('\n') === ub.join('\n');
    const [na, nb] = [navs(a.text), navs(b.text)];
    say(`${p}  urls ${ua.length}/${ub.length} (not counting /_astro/ assets)  only in A: ${onlyA.length ? onlyA.join(', ') : 'none'}  only in B: ${onlyB.length ? onlyB.join(', ') : 'none'}  same order: ${order ? 'yes' : 'NO'}  nav/footer blocks ${na.length}/${nb.length} ${na.join('\n') === nb.join('\n') ? 'identical' : 'DIFFER'}`);
    say(`    /_astro/ assets A: ${xa.map((u) => u.replace(/^\w+ \/_astro\//, '')).join(' ')}\n    /_astro/ assets B: ${xb.map((u) => u.replace(/^\w+ \/_astro\//, '')).join(' ')}`);
    if (na.join('\n') !== nb.join('\n')) for (let i = 0; i < Math.max(na.length, nb.length); i++) if (na[i] !== nb[i]) say(`    A ${cut(na[i] || '(none)')}\n    B ${cut(nb[i] || '(none)')}`);
    const bad = [...new Set([...ub].filter((u) => /\/(computer|prototype)(\/|$|\?|#)/.test(u)))];
    const badA = [...new Set([...ua].filter((u) => /\/(computer|prototype)(\/|$|\?|#)/.test(u)))];
    if (bad.length || badA.length) say(`    links to /computer/ or /prototype/: A ${badA.join(', ') || 'none'}; B ${bad.join(', ') || 'none'}`);
  }
  // The navigation once, in full.
  say(`# home page nav/footer blocks in B:`);
  for (const n of navs(perPage[0].b.text)) say(`    ${cut(n, 400)}`);
  say(`# /projects/${linked[0]}/ nav/footer blocks in B:`);
  for (const n of navs(perPage[4].b.text)) say(`    ${cut(n, 400)}`);

  say('\n## css: style sheets in document order, flattened into rules');
  for (const { p, a, b } of perPage) {
    const [sa, sb] = [await sheets(A, a.text), await sheets(B, b.text)];
    const [ra, rb] = [sa.flatMap((s) => s.rules), sb.flatMap((s) => s.rules)];
    const { keepA, keepB } = lcs(ra, rb);
    const dropA = ra.filter((_, i) => !keepA.has(i));
    const addB = rb.filter((_, i) => !keepB.has(i));
    const setA = new Set(ra), setB = new Set(rb);
    const moved = [...new Set(addB.filter((r) => setA.has(r)))];
    const removed = dropA.filter((r) => !setB.has(r));
    const added = addB.filter((r) => !setA.has(r));
    say(`${p}  sheets A: ${sa.map((s) => s.name.replace(/^inline <style> (.{0,40}).*/, 'inline "$1…"')).join(' | ')}`);
    say(`${' '.repeat(p.length)}  sheets B: ${sb.map((s) => s.name.replace(/^inline <style> (.{0,40}).*/, 'inline "$1…"')).join(' | ')}`);
    say(`${' '.repeat(p.length)}  rules ${ra.length}/${rb.length}  only in A ${removed.length}  only in B ${added.length}  in both but moved ${moved.length}`);
    const pre = (r) => r.slice(0, r.lastIndexOf(' {'));
    const decls = (r) => new Set(r.slice(r.lastIndexOf(' {') + 2, -1).split(';').filter(Boolean));
    const addedPre = new Map(added.map((r) => [pre(r), r]));
    for (const r of removed) {
      const twin = addedPre.get(pre(r));
      if (twin) {
        const [da, db] = [decls(r), decls(twin)];
        say(`    ~ ${cut(pre(r), 60)}: declarations only in A: ${[...da].filter((d) => !db.has(d)).join('; ') || 'none'}; only in B: ${[...db].filter((d) => !da.has(d)).join('; ') || 'none'}`);
        addedPre.delete(pre(r));
      } else say(`    - ${cut(r, 170)}`);
    }
    for (const r of addedPre.values()) say(`    + ${cut(r, 170)}`);
    if (moved.length) {
      const where = (list, r) => list.find((x) => x.rules.includes(r))?.name.replace(/^inline <style> (.{0,24}).*/, 'inline "$1…"');
      const groups = {};
      for (const r of moved) {
        const k = `${where(sa, r)} -> ${where(sb, r)}`;
        groups[k] = (groups[k] || 0) + 1;
      }
      say(`    moved: ${Object.entries(groups).map(([k, n]) => `${n} rule(s) ${k}`).join('; ')}; e.g. ${moved.slice(0, 2).map((r) => cut(r, 70)).join(' ;; ')}`);
    }
  }

  say('\n## files: the two dist folders by SHA-256');
  const fa = new Map(walk(DIST_A).map((f) => [f, sha(path.join(DIST_A, f))]));
  const fb = new Map(walk(DIST_B).map((f) => [f, sha(path.join(DIST_B, f))]));
  const same = [...fa].filter(([f, h]) => fb.get(f) === h).map(([f]) => f);
  const changed = [...fa].filter(([f, h]) => fb.has(f) && fb.get(f) !== h).map(([f]) => f);
  const onlyA = [...fa.keys()].filter((f) => !fb.has(f));
  const onlyB = [...fb.keys()].filter((f) => !fa.has(f));
  say(`files A ${fa.size}, B ${fb.size}: identical ${same.length}, changed ${changed.length}, only in A ${onlyA.length}, only in B ${onlyB.length}`);
  say(`identical, outside _astro: ${same.filter((f) => !f.startsWith('_astro/')).join(' ')}`);
  say(`identical, _astro: ${same.filter((f) => f.startsWith('_astro/')).join(' ')}`);
  say(`changed: ${changed.join(' ')}`);
  say(`only in A: ${onlyA.join(' ')}`);
  say(`only in B: ${onlyB.join(' ')}`);

  say('\n## routes: the deleted computer routes in the built site (B)');
  const text = (f) => (/\.(html|js|css|json|xml|txt|svg|webmanifest)$/.test(f) ? fs.readFileSync(path.join(DIST_B, f), 'utf8') : '');
  // What a released page loads: its scripts and style sheets, and their imports, transitively.
  const released = new Set(['index.html', '404.html', 'systems/index.html', 'systems/screen/index.html', ...linked.map((id) => `projects/${id}/index.html`)]);
  const queue = [...released];
  while (queue.length) {
    const f = queue.shift();
    const t = text(f);
    const refs = [
      ...[...t.matchAll(/(?:src|href)="\/(_astro\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]),
      ...[...t.matchAll(/(?:import|from)\s*\(?\s*["']\.\/([^"']+\.js)["']/g)].map((m) => path.posix.join(path.posix.dirname(f), m[1])),
      ...[...t.matchAll(/["'](\/_astro\/[^"']+\.js)["']/g)].map((m) => m[1].slice(1)),
    ];
    for (const r of refs) if (!released.has(r) && fb.has(r)) { released.add(r); queue.push(r); }
  }
  say(`reachable from the released pages (${released.size} files): ${[...released].sort().join(' ')}`);
  const mentions = [...fb.keys()].sort().map((f) => ({ f, t: text(f) })).filter(({ t }) => t.includes('/computer'));
  for (const { f, t } of mentions) {
    const hits = [...t.matchAll(/\/computer[^"'`\s<>)]{0,40}/g)].map((m) => m[0]);
    const deleted = hits.filter((h) => /^\/computer\/(systems|projects)/.test(h) || /^\/computer\/?$/.test(h));
    say(`${released.has(f) ? 'RELEASED ' : 'prototype'} ${f}: ${hits.length} mention(s) of /computer, ${deleted.length} of a deleted route${deleted.length ? ': ' + [...new Set(deleted)].join(', ') : ''}  e.g. ${[...new Set(hits)].slice(0, 5).join(', ')}`);
  }
  const words = new Map();
  for (const f of released) for (const m of text(f).matchAll(/[\w:/.-]*computer[\w/-]*/gi)) words.set(m[0], (words.get(m[0]) || 0) + 1);
  say(`the word "computer" in the released files, in any form: ${[...words].map(([w, n]) => `${w} x${n}`).join(', ') || 'none'}`);
  const releasedMentions = mentions.filter(({ f }) => released.has(f)).length;
  say(`released files that mention /computer: ${releasedMentions}; files that mention a deleted route (/computer/systems, /computer/projects, bare /computer/): ${mentions.filter(({ t }) => /\/computer\/(systems|projects)|\/computer\/?["'`)\s]/.test(t)).map(({ f }) => f).join(' ') || 'none'}`);
  const proto = [...fb.keys()].filter((f) => released.has(f) && text(f).includes('/prototype'));
  say(`released files that mention /prototype: ${proto.join(' ') || 'none'}`);
  if (LOG) fs.writeFileSync(LOG, lines.join('\n').replace(/\n+$/, '') + '\n');
})().catch((e) => {
  say('# harness error: ' + (e && e.stack ? e.stack : e));
  if (LOG) fs.writeFileSync(LOG, lines.join('\n') + '\n');
  process.exit(1);
});
