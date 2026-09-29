// The lab computer's terminal: the words it says, shared by the page (src/components/Terminal.astro,
// TermOutput.astro, the /computer/ transcript) and its script (src/scripts/lab/terminal.ts). What each
// command prints is TermOutput.astro, from src/data/site.ts and the projects.
import type { Command } from '../scripts/lab/routes';

/** The prompt: whose terminal, on which machine, and where. */
export const PS1 = 'donald@lab:~$';

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

/** Anything else. `help`, in the middle, is tappable. */
export const NOT_FOUND = ['Command not found. Run ', ' for available commands.'] as const;

/** Leaves the computer, as a terminal's own `exit` would. Not listed by `help`. */
export const EXIT = 'exit';
