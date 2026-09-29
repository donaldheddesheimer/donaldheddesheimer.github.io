// The lab computer's addresses. No three.js here: the computer's pages (src/layouts/Screen.astro), the
// homepage and the lab's controller (computer.ts) share it.
//
// A computer path names what the computer shows: 'work', 'work/<project id>', 'about', 'resume' or
// 'contact'. For each there are three addresses:
// - the lab reading it, the one to share:          /?computer=<path>
// - the page itself (the monitor's frame loads it,
//   and it stands alone without JavaScript):        /computer/<path>/
// - its canonical page:                             /projects/<id>/ for a case study, or the page itself
// The homepage's old anchors (/#work, /#about, /#resume, /#contact) open the same pages.
export const PAGES = ['work', 'about', 'resume', 'contact'] as const;

/** A valid computer path, or null. `projects` are the project ids the site has. */
export function parse(path: string | null | undefined, projects: readonly string[]): string | null {
  const p = (path ?? '').replace(/^\/+|\/+$/g, '');
  if ((PAGES as readonly string[]).includes(p)) return p;
  const m = p.match(/^work\/([\w-]+)$/);
  return m && projects.includes(m[1]) ? p : null;
}

export const labHref = (path: string) => `/?computer=${path}`;
export const pageHref = (path: string) => `/computer/${path}/`;
export const canonicalHref = (path: string) => (path.startsWith('work/') ? `/projects/${path.slice(5)}/` : pageHref(path));

/** The computer path for a same-site address that has one (not yet checked against the projects). */
export function pathOf(u: URL, origin: string): string | null {
  if (u.origin !== origin) return null;
  const p = u.pathname;
  if (p === '/') {
    const q = u.searchParams.get('computer');
    if (q) return q;
    const h = u.hash.slice(1);
    return (PAGES as readonly string[]).includes(h) ? h : null;
  }
  const m = p.match(/^\/computer\/(work\/[\w-]+|work|about|resume|contact)\/?$/) ?? p.match(/^\/projects\/([\w-]+)\/?$/);
  if (!m) return null;
  return p.startsWith('/projects/') ? `work/${m[1]}` : m[1];
}
