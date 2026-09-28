// PROTOTYPE (lab-cinematic, 2026-09-28): the lab computer's addresses. No three.js here: the computer's
// pages (src/layouts/Screen.astro), the prototype page and the lab's controller (computer.ts) share it.
//
// A computer path names what the computer shows: 'work', 'work/<project id>', 'about', 'resume' or
// 'contact'. For each there are three addresses:
// - the lab reading it, the one to share:        /prototype/?computer=<path>
// - the page the monitor's frame loads:           /computer/<path>/
// - the ordinary page with the same content:      /prototype/#<path>, or /prototype/work/<id>/
export const PAGES = ['work', 'about', 'resume', 'contact'] as const;

/** A valid computer path, or null. `projects` are the project ids the site has. */
export function parse(path: string | null | undefined, projects: readonly string[]): string | null {
  const p = (path ?? '').replace(/^\/+|\/+$/g, '');
  if ((PAGES as readonly string[]).includes(p)) return p;
  const m = p.match(/^work\/([\w-]+)$/);
  return m && projects.includes(m[1]) ? p : null;
}

export const labHref = (path: string) => `/prototype/?computer=${path}`;
export const frameHref = (path: string) => `/computer/${path}/`;
export const ordinaryHref = (path: string) => (path.startsWith('work/') ? `/prototype/${path}/` : `/prototype/#${path}`);

/** The computer path for a same-site address that has one (not yet checked against the projects). */
export function pathOf(u: URL, origin: string): string | null {
  if (u.origin !== origin) return null;
  const p = u.pathname;
  if (p === '/prototype/' || p === '/prototype') {
    const q = u.searchParams.get('computer');
    if (q) return q;
    const h = u.hash.slice(1);
    return (PAGES as readonly string[]).includes(h) ? h : null;
  }
  const m = p.match(/^\/(?:computer|prototype)\/(work\/[\w-]+|work|about|resume|contact)\/?$/) ?? p.match(/^\/projects\/([\w-]+)\/?$/);
  if (!m) return null;
  return p.startsWith('/projects/') ? `work/${m[1]}` : m[1];
}
