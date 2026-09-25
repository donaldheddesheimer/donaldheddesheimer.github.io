// The commit this site was built from, for the status bar's BUILD stamp. Read once, at build time.
// Git is there locally and in the deploy workflow (actions/checkout); anywhere else the stamp falls
// back to GITHUB_SHA, or is left out.
import { execSync } from 'node:child_process';

const git = (args: string) => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

function read(): { sha: string; date: string } | null {
  try {
    return { sha: git('rev-parse --short HEAD'), date: git('log -1 --format=%cs') };
  } catch {
    const sha = process.env.GITHUB_SHA?.slice(0, 7);
    return sha ? { sha, date: '' } : null;
  }
}

export const build = read();
