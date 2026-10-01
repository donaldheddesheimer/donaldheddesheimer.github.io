// The lab computer's terminal: the words it says, shared by the page (src/components/Terminal.astro,
// TermOutput.astro, the /computer/ transcript) and its script (src/scripts/lab/terminal.ts). What each
// command prints is TermOutput.astro (and a project's, TermProject.astro), from src/data/site.ts and the
// projects.
import type { Command } from '../scripts/lab/routes';

/** Where a view is, as the prompt and a view's first line say it: home for the startup and help, else
 *  under it (~/work/cucadence). A place to read, not a directory to `cd` into. */
export const where = (view = '') => (!view || view === 'help' ? '~' : `~/${view}`);

/** The prompt: whose terminal, on which machine, and where (the view being read). */
export const ps1 = (view = '') => `donald@lab:${where(view)}$`;
export const PS1 = ps1();

/** The startup's two lines. The second names `help`, which is tappable there. */
export const BOOT = {
  first: 'New terminal started.',
  second: ['Type ', ' to look around. The robots are on break.'] as const,
};

/** What `help` lists, in its order. */
export const HELP: { cmd: Command; label: string }[] = [
  { cmd: 'about', label: 'A little about me' },
  { cmd: 'work', label: 'Selected projects' },
  { cmd: 'resume', label: 'Experience, education, and résumé download' },
  { cmd: 'contact', label: 'Get in touch' },
];

/** `work <id>`, for an id no project has: the id goes after the first part, and `work`, tappable, after
 *  the second. */
export const NO_PROJECT = ['No project called ', '. Run ', ' to list them.'] as const;

/** Anything else, after what was typed. `help`, in the middle, is tappable. */
export const NOT_FOUND = [': command not found. Run ', ' for available commands.'] as const;

/** Leaves the computer, as a terminal's own `exit` would. Not listed by `help`. */
export const EXIT = 'exit';

/** Back to the startup, as a terminal's own `clear` (or Ctrl+L) would: its welcome, from the top,
 *  without playing it again. What was typed is kept for Up. Named under `help`'s list. */
export const CLEAR = 'clear';
