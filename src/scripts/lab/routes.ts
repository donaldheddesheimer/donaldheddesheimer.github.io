// The lab computer's addresses. No three.js here: the homepage, the terminal, the site's pages
// (src/layouts/Screen.astro) and the lab's controller (computer.ts) share it.
//
// A computer path names what the computer shows: 'terminal', or 'work/<project id>' (the terminal, with
// that project printed: `work <id>`). For each there are three addresses:
// - the lab showing it, the one to share:          /?computer (the terminal), /?computer=work/<id>
// - the page itself, a transcript (standing alone
//   without JavaScript, going to the lab with it):  /computer/, /computer/work/<id>/
// - its canonical page:                             /projects/<id>/ for a project (its case study), or
//                                                   the page itself
// The terminal's commands were once pages of their own. Their old addresses (/?computer=about,
// /#about, /computer/about/) open the terminal and run the command.
export const COMMANDS = ['about', 'work', 'resume', 'contact'] as const;
export type Command = (typeof COMMANDS)[number];
export const TERMINAL = 'terminal';

export const isCommand = (s: string): s is Command => (COMMANDS as readonly string[]).includes(s);

/** What ?computer=<q> shows: 'terminal' (q empty), a command (an old page's address: the terminal,
 *  running it), a project ('work/<id>'), or null (not the computer's). `projects` are the project ids
 *  the site has. */
export function parse(q: string | null | undefined, projects: readonly string[]): string | null {
  if (q == null) return null;
  const p = q.replace(/^\/+|\/+$/g, '');
  if (p === '' || p === TERMINAL || isCommand(p)) return p || TERMINAL;
  const m = p.match(/^work\/([\w-]+)$/);
  return m && projects.includes(m[1]) ? p : null;
}

export const labHref = (path: string) => (path === TERMINAL ? '/?computer' : `/?computer=${path}`);
/** The page itself; a command's is its place in the terminal's transcript. */
export const pageHref = (path: string) => (path === TERMINAL ? '/computer/' : isCommand(path) ? `/computer/#${path}` : `/computer/${path}/`);
export const canonicalHref = (path: string) => (path.startsWith('work/') ? `/projects/${path.slice(5)}/` : '/computer/');

/** The computer path for a same-site address that has one (not yet checked against the projects). */
export function pathOf(u: URL, origin: string): string | null {
  if (u.origin !== origin) return null;
  const p = u.pathname;
  if (p === '/') {
    const q = u.searchParams.get('computer');
    if (q != null) return q.replace(/^\/+|\/+$/g, '') || TERMINAL;
    const h = u.hash.slice(1);
    return isCommand(h) ? h : null;
  }
  if (p === '/computer/' || p === '/computer') {
    const h = u.hash.slice(1);
    return isCommand(h) ? h : TERMINAL;
  }
  const m = p.match(/^\/computer\/(work\/[\w-]+|about|resume|contact|work)\/?$/) ?? p.match(/^\/projects\/([\w-]+)\/?$/);
  if (!m) return null;
  return p.startsWith('/projects/') ? `work/${m[1]}` : m[1];
}
