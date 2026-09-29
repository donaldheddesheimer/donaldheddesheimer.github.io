# Lab terminal: progress (2026-09-29)

**Status: work in progress on the `lab-terminal` branch.** Not merged, not deployed, no pull request.
This is a checkpoint of the "command-driven portfolio inside the lab computer" handoff: the terminal is
built and runs in the lab, but the full validation pass, the evidence, and the handoff write-up are
still to do (listed below). When they're done, this note gets folded into the top section of
[`lab-scene-handoff.md`](lab-scene-handoff.md), the same way `lab-cinematic-status.md` was.

## What changed

The room, the robots, the opening name and title, and the monitor-entry flight are unchanged. What's
inside the computer is now a terminal, in place of the Work/About/Résumé/Contact pages and their bar.

- **Entering:** the same camera flight. Then a startup of about a second: `New terminal started.` is
  typed out quickly, then `Type help to look around. The robots are on break.` (with `help` clickable),
  a blank line, and `donald@lab:~$ █`. Then it waits. No section and no `help` runs on its own. The
  startup plays once per session; a key or tap during it finishes it at once.
- **Commands** (a small dispatcher; input is never run as code, HTML or a shell command):
  - `help` lists exactly four commands (`about`, `work`, `resume`, `contact`), each one a button.
  - `about`, `work`, `resume` and `contact` print from the existing data (`src/data/site`, the projects
    collection, the résumé PDF). Nothing is invented.
  - Input is trimmed and matched case-insensitively; an empty line just prints a new prompt.
  - Anything else prints `Command not found. Run help for available commands.`
  - `exit` is a hidden alias for leaving.
  - Up and Down recall earlier commands.
- **Output:** real HTML text and links, in a history that runs in order, with a fresh prompt after each
  result. Only the terminal scrolls. The prompt stays in view at the screen's foot. A new result is
  shown whole, with the prompt under it, when it fits; when it doesn't, the view goes to the result's
  start rather than the bottom. Nothing pulls the view after that. A polite live region gives a short summary
  (e.g. "Printed: 11 projects.").
- **Animations:** the startup, a blinking block cursor, a staggered reveal of `help`'s lines, and a
  short entrance for each output. None of them hold up input. Reduced motion (or Motion off) shows
  everything at once, with a steady cursor.
- **Leaving:**
  - "Back to room" is gone.
  - Esc closes an open project first, then leaves, putting focus back on the monitor.
  - A small power button sits in the monitor's bottom bezel (on phones, in the strip under the screen)
    for touch.
  - History, the reading position and the startup state are kept in `sessionStorage` (`lab:terminal`),
    so they survive leaving, coming back, and a reload.
- **Project details:** open inside the computer, in a frame at `/?computer=work/<id>`, with a "Back to
  terminal" link (and Esc) that returns to the terminal as it was.
- **Routes:**
  - `/?computer` is the terminal.
  - Legacy links go to the terminal and run their command:
    - `/?computer=about|work|resume|contact`;
    - `/#about` and the like;
    - `/computer/about/`, `/computer/work/`, `/computer/resume/`, `/computer/contact/`.
  - Project pages keep their URLs (`/projects/<id>/`, `/computer/work/<id>/`).
  - The résumé PDF is unchanged.
- **Fallback:** `/computer/` is a plain HTML transcript of every command's output. It's where the
  monitor's link goes without JavaScript, and where the lab sends you if its script fails
  (`/computer/?static`). It never appears under the working 3D room.
- **Monitor texture:** the screen in the room now shows the terminal's empty screen and cursor, in place
  of the old Work page.

### Files

| Status | Files |
| --- | --- |
| New | `src/components/Terminal.astro`<br>`src/components/TermCmd.astro`<br>`src/components/TermOutput.astro`<br>`src/lib/terminal.ts`<br>`src/scripts/lab/terminal.ts`<br>`src/styles/terminal.css`<br>`src/pages/computer/index.astro` |
| Rewritten | `src/scripts/lab/computer.ts`<br>`src/components/LabStage.astro` |
| Changed | `src/scripts/lab/routes.ts`<br>`src/scripts/lab/scene.ts` (the texture)<br>`src/pages/index.astro` (the pre-paint routing and the script-failure guard)<br>`src/layouts/Screen.astro` (the bar in the computer)<br>`src/components/CaseStudy.astro`<br>`src/pages/computer/work/[slug].astro`<br>`src/pages/404.astro`<br>`src/lib/folio.ts` |
| Now redirects to the terminal | `src/pages/computer/{about,resume,contact}.astro`<br>`src/pages/computer/work/index.astro` |
| Removed | `src/components/Folio{About,Contact,Resume,Work}.astro`<br>`src/styles/folio.css` |

`docs/evidence/lab-terminal-2026-09-29/harness/` holds the test server:

- `serve.cjs` serves `dist/` to Playwright, and can serve Google Fonts from a local copy;
- `fonts.sh` makes that local copy.

## Verified so far

- `npm run build`: 43 pages, no errors. `tsc --noEmit -p .`: clean.
- A smoke run in Playwright Chromium at 1440×900, with WebGL on **SwiftShader** (software, not a GPU)
  and Google Fonts served from a local copy:
  - the monitor click flies in and lands at `/?computer`;
  - the startup completes;
  - the screen shows only the two startup lines and the prompt;
  - focus is in the input, and the title is "Terminal · Donald Heddesheimer".
  - `help`, then `WoRk  ` (mixed case, trailing spaces): `work` runs.
    - The live region says "Printed: 11 projects.".
    - The terminal scrolls inside itself (scrollTop 252 of 2386); the window's scrollY stays 0.
    - The prompt stays at the screen's foot, and the power button shows on the bezel.

Nothing else has been checked yet.

## Still to do

1. **Validation harness** (`docs/evidence/lab-terminal-2026-09-29/harness/validate.cjs`) covering the
   acceptance checks, then run it and fix what it finds:
   - Opening and startup:
     - startup text and prompt only;
     - `help` shows exactly four commands.
   - Every command, typed and tapped:
     - a tapped command runs once, even on a double-click;
     - focus goes to its result.
   - Unusual input: unknown, whitespace or empty, mixed case, repeated, and rapid (including during
     the startup).
   - Scrolling:
     - long output scrolls inside the monitor and the room doesn't;
     - the view isn't pulled away from what's being read.
   - Links:
     - project details (in the frame, then Esc or the link back);
     - source links;
     - the résumé PDF;
     - `mailto:`, GitHub, LinkedIn.
   - Leaving and coming back:
     - Esc leaves, with focus on the monitor;
     - the power button (touch);
     - reentry keeps the history, the scroll and the finished startup;
     - so does a reload.
   - Legacy URLs, and Back/Forward.
   - Other conditions:
     - phone (390×844, touch), including a simulated keyboard (a stubbed `visualViewport`);
     - reduced motion;
     - keyboard only;
     - JavaScript off (the `/computer/` transcript);
     - a failed script (the fallback redirect).
2. **Stills and link preview:** `public/lab/opening-{wide,tall}.webp` and `public/og.jpg` still show the
   old Work page on the monitor. Re-render them, or replace just the screen area, to show the terminal.
   Check that the `--still-*` fractions in `LabStage.astro` still hold, and that the texture's cursor
   lines up with the live startup cursor at 1440×900.
3. **Evidence:**
   - desktop and phone screenshots;
   - a short recording: startup → help → a command's output → leaving and coming back.

   Label anything rendered with SwiftShader as such, and keep the recording small.
4. **Handoff:** a new top section in `docs/lab-scene-handoff.md`, covering the implementation, what was
   verified and how, and the known limitations:
   - a real phone keyboard wasn't testable here;
   - WebGL ran on SwiftShader;
   - the monitor's texture shows only the empty prompt;
   - `exit` is a hidden alias;
   - project pages keep the site's page design.

   Then fold this note into it.
5. Rebuild, run tsc, commit and push to `lab-terminal`. No merge, deploy or push to `main` without
   approval.
