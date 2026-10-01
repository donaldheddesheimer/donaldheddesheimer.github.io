# Robotics lab implementation handoff

## Current checkpoint: the terminal overhaul, 2026-09-30 (Claude)

**Status: implementation complete on `terminal-overhaul`, from `main` at `5ff4489` (PR #9 merged).** Pushed for review as PR #10; not merged or deployed. The terminal is now an application rather than an endless transcript. It shows one view at a time over a prompt that keeps to the screen's foot, has a compact Work index, a project reader that folds its detail away, and a small pixel robot on About. The room, camera, robots, welding, screensaver, monitor entrance and the startup that invites `help` are unchanged. Nothing opens by itself, and help still lists About, Work, Resume and Contact.

- **Commits, in order** (each builds on its own):
  1. `70eb36e` Make terminal commands navigate a current reading view.
  2. `d627e6b` Redesign work as a compact terminal project index.
  3. `aa05e36` Give terminal projects concise openings and progressive detail.
  4. `b95dfdc` Unify terminal typography and section presentation.
  5. `7b3ca72` Keep a double-clicked command's focus and phone prompt in hand (found by the checks below).
  6. `4018349` Record the terminal overhaul and focused regression checks.
  7. The type pass asked for in PR #10's review (below).
  8. The welcome and `clear` (below).
  9. The ambience: the robot alive, the screen's glass, a status line and a shell's habits (below).
- **The state model** (`terminal.ts`, "The views"):
  - A view is one of `''` (the startup), `help`, `about`, `work`, `resume`, `contact` or `work/<id>`. Each is mounted once, from its `<template data-term-out>`, the first time it's asked for, as a `[data-view]` in `[data-term-views]`. Only the current one is shown.
  - Asking for another view keeps the old one's scroll position, hides it and shows the new one where it was left (from its start the first time), with its disclosures as they were. Asking for the view already shown leaves it where it is. With motion on, a view fades in over 160 ms; with reduced motion or Motion off, it doesn't.
  - The prompt shows where the reader is (`donald@lab:~/work/cucadence$`; at the startup and in help, `donald@lab:~$`).
  - A mistake isn't a view. An unknown command, or a project that isn't there (with its guesses, "Did you mean work fluxion?"), is said on one line over the prompt. The view underneath stays, and the line clears on the next command, even a blank Enter.
  - Up and Down recall typed commands from their own list (consecutive repeats collapsed), apart from the views.
  - **The session** is stored under `lab:terminal:2` as `{v: 2, boot, recall, view, views: {view: {y, open}}}`, checked field by field when it's read. An unknown view is dropped, a negative y becomes 0, and `open` keeps only indices.
  - **Migration:** the first version's transcript (`lab:terminal`, a `log` of what was typed) is read once. Its non-blank lines, trimmed, become recall (the last 60), and the last view it showed becomes the view. The old key is left in place.
  - **Addresses** (`computer.ts`): a project's view pushes a history entry, `/?computer=work/<id>`, storing its view (`v`) and what opened it (focus goes back there on Back). Other views replace the entry at `/?computer`. Back and Forward show each entry's view where it was left. Coming back from the room finds the view as it was left. A shared project link opens at its `#anchor`, unfolding the section it points into, and the old command addresses still run their command. Titles are `<project> · Terminal · Donald Heddesheimer` on a project.
  - **Without JavaScript,** `/computer/` prints every view in turn, each under an echo of its command. `/computer/work/<id>/` prints one project the same way.
- **What a reader sees:**
  - **Work** opens with a title and a one-line descriptor, then one row per featured project: its name (a link), a one-line purpose, its stack and context, and at most one result, set brighter than the line around it (amber is kept for commands and actions). Only two are featured (Traffic Operations Center, cuCadence). "Show all 11 projects" unfolds the other nine, and stays unfolded with the view. There are no cards, thumbnails or per-row source and demo links. The rows come from three new optional front-matter fields, `line`, `stack` and `result`, falling back to the brief or summary.
  - **A project** opens on its brief: its name, what it does, its stack, date, context and team, and work's result. My part and the hard part follow, where the brief has them, then source and demo on one line. Below, everything is folded: the cover, each section of the write-up behind its own heading (`+`/`-`), and the stats as "In numbers". Related projects and a way back to work close it.
  - **About** opens on my name, with a small pixel robot drawn from a character grid (hidden from screen readers). Then come the headline, school and city, the two profile paragraphs, what I'm doing now, and links to work, resume and contact.
  - **Resume** puts the PDF first, then each role on one line with its dates. What I did in each role, and the coursework, are folded.
  - **Contact** puts its note in the heading, so the email, copy button and profiles follow the title.
  - **Type** (after the review's pass): the site's mono (JetBrains Mono) throughout, as a terminal, except each view's title, which is in a pixel face (Pixelify Sans, from Google Fonts with the others, at weights 500 and 600; no package). Titles are 2.125em; work's project names (1.1875em) and the write-up's section headings (1.125em) are larger and bold. Prose is 1.65 line-height on a 70-column measure, and metadata is smaller (0.8125–0.9375em) and dim, so titles and names lead. A dashed line divides the view from the prompt.
- **The type pass** (PR #10's review: "a small font/hierarchy pass—not a redesign"): `terminal.css`, plus `--font-pixel` in `global.css` and the font in `Base.astro`'s Google Fonts link. A first take set the reading text in Inter; Donald wanted the pixelated feeling kept rather than a clean one, so the reading text went back to the mono, with only the titles in the pixel face. The heading reset in a view (`font: inherit` on h3–h6) now has zero specificity, so a heading's class sets its type; before, it quietly undid work's bold project names. Evidence in `docs/evidence/terminal-type-2026-09-30/`: `before/` (the overhaul's `shots.cjs` at `4018349`) and `after/`, the same 14 stills; `compare/`, six side-by-side sheets from `harness/compare.cjs` (work, work with all shown, a project folded and opened at 1440×900 on the monitor's screen, work and a project at 390×844); `logs/`. The build and tsc are clean. `validate.cjs` groups startup 10, commands 29, scroll 9, links 16, phone 25 and fit 23 pass; fit's one FAIL is the known 360×640 at 200% text, as before. nojs failed its anchor check at 1440 and 390 on the first run after the font link changed (nothing cached, so a late font moved the page under the anchor) and passed in every rerun (`validate-nojs-reruns.log`).
- **The welcome and `clear`** (asked for after the type pass, from a mockup of a pixel robot beside a name; Donald chose each option): the startup now has a welcome card between its two lines, `TermHello.astro`: a bigger pixel robot (`PixelBot.astro`, redrawn on a 32×30 grid with an outline, shading, a lit edge, a visor and a chest panel) beside my name in the pixel face, the headline, and school and city. No new copy: all of it is `profile` from `site.ts`. About opens on the same robot. `/computer/` prints the welcome too, its name a line rather than a heading. `clear` (`CLEAR` in `lib/terminal.ts`) goes back to the startup, from its top, without playing it again; what was typed is kept for Up, and `clear` itself is recalled. Ctrl+L does the same, keeping what's being typed and adding nothing to recall. Tab completes it, and help names it under its list ("And clear, back to the start."). The boot fades the welcome in between its lines, so `BOOT_MS` is 1080. `validate.cjs`: startup's text and help's status include them; keyboard's Shift+Tab meets `clear` first; commands adds three checks (clear from a scrolled project, Ctrl+L, Tab). nojs's anchor check was 1 px strict about "as near as the page scrolls": a late web font, with Chrome's scroll anchoring, leaves the line where it was and the page 2 px short of its foot, so it failed about one run in three. It now asks whether what's left to scroll would bring the line to the top. Six reruns of nojs pass. Evidence in `docs/evidence/terminal-welcome-2026-09-30/`: `screens/` (the startup, help and about at 1440×900; the startup and about at 390×844) and `logs/`. The build and tsc are clean. The full run gives 246 passed, 2 failed: `fit` at 360×640 with 200% text, and the `leave` reload flake, both known (above and below).
- **The ambience** (Donald chose from options: today's robot, alive, over a monitor-headed one, a welder or one asleep; and all four extras, with the wording of the hidden commands approved before they were built):
  - **The robot** (`PixelBot.astro`) is drawn in parts now: the head apart from the body, and the antenna light, the eyes, and eyes shut and squinting (hidden) apart from the head. In the lab's terminal it blinks every 5.2 s and its antenna light pulses, both in whole steps. While something's typed at the prompt its eyes drop a pixel to it (`data-bot-look` on the terminal). A command that ran gets a nod, the head bobbing a pixel twice; a mistake, or `sudo`, a squint for 1.4 s (`data-bot`). Reduced motion, or Motion off: still, eyes open, and the script sets no moods. The transcript's robot is still.
  - **The screen's glass** (`terminal.css`, `.term-glass` in `Terminal.astro`): a faint glow on the type (amber on the prompt and commands), the screen darkening toward its edges, and scanlines at 8% black every third pixel, over everything and taking no pointer. It doesn't move, so it stays with reduced motion; with `prefers-contrast: more` or forced colours it all goes.
  - **A status line** under the prompt, on a band of its own: `robots: on break`, and the time in Atlanta (`America/New_York`) to the minute, kept every 10 s while the terminal's on screen. Hidden from screen readers.
  - **A shell's habits**, unlisted by help and not completed by Tab, each answered on the line over the prompt (and told) as a mistake is, the view staying, recalled like any command: `whoami` (donald), `ls` (help's commands as `about/  work/  resume/  contact/`, each a command to run), `pwd` (`/home/donald` and where the reader is), `sudo …` ("donald is not in the sudoers file. This incident will be reported to the robots.") and `coffee` ("Out of coffee. The robots got to it first."). `exit` was already there. The words are `SAID`, `HOME`, `BAR` and `ZONE` in `lib/terminal.ts`.
  - **Found on the way, fixed:** the line over the prompt (a mistake's, and now a habit's) was capped at 76 columns, so on a wide screen the prompt's name rode up beside it. The line is the whole width now, its text still 76 columns at most.
  - `validate.cjs`: startup checks the status line and its clock against Atlanta's time; the unknown command is `rm -rf /` now (`sudo` has an answer); commands adds a check per habit (said, told, the view staying, recalled, the robot's mood), `ls`'s commands, that they're unlisted, and the robot's look and squint; motion checks the robot's animations, and that it holds still and has no moods with reduced motion and with Motion off. Evidence in `docs/evidence/terminal-ambience-2026-10-01/`: `screens/` (the startup, a mistake, `ls` and about at 1440×900; the startup and `ls` at 390×844; `bot-states.png`, the robot open, mid-blink, looking and squinting, at 2×), `harness/stills.cjs`, and `logs/` (build, tsc, validate, stills). The build and tsc are clean. The full run gives 258 passed, 2 failed: the same two known, `fit` at 360×640 with 200% text and the `leave` reload flake.
- **What to judge:** `docs/evidence/terminal-overhaul-2026-09-30/`:
  - `screens/`, at 1440×900 on the monitor with a mouse:
    - the startup, help, and work, compact and with all eleven shown;
    - `work cucadence` folded and with "How it works" opened;
    - about, resume and contact.

    Also help, work, a project, about and contact at 390×844, each tapped on a touch screen.
  - `video/terminal-overhaul-1280x800.webm` (35.4 s, 2.2 MB; `screens/recording-sheet.jpg` samples it every 3 s) covers:
    - the monitor clicked and the startup;
    - help typed, work clicked in it, all eleven shown;
    - Fluxion clicked, a section opened and read;
    - `about` typed, `work cu` completed by Tab and run;
    - Escape and the room;
    - the monitor again: back on cuCadence where it was, with no startup.
  - `logs/`: build, tsc, validate (the full run), validate-leave-reruns, shots and rec.
  - `harness/`: `shots.cjs` and `rec.cjs`, which use the lab-terminal pass's `serve.cjs`.
- **Checks** (headless Chrome 154.0.8037.58, ANGLE Metal, Apple M5 Pro):
  - The build and tsc are clean.
  - **`validate.cjs`** (`lab-terminal-2026-09-29/harness/`) was rewritten for the view model rather than loosened. Checks that read the transcript's entries now read the view shown, the views mounted (each once), the line over the prompt, recall and the stored session. A group that throws (a wait timed out) is a FAIL with its error, and the run goes on to the next group.
    - The full run gives **243 passed, 2 failed**. It is not a full pass. By group: startup 10, commands 29, complete 10, tap 4, scroll 9, links 16, leave 9 (1 FAIL), history 52, migrate 8, phone 25, motion 7, keyboard 9, nowebgl 15, nojs 11, failed 7, fit 24 (1 FAIL).
    - What the groups cover:
      - the startup alone, and each command's view (shown once, never twice);
      - mistakes over the prompt, and project guesses;
      - Tab completion, and Tab moving on;
      - recall, with repeats collapsed;
      - each view's own scroll, and its disclosures kept;
      - migration from `lab:terminal`, and a malformed store sanitized;
      - deep links with anchors, Back and Forward, and focus returned;
      - the résumé PDF (served, `download`), copy, and the contact links;
      - reduced motion and Motion off, and Esc and reentry;
      - the phone and the keyboard;
      - no WebGL, no JavaScript and a failed script;
      - sizes.
    - **Failure 1, `fit` at 360×640 with 200% text:** the known case, below.
    - **Failure 2, `leave`:** "a reload with a figure and a section unfolded unfolds them again, the same line where it was". Both came back unfolded, but the line in view was 32 px off. It passed in the group runs before and after, and in three reruns of `leave` alone (`validate-leave-reruns.log`), so it fails about one run in four. The likely cause is the write-up's images, which have no width or height: a lazy image that loads after the position is restored moves the text under it. Not fixed here.
    - The checks found two real problems, fixed in `7b3ca72`:
      - A double-clicked command's second press landed on the view it had just shown, selected a word there, and left the focus off the prompt.
      - At 390×844 with 200% text, the `~/contact` prompt ran 45 px off the side, and "Show all 11 projects" was 26 px tall to a finger.
    - Beyond that, the fixes were to the checks' own assumptions. A view element is itself the `.t-project`. Fluxion fits the screen folded, so a section is unfolded before scrolling. A folded static page may not scroll its anchor to the top. Contact has no `help` to tap, so it's typed.
  - The earlier passes' own harnesses are records of those passes and weren't changed. Their terminal checks assume the transcript, so they no longer run against this build: `maintenance-robot-2026-09-30/harness/complete.cjs`, the `rec.cjs` of the terminal-workshop and lab-terminal passes, and `lab-terminal-2026-09-29/harness/shots.cjs`. What they checked is covered by `validate.cjs`.
  - The room stills and social preview weren't regenerated: nothing in the room changed.
- **Limitations:**
  - **360×640 at 200% text:** the monitor tap still never reaches reading, as on main, and that size is the one `fit` FAIL. `fit` now catches it and goes on to the last three sizes, which pass.
  - **Anchors without JavaScript:** a deep link to a folded section lands on its heading line, still folded. The browser opens a `<details>` for an anchor inside it, not for one on its summary. With the lab running, the section unfolds.
  - **The `leave` reload check is flaky** (above): an image without dimensions can load after the reading position is restored.
  - **Narrow prompts:** at 390 px with text enlarged, a deep prompt (`donald@lab:~/contact$`) breaks mid-word onto a second line rather than scroll sideways.
- **Editorial questions** (nothing was invented; each is left out rather than filled in):
  - My part is missing for eight projects: Traffic Operations Center, Skyblock Bazaar, claude-status, Fluxion, nn, Smart Bin, Swerve Drive and TravelMate.
  - Results to confirm or supply:
    - Bytefight's tournament placement;
    - how Swerve Drive ran on the robot;
    - nn's GEMM vs cuBLAS numbers, once measured;
    - Skyblock's numbers, still unconfirmed and so kept out of work's row.
  - TravelMate has no hard part.
  - Useless Machine's "My part" reads "My first project ever.", and its "video is below" now points into a folded section.
  - Is two featured projects the right number?
  - The new `line`, `stack` and `result` wording across the eleven wants a read.

## Earlier checkpoint: an overhead maintenance robot, and terminal quality of life, 2026-09-30 (Claude)

**Status: implementation complete on `workshop-upkeep`, from `main` at `fe9623b` (PR #8 merged).** Pushed for review as a pull request; not merged or deployed. A small maintenance robot now hangs in a harness above the room, repairing a broken rail bracket. The terminal completes commands with Tab, and each project opens with what it does, the hard part and the result. The opening's identity, the monitor interaction, the camera fit and the motion setting behave as before.

- **Commits, in order** (each builds on its own):
  1. `0b8e02f` Add an overhead maintenance robot to the workshop.
  2. `75bad04` Animate the maintenance robot and restrained welding sparks.
  3. `12a68c0` Polish terminal command discovery and navigation.
  4. `6d92303` Refine terminal project writing and output pacing.
  5. `c9fa091` Refresh maintenance robot and terminal evidence: stills, social preview, evidence, this section.

  After review:

  6. `80642e1` Make the welding sparks fall in visible streaks.
  7. `59826d3` Clear the completion list when the caret moves.
  8. `782367d` Dispose the welding arc's sprite with the scene.
  9. The one that brings this section and the evidence up to date with them.
- **Recorded here for the first time: PR #8's follow-ups.** These were merged to main with PR #8 but never written up in this file:
  - `86a1dc6` slimmed the window's frame and mullions (the floor light's pane mask matches). Terracotta now turns three-quarters round to watch Ivory and glances back to the visitor mid-watch, so its face stays readable; this settles the open question below about its back being turned. The far traffic lights are a touch larger and at full brightness. The stills and preview were regenerated.
  - `f639573` laid a warm mood over the room: shadowed corners, a warm cast, a touch more contrast, and a still film grain. It is CSS over the canvas and the fallback still alike, so it adds no draw calls, and the grain doesn't move under reduced motion. The stills harness hides it, so the fallback images aren't graded twice.
  - `3af3c16` made the monitor's light on the desk the screensaver's night blue, with a soft ring on the bezel (a plane outside what the pointer picks). It turns warm white again as the terminal takes over. The stills and preview were regenerated.
- **What changed:**
  - **The rigger** (`scene.ts`, "The rigger", `buildRigger`) is a yellow maintenance robot in a blue webbing harness. It hangs from two cables to fixed anchors, never by the neck, in the space between the shelving and the window, above the clock. It sits in the harness with its legs folded. One hand holds a wall rail; the other holds a welding torch. The rail's middle bracket has a cracked brace, whose lower piece hangs loose, with soot round the break.
    - Most of it is baked into merged meshes: the shell, skull, visor and torch, with fixed-length capsule arms placed by two-bone IK. This keeps the cost to 25 draw calls.
    - The visor is a hood that pivots at the temples. It is up when idle or inspecting and down when welding.
    - On a phone held upright (the tall crop), it would sit behind the name, so it's hidden there.
  - **The repair loop** (`REPAIR`, `RK`) runs on the scene clock, every 24 s, the first starting about 7.5 s after the first draw (after the greeting). In seconds from the first draw, the first time round:
    - from about 9.2 to 11.5 it welds the break, having dipped its head to drop the visor;
    - it pulls back, tosses the visor up, and leans in, head tilted, to inspect;
    - at about 14.1 it does a double take at a missed spot;
    - from about 15.8 to 16.7 it drops the visor for a short corrective weld, then gives two satisfied nods;
    - from about 20 to 25 it glances down at the room, then waits for the next round.

    The sway is a deterministic pendulum on the cables, with small swings as it stops, pulls back and does the double take.

    The arc is one additive sprite that flickers. The sparks are one `Points` draw, spat on a fixed schedule from a hash (no `Math.random`). Review found them too restrained to register at normal size, so each is now a streak: eight points along its last 16 cm of path, spaced by distance however fast it falls, dimming and reddening to the tail. They're thrown wider and fall for up to 1.5 s, down the wall past the clock and the charge bay. The pool is 160, with the slot period set to the longest life. Before, a slot fired again every 0.5 s, so no spark outlived that whatever its lifetime said. The weld beads glow and cool.

    While reading, or with the scene paused, it eases to a held pose and the loop stops. With reduced motion or Motion off it shows the composed pose: no sway, no sparks, no arc, no frozen flash. Turning motion off mid-weld drops the sparks and the arc at once.
  - **Tab completion** (`terminal.ts`, "Completion") completes a command name (`help` and the four it lists) or, after `work `, a project's id. It applies only with the caret at the end of something typed and nothing selected.
    - One match fills the prompt in; it never runs it.
    - Several fill in the prefix they share, or, sharing no more, are listed dimly over the prompt and announced, until the next key, or until the caret leaves the end or something is selected (an arrow, Cmd+Left, a click in the field, select all; a review fix).
    - With no match, nothing typed, or the same Tab again with the list up, Tab isn't taken, and focus moves on. There is no keyboard trap.
    - Shift+Tab, modified Tab and IME composition are left alone.
    - `exit` is not completed, and no commands were added.
  - **Project writing** (`content.config.ts` `brief`, `TermProject.astro`, `TermOutput.astro`): each project has a brief, with up to four lines: what it does, my part, the hard part, and the result. `work <id>` opens with them under the name, each as a labeled line of prose. `work`'s list shows each project's name with its date and context across from it, then the brief's first line, then its commands. The case study pages and page descriptions still use `summary`.
  - **Pacing** needed no change. Output already comes in at once with a 200 ms fade (help's lines staggered), with no typing queue and nothing under reduced motion. Each command scrolls once, so a reader's position, selection, focus and the prompt are left alone.
- **Stills and preview** were regenerated: `public/lab/opening-wide.webp` and `public/og.jpg` show the robot's composed pose. `opening-tall.webp` came out byte-identical (the robot is hidden in the tall crop). The bezel fractions didn't move (wide 0.347/0.5919/0.5493/0.7936; tall 0.2511/0.462/0.7489/0.618), so `LabStage.astro` is unchanged, and the `nowebgl` group confirms the still's monitor link sits on the pictured monitor.
- **What to judge:** `docs/evidence/maintenance-robot-2026-09-30/`:
  - `screens/` holds:
    - the held opening at 1440×900 and 1920×1080;
    - the repair loop at 1440×900, in full and cropped to the robot and the sparks falling below it: the weld (10.6 s), the inspection (13.3 s), the double take (14.3 s) and the corrective weld (16.2 s);
    - `motion-off-mid-weld-sheet.jpg`: welding, Motion off 0.4 s later and 1.5 s after that, Motion back on, just after Escape, and eased back;
    - the terminal's `work` list, Tab listing three ids, `work cucadence`, and the room after Escape;
    - the phone opening and terminal at 390×844.
  - `video/repair-cycle-1280x800.webm` (24.4 s, 1.0 MB) runs from just before the first weld through the whole cycle, then entry with the startup, Escape and the room back.
  - `logs/` holds the build, tsc, validate, perf, stills, shots, rigcheck, complete and rec logs. `validate-after-review.log` reruns the groups the review fixes touch. The screens, the sheet, the recording and the other logs were regenerated after the fixes; `validate.log`, `stills.log` and the stills are from before them (the stills hold the composed pose, with no sparks).
  - `harness/` holds `shots.cjs`, `rigcheck.cjs`, `complete.cjs`, `perf.cjs` and `rec.cjs`, which use the lab-terminal pass's `serve.cjs`. `perf.cjs` takes `DIST` (another build) and `PERF_AT` (when to sample).
- **Checks** (headless Chrome 154, ANGLE Metal, Apple M5 Pro):
  - The build and tsc are clean.
  - `validate.cjs` passes 215 checks with no failures (startup, commands, links, leave, history, phone, motion, keyboard, scroll, tap, nowebgl, nojs, failed, and `fit` up to 390×844 at 200% text). It then stops at the known 360×640/200%-text case, as on main, so `fit`'s last three sizes didn't run: not a full pass. After the review fixes, commands (26), history (52), keyboard (7) and motion (5) pass again with no failures; the full suite wasn't rerun.
  - `complete.cjs` passes all its checks:
    - completion of commands and `work <id>`, a shared prefix, a listed set, and the second Tab moving on;
    - the list cleared by Left, Cmd+Left, a click in the field and select all, and kept by Right at the end, where the caret doesn't move (the first four fail on the build before the fix);
    - no match, nothing typed, the caret short of the end, a selection, Shift/Ctrl/Alt+Tab and composition all left to the browser;
    - nothing run by a completion, and Enter then running it once;
    - Up/Down history;
    - work's links, a modified click opening a new tab with nothing run here, the project's source and demo links (new tab, `noopener`), the résumé PDF (served, `download`), contact's email, GitHub and LinkedIn, copy, and a shared `/?computer=work/fluxion`.
  - `rigcheck.cjs`: Motion off mid-weld gives the held pose with no sparks or arc, and `data-running` false; while reading, `data-running` is false; after Escape the robot eases back. No page errors.
  - `shots.cjs`: the terminal round trip and the phone smoke check (390×844, touch: the monitor tapped reaches reading, the power button leaves) pass with no page errors.
  - The monitor pick passes at all five points at every size. The monitor rect and camera distances are unchanged from main.
- **Cost** (`perf.cjs` on this branch and on main's build, same machine, sampled 9–15 s after the first draw: the first weld and the inspection here, the copycat's start on main; one run each; measured):
  - at 1440×900, draw calls go from 365 to 390 and triangles from 127k to 135k (1920×640: 370 to 395; 390×844 unchanged at 204, the robot hidden);
  - frames stay at 16.7 ms, with none over 25 ms, at DPR 1 and 2;
  - the JS callback goes from 1.9 to 2.6 ms at p50 and 2.8 to 3.2 ms at p95 (DPR 1);
  - the GPU-synced frame p95 is 2.3 ms here against 4.2 ms on main at DPR 1, and 4.4 against 4.8 at DPR 2: within this measure's noise, not a saving.

  After the review's heavier sparks (one run, same sizes and sample window): still one draw for them (391 calls mid-weld, the arc's sprite the one more), frames at 16.7 ms with none over 25 ms, and the JS callback 2.7 ms at p50 and 3.4 ms at p95 (DPR 1), against 2.6 and 3.2 before: within run-to-run noise.

  SwiftShader and phone hardware were not measured.
- **Missing facts, flagged rather than invented** (each has a TODO in its project's front matter):
  - My part: Traffic Operations Center, Skyblock Bazaar, claude-status, Fluxion, nn, Smart Bin, Swerve Drive, TravelMate.
  - The result: Bytefight (the tournament placement), Swerve Drive (how it ran on the robot); nn's could carry the GEMM vs cuBLAS numbers once measured.
  - The hard part: TravelMate.
  - Skyblock's numbers are marked "confirm" by an earlier TODO; the brief repeats them as the write-up states them.
- **Limitations and open questions:**
  - The 360×640/200%-text stop in `fit` remains, as on main: the monitor tap never reaches reading, and `fit`'s last three sizes don't run. The mobile redesign stays deferred; the phone smoke checks above passed.
  - The robot is hidden on a phone held upright, so phones never see it.
  - The brief repeats a project's headline numbers, which its stats list again below. That was left as is, so the opening stands alone.
  - Tab completion is keyboard-only; on a touch screen the tappable commands do the same job.

## Earlier checkpoint: expressive robots, a pixel screensaver and a city window, 2026-09-30 (Claude)

**Status: implementation complete on `playful-workshop`, from `main` at `fe97460`.** Not pushed, merged or deployed. The robots have faces that react, and a copycat game. The monitor idles on a screensaver of our own, and the window looks out on a city at blue hour. The terminal, the opening's identity, the monitor interaction, the props and the motion setting behave as before.

- **Commits, in order** (each builds on its own):
  1. `fa43d3e` Give the workshop robots expressive faces and a copycat exchange.
  2. `b8e0e1d` Add a colorful pixel-cat screensaver to the lab monitor.
  3. `a911620` Open the workshop onto a city at blue hour.
  4. The one that adds this section: stills, social preview, evidence.
- **What changed:**
  - **Faces** (`scene.ts`, "Faces"): each head has eyes and brows on their own mounts:
    - Terracotta has oval eyes and arched brows;
    - Graphite has bar eyes under heavy brows;
    - Ivory has round eyes and thin brows.

    An `Expr` (open, brow lift and tilt, a sly quirk, a happy squash, and gaze) is set each frame from a per-robot calm face plus moods. The moods are WIDE, GLEE, SLY, FOCUS, PROUD, POISE, HOPE and KEEN. The eyes lead a head turn. The greeting uses them: Terracotta goes wide-eyed and then beams as it waves, Graphite's eyes slide to the visitor before its head, and Ivory raises a brow.
  - **The copycat exchange** (`COPY`, `copycat()`) comes first at 9.5 s, then every 48 s, and lasts 13.6 s:
    - Terracotta shows a short move to Graphite;
    - Graphite copies it, slower and heavier;
    - Ivory does it crisply;
    - Terracotta spins round, goes wide-eyed and ta-das.

    It is on the scene clock, so it holds with motion off.
  - **The screensaver** (`screensaver.ts`, new) is 128×80 pixel art of our own, drawn on a canvas and shown with nearest filtering. It has a ginger cat in a red scarf, a sine-wave rainbow trail, twinkling stars and a ringed planet. It animates at 10 steps a second, with four cat frames. No GIF, no audio, no dependency.
    - As the camera flies in, it dissolves pixel by pixel into the terminal's charcoal. The dissolve runs from 20% to 55% of the 1.9 s flight, about 0.65 s, before the HTML terminal fades in. Leaving reverses it.
    - It redraws only when its step or dissolve changes, and not at all while reading.
    - With reduced motion or Motion off it shows a still frame and switches immediately.
  - **The window** (`buildRoom`, `cityTexture()`) is 3.2×1.3 m, with three tall panes in a heavy frame. Behind it is a painted skyline at blue hour:
    - a peach horizon fading to blue, and a few early stars;
    - three rows of buildings from hazy to dark, with scattered lit windows;
    - two landmark towers;
    - an elevated road.

    Five cars' lights (`traffic(t)`, one `Points` draw) cross the road now and then, on the scene clock. The window's floor light is softer, and the moonbeam haze is gone. The clock reads 7:38.
- **Stills and preview** were regenerated: `public/lab/opening-{wide,tall}.webp` and `public/og.jpg`. The static monitor shows the screensaver's still. The bezel fractions didn't move (wide 0.347/0.5919/0.5493/0.7936; tall 0.2511/0.462/0.7489/0.618), so `LabStage.astro` is unchanged.
- **What to judge:** `docs/evidence/playful-workshop-2026-09-30/`:
  - `screens/` holds:
    - the held opening at 1440×900, 1920×1080, 1920×640 and 390×844, plus the city window;
    - the greeting at two points, and the copycat at three;
    - the screensaver close up;
    - the dissolve mid-entry, the terminal after startup, the screensaver back after Escape, and reentry with the transcript kept;
    - reduced motion in and out at 150 ms;
    - a shared project link;
    - the phone terminal.
  - `video/playful-1280x800.webm` (32 s, 1.3 MB) runs through the greeting, the copycat, the screensaver, entry with the startup, Escape and the screensaver's return.
  - `logs/` holds the build, tsc, validate, perf and shots logs.
  - `harness/` holds `shots.cjs` and `rec.cjs`, which use the lab-terminal pass's `serve.cjs`. `rec.cjs` thins frames to 25 fps and hands them over in chunks.
- **Checks** (headless Chrome 154, ANGLE Metal, Apple M5 Pro):
  - The build and tsc are clean.
  - `validate.cjs` passes 215 checks with no failures, through startup, commands, links, leave, history, phone, motion, keyboard, nowebgl (the still's monitor link sits on the pictured monitor), nojs, failed, and most of `fit`.
    - It stops at the known 360×640/200%-text case, as on main. **`fit`'s last three sizes didn't run**, so this is not a full pass.
  - `shots.cjs` confirms:
    - first entry plays the startup (`boot` done, no entries);
    - reentry keeps the transcript and never replays (`boot` stays `done`);
    - reduced motion is in `read` 150 ms after the click and out 150 ms after Escape;
    - `/?computer=work/cucadence` opens straight into the project;
    - the phone tap reaches `read`;
    - there are no page errors.
  - The monitor pick passes at all five points at every size. The monitor rect and camera distances are unchanged from main.
- **Cost** (1440×900 while dancing, same machine, two alternating runs each; measured):
  - draw calls go from 356 to 364, and triangles from 124k to 127k;
  - frames stay at 16.7 ms, with none over 25 ms;
  - the JS callback p50 is 1.8–2.5 ms on both builds, so within noise;
  - the synced frame p95 is 3.4–4.8 ms here against 3.8–5.7 ms on main.

  SwiftShader and phone hardware were not measured. The screensaver's texture upload is 128×80 at 10 per second.
- **Open questions:**
  - At 390×844 the window sits behind the Settings button and the end of the view hint. Both still read, helped by the hint's text shadow, but the contrast is lower than on the wall.
  - Terracotta turns its back to watch Ivory in the copycat's third part. This is intended, but its face is hidden for about 2 s.
  - The traffic is deliberately faint. At 2.5 px it can be missed on a high-DPI display.

## Earlier checkpoint: a lived-in workshop, caught dancing, 2026-09-30 (Claude)

**Status: implementation complete on `lively-workshop`, from `main` at `f121bc7`.** Not merged or deployed. The opening room was dark and empty on the left. It is now furnished, warmer, and a little alive, and the terminal behaves exactly as before.

- **Commits, in order** (each builds on its own):
  1. `22a0de7` Fill out the left side of the workshop.
  2. `3503587` Warm the workshop with a floor lamp and a lifted fill.
  3. `5e87d63` Catch the robots dancing when a visitor arrives.
  4. The one that adds this section: stills, social preview, evidence.
- **What changed** (all in `src/scripts/lab/scene.ts`):
  - **The left side** (`buildStore`) is a storage and experimentation corner:
    - a side wall and two bays of metal shelving with cases, parts bins, spare robot heads, boxes, a desk fan and a trailing plant;
    - assembly drawings below the name, cable coils on hooks and a clock;
    - a charging bay behind Graphite with hanging cables and a pad;
    - a scope cart;
    - an open equipment case and a coiled extension cable in front.

    The props are baked into merged meshes, except for the fan rotor, the one spare head that moves, and one instanced mesh for the status lights.
  - **Lighting:**
    - a floor lamp with a warm point light, between the shelving and the bay;
    - the hemisphere fill raised from 0.35 to 0.8, and the environment from 0.12 to 0.22;
    - the moonlight and the bench pendant unchanged.
  - **The caught moment** (`caught()`, `CAUGHT`, `FREEZE`) plays on the first opening of a tab session (`sessionStorage` `lab:caught`), with motion on. In seconds from the first draw:
    - at about 2, Terracotta notices the visitor and straightens, eyes wide;
    - at about 2.35, Graphite freezes mid-move, and its head creaks round in two steps;
    - at about 2.75, Ivory turns to look, head tilted;
    - from 3.7 to 5.5, Terracotta waves;
    - by about 6.7, all three are back in the routine.

    The poses come from the routine's own poses and `face()` and `WAVE`. It never blocks the computer: entering quiets the robots as before. The idle hint waits until the moment is over. With reduced motion or Motion off, the room opens on the same composed pose as before. Turning motion off mid-moment cancels it.
  - **Background life** (`store.animate(t, spin)`), on the scene clock, so it holds with motion off and stops when the scene pauses:
    - the fan turns, and eases to a stop while reading;
    - the bay's four status lights count up;
    - the scope's light blinks every 3.3 s;
    - every 21 s (first at about 8 s), the spare head lights its eyes, looks round and dozes off.
- **Stills and preview** were regenerated: `public/lab/opening-{wide,tall}.webp` and `public/og.jpg`. The monitor's bezel fractions didn't move, so `LabStage.astro` is unchanged.
- **What to judge:** `docs/evidence/lively-workshop-2026-09-30/`:
  - `screens/` holds:
    - the held opening at 1440×900, 1920×1080, 1920×640 and 390×844;
    - three frames of the caught moment;
    - a reload that doesn't replay it;
    - the monitor entered during the moment, and after Escape;
    - the phone terminal entered during the moment.
  - `video/caught-1280x800.webm` is the moment, 9.2 s.
  - `logs/` holds the build, tsc, validate and perf logs.
  - `harness/` holds `shots.cjs` and `caught-rec.cjs`, which use the lab-terminal pass's `serve.cjs`.
- **Checks** (headless Chrome 154, ANGLE Metal, Apple M5 Pro):
  - The build and tsc are clean.
  - `validate.cjs` passes 215 checks with no failures, through startup, leave, motion, history, phone and most of `fit`.
    - It stops in `fit` at 360×640 with 200% text: the monitor tap never reaches reading. **This stop is the same on main's build**, so it predates this pass. It is logged, not fixed.
    - The `nowebgl` group passes with the new stills.
  - The monitor pick passes at all five points at every size. The monitor rect and the camera distances are unchanged from main.
- **Cost** (measured at 1440×900 while dancing, same machine):
  - draw calls rise from 321 to 356, and triangles from 101k to 124k;
  - frames stay at 16.7 ms, with none over 25 ms;
  - the JS callback p50 goes from 1.7 to 2.0 ms;
  - the synced frame p95 goes from 3.4 to 4.2 ms.

  SwiftShader and phone hardware were not measured.
- **Open questions:**
  - The caught moment's timings are tuned by eye. On a slow first load, the opening's settle can overlap its start.
  - The far left of 1920×640 is still a plain dark wall past the shelving.

## Earlier checkpoint: project details in the terminal, and a workshop with character, 2026-09-30 (Claude)

**Status: implementation complete on `terminal-workshop-polish`, from `main` at `f6a7150`.** The five workshop commits below are followed by a dismissible viewing suggestion for mobile and narrow windows.

- **Viewing suggestion:** the opening says “The lab is best experienced in a wider, horizontal view.” It appears below the name on narrow/short viewports and touch devices, hides with the opening while using the terminal, and remembers dismissal for the tab's session. Codex verified narrow-view visibility, normal desktop hiding, dismissal across reload, and the build. This addition does not change the terminal or scene geometry.

- **Commits, in order** (each builds on its own, and each can be reviewed and reverted alone):
  1. `7745081` Render project details within the portfolio terminal.
  2. `b886565` Shape the workshop lighting and opening composition.
  3. `49d47b2` Differentiate the workshop robots and their dance behavior.
  4. `7835167` Add specific workshop details around the robots.
  5. The one that adds this section: Refresh workshop fallbacks and document the terminal experience.
- **This supersedes the project details frame** in the section below. There, `work <id>` covered the terminal with an iframe of the case study, with "Back to terminal" and an Escape that closed it first. That frame is gone. Where the sections below describe it, this one wins.
- **What to judge:** `docs/evidence/terminal-workshop-2026-09-30/`:
  - `screens/`;
  - `video/terminal-1280x800.webm`: the terminal, 23.6 s;
  - `video/robots-1280x800.webm`: one loop of the dance, then the held moment, 20.2 s;
  - `logs/`.

### What changed

1. **A project prints into the terminal** (commit 1).
   - **Where it's made:**
     - `src/components/TermProject.astro`: one project in the terminal's type;
     - `src/components/TermProse.astro`: the write-up's layout;
     - `src/lib/writeup.ts`: what turns the case study's HTML into it.
   - **The source is the case study's own Markdown**, as `/projects/<id>/` renders it, so the content is unchanged. The same markup serves the lab and the no-JavaScript page `/computer/work/<id>/`.
   - **What it prints:**
     - the name, when and where, and what it is;
     - status, source (and demo), team and tags, and the figures, in the terminal's key and value columns;
     - the write-up: plain section lines, prose, lists and links;
     - related work, to run next.
   - **Figures are folded** under a line that says what they show, and open when it's clicked. A video's poster loads only once its figure is opened.
   - **Code blocks** scroll sideways within themselves. The page never does.
   - In the lab, each project waits in a `<template>` until it's run (`Terminal.astro`).
2. **Command syntax.** Commands are trimmed and matched in any case, and never run as code, HTML or a shell command.

   | Command | Prints |
   |---|---|
   | `help` | The four commands below, each a button. |
   | `about` | About me, from `src/data/site.ts`. |
   | `work` | A numbered list of the 11 projects. Tapping an entry runs `work <id>` for it. |
   | `work <id>` | That project (1 above). An id no project has prints `No project called <id>. Run work to list them.`, with `work` a button. |
   | `resume` | The résumé PDF, then Experience, Education and Skills. |
   | `contact` | Email, GitHub and LinkedIn. |
   | `exit` | Leaves. A hidden alias, not listed by `help`. |
   | anything else | `Command not found. Run help for available commands.` |

   An empty line gives a new prompt, and doesn't change the address. Up and Down recall earlier commands.
3. **Addresses** (`src/scripts/lab/routes.ts`, the pre-paint routing in `src/pages/index.astro`). The table below still holds, except for these rows:

   | Address | Now |
   |---|---|
   | `/?computer=work/<id>` | The terminal, with that project printed (`work <id>`). An anchor (`#approach`) lands on its section. |
   | `/computer/work/<id>/` | With JavaScript, it goes to `/?computer=work/<id>` with its anchor. Without JavaScript, or after the lab's script failed, the project stands alone on the page, in the terminal's type, with its commands as links to their pages. `noindex`, with its canonical at `/projects/<id>/`. |
   | a failed script at `/?computer=work/<id>` | The case study, `/projects/<id>/`, with the anchor. |

4. **History.**
   - Going in adds one entry, and printing a project adds one more.
   - Back and Forward reprint an entry's project rather than printing it again: the transcript keeps one copy, and the reading place comes back.
   - An anchor edited into the address while reading stays on the same entry, and prints nothing again.
   - Escape, `exit` and the power button leave straight for the entry the lab was opened from. There's no frame to close first. The focus goes back to the monitor's link, or stays in the prompt if the command was typed.
   - **Kept for the session:**
     - the transcript;
     - the reading place, kept even when the oldest outputs are trimmed;
     - which figures were open.

     They survive leaving, coming back and a reload.
5. **Lighting and the opening** (commit 2, `src/scripts/lab/scene.ts`).
   - **The moon** comes in high from the left through the window:
     - a cool spot along one direction;
     - the six panes laid across the floor, right of the monitor, as one additive quad;
     - a faint beam of four haze sheets between.
   - **The pendant** is a warm spot hung low over the service stand. The unfinished robot and the bench's end are the warm pool at the back.
   - **The work light's cone** is tighter and aimed at the dancers' floor.
   - **The fill** is darker and cooler, so the wall above the robots and the room's corners stay dark.
   - **Looking around** is now limited both ways by the monitor's bezel against the window's margin. Before, only turning left was limited, so in a narrow mouse window turning right pushed the monitor partly out of the picture.
6. **The robots** (commit 3). The dancers keep the shared rig and the routine's four sections. Each now has its own sense of time and its own version of a section, not only a phase offset.
   - **Graphite:**
     - moves for three beats of each bar and all but stops on the fourth, holding a shape;
     - stands lower;
     - its gestures are broad and whole-armed.
   - **Ivory:**
     - lands every move on a half beat, and tuts: one forearm set at a time, right on the beat and left on the next;
     - its head follows the arm that moved;
     - never has both forearms across the body at one height.
   - **Terracotta:**
     - kicks on every off-beat in the warm-up;
     - in the canon, overdoes its hop-spin: a wobble with its arms out, a foot out to catch it, a hop back, a shake of the head, then the pose it meant.

     Graphite turns to watch it, and Ivory tilts its head.
   - **The unfinished robot** on the stand runs a stepped calibration every 12 s: head, elbow, wrist, a nod. Reading quiets it with the others.
   - **The held moment** is now beat 11.5 (it was 21.2), where each dancer is in a clear pose of its own. Reduced motion and Motion off show it.
   - The text clearance samples the dancers' reach twice as often (128 samples a loop), and the probe's `stats()` reports the beat.
7. **Workshop details** (commit 4), all procedural: canvas textures and primitives, with no new files, fonts or dependencies.
   - **By the bench:**
     - a wiring sketch for the arm on the stand, taped to the wall at the pegboard's end, askew, gone over in red where it was wrong;
     - marker labels on the parts drawers, one written over and one blank;
     - a bench supply with a dim readout, its leads clipped to the spare head. The rubber ring moved to make room.
     - on the pegboard, a missing wrench's outline and hand grime.
   - **On the cart:** a tag on the spare forearm, on a string.
   - **On the desk, under the lamp:** the useless machine, one of the projects in the content (`src/content/projects/useless-machine.md`): a small wooden box with its switch on the lid.
   - **No floating labels.** All text is on the objects themselves. The sketch is a generic servo test rig, not a diagram of a real project.
   - **No new randomness is drawn**, so the robots' seeded details are unchanged.
8. **Fallbacks** (commit 5), retaken from the scene as it is now:
   - `public/lab/opening-wide.webp`: 33 KB;
   - `public/lab/opening-tall.webp`: 11 KB;
   - `public/og.jpg`: 66 KB.

   The monitor's bezel moved in the wide still, so `LabStage.astro`'s `--still-*` fractions were updated to match:
   - **wide:** from 0.3392 / 0.5889 / 0.5396 / 0.7884 to 0.347 / 0.5919 / 0.5493 / 0.7936;
   - **tall:** from 0.253 / 0.4627 / 0.747 / 0.6173 to 0.2511 / 0.462 / 0.7489 / 0.618.

   To retake them, follow "Retaking the stills" further down, with the lab-terminal pass's `harness/stills.cjs` and `harness/og.cjs`.
9. **Harness.**
   - **`validate.cjs` in `lab-terminal-2026-09-29`:**
     - commit 1 replaced its iframe checks with checks of the printed write-up, folded figures, posters, anchors, reloads and history;
     - commit 5 fixes a flaky history check. "Forward, and Forward again" compared scroll positions after a fixed 600 ms, while a smooth scroll could still be running. It missed by 8–9 px in about one run in three. It now waits until the terminal's `scrollTop` has held for 250 ms, and passed 4 of 4 runs alone and in the full run.
   - **This pass's own harness** (`terminal-workshop-2026-09-30/harness/`):
     - `rec.cjs`: the lab-terminal pass's recording, with a project added;
     - `robots-rec.cjs`: the dance loop and the held moment.

     Both use the lab-terminal pass's `serve.cjs`.

### Validation

- **Machine:** Apple M5 Pro, Darwin 25.5.0.
- **Browser:** headless Chrome 154.0.8037.58 (installed Chrome, through Playwright). WebGL is ANGLE Metal on the Mac's GPU. No SwiftShader run in this pass.
- **Site:** `dist/` from `npm run build`, read straight from disk (`serve.cjs`).
- **Build:** 43 pages, with only the older three.js chunk-size warning (`logs/build.log`).
- **Type check:** `tsc --noEmit -p .` is clean (`logs/tsc.log` is empty).
- **`git diff --check`:** clean.
- **Every commit** was built and type-checked on its own before the next.

**The terminal's checks.** `validate.cjs` in `lab-terminal-2026-09-29`, run on the final build, is 227 checks, all passing (`logs/validate.log`). It covers:
- the startup, commands and taps;
- scrolling and links, including every project printed, folded figures, posters and anchors;
- leaving and coming back with the history kept, and addresses and history;
- the phone, including a simulated keyboard;
- reduced motion and Motion off, and the keyboard;
- no WebGL, with the link over the new stills to the pixel at five sizes;
- no JavaScript and a failed script;
- the fit at 13 sizes, including 200% and 150% text.

**The scene.** These were measured with scratch scripts (not committed) on the GPU, after each of commits 2–4. Only the robots and props changed after commit 2; the figures below are from the final scene.
- **The opening's fit** is the same after commits 3 and 4 as after commit 2: the camera's distance is 7.48 at 1440×900, 7.36 at 1920×1080 and 1920×640, and 8.8 at 390×844.
- **The monitor's pick** (the pointer on its centre and four inset corners) hits at all five points at all four sizes.
- **Looking around**, as far as it goes in six directions at 1440×900, 390×844 and 1920×640, keeps the monitor in view every time. The pick hits all five points in 16 of 18 cases. At the up-left limit, at 1440×900 and 1920×640, the inset bottom-right point misses. The monitor is skewed there, so that inset corner of its bounding box falls just outside the bezel. The miss is the same before commit 4 (measured on commit 3).
- **Frame cost at 1440×900,** held (reduced motion), on the M5 Pro with ANGLE Metal. Callback time is CPU time in the page's animation frame, not GPU time.

  | | Commit 3 | Commit 4 |
  |---|---|---|
  | Draw calls a frame | 313 | 321 |
  | Callback p50/p95, 1× | 2.1 / 2.5 ms | 1.5 / 2.1 ms |
  | Callback p50/p95, 2× (buffer 1800×1125) | 1.6 / 2.3 ms | 1.5 / 2.3 ms |
  | Frame interval p50/p95 | 16.7 / 16.8 ms | 16.7 / 16.8 ms, none over 25 ms |

  The callback times differ between runs by more than the props add, so read them as unchanged.
- **The dance** was checked on contact sheets at chosen beats, with a fake clock. The recording shows the loop, then the held moment once reduced motion is switched on.

**Screens** (GPU, the page's own fonts, JPEG), in `docs/evidence/terminal-workshop-2026-09-30/screens/`:
- **Opening:**
  - `opening-{1440x900,1280x800,1920x1080}` and `phone-opening-390x844`;
  - `focus-monitor-1440x900`;
  - `robots-held-1280x800`: the recording's last frame, the held moment.
- **The terminal, at 1440×900:**
  - `terminal-startup`, `terminal-help`, `terminal-work`, `terminal-contact`;
  - `terminal-project`: `work traffic-ops-center`, printed.
- **Tablet:** `tablet-terminal-1180x820`.
- **Phone:** `phone-terminal`, `phone-terminal-work` and `phone-terminal-project`, all 390×844.

**Recordings** (VP9, 1280×800, from Chrome's screencast replayed into MediaRecorder, with no ffmpeg):
- **`video/terminal-1280x800.webm`** (23.6 s, 2.0 MB). A real mouse and keyboard:
  - find the monitor and click it, fly in, and watch the startup;
  - type `help`, then `work`;
  - click the first project's command in the list, and scroll through its details;
  - press Esc and fly out;
  - click the monitor again: the transcript and the reading place are back, and the startup doesn't replay.
- **`video/robots-1280x800.webm`** (20.2 s, 1.0 MB): one whole loop of the dance, untouched (32 beats at 112 bpm), then reduced motion switched on, and the room holds.

### Known limitations

1. **Coverage:**
   - headless Chrome 154 on one Mac;
   - no Safari, Firefox, Playwright WebKit, real phone or tablet, or screen-reader pass;
   - a phone's keyboard is simulated.
2. **The props are small at most sizes.** The drawer labels, the tag and the readout are a few pixels tall at 1440×900. They read as labels, not as words. The sketch and the useless machine read at every desktop size. On a phone, only the useless machine is in the picture.
3. **The sketch sits between Ivory's head and the unfinished robot** at 1440×900. Its paper is toned down to keep it from drawing the eye, but it's still the palest thing on that part of the wall.
4. **Frame cost wasn't measured while dancing** in this pass, and not on any GPU but the M5 Pro.
5. **The look-around pick miss** at the up-left limit (Validation, above) comes from the harness's inset corner on a skewed monitor. It isn't a new gap in the monitor's hit area, but nothing measures the bezel's exact outline there.
6. **Carried over from the section below:**
   - the monitor's texture shows only the empty prompt;
   - the right-click on the drawn monitor;
   - the three.js chunk-size warning;
   - stills that go stale if the opening changes without a retake.

### Commands (from the repository root)

```sh
npm run build                          # 43 pages
git diff --check
tsc --noEmit -p .                      # clean

# PW=<path to a playwright or playwright-core module>; the site from dist/, no server.
T=docs/evidence/lab-terminal-2026-09-29          # the terminal's harness
E=docs/evidence/terminal-workshop-2026-09-30     # this pass's evidence
PW=<playwright> node $T/harness/validate.cjs dist > $E/logs/validate.log   # or: … dist history
PW=<playwright> node $T/harness/shots.cjs $E/screens
PW=<playwright> node $E/harness/rec.cjs                                     # → $E/video/terminal-1280x800.webm
LAST=$E/screens/robots-held-1280x800.jpg PW=<playwright> node $E/harness/robots-rec.cjs
PW=<playwright> node $T/harness/frames.cjs $E/video/terminal-1280x800.webm <scratch>/sheet.png
PW=<playwright> node $T/harness/stills.cjs <scratch>                        # then "Retaking the stills", below
PW=<playwright> node $T/harness/og.cjs <scratch>/og.png                     # then down to public/og.jpg
```

## Earlier checkpoint: a terminal inside the lab computer, 2026-09-29 (Claude)

**Status: merged into `main` as `f6a7150` (pull request #5).** The checkpoint above replaces its project details frame; see there.

- **Branch:** `lab-terminal`, from `main` at `b49f29c` (the merge of the full-screen lab below).
- **Commits:**
  - `7d73627`: the terminal, as work in progress. It was made by a cloud session, verified there only by a SwiftShader smoke run.
  - The one that adds this section: the validation, the fixes it and two reviews found, the stills, the evidence and this write-up.
- **Brief:** a command-driven portfolio inside the lab computer.
- **This supersedes the pages inside the computer.** The Work, About, Résumé and Contact pages and their bar, from the checkpoint below, are gone. The computer now holds a terminal. The room, the robots, the opening's name and title, and the flight to the monitor are unchanged. Where the sections below describe the computer's pages, this one wins.
- **What to judge:** `docs/evidence/lab-terminal-2026-09-29/`:
  - `screens/`;
  - `video/terminal-1280x800.webm`: 20.5 s, from the startup to leaving and coming back;
  - `logs/validate.log`.

### What changed

1. **The computer is a terminal** (`src/components/Terminal.astro`, `src/scripts/lab/terminal.ts`, `src/styles/terminal.css`). It isn't a fake OS: there are no windows, only a prompt and what it prints.
   - **Going in:** the same camera flight, then a startup of about a second:
     - `New terminal started.` types out quickly;
     - then `Type help to look around. The robots are on break.`, with `help` a button;
     - then `donald@lab:~$ █`.

     Then it waits. Nothing runs on its own. The startup plays once a session, and a key or tap during it finishes it at once.
   - **Commands.** A small dispatcher runs them. What's typed is never run as code, HTML or a shell command, and it's trimmed and matched in any case.
     - `help` lists exactly four: `about`, `work`, `resume` and `contact`, each a button.
     - Those four print from the site's own data (`src/data/site.ts`, the projects collection, the résumé PDF), through `src/components/TermOutput.astro`. Nothing is invented.
     - An empty line gives a new prompt.
     - Anything else prints `Command not found. Run help for available commands.`
     - `exit` leaves. It's a hidden alias, not listed by `help`.
     - Up and Down recall earlier commands.
   - **Output:**
     - Output is real text and links, in a history that runs in order. Each command is an `h2`.
     - The terminal alone scrolls. The prompt stays at the screen's foot.
     - A new result is shown whole with the prompt under it when it fits. When it doesn't, it's shown from its start, not the bottom. Nothing moves the view after that, typing included.
     - A polite status line gives a short summary, for example "Printed: 11 projects.".
   - **Motion:**
     - the startup;
     - a blinking block cursor;
     - `help`'s lines, staggered;
     - a short entrance for each output.

     None of these holds up input. Reduced motion, or Motion off in Settings, shows everything at once, with a steady cursor.
   - **Kept for the session** (`sessionStorage`, `lab:terminal`): the history, the reading position and the finished startup. They survive leaving, coming back, and a reload.
2. **Leaving** (`src/scripts/lab/computer.ts`, `src/components/LabStage.astro`).
   - "Back to room" is gone.
   - **Escape:**
     - with a project's details open, it closes them first;
     - otherwise it leaves, with the focus back on the monitor's link;
     - during the flight in, it turns the lab around once the flight lands.
   - **`exit`** leaves too, and so does Back.
   - **The power button is a touch screen's only** (`@media (pointer: coarse)`), for the lack of an Esc key there. With a mouse and a keyboard there's no button: Esc leaves.
     - **Placement:**
       - on the monitor (a tablet), it sits in the bottom bezel at its right, under the screen;
       - across the window (phones, small windows), it sits in a strip under the screen. With a mouse, a window that small has no strip: the screen reaches the window's foot;
       - while a phone's keyboard is up, it's hidden.
     - **Size:** it's sized from the text size and the bezel, with a 44 px reach.
3. **A project's details** open inside the computer, in a frame over the terminal, at `/?computer=work/<id>`.
   - They're the project's page (`/computer/work/<id>/`), which keeps the site's page design.
   - "Back to terminal" and Escape return to the terminal as it was, with the focus on the details link.
4. **Addresses** (`src/scripts/lab/routes.ts`, the pre-paint routing in `src/pages/index.astro`): see the table below.
5. **Without JavaScript, or if the lab's script fails:** `/computer/` (`src/pages/computer/index.astro`) is a plain transcript of every command's output, each at its anchor (`/computer/#work`).
   - It's where the monitor's link goes without JavaScript.
   - It's where the lab sends you when a script fails to load (`/computer/?static`). A session flag holds you there until the lab next runs.
   - It never shows under a working room.
6. **The monitor in the room** shows the terminal's empty screen and cursor (`terminalTexture()` in `src/scripts/lab/scene.ts`), in place of the old Work page. At 1440×900, the drawn cursor lies within 0.7 px of the live startup's.
7. **Stills and link preview** are re-rendered to show the terminal:
   - `public/lab/opening-wide.webp`: 37 KB;
   - `public/lab/opening-tall.webp`: 12 KB;
   - `public/og.jpg`: 72 KB.

   The monitor's position in them hasn't moved: the `--still-*` fractions are unchanged.

   To retake them, follow "Retaking the stills" in the section below, with this pass's `harness/stills.cjs` and `harness/og.cjs`. The copy in `lab-computer-2026-09-29` now renders a black still (see the fixes).
8. **Other pages:**
   - The project pages' bar leads to the terminal's commands (`/computer/#<command>`).
   - The 404's "Explore my work" runs `work`.
9. **Removed:**
   - `src/components/Folio{About,Contact,Resume,Work}.astro`;
   - `src/styles/folio.css`.

   `src/pages/computer/{about,resume,contact}.astro` and `src/pages/computer/work/index.astro` now forward to the terminal.
10. **Docs:**
    - `README.md` is rewritten for the terminal;
    - `docs/lab-cinematic-status.md` points here;
    - `docs/lab-terminal-progress.md`, the work-in-progress note, is folded into this section, so it's removed.

### Addresses

| Address | Now |
|---|---|
| `/` | The lab's opening, unchanged. |
| `/?computer` | The lab, in the terminal. A reload or a shared link opens it at once, without the flight. |
| `/?computer=about\|work\|resume\|contact`, `/#about` (and the other three), `/computer/about/` (and the other three), `/computer/#about` | The terminal, running that command. The address becomes `/?computer`, and a reload doesn't run it again. |
| `/?computer=work/<id>` | The project's details over the terminal. |
| `/computer/work/<id>/` | The page the details frame loads. Opened on its own with JavaScript, it goes to `/?computer=work/<id>`, keeping a section anchor (`#approach`). Without JavaScript it stands alone. |
| `/computer/` | With JavaScript: `/?computer` (or `/?computer=<command>` for its anchor). Without JavaScript, or with `?static` or the failure flag: the transcript. `noindex`. |
| `/projects/<id>/` | Unchanged: the project's page, indexable. |
| `/resume.pdf` | Unchanged. |
| `/?sel=…`, `/systems/`, `/prototype/…` | As before (below). |

History:
- Going in adds one entry, and opening a project's details adds one more.
- Back and Forward move between them and out of the lab. The terminal comes back as it was.
- Escape, `exit` and, on a touch screen, the power button go back to the entry the lab was opened from.

### Review and fixes

`7d73627` was reviewed in two halves, presentation and behaviour, by adversarial reviewers. A fresh skeptic then checked each finding in a browser. Of 13 findings, all 13 were confirmed and none refuted, and all are fixed:

- **Escape during the flight in** was swallowed, so the lab opened anyway. Now it turns around once the flight lands.
- **The failure flag** (`lab:static`) was never cleared, so after one failed script load every `/computer/…` address stayed on the transcript for the whole session. The lab now clears it when it runs.
- **Focus rings:**
  - Escape from details opened with the mouse returned the focus without a ring. It's now ringed after a key and not after a click.
  - Double-clicking a command left the focus on its button, so Enter ran it again. The focus now goes back to the prompt.
- **Scrolling:** a result that fitted could scroll its command's line off the top. It's now kept.
- **Copy:** with the clipboard refused, the copy button selected the address silently. It now says "selected", and the status line says so too.
- **A section anchor** on an old details address (`/computer/work/<id>/#approach`) was dropped. It's now kept.
- **Phones at 200% text:**
  - the startup line was cut off, and the prompt's field was one character wide;
  - key–value rows overflowed.

  The prompt now wraps and keeps a field of at least 8 characters, and the rows stack.
- **The power button:**
  - it was 40 px on touch screens, and is now a 44 px reach;
  - its box overlapped the screen's foot, and now it sits below it.
- **Touch targets:** links had no touch padding, despite the stylesheet's comment. They're padded now.
- **The 404's "Explore my work"** opened an empty terminal. It now runs `work`.
- **Stale descriptions** of the removed pages, in `README.md` and two comments.

The validation harness found more, all fixed:
- **Tabbing down through `work`'s links left 7 of 40 under the sticky prompt.** Now none are. A scroll margin on the terminal's links and buttons does it. It isn't padding on the terminal, because the input, scrolled to as it's typed in, would then drag the history away from where it's being read. The harness caught that too.
- **The retake script (`stills.cjs`) rendered a black still.** It hid `.home`, which now holds the room. It now hides only the name and Settings.
- **The power button across sizes:**
  - at 1920×1080 it overlapped the screen when clamped to the window;
  - at 1280×800 with 200% text it sat half a pixel off the bezel.
- **The power button's "Leave · Esc" tip ran under its focus ring**, which was seen in the screenshots. It was fixed, then went with the desktop button (below).

A second review, of the branch as validated, found three things, all fixed:
- **The desktop still had a way out on the bezel.** The power button showed whenever the computer was open, against the direction that a desktop leaves by Esc alone. It's now shown only on a touch screen, and its desktop-only tip is gone. The checks now require no button with a mouse, at every desktop size, and none to Tab to.
- **The startup's cursor stayed until the startup ended.** Its animation's delay used `--n`, which was set on its sibling (the typed line), so the browser computed the animation as `none`. `--n` is now on their shared parent, and the cursor goes at 488 ms (21 × 18 ms + 110 ms), with the startup still playing. A check covers it. Set back on the sibling, the same check reads `none`.
- **The handoff wasn't finished.** This section was a placeholder, and the harness's scripts and screens weren't committed. They are now.

### Validation on the final build

- **Machine:** Apple M5 Pro, Darwin 25.5.0.
- **Browser:** headless Chrome 154.0.8037.58 (installed Chrome, through Playwright). WebGL is ANGLE Metal on the Mac's GPU: "ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)". The log's first line records it.
- **Not covered:**
  - no SwiftShader run in this pass;
  - no Safari, Firefox, Playwright WebKit, real phone or tablet, or screen reader.
- **Site:** `dist/` from `npm run build`, served straight from disk into the browser (`harness/serve.cjs`). No server.
- **Build:** 43 pages, with only the three.js chunk-size warning, which is older than this pass.
- **Type check:** `tsc --noEmit -p .` is clean (`logs/tsc.log` is empty).
- **Measured vs inferred:** everything in the table is measured, unless it says otherwise.

`harness/validate.cjs` runs 195 checks in 14 groups. Result: 195/195, in 231 s (`logs/validate.log`).

| Area | Result |
|---|---|
| Startup (1440×900) | The flight goes fade, fly, read. The startup plays once (909 ms to done), then waits with only its two lines and the prompt. Focus is in the prompt. The title is "Terminal · Donald Heddesheimer", at `/?computer`. The dialog is modal and labelled, the input is labelled "Command" and described by the startup's hint, and the block cursor blinks. The cursor after the first line goes at 488 ms (its animation `term-gone`, delay 0.488 s), and is gone (opacity 0) while the startup still plays. Coming back, the startup doesn't play again. A key during it finishes it at once, and the command typed then runs. |
| `help` and the commands | `help` lists exactly `about`, `work`, `resume` and `contact`, each a button, and the status line says "Commands: about, work, resume, contact.". `about` names Donald. `work` lists 11 projects, each with details. `resume` links the PDF, then Experience, Education and Skills. `contact` gives email, GitHub and LinkedIn. Each is announced once ("Printed: 11 projects.") with the prompt ready. `about` and `contact` fit, so they're shown whole with the prompt under them; `work` and `resume` are shown from their start. |
| Input | `"  WoRk  "` (mixed case, spaces around) runs `work`. An unknown command prints exactly the not-found line. An empty line, or one of spaces, gives a new prompt and is hidden from a screen reader. Typed markup (`<img onerror>`, `<b>`) is shown as text and never run. A long line stops at 200 characters, with no sideways scroll. Repeated and rapid commands each run once, in order. Up and Down recall. No `id` repeats after 15 commands. |
| Clicks and taps | `help` in the startup's line runs once. A double click runs once. Enter on a command's button runs it once, with the focus back in the prompt. Typing with the focus on a link goes to the prompt. |
| Scrolling | The wheel scrolls the terminal (92 → 792 px), not the window (0) or the room (its look unchanged). Left where it's being read, the terminal stays put, typing included (492 → 492). |
| Links | All 11 details links open in the frame at `?computer=work/<id>`, with focus on its `h1` and the terminal inert. Escape comes back with the focus ringed on the details link and the terminal where it was; a clicked "Back to terminal", without the ring. The next project from inside the details is a new entry. Source and demo open a new tab (`noopener`, https). The résumé is a real PDF (200, `application/pdf`, 146,254 bytes, downloads as `Donald-Heddesheimer-Resume.pdf`). Email is `mailto:`; GitHub and LinkedIn open a new tab, labelled. Copy puts the address on the clipboard ("Copied."). With the clipboard refused, it selects it ("Selected, to copy."). |
| Leaving and coming back | Escape goes back to the address the lab was opened from, with the focus ringed on the monitor's link. Back in, the history and the reading position are as they were (52 → 52 px), with no startup. With a mouse there's no power button (`display: none`). `EXIT` leaves. On a touch tablet (1180×820), the power button is 36×36 at (1026, 721), under the screen's foot at 720, its icon on the bezel, under the screen's foot; tapped, it leaves without a ring. A reload opens the terminal at once, with the history, the reading position and the finished startup. Escape during the flight in leaves once it has landed. |
| Addresses and history | All 16 old command addresses (`/?computer=`, `/#`, `/computer/<cmd>/`, `/computer/#`, for each command) open the terminal running it, at `/?computer`, and a reload doesn't run it again. `/?computer=work/<id>` opens its details. `?computer=bogus` and an unknown project go to the room, with the address cleaned. `/prototype/?computer=about` and `/?sel=layer:gpu` run their command, and `?sel=project:<id>` goes to the project's page. `/computer/work/fluxion/#approach` opens `/?computer=work/fluxion#approach`, with Approach near the frame's top. `#contact` set on the opening runs `contact`. Back and Forward go details → terminal → room → terminal (as it was) → details. |
| Phone (390×844, 360×640, touch) | Across the window, with 16 px type. Focus is on the terminal, not the input, so no keyboard is raised. The power button is 44×44, in the strip under the screen. `help` and `work` tapped each run once, with focus on their heading. A swipe scrolls the terminal (275 → 578 px), not the window. With a keyboard up (simulated: see Known limitations), the terminal fits above it (390×506), with the prompt in view and the power button hidden. Typing runs `about`. With the keyboard down, the button is back. Tapped, it leaves without a ring. A tablet held upright (820×1180) also reads across the window. |
| Reduced motion, and Motion off | In without the flight, the startup all at once, and no output animation (0 animations, against 4 for `help` with motion on). The cursor is steady. |
| Keyboard | Tab reaches the monitor's link, ringed, and Enter puts the focus in the prompt. Shift+Tab reaches the newest command button, ringed, and Enter runs it once, back to the prompt. The output's links and buttons take a ring. Tabbing down through `work`'s links, none is left under the prompt (7 of 40 were before the fix). Tab from the prompt reaches no power button. Escape leaves, with the focus ringed on the monitor. |
| No WebGL (context refused) at 1440×900, 390×844, 1440×400, 2560×900 and 3840×950 | The still shows, and its monitor's link lies on the pictured monitor to the pixel. It opens the terminal across the window. Escape returns the focus to the link, and Enter goes in again. |
| No JavaScript (1440×900, 390×844) | The monitor links to `/computer/`, the transcript. It has `help` and the four commands, each a section with its heading, with commands linking to their place and no buttons. The 11 details link to `/projects/`, and "Back to the lab" to `/`. It's `noindex`, with its canonical and no sideways scroll. `/computer/about/` forwards to `/computer/#about`. |
| Failed script (scripts answered 503) | The opening stays the opening. `/?computer` goes to `/computer/?static`, with the flag set, and `/?computer=about` to its `#about`. The monitor's link then stays on the transcript, with no loop, and a project's address goes to its page. When scripts load again, the lab runs, the flag is cleared, and `/computer/#about` opens the lab running `about`. |
| Fit: on the monitor at 1440×900, 1920×1080, 1280×800, 1024×768, 1180×820 (touch) and 1280×800 at 200% text. Across the window at 390×844, 390×844 and 360×640 at 200% text, 1024×400, 740×360, and 568×320 at 150% text | The screen and the prompt are in view, with nothing sideways. On touch screens the power button is in view; with a mouse there's none, and at 1024×400 the screen reaches the window's foot (measured 1024×400). On the monitor on a touch tablet (1180×820), the power button's box is under the screen and its icon on the bezel: 36 px, with a 44 px reach. `contact` and `work` run. The prompt's field is 15 characters or more. The email is on one line, or across the width on a phone at 200% text. On touch screens, links are 32–37 px tall at the default text size. |

**Not measured in this pass (inferred):** frame rate and frame time. The scene's per-frame work is unchanged apart from the screen's texture, which is drawn once.

**Screens** (GPU, the page's own fonts, JPEG): `docs/evidence/lab-terminal-2026-09-29/screens/`.
- **Opening:**
  - `opening-{1440x900,1280x800,1920x1080}` and `phone-opening-390x844`;
  - `focus-monitor-1440x900`: the keyboard's ring on the monitor.
- **The terminal, at 1440×900:**
  - `terminal-startup`;
  - `terminal-help`;
  - `terminal-work`;
  - `terminal-contact`;
  - `details`: a project over the terminal.
- **Tablet, 1180×820, touch, at 2×:** `tablet-terminal-1180x820`: the terminal on the monitor, the power button on the bezel.
- **Phone, 390×844, touch, at 2×:**
  - `phone-terminal`;
  - `phone-terminal-work`.

**Recording:** `video/terminal-1280x800.webm` (VP9, 1280×800, 20.5 s, 1,980 KB). In it, a real mouse and keyboard:
- find the monitor and click it;
- fly in;
- watch the startup;
- type `help`, then `work`;
- scroll;
- press Esc and fly out;
- click the monitor again: the history is back, and the startup doesn't replay.

It's made from Chrome's screencast frames, replayed at their own timing into MediaRecorder, with no ffmpeg. `harness/frames.cjs` makes a contact sheet of it.

### Known limitations

1. **Coverage:**
   - headless Chrome 154 on one Mac;
   - no Safari, Firefox, Playwright WebKit, real phone or tablet, or screen-reader pass.
2. **A phone's keyboard is simulated.** The checks stub `visualViewport` to stand in for one, so a real iOS or Android keyboard hasn't been seen.
3. **The monitor's texture shows only the empty prompt.** The room's picture of the screen doesn't follow what's been run.
4. **`exit` is a hidden alias**, deliberately not listed by `help`.
5. **Project details keep the site's page design.** They aren't terminal output.
6. **Touch targets:**
   - Links in the output are about 32–37 px tall on touch screens, not 44. That's the text's line plus padding, measured at 30 px or more at every touch size.
   - On a touch screen large enough to show the monitor (a tablet, 1180×820), the power button's box on the bezel is 36 px, with a 44 px reach below it.
   - A device with both a touch screen and a mouse gets the button only if its primary pointer is coarse (`pointer: coarse`), so a touch laptop leaves by Esc. That's inferred from the media query, not tested.
7. **Nothing on a desktop says Esc leaves.** `help` doesn't list it, following the direction that a desktop leaves by Esc alone. `exit` and Back also leave.
8. **The terminal isn't a shell.** It has no pipes, arguments, tab completion or history search, by design.
9. **Carried over from the checkpoint below:**
   - the right-click on the drawn monitor;
   - browser close-request limits;
   - the three.js chunk-size warning;
   - stills that go stale if the opening changes without a retake.

### Commands (from the repository root)

```sh
npm run build                          # 43 pages
git diff --check
tsc --noEmit -p .                      # clean (logs/tsc.log)

# Playwright isn't a dependency: PW=<path to a playwright or playwright-core module>. The scripts launch
# installed Chrome (channel 'chrome') with ANGLE Metal; validate.cjs takes --swiftshader instead. They
# read the built site straight from dist/ (harness/serve.cjs): no server.
E=docs/evidence/lab-terminal-2026-09-29
PW=<playwright> node $E/harness/validate.cjs dist > $E/logs/validate.log   # or: … dist <group>, e.g. leave
PW=<playwright> node $E/harness/shots.cjs                                   # → $E/screens
PW=<playwright> node $E/harness/rec.cjs                                     # → $E/video/terminal-1280x800.webm
PW=<playwright> node $E/harness/frames.cjs $E/video/terminal-1280x800.webm <scratch>/sheet.png
PW=<playwright> node $E/harness/stills.cjs <scratch>                        # then "Retaking the stills", below
PW=<playwright> node $E/harness/og.cjs <scratch>/og.png                     # then down to public/og.jpg
```

## Earlier checkpoint: full-screen lab, portfolio inside the computer, `9daa78c` (Claude)

**Superseded inside the computer by the terminal above.** Its Work, About, Résumé and Contact pages and their bar ("Back to room") are gone. Its room, opening, monitor link, stills and fallbacks still stand, as updated above. Merged to `main` as `b49f29c`.

- **Branch:** `lab-computer-portfolio`, from `main` at `2c1009b` (the merge of the homepage cutover below).
- **Commit:** `9daa78c`.
- **Brief:** "Full-screen robotics lab, portfolio inside the computer". It was headed "Direction — supersedes earlier homepage instructions". Later in the pass: "get rid of the show my work button its redundant".
- **This direction supersedes the scroll-down and ordinary-page fallback.** The earlier checkpoints below built these, and all of them are gone:
  - Work, About, Résumé and Contact as sections below the lab;
  - the stacked page for windows the lab doesn't open in;
  - "Open ordinary page", and the redirect to the ordinary page for small windows;
  - the site header, phone tab bar, footer, skip link and ⌘K search.

  The lab is the whole homepage, and the portfolio lives only inside the computer. Where the earlier sections say otherwise, this one wins.
- **What to judge:** `docs/evidence/lab-computer-2026-09-29/`:
  - `screens/`;
  - `video/lab-1280x800.webm`: 19 s, the flight in and out;
  - `logs/validate.log`.

### What changed

1. **The homepage is the lab and nothing else** (`src/pages/index.astro`).
   - **The opening has four things:**
     - the name;
     - "Software engineer" (`profile.title`);
     - a discreet Settings control (Motion);
     - the monitor, which is the way in.
   - **Nothing else:** no ticker, introduction, Résumé or Contact buttons, nav, tab bar, sections below, footer, skip link or "Open ordinary page".
   - **The monitor is the only way in.** A "Show my work" pill was added for this brief and then removed at the owner's request, as redundant.
   - **One `<main>`, in reading order:**
     - the `h1` (the name);
     - the room, with its one link;
     - Settings.
   - The page fills the window (`100dvh`, safe-area padding). With enlarged text or a very short window, it grows and scrolls rather than clipping.
2. **The monitor is the destination** (`src/scripts/lab/scene.ts`).
   - **The desk moved to the front, a little left of centre:** `DESK = { x: 0.1, z: 3.5, yaw: 0.22 }`, from `x: -1.35, z: 3.3, yaw: 0.5`.
   - **The dancers moved round it.** Graphite stands behind the monitor's left (`at: [-1.55, 0.35, 0.55]`) and Terracotta to its right (`[1.85, 1.0, -0.55]`). Ivory stays further back.
   - **Tall windows get a monitor-first fit.** The monitor takes a share of the width, from 12% at 1.3:1 up to 52%. The camera comes in until it does, the room crops, and the picture slides to put the monitor just below the middle.
   - **Measured share of the window's width:**
     - 18–20% at 1024–1920 wide;
     - 40% at 820×1180;
     - 51% at 390×844;
     - 46% at 360×640.
   - **No new props or models.** The gentle pointer look, bounded drag-to-look, click versus drag, the monitor brightening under the pointer and the once-only idle hint are unchanged.
   - **The scene tells the page where the monitor is** (`LabScene`):
     - `onFit` gives the bezel each time the opening is fitted;
     - `monitor()` gives it as drawn now;
     - `highlight()` brightens it as hover does.
   - The monitor's own picture of the bar now reads "← Back to room".
3. **The monitor's link** (`src/components/LabStage.astro`).
   - **A real link:** `<a href="/computer/work/" aria-label="Explore my work">`.
   - **Where it stands:**
     - over the still's monitor, from CSS properties (`--still-*`, `--mon-*`), until the scene draws;
     - then over the drawn monitor (`onFit`).
   - **Once the scene has drawn, it passes the pointer through** (`pointer-events: none`). The scene picks the monitor, so a drag that ends on it is a look, not a click.
   - **Clicks:**
     - a plain click goes in;
     - Cmd-, Ctrl- or Shift-click, and a middle click, open the link's own address in a new tab, as the link would.
   - **Keyboard focus rings the drawn monitor and brightens it.** The ring follows the monitor as the room sways, including when the focus arrives before the scene has drawn.
4. **Stills from the scene** (`public/lab/opening-{wide,tall}.webp`, 40 KB and 16 KB).
   - Each is rendered from the built site under reduced motion (the held moment), with the name hidden.
   - The page shows one until the scene draws. It stays without WebGL, without JavaScript, and under Save-Data until the lab is entered.
   - **Which still:**
     - tall windows (4:5 or narrower) get `opening-tall`;
     - wider windows get `opening-wide`.
   - Windows more than twice as wide as tall show the still lower (`--still-py: 0.75`), which keeps its monitor in view.
   - Retake them whenever the opening changes (see "Retaking the stills" below).
5. **The computer holds the portfolio** (`src/scripts/lab/computer.ts`, `src/layouts/Screen.astro`).
   - **Going in lands on Work.** The four places are Work, About, Résumé (with the PDF) and Contact, under one slim bar: the name, the four, and "Back to room". It's a clean website, not a fake OS.
   - **Reading is stable.** The page is flat and front-facing, in whole pixels, so its text is sharp and selectable. Only the reader scrolls; the camera doesn't move and the robots come to rest.
   - **Small windows read across the whole window**, inside the safe areas (`data-pc-full`). That's under 64rem wide or 36rem tall: phones, narrow or short windows. There's no touch capture; the page scrolls natively.
   - **This replaces the redirect** to an ordinary page or the stacked homepage.
   - **Leaving:** "Back to room" and Escape go back to the entry the lab was opened from and restore the focus.
     - After a keyboard exit, the focus returns ringed.
     - After a clicked or tapped "Back to room", it returns without the ring: Chrome honours `focusVisible: false`, and a browser without it shows the ring.
   - **Other pages:** `/projects/<id>/` and the 404 use the same bar, leading into the computer and back to the room.
6. **The document shell** (`src/layouts/Base.astro`) is only the head:
   - title, description, link preview and canonical;
   - `viewport-fit=cover`;
   - the Motion setting applied before first paint;
   - fonts.

   Settings is its own component (`src/components/Settings.astro`). Escape closes it wherever the focus is, and a press inside it (on its note) keeps it open.
7. **Removed:**
   - `src/lib/build.ts`: the footer's build stamp. Its two type errors are gone, and `tsc` is now clean.
   - The header, tab bar, footer and search markup and scripts.
   - The CSS that only they used.
8. **`public/og.jpg`** is re-rendered as the new opening (1200×630): the name, title, Settings and the monitor at the centre.
9. **Docs:**
   - `README.md` is updated for the new site;
   - `docs/lab-cinematic-status.md` points here.

### Addresses

| Address | Now |
|---|---|
| `/` | The lab: the name, title, Settings and the monitor. Indexable. |
| `/?computer=<path>` | The lab reading that page (`work`, `work/<id>`, `about`, `resume`, `contact`). A reload or shared link opens it at once, without the camera's entrance. A small window reads across the window, not by redirect. An unknown path is dropped from the address. |
| `/#work`, `/#about`, `/#resume`, `/#contact` | Old anchors: made `/?computer=<page>` before first paint (typed on the opening too, via `hashchange`). |
| `/computer/<path>/` | The page the monitor's frame loads. `noindex`, canonical to `/projects/<id>/` for a case study or to itself. Opened on its own with JavaScript, it goes to `/?computer=<path>`. Without JavaScript it stands alone, linked to the other three and back to `/`. |
| `/projects/<id>/` | Unchanged address: the case study, indexable, under the computer's bar. |
| `/?sel=…`, `/systems/`, `/systems/screen/` | `?sel=project:<known id>` → `/projects/<id>/`. Any other selection → `/?computer=work` (was `/#work`). None → `/`. |
| `/prototype/`, `/prototype/work/<id>/` | Unchanged: → `/` (keeping `?computer=` and the anchor) and → `/projects/<id>/`. |
| Unknown | The 404 page, under the computer's bar: "Explore my work", "Back to room" and recent case studies. |

History: going in adds one entry, and each page opened inside adds one. Back and Forward move between them and out of the lab, with each page's scroll restored. "Back to room" and Escape go back to the opening entry in one step, or, for a lab opened at once, replace the entry with `/`.

### Review fixes

An adversarial review ran three lenses over the uncommitted change, each finding checked by a separate verifier:
- brief, routes and content;
- accessibility, fallbacks and layout;
- entry, focus and history.

Everything confirmed is fixed, and most fixes have a check in `validate.cjs`. The copy fixes are comments and docs only.

- **Focus and keyboard:**
  - The ring didn't appear when the link was focused before the scene drew. It now rings the monitor once the scene has drawn.
  - The focus didn't come back when Escape followed an entry that opened at once. It does now.
  - The ring drifted off the swaying monitor. It follows it now.
  - A clicked "Back to room" left a keyboard ring. It no longer does.
  - The focus could come back to a Settings switch whose panel had shut. It now falls back to the monitor's link.
- **Landmarks:** the room sat outside `<main>`. It's now inside, after the `h1`.
- **The monitor:**
  - Modified and middle clicks on the drawn monitor did nothing. They open a new tab now.
  - In very wide windows, the still's monitor fell partly out of view. It stays in view now.
- **Settings:**
  - A click on its note closed the panel.
  - Escape didn't close it after a click in Safari, or in Firefox on a Mac.
- **Leaving:**
  - **A dialog the browser shuts** (a close request the page may not refuse) called leave twice, which could step back through history twice. It also flew the camera back behind a closed dialog. It now takes one step and is instant.
  - **A leave asked for during a move** could drop a Back or Forward that came in the same move, leaving the lab out of step with the address. It now catches up with the address.
  - **A close request with no Escape behind it** (Android's Back, when the room's document has the focus) left the lab. It now goes back one page.
    - The verifier refuted the general claim: while reading, the focus is in the frame, and Chrome gives Back to the history.
    - The narrow case is handled anyway.
- **Resize or loss of the room during the flight** was dropped. The page now lands in the layout the window has.
- **Reduced motion** waited for the scene to load, only to cut in. It now cuts in at once.
- **Copy:** stale comments that mentioned the retired header, footer and homepage sections, and the stills' retake procedure (below).

### Validation on the final build

- **Machine:** Apple M5 Pro, Darwin 25.5.0.
- **Browser:** headless Chrome 154.0.8037.58 (installed Chrome, through Playwright 1.63.0). WebGL is ANGLE Metal on the Mac's GPU: "ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)". The log's first line records this.
- **Not covered:** no SwiftShader run, and no Safari, Firefox, Playwright WebKit, real phone or screen reader.
- **Site:** `dist/` from `npm run build`, served straight from disk into the browser (`harness/serve.cjs`, GitHub Pages' rules: directory index, `404.html`). No server.
- **Build:** 42 pages, with only the three.js chunk-size warning, which is older than this pass.
- **Type check:** `tsc --noEmit -p .` (tsc 5.9.3) is clean (`logs/tsc.log` is empty).
- **Measured vs inferred:** everything in the table is measured on the final build, unless it says otherwise.
- **Final source edit:** a comment. Before and after it, every built HTML, CSS and JavaScript file is byte-identical (SHA-256).

`harness/validate.cjs` runs 132 checks in 15 groups. Result: 132/132 (`logs/validate.log`).

| Area | Result |
|---|---|
| Opening, at 1440×900, 1920×1080, 1280×800, 1024×768, 820×1180, 390×844 and 360×640 | Only the name and title are shown, and only two controls: the monitor's link and Settings. There are no sections, nav, footer, tab bar, anchors, or skip or ordinary-page links, and no outer scrolling. The monitor is wholly in view without looking around. Its link lies on the drawn bezel (to the pixel) and clear of the name and Settings. |
| Keyboard and landmarks | Tab goes to the monitor's link, then Settings, both ringed. The link is in `main`, after the `h1`. Focus rings the drawn monitor and brightens it: mean screen luminance 32.6 → 41.6 (hover: 32.7 → 41.7). A focus that arrives before the scene draws gets the ring once it has, following the swaying monitor within 0.5 px. Enter goes in on Work (2.18 s with the flight), with the focus in the page. The room behind is inert. Escape comes back to the address it was opened from, with the focus ringed on the link. |
| Pointer | A drag ending on the monitor looks and doesn't go in. Hover brightens the monitor, with a pointer cursor. A click goes in. Cmd-click and middle click open `/?computer=work` in a new tab and leave the lab closed. |
| Inside | About from the bar changes the address, and the camera and frame don't move. The wheel scrolls the page (60 px) and not the window (0). Résumé links the PDF. Back returns to About where it was scrolled, and Forward to Résumé. A refresh reopens on the monitor. A clicked "Back to room" returns the focus without a ring. Case study → Back → Work → Back reaches the room, and Forward opens Work again. |
| Leaving and close requests | Escape inside a case study (two pages in) leaves for the room. A close request with no Escape (`dialog.requestClose()`, standing in for Android's Back) goes back one page, then to the room. A dialog shut by the browser leaves at once (no return flight), one step back, not past the opening. Narrowed during the flight in, it lands across the window. Opened with the focus on a Settings switch, the focus comes back to the monitor's link. |
| Resize while reading | 1440 → 700 wide reads across the window. Back to 1440, it's on the monitor again, on the same page. |
| Phone (390×844, 360×640, touch) | Reads across the window, with no outer scroll. The page scrolls inside (`touch-action: auto`) and "Back to room" is shown. Tapping it returns to the opening. |
| Addresses | All four anchors open the computer on their page. `?computer=work/<id>` opens the case study. `?computer=bogus` is dropped. `?sel=project:<id>` goes to the case study and other selections to Work. `/systems/` → `/`. `/prototype/?computer=about` keeps the address and `/prototype/work/<id>/` goes to the case study. `/computer/about/` on its own goes to the lab reading it. `/projects/<id>/` stays, indexable, and links to no `/#…` anchor. |
| Reduced motion and Motion | Reduced motion: the room holds still, with no idle hint, and going in cuts (87 ms to reading). Motion off in Settings stops the room, is remembered, and survives a reload. With the scene not yet loaded (Save-Data), reduced motion cuts in without loading it (70 ms). |
| Idle hint | It shows once, peak 0.999, when the page is left alone. A press cancels it. |
| No WebGL (context refused) at 1440×900, 390×844, 1440×400, 2560×900 and 3840×950 | The still shows, and its monitor's link lies on the pictured monitor (within 1.5 px), in view with room for the ring. The link is what a click at its centre hits. A click or tap opens the computer across the window. Escape returns the focus to the link, and Enter goes in again. |
| No JavaScript (1440×900, 390×844) | The monitor, a link to `/computer/work/`, is the only control: Settings isn't offered. Work stands alone, with the other three places, 11 case studies and "Back to room" to `/`. |
| Enlarged text and short windows | 1280×800 and 390×844 at 200% text, 1024×400, 740×360, and 568×320 at 150%: the name and Settings are reachable and apart, there's no sideways scroll, and the monitor is in view. Reading keeps "Back to room" in view. |
| Save-Data | No scene until asked for; the still shows. Its monitor opens the computer. |
| Settings | A press on its note keeps it open. Escape closes it with the focus on the page, and the focus goes to its button. A press elsewhere, or the focus moving out, closes it. |

**Not measured in this pass (inferred):**
- **Frame rate and frame time.** The scene's per-frame work is the prototype's, with the desk and two robots placed differently, so the cinematic checkpoint's GPU performance table is expected to hold.
- **The robots' clearance.** It was measured against the old introduction's text. The opening now has only the name in its corner, fitted by the same `fitHero()` rules.

**Screens** (GPU, the page's own fonts, JPEG): `docs/evidence/lab-computer-2026-09-29/screens/`:
- **Opening:**
  - `opening-{1440x900,1280x800,1920x1080}`;
  - `phone-opening-390x844`;
  - `focus-monitor-1440x900`: the keyboard's ring on the brightened monitor.
- **Reading:**
  - `reading-{work,about,resume,case}-1440x900`;
  - `phone-reading-{work,case}-390x844`.
- **Fallbacks** (taken by `validate.cjs`):
  - `nowebgl-opening-1440x900`;
  - `nojs-work-390x844`;
  - `fit-1280x800-text200`: the opening at 200% text.

**Recording:** `video/lab-1280x800.webm` (VP9, 1280×800, 19 s). It shows:
- the opening;
- the pointer finding and brightening the monitor;
- the click and the flight in;
- About from the bar, and a scroll;
- Résumé;
- "Back to room" and the flight out.

It was made from Chrome's screencast frames, replayed at their own timing into MediaRecorder: no ffmpeg. `harness/frames.cjs` makes a contact sheet of it as it plays.

### Retaking the stills

The stills, and the link's position over them without the scene, come from the scene itself. Retake them whenever the opening changes: the desk, the robots' rest poses, the room, the lighting, the camera or the fit.

1. `npm run build`.
2. `PW=<playwright> node docs/evidence/lab-computer-2026-09-29/harness/stills.cjs <scratch>`.
   - It renders `opening-wide.png` (1600×1000) and `opening-tall.png` (720×1440) from the built site: reduced motion, the GPU, the name hidden.
   - For each, it prints the monitor's bezel as fractions of the still: `ml`, `mt`, `mr`, `mb`.
3. Convert each to WebP, quality 72, method 6 (for example Pillow's `save(…, 'WEBP', quality=72, method=6)`), into `public/lab/`.
4. Put the fractions into `LabStage.astro`: `--still-ml/mt/mr/mb` under `:root` for the wide still, and under `(max-aspect-ratio: 4/5)` for the tall one. `--still-a` (1.6 and 0.5) changes only if the render sizes do.
5. Rebuild, then run `validate.cjs dist nowebgl`. It checks that the link lies on the pictured monitor, within 1.5 px, at five sizes, including 2560×900 and 3840×950 for the lower placement in wide windows.

`harness/og.cjs` remakes the link preview in the same way:
- render at 2x;
- Lanczos down to 1200×630;
- JPEG quality 86, progressive;
- save as `public/og.jpg`.

### Known limitations

1. **Coverage:**
   - headless Chrome 154 on one Mac;
   - no Safari, Firefox, Playwright WebKit, real phone (iOS or Android) or screen-reader pass.

   Android's Back is exercised only through `dialog.requestClose()` in desktop Chrome.
2. **Right-clicking the drawn monitor gives the canvas's menu, not a link menu.** Once the scene has drawn, the link passes the pointer through so the scene can tell a click from a drag. Cmd-, Ctrl- and middle clicks still open a new tab. The keyboard, the still, and pages without JavaScript have the real link.
3. **Browser close-request limits.** A close request the page may not refuse, when the room's document has the focus, shuts the dialog. The lab then leaves at once for the entry it was opened from, rather than going back one page. In Chrome, that's Back pressed again with no tap or key since the last one.
4. **Focus ring after a clicked "Back to room"** uses `focus({ focusVisible: false })`. A browser without it shows the ring.
5. **Redirects need JavaScript to be exact** (GitHub Pages can't redirect on the server). Without it:
   - `/computer/<path>/` stands alone, by design;
   - the retired addresses' meta refresh goes to their fixed replacement.
6. **Reduced motion wins in the lab** (unchanged): with the system setting on, Motion in Settings brings back the page's transitions, but the room holds still.
7. **Carried over:**
   - the three.js chunk-size warning;
   - the Graphite–Terracotta tap during their greeting (not re-measured after the move).
8. **The stills are pictures of the scene.** They go stale if the opening changes without a retake (above).

### Commands (from the repository root)

```sh
npm run build                          # 42 pages
git diff --check
tsc --noEmit -p .                      # clean (logs/tsc.log)

# Playwright isn't a dependency: PW=<path to a playwright or playwright-core module>. The scripts launch
# installed Chrome (channel 'chrome') with ANGLE Metal; validate.cjs takes --swiftshader instead. They
# read the built site straight from dist/ (harness/serve.cjs): no server.
E=docs/evidence/lab-computer-2026-09-29
PW=<playwright> node $E/harness/validate.cjs dist > $E/logs/validate.log   # or: … dist <group>, e.g. close
PW=<playwright> node $E/harness/shots.cjs                                   # → $E/screens
PW=<playwright> node $E/harness/rec.cjs                                     # → $E/video/lab-1280x800.webm
PW=<playwright> node $E/harness/frames.cjs $E/video/lab-1280x800.webm <scratch>/sheet.png
PW=<playwright> node $E/harness/stills.cjs <scratch>                        # then "Retaking the stills"
PW=<playwright> node $E/harness/og.cjs <scratch>/og.png                     # then down to public/og.jpg
```

## Earlier checkpoint: the lab becomes the homepage, `b4f5a5c` (Claude)

**Superseded by the full-screen lab above.** Its sections below the lab, stacked page for small windows, "Open ordinary page", site header, tab bar, footer and search are gone, and `/#<section>` now opens the computer. Merged to `main` as `2c1009b`.

- **Branch:** `cinematic-lab-homepage`, from `cinematic-lab-prototype` at `b7800f0`. `origin/main` was still `cc1a6c4` when the branch was pushed, so it merges without conflicts.
- **Commit:** `b4f5a5c`.
- **Brief:** "Finish the cinematic lab and make it the homepage". It's a polish and release pass on the prototype below, with no redesign. The monitor's brightness, the computer's pages, the room and the robots' designs are unchanged.
- **What to judge:** `docs/evidence/lab-homepage-2026-09-28/screens/`. These are rendered on a real GPU (Apple M5 Pro, ANGLE Metal, headless Chrome 153) with the page's own web fonts. The earlier checkpoint's screens were set in the fallback font.

### What changed

1. **The robots** (`src/scripts/lab/scene.ts`):
   - **Graphite's arm keeps clear of the introduction and its links.**
     - `reach()` gives the outer corners of Graphite's elbows and hands as posed.
     - `fitHero()` also fits those points, for the whole dance, 16 px clear of every text line and link of `[data-lab-avoid]`.
     - Graphite keeps its arms close (a new persona trait, `close: 1`): raised arms go straight up rather than out, with the elbows bent.
   - **Ivory stands clear of the service stand:** `at: [0.85, -1.55, 0.25]`.
   - **Terracotta turns to face Ivory for its reaction:** a `turn` channel, `hops()` and `bearing()`. It hops round, shimmies facing Ivory, and hops back.
2. **Settings** (`src/layouts/Base.astro`):
   - The header's Motion switch is now inside a small Settings disclosure: an icon button (`aria-expanded`, `aria-controls`) over a panel.
   - The panel closes on Escape (focus returns to the button), when focus leaves it, and on a click outside.
   - The footer's switch stays, and both switches agree.
   - The note under the switch says what it covers, and that the room holds still while the system asks for reduced motion.
   - Without JavaScript, Settings and the footer's switch aren't shown, because nothing can work them.
3. **The cutover.**
   - `src/pages/prototype.astro` is now `src/pages/index.astro`: the lab is `/`, indexable, with canonical and `og:url` set to itself. Its title is "Donald Heddesheimer · Systems and GPU software engineer".
   - The scripts moved from `src/scripts/lab-prototype/` to `src/scripts/lab/`.
   - Every page has the lab's header: the mark, the section links (Work, About, Résumé, Contact) and Settings. The phone tab bar has Home and the same four, and the search list (⌘K or `/`) has the sections and the case studies.
   - There's no "Systems map" anywhere.
   - The link preview is a new `public/og.jpg` (1200×630): the opening itself, with the fonts, under reduced motion. `harness/og.cjs` in the new evidence folder remakes it. It replaces `og.png`, the console card.
   - `/computer/…` stays the frame's own: `noindex`, canonical to the ordinary page. Opened on its own, each page goes to the lab reading it, or to the ordinary page in a window the lab doesn't open in.
4. **The dashboard is retired.**
   - **Deleted:**
     - the Rover Autonomy mission and simulation (`rover-sim.ts`, `rover-render.ts`, `MissionCanvas`);
     - the systems map and console (`Overview`, `Stage`, `SystemsMap`, `Inspector`, `Evidence`, `EntityShape`, `lib/model.ts`, `lib/layout.ts`, `selection.ts`);
     - the old homepage (`HomeSections`, `Section`, `Panel`, `Timeline`, `lib/timeline.ts`);
     - the first lab (`RobotStage`, `robot-scene.ts`, `lab.ts`);
     - `site.ts`'s `mission` and `skillAliases`;
     - about 1,550 lines of `global.css` that served only them.
   - **Case studies** (`CaseStudy.astro`) read as the computer shows them, with no project codes, "Featured" badge, "Show on map" or Connections graph. Their "Related work" list stays.
   - **Genuine rover content is kept:**
     - the RoboJackets RoboNav / University Rover Challenge role in About and Résumé;
     - the introduction's rover-autonomy lines;
     - the project write-ups.
5. **Old addresses forward** (the table below).
   - GitHub Pages can't redirect on the server, so each old address is a small static page (`src/layouts/Redirect.astro`) with:
     - `location.replace` (no history entry);
     - a `<noscript>` meta refresh;
     - `noindex`;
     - a canonical link to the replacement.
   - **Selections** (`src/components/LegacySel.astro`) are matched against the list of project ids built with the site:
     - `^project:([\w-]+)$` with a known id makes `/projects/<id>/`;
     - any other selection goes to `/#work`.
     - Nothing else from the query reaches an address.
6. **Docs:**
   - `README.md` is rewritten for the new site: its addresses, where to edit content, and the layout.
   - `docs/lab-cinematic-status.md` points here.
7. **Harness:**
   - the existing scripts are pointed at `/` and at Settings (`fallbacks-motion.cjs` opens the disclosure to reach the switch);
   - `shots.cjs` gains `FONTS=1`, `settings` and `project`;
   - `robots-dance.cjs` measures text clearance and the stand's parts;
   - a new `homepage.cjs` checks redirects, metadata, links, Settings and plain pages.

### Addresses

| Address | Now |
|---|---|
| `/` | The lab (roomy windows) over Work, About, Résumé and Contact. Indexable. |
| `/?computer=<path>` | The lab reading that page. A window the lab doesn't open in goes to the ordinary page (`/projects/<id>/` or `/#<section>`). An unknown path is dropped from the address. |
| `/projects/<id>/` | Unchanged address. The case study, indexable. |
| `/computer/<path>/` | The frame's page. `noindex`. On its own, it goes to `/?computer=<path>` or the ordinary page. |
| `/prototype/` | → `/`, keeping the query (`?computer=`) and the `#section`. |
| `/prototype/work/<id>/` | → `/projects/<id>/`, keeping the query and anchor. |
| `/systems/`, `/systems/screen/` | With `?sel=project:<known id>` → `/projects/<id>/`. With any other `?sel=` → `/#work`. Bare (or `?sel=` empty) → `/`. |
| `/?sel=…` | The same rule as `/systems/`. An empty `?sel=` stays on `/`. |
| Unknown | The 404 page: the header, links home, and a few case studies. |

### Validation on the final build

- **Machine:** Apple M5 Pro (18 cores, 24 GB), Darwin 25.5.0.
- **Browser:** headless Chrome 153.0.8010.54 through Playwright.
  - **"GPU"** below means WebGL through ANGLE Metal on the Mac's GPU. Each log's first line names the renderer.
  - **"SwiftShader"** means Chrome's software WebGL. It's used only where no frame rate or pose is read: redirects, metadata, links, Settings.
- **Server:** this branch's `npm run build`, served by `npm run preview` on :4322.
- **Build:** `npm run build` gives 42 pages. Only the three.js chunk-size warning, which is older than this pass.
- **Type check:** `tsc --noEmit -p .` (tsc 5.9.3) gives only the two old `src/lib/build.ts` errors: no Node types (`logs/tsc.log`).
- **Measured vs inferred:** everything below is measured unless it says otherwise.
- **Logs** are in `docs/evidence/lab-homepage-2026-09-28/logs/`. The existing scripts are in `docs/evidence/lab-cinematic-2026-09-28/harness/`, the new ones in `…/lab-homepage-2026-09-28/harness/`.
- **Last source changes:** two edits followed the GPU runs of navigation, click versus drag, look limits and the fallbacks:
  - a comment in `scene.ts`;
  - the `scripting: none` rule in `Base.astro`.
  - After the rebuild, every built JavaScript file is byte-identical (SHA-256), and only the stylesheet changed. So those runs stand for the final build.
  - `homepage.cjs`, the robots and the screenshots ran on the final build itself.

| Area | Result | Log |
|---|---|---|
| Legacy redirects (SwiftShader) | 26/26 with JavaScript: every row of the table above, with the query and anchor kept where it says so. None adds a history entry (`history.length` unchanged). Hostile selections (`project:fluxion/../../evil`, `project:fluxion?x=//evil.example`, `<script>`, `javascript:alert(1)`, `//evil.example`, `org:`, `cap:`, `hobby:`, unknown ids) all go to `/#work`. 4/4 without JavaScript: the meta refresh goes to the fixed replacement. | `homepage.log` |
| Indexing and canonical (SwiftShader, every built page) | The only indexable pages are `/` and the 11 case studies, each with canonical and `og:url` set to itself and `og:image` `/og.jpg`. The 12 indexable titles are unique. The `/computer/…` pages are `noindex`, with canonical set to the ordinary page. The `/prototype/…` and `/systems/…` pages are `noindex`, with canonical set to their replacement. The 404 page is `noindex`. `/og.jpg` is a 1200×630 JPEG; `/og.png` is 404. 59/59. | `homepage.log` |
| No leftover entry points | No built page outside the retired ones links to `/prototype`, `/systems` or `?sel=`. That covers the header, tab bar, footer, search list (20 entries) and the case studies. | `homepage.log` |
| Settings (SwiftShader, 1440×900 and 390×844) | 19/19. Tab reaches it with a visible focus ring. Enter or Space opens it, with the focus kept on the button. Tab moves into the panel. Space on the switch turns Motion off: it's stored, both switches uncheck, and the frame loop stops (1 frame in 2 s). Escape closes it and returns focus without touching the lab. Tabbing out or clicking elsewhere closes it. The setting persists across a reload, and the footer's switch agrees. On a phone the button is 44×44 and the panel opens inside the window. Without JavaScript, Settings and the footer switch aren't shown. | `homepage.log`, `screens/settings-open-*-nofonts.png` |
| Reduced motion (GPU and SwiftShader) | Motion starts off with nothing stored. The room is one still frame (0 differing pixels 2 s apart). There's no look-around and no idle hint, and the computer opens with a cut. Turned on in Settings, the choice is stored and the page's transitions come back (the frame fades in), but the room still holds still: the system setting wins in the lab, as before this pass. | `fallbacks-motion.log`, `homepage.log` |
| Motion switch (GPU) | Tab ×8 goes Settings, then (Enter), then the switch. Space and Enter toggle it, and the choice persists across reloads. Switched off mid-dance at 2 s and at 5 s, the room matches a page loaded with Motion off (0 differing pixels, 2 runs). Switched off mid-look, the view returns to rest. | `fallbacks-motion.log` |
| Click versus drag (GPU) | 18/18, as in the prototype pass. A click on the monitor enters, even with 4–5 px of movement. Drags don't enter (8 px or 30 px ending on the monitor, 150 px away from it, or starting in the room and ending on it). Drags starting on links don't turn the view. "Explore the lab" enters by click and by Tab + Enter. A pen drags like a mouse. | `look-click-input.log` |
| Look limits (GPU) | PASS at 1280×800, 1440×900 and 1920×1080, six drags each (four sides and both corners toward the monitor): the whole screen stays in the window, and the view eases back in 1.4–3.1 s. The nearest edge is 31.6 px (1440×900, a full leftward drag). | `look-click-limits.log` |
| Navigation (GPU) | 11 checks × 2 runs, 276/276. They cover entries and addresses from `/`, Back and Forward with the scroll restored per entry, "Leave computer", Escape (in the frame and outside it) with focus back on "Explore the lab", reload, direct and invalid `?computer=` links, "Open ordinary page", the redirect for windows the lab doesn't open in, links out, the résumé PDF, copy-email, the back-forward cache, resizing while reading, and the keyboard. | `navigation.log` |
| Mobile and stacked (GPU) | At 390×844 (DPR 3) and 360×640 (DPR 2) with touch: no horizontal overflow, touch scrolls without turning the view, and a tap on the monitor or "See the work" goes to `#work`. Text is 14 px or larger. `?computer=about` goes to `/#about`, `?computer=work/cucadence` to `/projects/cucadence/`, and `/computer/resume/` to `/#resume`. At 1024×768 with a mouse, drags don't navigate. A 1440→1024→1440 resize while reading works. The computer's bar keeps "Leave" in view at 800, 600 and 390 px. | `fallbacks-phone.log` |
| No WebGL and no JavaScript (GPU browser) | With the context refused, or with `--disable-webgl`: `data-failed`, the still, and "See the work" to `#work`. A shared `?computer=about` opens the page flat in the frame, and Escape goes back to `/`. The only console errors are three.js's context errors. Without JavaScript, at 1440 and 390: the still, all four sections, and "See the work" to `/#work`; `/projects/cucadence/` reads. Save-Data: the scene waits for "Explore the lab", then loads and reaches reading in 2.4 s. | `fallbacks-nogl.log`, `homepage.log` |

**Robots (GPU, the page's own fonts).** `robots-dance.cjs` ran with `QUICK=1 LOOPS=3` on a paused fake clock, so each size has 1,612 samples: every 32 ms of scene time over three loops. `logs/robots-dance-<size>.log`.

| Size | Camera distance | Graphite's closest approach to the introduction | Ivory and Terracotta |
|---|---|---|---|
| 1280×720 | 7.157 (+5.2%) | 11.9 px, to "Contact" (beat 15.63) | 368 and 280 px |
| 1280×800 | 7.728 (+8.7%) | 9.0 px, to "Contact" (beat 15.57) | 372 and 306 px |
| 1440×900 | 7.110 (unchanged) | 33.9 px, to "Contact" (beat 15.63) | 484 and 394 px |
| 1920×1080 | 6.805 (unchanged) | 168.8 px | 730 and 631 px |
| 2560×1440 | 6.805 (unchanged) | 38.0 px | 606 and 512 px |

- **The introduction:**
  - No robot's projected mesh enters any text line or link of the introduction at any sample, at any size.
  - The fit keeps 16 px from the arm's outer corners. The whole mesh comes a little closer (9–12 px at the 1280 widths), because the corners approximate it.
  - The camera distance is compared with the fit before this pass's reach clearance, with the real fonts. Keeping Graphite's reach clear pulls the camera back only at the two 1280 widths.
- **Ivory:**
  - Against the stand's parts (plate, mast, arm, casters, cable), vertex by vertex: 0/1612 at every size, down from 87 of 541 samples, up to 100 mm, before.
  - Against the unfinished robot: 0/1612.
- **Terracotta faces Ivory** (head within 20°) in beats 14.55–16.16 of each loop, around its shimmy (chest roll std 0.057 rad in beats 14.95–15.75, against 0.036 before it). Before this pass, it didn't face Ivory in that window.
- **Graphite and Terracotta** still touch, as before this pass: 14/1612 samples, up to 38 mm, at beats 3.26–3.32 and 5.35–5.53, during their greeting (Terracotta's wave, beats 3–6.6 in the code). It reads as a tap and wasn't in the brief.
- **The draw budget at the opening:** 300 draw calls and 97,084 triangles at 1440×900, the same as the prototype. It's 302–311 calls and 97,856–100,152 triangles at the other sizes: the view takes in more or less of the room. Frame rate and frame time weren't measured again. The scene's per-frame work is unchanged apart from the poses, so the prototype's performance table below is expected to hold (inferred, not measured).

**Screens** (GPU, the page's own fonts, JPEG 86%): `docs/evidence/lab-homepage-2026-09-28/screens/`:
- `opening-{1280x800,1440x900,1920x1080}`;
- `settings-1440x900`;
- `reading-{work,about,case}-1440x900`;
- `project-1440x900`;
- `phone-{opening,page-work,project}-390x844`.

The two `settings-open-*-nofonts.png` clips are from `homepage.cjs` (SwiftShader, fallback font). 1.5 MB in all, and no recording.

### Known limitations

1. **Coverage:**
   - headless Chrome on one Mac only;
   - no Safari, Firefox, Playwright WebKit, real phone or screen-reader pass;
   - GPU numbers are for the Apple M5 Pro only.
2. **Redirects need JavaScript to be exact.** GitHub Pages can't redirect on the server.
   - Without JavaScript, the `<noscript>` meta refresh goes to the fixed replacement. It drops the selection and the prototype's query: `/systems/?sel=project:fluxion` goes to `/`, not the case study.
   - Search engines see `noindex` and the canonical link.
3. **Reduced motion wins in the lab.** With the system setting on, turning Motion on in Settings brings back the page's transitions, but the robots and camera stay still. This is the prototype's behavior, kept as the brief asked, and the note under the switch says so.
4. **Robots:** the Graphite–Terracotta tap above, and the 1280-wide framing that sits 5–9% further back.
5. **Case studies change on the released site:**
   - `/projects/<id>/` loses the map's project codes, "Featured" badge, "Show on map" button and Connections graph;
   - "Related work" stays;
   - their write-ups are unchanged.
6. **The site header is the lab's on every page.** The released case studies' header had a Search button and a Résumé (PDF) button, and neither is kept.
   - Search opens with ⌘K / Ctrl+K or `/`. `[data-cmdk-open]` is still wired, but nothing on the page uses it: the prototype's design had no button.
   - The PDF is linked from the opening's Resume button and the Résumé section.
7. **Carried over from the prototype:**
   - the redirect for windows the lab doesn't open in can paint once before it goes;
   - the computer's bar scrolls 32 px at 320 px;
   - the reduced-motion cut draws about twice in one tick;
   - the 1920×1080 @2x fly-out interval;
   - the back-forward cache was exercised in Chrome only;
   - the two `src/lib/build.ts` type errors;
   - the chunk-size warning.

### Commands (from the repository root)

```sh
npm run build                          # 42 pages
git diff --check
tsc --noEmit -p .                      # only the two src/lib/build.ts errors (logs/tsc.log)
npm run preview -- --host 127.0.0.1 --port 4322

# Playwright isn't a dependency: NODE_PATH=<a directory with it>. The scripts launch SwiftShader;
# the GPU runs pointed the launch at ANGLE Metal instead.
H=docs/evidence/lab-cinematic-2026-09-28/harness; E=docs/evidence/lab-homepage-2026-09-28
DIST=$PWD/dist LOG=$PWD/$E/logs/homepage.log node $E/harness/homepage.cjs
BASE=http://127.0.0.1:4322 OUT=public/og.jpg node $E/harness/og.cjs
W=1280 H=800 QUICK=1 LOOPS=3 OUT=<scratch> LOG=$E/logs/robots-dance-1280x800.log node $H/robots-dance.cjs
FONTS=1 EXT=jpg OUT=$E/screens W=1440x900 STEPS=hero,settings,read,about,case,project node $H/shots.cjs
RUNS=2 LOG=$E/logs/navigation.log node $H/navigation.cjs
LOG=$E/logs/look-click-input.log node $H/look-click-input.cjs     # likewise look-click-limits, fallbacks-{motion,nogl,phone}
```

## Earlier checkpoint: cinematic lab prototype, `b7800f0` (Claude)

**Superseded by the homepage cutover above.** Its addresses (`/prototype/…`) now forward, and the cutover pointed its harness scripts at `/`, so the commands at the end of this section are as they were run then.

- **Branch:** `cinematic-lab-prototype`, from `origin/main` at `cc1a6c4` (the merge of PR #2, which contains `796f421`).
- **Commits:**
  - `7c60fea` is the pass that started the branch. Its work-in-progress note is `git show 7c60fea:docs/lab-cinematic-status.md`.
  - `aabec24` is the rightward look limit.
  - This pass is the commit that adds this section: `git log -1 -- docs/lab-scene-handoff.md`.
- **Brief:** "Handoff: Cinematic robotics lab with gentle exploration" (Option A), then the later direction under "Scope" below.
- **Where to look:**
  - `/prototype/` is the prototype. It's unlinked and `noindex`.
  - The computer's pages are `/computer/{work, work/<id>, about, resume, contact}/`.
  - A shareable address is `/prototype/?computer=<path>`.
- **What to judge:** `docs/evidence/lab-cinematic-2026-09-28/screens/`.
  - Rendered on a real GPU: Apple M5 Pro, ANGLE Metal, headless Chrome 153.
  - Set in the fallback font, because every harness aborts the Google Fonts requests.

### Scope (the later direction supersedes the earlier dashboard-preservation brief)

- **The computer is a simple portfolio:** Work, About, Résumé and Contact, not the systems dashboard.
- **Removed from the new experience** (`/prototype/`, `/computer/*`):
  - the Rover Autonomy mission and simulation;
  - every entry point to the dashboard.
- **Checked:**
  - These pages link nowhere under `/systems`.
  - They have no mission, telemetry or map.
  - The `?sel=` redirect to `/systems/` no longer fires on the prototype (below).
- **Genuine rover content is kept:**
  - the RoboJackets RoboNav / University Rover Challenge role in About and Résumé;
  - the "rover autonomy" lines of the introduction.
- **Legacy routes are untouched in this pass:**
  - `/`, `/projects/<id>/`, `/systems/` and `/systems/screen/` are unchanged, as the release diff below shows.
  - Their retirement is listed at the end of this section, for the homepage cutover.

### What the prototype does now

From `7c60fea` (details in its note):
- **A monitor-first opening.**
  - The chair is moved aside and Graphite moved by the desk.
  - The monitor is large at the lower left: 262, 294 and 389 px wide at 1280×800, 1440×900 and 1920×1080.
- **One flight straight into reading** (1.9 s), from "Explore the lab" or a click on the monitor. There is no workstation stop and no "Use the computer".
- **A gentle look-around.**
  - Pointer parallax, plus a mouse or pen drag past 6 px, softly bounded and easing back on release.
  - Touch scrolls the page. The keyboard and the wheel are untouched.
  - It's off while reading, in flight, without the lab, with reduced motion and with Motion off.
- **The computer as a simple portfolio:**
  - built from shared `Folio*` components;
  - the old `/computer/` index, `/computer/systems/` and `/computer/projects/<id>/` are deleted.
- **Controls:**
  - a Motion switch in the header;
  - Escape leaves;
  - the computer's bar holds "Leave computer" and "Open ordinary page" (`postMessage`).
- **Navigation:**
  - an entry per computer page;
  - `?computer=` links;
  - a redirect before paint for windows the lab doesn't open in.
- **The idle hint:** once, after 5 s without input, the screen and bezel brighten and dim over 2.2 s.

From `aabec24`:
- **The rightward look limit** is solved each frame, so the monitor's bezel stays inside the fit's 1.5% margin.
- Roomy windows keep about 0.16 rad. Tight ones get 0.06–0.08 rad.

This pass (each bug was reproduced before the fix; the "before" logs are kept):
1. **Motion off resets the scene** (`scene.ts` `onMotion`):
   - it ends the hint and drops its brightness;
   - it drops the pointer's camera offset;
   - it restores the normal screen light;
   - it renders the settled frame.
   - Before the fix, a hint or a pointer offset caught at the switch stayed in the still frame.
2. **The hint needs the whole screen in the window** (`screenShown()`: all four corners inside it).
   - It's still once only, and still never with reduced motion or Motion off.
   - Before the fix, it played with the monitor scrolled out of sight (`logs/hint-light-idle-before-fix.log`).
3. **Brightness: the comment above `SCREEN_LIT` is corrected.**
   - The screen's page is mostly dark, so on the whole it reads dimmer than the floor under the work light. The bezel's glow and the hover lift mark it out.
   - Nothing was raised. The visual judgment is under "Validation".
4. **Click versus drag with the look off** (reduced motion, Motion off, stacked windows):
   - A mouse or pen press that moves past 6 px is a drag.
   - Letting go over the monitor no longer enters, or jumps to `#work` (`logs/look-click-off-before-fix.log`).
5. **Scroll per history entry** (`computer.ts`).
   - Each entry now carries a key `k`. At `popstate` the scroll of the page being left is kept under that key.
   - Before the fix, Back then Forward lost it: Résumé at 900 px came back at 0.
6. **The computer's bar in narrow windows** (`Screen.astro`).
   - Below 56rem the name goes.
   - Below 44rem the places scroll inside the bar, "Open ordinary page" goes and "Leave computer" reads "Leave".
   - Before the fix, "Leave" was pushed out of the window at 390 px, with or without JavaScript.
7. **`Base.astro`:** the home page's `?sel=` redirect to `/systems/` is gated `home && !lab`, so it can't take the prototype to the dashboard.
8. **Harness fixes:**
   - `look-click-off.cjs` no longer expects `dragged === false` for a moved mouse press with the look off (item 4).
   - `navigation.cjs` check 6 waits for `commit` on Back: a back-forward cache restore fires no `load`.
   - `navigation.cjs` check 11 finds "Leave computer" by its `aria-label`: the button's text now has a no-break space before the part that narrow windows hide (item 6).
   - `shots.cjs` drops the unimplemented `FREEZE` line.

### Validation on the final build

- **Machine:** Apple M5 Pro (18 cores, 24 GB), Darwin 25.5.0.
- **Browser:** headless Chrome 153.0.8010.54 through Playwright, with WebGL through **ANGLE Metal on the GPU** ("ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)", printed at the top of each log).
- **Servers:** the branch's `npm run build` on :4322, and `origin/main` `cc1a6c4` built into a scratch copy on :4330.
- **Measured vs inferred:** everything below is measured unless it says otherwise.
- **Logs** are under `docs/evidence/lab-cinematic-2026-09-28/logs/`, and the scripts under `harness/`.
- **Reruns after the last source change** (the computer's bar, item 6): navigation, both click-versus-drag scripts, the idle hint and the Motion fallbacks were run again on the final build, and gave the results below. `look-click-limits` ran before it; that change doesn't touch the room's camera.

| Priority | Result | Log |
|---|---|---|
| Click versus drag | 18/18 with the look on. A click on the monitor enters, even with 4–5 px of movement. A drag doesn't enter: moved 8 px or more on the monitor, moved off it, or started in the room and let go over it. A drag that starts on a link doesn't turn the view. "Explore the lab" enters by click and by Tab + Enter, and a pen drags like a mouse. 11/11 with the look off (reduced motion, Motion off, the computer open, 1024×768, touch): a drag let go over the monitor doesn't enter or jump to `#work`, a click still enters, and touch scrolls the page at 390×844 and 1440×900. | `look-click-input.log`, `look-click-off.log` |
| Look limits | At 1280×800, 1440×900 and 1920×1080, eight drags each (four sides and the corners): the whole screen stays in the window. The nearest edge is 31.6 px (1440×900, full leftward drag). The view eases back to rest in 1.5–3.1 s. Drift over 50 s: pass, from the `aabec24` build (the look code is unchanged since). | `look-click-limits.log`, `look-click-drift*.log` |
| Direct entry and navigation | 11 checks × 2 runs, 276 assertions, 0 failures. They cover entries and addresses, Back/Forward with scroll per entry, "Leave computer", Escape (focus in the frame and outside it), reload, direct and invalid `?computer=` links, "Open ordinary page", the redirect for windows the lab doesn't open in, links out, the résumé PDF, copy-email, the back-forward cache (restored with `pageshow` persisted), resizing while reading, and the keyboard. The served pages were scanned for phone numbers (counts only): none found. | `navigation.log` |
| Motion | Switched off, it matches the pose of a page loaded with Motion off: one frame drawn in 2 s, then the loop stops. It persists across reloads, and both switches agree. A click or Enter on the switch during the hint takes the screen back to rest (`hint 0`). | `fallbacks-motion.log`, `hint-light-idle.log` |
| Idle hint | 42 PASS. It fires once. A press, key or drag stops or cancels it, and moves, the wheel and scroll only delay it. Never with reduced motion or Motion off (stored, or switched), and never with the computer open. Never while the monitor is out of the window. 2/2 with the screen's top 74 px above the window: no hint in 10 s. Scrolled back whole, it came on 5.0 s later, once. | `hint-light-idle.log`, `hint-light-partial.log` |
| Mobile and stacked | At 390×844 and 1024×768: no horizontal overflow, touch scrolls, and a tap on the monitor goes to `#work`. The computer's bar fits at 600 and 390 px. A 1440→1024→1440 resize while reading works (full mode, then back). | `fallbacks-phone.log` |
| Fallbacks | No WebGL: `data-failed`, the still, and "See the work" to `#work`; the only console errors are three.js's "could not create a WebGL context". No JavaScript: the still, all four sections shown, and "See the work" to `#work`. Save-Data: the scene isn't loaded until "Explore the lab", then it loads, draws and reaches reading in 2.4 s. | `fallbacks-nogl.log` |
| Live pages | 87 loads of the branch and the baseline at 390 and 1440, clean: no page errors, failed requests or console errors, apart from the aborted fonts and the expected 404 page. | `fallbacks-live.log` |
| Released pages against `cc1a6c4` | Built HTML bodies are equal on all 15 released pages. No released file mentions `/computer` or `/prototype`. | `release-diff-html.log` |
| | Pixels (full page, reduced motion) at 1440×900, 390×844 and 1024×768: of 32 page/size pairs, 31 identical and 1 capture noise. Computed styles are equal apart from `--text-2xl`, which the prototype's CSS defines. | `release-diff-pixels.log` |
| | Touch (390×844, `isMobile` + `hasTouch`): 14 of 15 identical. `/projects/cucadence/` was flagged at first by two max-1 regions inside `cadence-timeline.png`. With four captures a side, two baseline captures match all four candidate captures to the pixel, and the same regions differ between baseline captures: capture noise. | `release-diff-pixels-touch.log`, `release-diff-pixels-touch-cucadence.log` |

**The monitor's light, judged visually** (`hint-light-lighting.log`; the clips were reviewed and aren't committed):
- **Mean luma of the screen (0–255):**
  - 30.5 at rest;
  - 38.6 under the pointer;
  - 44.6 at the hint's peak;
  - 52.6 for both together.
- **For comparison:** the brightest same-size patch elsewhere in the window (text, bar, caption and monitor excluded) is 62. The screen doesn't beat it, and wasn't made to.
- **The judgment:** at rest the monitor clearly reads as a screen showing a page: the Work grid and its bar. The bezel's glow separates it from the desk. The peak is a gentle, visible swell, not a beacon.
- **Under the pointer:** every dark screen pixel lifts, by at least 5.9 luma. There's no z-fighting, and the cursor is `pointer`.

**Robots** (`robots-dance*.log`, from `7c60fea`'s scene; the dance code is unchanged since; report only, nothing fixed):
- **Ivory and the stand:** they intersect in 87 of 541 samples, up to 100 mm. It isn't obvious from the camera (visual judgment).
- **Graphite and Terracotta:** they intersect in 6 samples, up to 35 mm. It reads as a tap.
- **Graphite over "Contact":** Graphite's arm crosses the "Contact" link at 1440×900 for about 0.1 s (beats 15.45–15.57).
- **Terracotta's shimmy:** Terracotta doesn't face Ivory during the shimmy window its reaction is written for.
- **The reduced-motion still (beat 21.2):** Terracotta is mid-move there, at the 88th percentile of its loop's speed. Graphite is at the 5th and Ivory at the 52nd.

### Performance (real GPU: Apple M5 Pro, ANGLE Metal, headless Chrome 153.0.8010.54)

`harness/measure.cjs`: 5 s windows (the flights are their own length). The WebGL draw calls and `requestAnimationFrame` are wrapped from outside the page.

| State | 1440×900 @1x (buffer 1440×900) | 1440×900 @2x (1800×1125) | 1920×1080 @2x (2400×1350) |
|---|---|---|---|
| Opening, dancing | 60 fps; callbacks 1.9 / 2.7 ms (p50 / p95); 300 calls; 97,084 triangles | 60 fps; 2.0 / 2.9 ms | 60 fps; 2.3 / 3.1 ms; 303 calls; 98,016 triangles |
| Dragging to look | 60 fps; 1.6 / 2.4 ms | 60 fps; 1.9 / 2.9 ms | 60 fps; 2.2 / 3.0 ms |
| Flying in (1.9 s) | 59.5 fps; one 33 ms interval | 60.5 fps | 60 fps |
| Reading, first 3 s (robots easing to rest) | 18 frames/s drawn; 149 calls; 51,212 triangles | 17.3 frames/s | 17.7 frames/s; 155 calls |
| Reading, settled | 0 | 0 | 0 |
| Flying out (1.5 s) | 59.2 fps | 58.6 fps | 51.3 fps in the first run: one 200 ms interval. Then 117 ms in run 2 and none in run 3. |
| Motion off, and scrolled past the opening | 0 | 0 | 0 |

- **Reduced motion** (1440×900 @1x, `measure-1440x900-dpr1-reduced.log`):
  - Nothing is drawn in any window except the cuts in and out, one frame each.
  - Those frames count 600 and 450 draw calls: about two scenes' worth in one tick (inferred from the counts: the cut draws twice). Not investigated.
- **Frame intervals:** p50 16.7 ms and p95 ≤ 16.8 ms in every state.
- **Callback time** on the main thread: at most 6.4 ms, in any frame.
- **Budgets:**
  - 300–306 draw calls per frame, against the provisional ~450.
  - About 98k triangles.
  - The pixel ratio is capped at 1.25, so a 2x display gets 1.25x the buffer.
- **JS heap:** 10.5–25.5 MB.
- **Not measured:**
  - GPU time on the GPU (no timer query is exposed to pages).
  - GPU memory. Stopping the drawing doesn't release it: the renderer, buffers and textures stay allocated.
- **The fly-out interval at 1920×1080 @2x** (the three `measure-1920x1080-dpr2*.log`):
  - It was seen only under the measuring harness, which wraps every draw call: 2 of 3 runs.
  - A scratch probe (not committed) ran the same path ten times without the harness, five of them with the same look drag first: no interval over 25 ms after Escape.
  - The probe recorded no long animation frame (> 50 ms on the main thread).
  - Cause not established.

### Evidence

`docs/evidence/lab-cinematic-2026-09-28/`:
- **`screens/`:** 20 JPEGs, 2.1 MB in all, at 86% quality:
  - `opening-{1280x800,1440x900,1920x1080}`;
  - `look-{left,right,up,down}-1440x900`;
  - `reading-{work,about,resume,contact,case}-1440x900`;
  - `phone-{opening,page-work}-390x844`;
  - `stacked-{opening,page-work}-1024x768`;
  - `reduced-{opening,reading-work}-1440x900`.
- **`logs/`:** the runs above. The `*-before-fix.log` files show the bugs reproduced before the fixes. Local output paths in them are shortened to `<scratch>` and `<repo>`; the files they name (contact sheets, raw captures) aren't committed.
- **`harness/`:** the scripts. Playwright isn't a dependency.

No recording is committed.

### Known limitations

1. **Coverage.**
   - Headless Chrome on one Mac only.
   - No Safari, Firefox, Playwright WebKit, real phone or screen-reader pass.
   - The fallback font throughout, because the fonts were aborted.
2. **The redirect for windows the lab doesn't open in** is a client-side `location.replace` in the page body, because GitHub Pages can't redirect by query.
   - The `?computer=` document can paint once before it goes. This was seen once, at 1024×768 on `?computer=work/cucadence`, in an earlier navigation run.
   - It was then seen in 0 of 30 loads in a dedicated repeat, and in 0 of the 20 loads of the final run's check 7.
   - Accepted for the prototype.
3. **The computer's bar at 320 px:** the places scroll 32 px inside the bar.
4. **The robots:** the intersections and reactions above.
5. **The reduced-motion cut** draws about twice in one tick, and the 1920×1080 @2x fly-out has the interval above. Both are measured, and neither is explained.
6. **The back-forward cache** was exercised in Chrome only. Safari's differs.
7. **Carried over:**
   - The two `src/lib/build.ts` type errors: no Node types, because `@types/node` isn't installed (TS2307 and TS2580 with tsc 5.9.3, `logs/tsc.log`).
   - The existing chunk-size warning.

### Legacy to retire at the homepage cutover (retired in the checkpoint above)

- **Pages:** `src/pages/systems.astro` (`/systems/`) and `src/pages/systems/screen.astro` (`/systems/screen/`).
- **Components:** `Overview` → `Stage` → `MissionCanvas`, `SystemsMap`, `Inspector`, `Evidence`, and the released lab's `RobotStage` and `Panel`.
- **Scripts:** `rover-sim.ts`, `rover-render.ts`, the released `robot-scene.ts` and `lab.ts`, and `selection.ts` if nothing else uses it.
- **Data:** `site.ts`'s `mission` export and `skillAliases`, and what in `lib/model` serves only the map.
- **`Base.astro`:**
  - the `?sel=` home redirect to `/systems/`;
  - the nav's "Systems map" link;
  - the search entries (`onConsole`).
- **Links:**
  - `HomeSections.astro`'s systems-map links;
  - `CaseStudy.astro`'s `mapHref` and Connections links;
  - the command palette's Map group.
- **Text:**
  - the og:image alt ("A console-style card with an abstract systems map");
  - the stale comment in `CaseStudy.astro` that says the case study "stays on the systems map, one link away".
- **Redirects for existing links**, which GitHub Pages can't do server-side, so each would be a small static page with `location.replace`, a `<meta http-equiv="refresh">` and a canonical link:
  - `/systems/` and `/systems/screen/` → `/` (or `/#work`);
  - `/?sel=<id>` (and `/systems/?sel=<id>`) → the matching `/projects/<id>/` where the id is a project, else `/#work`.

### Commands (from the repository root)

```sh
npm run build                          # 42 pages
git diff --check
tsc --noEmit -p .                      # TypeScript isn't a dependency: only the two src/lib/build.ts errors (logs/tsc.log)
npm run preview -- --host 127.0.0.1 --port 4322

# Playwright isn't a dependency: NODE_PATH=<a directory with it>. Most scripts launch SwiftShader by default.
# For the GPU numbers above, the launch was pointed at ANGLE Metal on the Mac's GPU instead.
E=docs/evidence/lab-cinematic-2026-09-28; cd $E/harness
BASE=http://127.0.0.1:4322 EXT=jpg OUT=../screens W=1440x900 STEPS=hero,look,read,about,resume,contact,case node shots.cjs
BASE=http://127.0.0.1:4322/prototype/ W=1440x900 DPR=1 node measure.cjs     # also DPR=2, W=1920x1080, REDUCE=1
LOG=../logs/navigation.log BASE=http://127.0.0.1:4322 node navigation.cjs
node look-click-input.cjs; node look-click-off.cjs; node look-click-limits.cjs
LOG=../logs/hint-light-idle.log node hint-light-idle.cjs; node hint-light-partial.cjs
node fallbacks-motion.cjs; node fallbacks-phone.cjs; node fallbacks-nogl.cjs; node fallbacks-live.cjs
# Baseline: origin/main cc1a6c4 built into a scratch copy, served on :4330
DIST_A=<the baseline's dist> BASE_A=http://127.0.0.1:4330 BASE_B=http://127.0.0.1:4322 node release-diff-html.cjs
BASE_A=http://127.0.0.1:4330 BASE_B=http://127.0.0.1:4322 node release-diff-pixels.cjs   # TOUCH=1 JOBS='390x844:*' for touch
```

## Earlier checkpoint: computer-first prototype, `796f421` (Claude)

**Status: waiting for visual approval of the composition and the reading experience.** Nothing here is pushed, merged or deployed.

- **Branch:** `computer-first-prototype`, local only, from `origin/main` at `67f036f`. This pass is the commit that adds this section: `git log -1 -- docs/lab-scene-handoff.md`.
- **Brief:** "Handoff: Computer-first robotics portfolio prototype". One focused pass, stopping after the opening, the workstation view, a real project read in the monitor, and the mobile and reduced-motion presentations.
- **Where to look:**
  - `/prototype/` is the prototype. It's unlinked and `noindex`.
  - The monitor's pages are under `/computer/`: `/computer/`, `/computer/projects/<id>/` and `/computer/systems/`. Each is `noindex`, and its canonical link points at the ordinary page.
  - The released pages (`/`, `/projects/<id>/`, `/systems/`) and the released lab (`robot-scene.ts`, `lab.ts`, `RobotStage.astro`) are untouched. The release diff below shows it.
- **What to judge:** `docs/evidence/lab-prototype-2026-09-27/screens/`. Everything was rendered in software (below), with the fallback font, because Google Fonts is blocked here. Inter will set the text a little differently.

### What the prototype does

1. **The opening** (`screens/opening-{1280x800,1440x900,1920x1080}.jpg`).
   - The room fills the first view: an after-hours lab.
   - The name, role, "Explore the lab", Resume and Contact are a small block over its dark top-left corner.
   - The workstation is nearest at the left. Its monitor shows a drawn preview of the Portfolio home, made from the page's own data and cover images.
   - The three dancers are in the middle, with the workbench, the unfinished robot on its service stand, and the window beyond them.
   - "Explore the lab" and a click on the monitor both enter. There are no walking controls.
2. **The workstation** (`screens/desk-1440x900.jpg`).
   - "Explore the lab" flies the camera to about 2 m from the monitor, standing back and to its right. The monitor is large at the left and nearly square on; the dancers are beyond it.
   - The bar holds "Leave the lab", the title and pause/play. "Use the computer" sits under the monitor, and the monitor itself is clickable.
3. **Reading** (`screens/read-overview-1440x900.jpg`, `read-cucadence-1440x900.jpg`, `scrolled-read-cucadence-1440x900.jpg`).
   - The camera moves square on to the screen. The page is real HTML in a frame laid flat over it: 1123×702 px at 1440×900, focused and scrollable.
   - A strip of the room shows around it. The room dims behind the page, the robots come to rest, and the scene stops drawing.
   - The bar holds "Back to desk", the title "Portfolio", "Open ordinary page" (a new tab, at the page being read) and "Leave the lab".
   - The monitor's home is "Portfolio": the introduction, selected work, projects, experience, contact and résumé links, and a link to the systems map. A case study reads as it does on its own page.
4. **Phones and windows that can't hold the composition** (`screens/phone-*-390x844.jpg`, `stacked-*-1024x768.jpg`).
   - Under the release's `roomy` gate (`(width >= 64rem) and (height >= 36rem) and (min-aspect-ratio: 3/2)`), the opening stacks: the text, then a band of the room.
   - The entry reads "Selected work" and goes to the page's own sections below, at full width.
   - The lab doesn't open there.
5. **Reduced motion** (`screens/reduced-*-1440x900.jpg`).
   - The robots hold one still pose, beat 21.2 of the routine: each in character, with arms clear of the text. Pause/play reads "Play".
   - The camera cuts rather than flies, and a frame is drawn only when something changes.
6. **Below the opening** is the homepage's content (`HomeSections`), unchanged and visually secondary. It's the whole page for the stacked layouts, and for anyone who scrolls.

**Environment:**
- A concrete floor with the dance area taped out, a block wall with a high night window, and a workbench with a pegboard under a pendant.
- The unfinished robot on its service stand, a task chair rolled aside, and a tool cart (the two foreground props).
- The workstation: desk, monitor, keyboard, lamp, mug and notebook.
- Warm practical light (pendant, desk lamp, screen glow, and a tripod work light as the key, placed out of every view) with one cool accent, the moonlight through the window.
- Simple geometry throughout. The lens is fixed per view (34° opening, 40° workstation and reading) and never widened.

**Robots** (`scene.ts` `BUILDS`):
- **Graphite** is heavy and deliberate: the broadest build and a low stance. It sways at half time, bounces every other beat and arrives late on arm moves.
- **Ivory** is precise and curious: tall and long-necked. It snaps to each arm key, and looks around and tilts its head between moves.
- **Terracotta** is small and playful. It bounces twice a beat, hops its steps and throws its arms wide.
- **The unfinished robot** doesn't dance. It hangs on the service stand in bare aluminium and primer, with exposed joints, partial surfaces and a few construction lines.

### How the opening is framed (`fitHero()` in `scene.ts`)

- One lens. The camera dollies back to the nearest distance at which the room's fit points sit inside the frame's safe area.
- Then it looks for the smallest slide of the picture (up to 10% right and 5% down, off-centre projection) that lets it come nearest while keeping the dancers' heads and reach, and the monitor, clear of the text block, which `data-lab-avoid` marks.
- The distance is capped at 1.25× the unconstrained fit, so the room never shrinks far. A `ResizeObserver` on the text refits it when the web font arrives.
- Reach is approximated as a point 0.6 m to each robot's left, at head height (2.05 m). That is simpler than a sweep of the routine, and at 1280×800 it keeps graphite's raised arms off "Contact".

### Shared content: one source, two frames

- **Extracted, not copied:**
  - `src/components/HomeSections.astro` is the homepage's sections, moved out of `index.astro`.
  - `src/components/CaseStudy.astro` is a case study's body, moved out of `projects/[slug].astro`.
  - The ordinary pages now render these components. The systems map was already a component (`Overview.astro`).
- **The monitor's pages** (`src/pages/computer/`) render the same three components in `src/layouts/Screen.astro`. That layout has no site header, footer, tab bar, search, 3D opening or lab controller, only one slim "Portfolio" bar. No robot scene is ever inside the monitor.
- **`src/scripts/lab-prototype/computer.ts`** runs the lab: its states (`html[data-pc]`: fade, fly, desk, read, return), history, focus, Escape, and laying the frame on the screen. It is warped onto the screen quad at the workstation (inert) and flat while reading.
- **`src/scripts/lab-prototype/scene.ts`** is the room.
- **`src/components/LabStage.astro`** is the stage, the fallback still and the controls.
- Both scripts are forks of the released `lab.ts` and `robot-scene.ts`, which are left as they are.

### Temporary behaviour (documented at the top of `computer.ts` and `Screen.astro`)

- The lab takes one history entry at the same address. Back (or "Leave the lab") leaves it from either view, and moving between the workstation and reading adds no entry. Escape steps back one view: reading → workstation → out.
- Pages inside the monitor have no history of their own. A link to a page the computer has opens its `/computer/` version in the frame with `location.replace`. Same-page anchors scroll in place.
- Anything else leaves the frame for the top page (`<base target="_top">`). New-tab links keep their own target.
- A reload or a shared link opens the opening: no address names the lab or a page in it. A `/computer/` page opened on its own replaces itself with its ordinary page, keeping the query and hash.

**Validation list** (`harness/validate.cjs` → `logs/validate.log`, and `keys.cjs` → `logs/keys.log`; headless Chromium, 1440×900):

| Item | Behaviour | Checked here |
|---|---|---|
| History duplicates | One `{pc:true}` entry per visit. `history.length` stays 3 through desk ↔ read, moving between pages in the monitor, leaving and re-entering, and entering after Forward. | yes |
| Back / Forward | Back leaves the lab from either view and focuses the entry link. Forward returns to the lab's entry but doesn't reopen the lab; entering from there reuses the entry. | yes |
| Refresh | A reload while reading opens the opening; the entry's state is cleared, and no entry is added. | yes |
| Shareable URLs | The address stays `/prototype/` throughout. `/computer/`, `/computer/projects/cucadence/#objective` and `/computer/systems/?sel=…` opened on their own land on `/`, `/projects/cucadence/#objective` and `/systems/?sel=…`. | yes |
| Internal links | Monitor pages link only to pages the computer has: 0 same-origin links on the case study would leave the lab. | yes; a link that leaves via `_top` wasn't exercised, because none exist |
| External links | The repository link opens a new tab, and the lab stays open. | yes |
| Downloads | No `download` links on these pages. The résumé (PDF) opens a new tab and the lab stays. | partly: headless Chromium has no PDF viewer, so the tab's content wasn't observed |
| Clipboard | "Copy address" in the monitor writes the address and shows "Copied" (same-origin frame). | yes, with clipboard permission granted; not in Safari or Firefox |
| Focus and scroll restoration | Leaving restores the page's scroll (120 px in the test) and focuses the control that opened the lab. The monitor's page keeps its scroll between reading and the workstation (700 px). Re-entering starts at the overview's top (the frame is discarded on leaving). | yes |
| Loading | The frame loads on entry. Until it does, the monitor shows the drawn preview. With Save-Data the scene loads on the first entry, which waits for its first frame (at most 8 s) under a progress cursor. | Save-Data path yes (`logs/fallback.log`); slow networks not measured |
| bfcache | `pageshow` with `persisted` reconciles the lab with its entry. | not observed: in this run the page came back by a reload (to the opening), not from the cache. The cause wasn't established; Playwright's request routing, on in this context, may itself prevent caching. |

### Results on the final build

**Keyboard and history** (`logs/keys.log`):
- Tab reaches "Explore the lab". Enter goes to the workstation, with focus on "Use the computer". Enter on that goes to reading, with focus in the frame; Tab inside reaches "Portfolio".
- Escape goes to the workstation, then leaves, with focus back on the entry link.
- In again: cuCadence and back to the overview inside the monitor, then browser Back leaves.
- `history.length` is 3 from the first entry on (2 before it).

**Fallbacks** (`logs/fallback.log`, `screens/fallback-*.jpg`):
- **No JavaScript:** the release's still and "Selected work".
- **No WebGL:** `data-failed`, "Selected work", and the click goes down the page to `#work`.
- **Save-Data:** the scene isn't loaded until "Explore the lab". Then it loads, draws, and reaches the workstation.

**Performance** (`harness/measure.cjs` → `logs/measure-1440x900.log`, `logs/measure-reduced-1440x900.log`):
- **Hardware:** a cloud container with an Intel Xeon at 2.10 GHz (4 vCPU), 15 GB RAM and **no GPU**. Headless Chromium 141.0.7390.37, with WebGL through ANGLE on **SwiftShader, a CPU renderer**.
- **Not GPU numbers:** the frame rates below are this CPU's software rendering. They say nothing about frame rate on a real GPU, and none was available.
- **What is hardware-independent:** draw calls, triangles and buffer sizes, which are counted by wrapping WebGL's draw calls from outside the page, shadow pass included.

| State | Frames drawn per second (software) | Draw calls per drawn frame | Triangles per drawn frame |
|---|---|---|---|
| Opening, dancing | 2.0 | 312 | 100,600 |
| Workstation | 1.33 | 303 | 98,228 |
| Reading, first 6 s (robots easing to rest) | 1.5 | 168 median, 170 max | 57,814 median, 58,922 max |
| Reading, 6–12 s and 12–18 s | 0 | — | — |
| Opening, paused | 0 | — | — |
| Opening, scrolled out of view | 0 | — | — |
| Every state, reduced motion | 0 (frames are drawn only on a change, outside these windows) | — | — |

- **Budgets:**
  - At most 312 draw calls against the provisional ~450.
  - 6 lights against ≤ 6: pendant, desk lamp, screen glow, key, moon and hemisphere.
  - 1 shadow caster against 1: the key, with a 1024² map.
- **Buffer:** the canvas buffer is 1440×900 at DPR 1. The pixel ratio is capped at 1.25, so a 2x display gets 1800×1125; that wasn't measured.
- **JS heap:** 10.7–11.3 MB, from `performance.memory`.
- **GPU memory:** not measured. Pausing, reading and scrolling away stop drawing, but they don't release GPU memory: the renderer, buffers and textures stay allocated.
- **Easing at software frame rates:** the robots' ease to rest advances at most 0.1 s per frame, so at ~1.5 fps it takes about nine drawn frames rather than 0.9 s.
- **Found and fixed while measuring:** the workstation's frame could draw twice (606 calls). Landing re-rendered outside the animation loop in the same frame the loop drew. `resize()` now only re-aims the camera when the loop is running and the buffer wasn't resized. Before the fix, the out-of-loop draws at landing were traced to `settle()` → `resize()` → `render()`, which `setRect()` calls on landing. After it, there are none at flight or desk (a scratch trace, not committed), and the workstation's max is 303.

**Release pages against `67f036f`** (`harness/release-diff.cjs` → `logs/release-diff.log`, `logs/release-diff-pxstat.log`; full page, reduced motion, pixel by pixel):
- `/projects/cucadence/` and `/systems/` are identical at 1440×900 and 390×844.
- `/` differs only inside downscaled photos, by up to 9 per channel (mean about 1). Which photo differs changes from run to run.
- The same capture of the prototype build against itself differs by up to 18 in the same way, and the baseline against itself was identical in one run. So this is capture noise at the level of the build's own variation, not a change.
- The built HTML of `/` matches the baseline apart from asset hashes, one identical inline script's position, and the timeline's CSS now being inlined rather than in `index.css`: `HomeSections` is shared, so the bundler splits its CSS.
- The harness now loads every lazy image before capturing. An earlier run caught the claude-status card's lazy image loaded in one shot and not the other.

### Commands (from the repository root)

```sh
npm run build                     # exit 0: 29 pages (15 + /prototype/ + 13 /computer/ pages); the existing chunk-size warning (logs/build.log)
git diff --check                  # exit 0
/opt/node22/bin/tsc --noEmit -p . # TypeScript 6.0.2 (not a dependency): the same two src/lib/build.ts errors, none elsewhere (logs/tsc.log)
npm run preview -- --host 127.0.0.1 --port 4321 # every harness script's default BASE

# Playwright is not a dependency: NODE_PATH=$(npm root -g). The scripts launch SwiftShader.
E=docs/evidence/lab-prototype-2026-09-27
(cd $E && sh harness/screens.sh)                          # screens/, logs/screens.log
node $E/harness/measure.cjs; REDUCE=1 node $E/harness/measure.cjs
node $E/harness/keys.cjs; node $E/harness/validate.cjs
OUT=$E/screens node $E/harness/fallback.cjs
# Baseline: origin/main 67f036f built into a scratch copy, served with python3 -m http.server 4330
node $E/harness/release-diff.cjs; BASE_B=http://127.0.0.1:4330 node $E/harness/release-diff.cjs   # control
```

### Evidence

`docs/evidence/lab-prototype-2026-09-27/`:
- `screens/`: small JPEGs, named above.
- `logs/`: the runs above.
- `harness/`: the scripts, run on the final build.

No recording is committed. A 1280×800 walkthrough (opening → workstation → reading → cuCadence, scrolled → Escape twice) was recorded with Playwright and shared outside the repository. It's software-rendered, so its motion runs at 1–2 fps.

### Known limitations

1. **Software rendering only.**
   - No real GPU, phone, Safari, Firefox or screen-reader pass.
   - No axe pass on this prototype.
   - The fallback font throughout.
2. **The fallback still** (no JavaScript, no WebGL, and Save-Data before entry) is the release's robots-only illustration, not the lab.
3. **Temporary navigation**, as listed above:
   - The monitor has no history of its own.
   - A reload leaves the lab.
   - Forward doesn't reopen it.
   - A bfcache restore wasn't observed.
4. **Framing assumptions.**
   - Text clearance assumes 0.6 m of reach to each robot's left. A move that reaches further could still cross the text at some window size; only 1280×800, 1440×900 and 1920×1080 were looked at.
   - On the stacked layouts the room is a band under the text, not composed for those shapes.
5. **Carried over:**
   - The chunk-size warning.
   - The two `src/lib/build.ts` type errors.
   - A DPR change with no resize is unhandled.

### After approval (not started)

- Decide the production navigation from the validation list: history inside the monitor, deep links, and reload.
- Then fold the prototype into `/` in place of the released lab.
- Measure on real GPUs and phones.
- Replace the fallback still with the lab.
- Retire the forked `lab.ts` and `robot-scene.ts`, or the forks.

## Earlier checkpoint: release pass, `67f036f` (Claude)

- Branch: `robot-hero-integration`, continuing from `678c33e`. This pass is the commit that adds this section: `git log -1 -- docs/lab-scene-handoff.md`.
- Scope: the two issues in the release brief, lab framing on narrow and portrait windows and the phone controls, plus two bugs found while checking them (changes 3 and 5).
- Kept from the second pass: the smoother opening, the case study pages and the safe `probe-build.sh`.
- Out of scope, as before: robot personalities and the rough schematic robot ("Future art direction" below).

### Changes in this pass

1. **Lab framing: one fixed lens, and the reveal only on wide windows** (`src/scripts/robot-scene.ts`, `src/scripts/lab.ts`).
   - The second pass's lens widening is reverted: `measureReach()`, `LAB_SPILL` and `LAB_FOV_MAX` are gone. The lab lens is again a fixed 62° by the window's height, as at `cbfab9d`, and the screen still covers `labRect`, so the dashboard's frame and text are unchanged.
   - `roomy` in `lab.ts` adds `(min-aspect-ratio: 3/2)` to `(width >= 64rem) and (height >= 36rem)`. Windows narrower than 3:2 (4:3, 5:4, portrait tablets) get the ordinary full-width dashboard instead of the flight:
     - Enter the lab and a click on the monitor open the `/systems/` page.
     - A lab already open when the window is resized below 3:2 shows the map across the window, with the scene held (`data-lab-full`, as under 64rem before).
   - Why 3:2, from the sweep below:
     - From 3:2 the terracotta robot's head and torso stay in the picture through the whole loop; only a raised forearm leaves it at the height of a move (up to 149 px at 3:2, remaining issue 2).
     - Narrower, its body is cut by the window's edge: at 4:3, half of it at the widest.
2. **Phone and tablet opening: the caption and controls in a row under the picture** (`src/components/RobotStage.astro`, `src/styles/global.css`).
   - Under 64rem the figure is a grid:
     - The picture takes the first row, at least `--stage-h` tall: 13rem on phones, 16rem from 40rem, `clamp(16rem, 38svh, 24rem)` from 48rem.
     - Under it is one row: the caption on the left, Enter the lab and pause/play on the right.
   - The row is in the page's flow: not sticky, never over the robots. The scrim is confined to the picture. This replaces the second pass's sticky row.
   - Under 48rem, where the tab bar is fixed, the opening fills the first view down to 0.75rem above the bar when the text leaves room, and the picture takes the extra height. Where it doesn't, the opening runs on and the row scrolls into view like the rest of the page.
   - `robot-scene.ts` now frames the opening's robots in the picture's rect rather than the figure's, so the row under the picture doesn't shift them. From 64rem the two rects coincide.
3. **Regression found and fixed before committing.** The first build of change 2 left the picture 0 px tall on every stacked layout: the grid's `align-items: center` also centred the stage, whose children are all absolutely positioned.
   - Reproduced at 360×640 and 390×844: the picture measured 668–668 and 674–674 px (a scratch run before the fix; its output isn't in `logs/`), and the first view showed a dark band where the robots should be.
   - Fixed with `align-self: stretch` on the stage. The picture is now 208 px tall at both sizes (table below). `phonescroll.cjs` now fails a picture under 100 px.
4. **Harness** (`docs/evidence/lab-2026-09-27/harness/`):
   - `interact.cjs` has three new checks, now 28: at 1280×960 (4:3) an open lab shows the map at full width; Escape from there brings the opening's view back (change 5); and Enter the lab opens the `/systems/` page.
   - `phonescroll.cjs` is new. It checks that the row sits under the picture, measures its distance to the tab bar at the first view, and checks that each control is what a tap hits at every scroll position where its centre is between the bars. Then it taps pause/play and Enter the lab.
5. **Leaving the lab without the return flight left the camera on the monitor** (found in review, reproduced, fixed; `lab.ts` `close()`, `robot-scene.ts` `home()`).
   - `close()` flies home only when the lab can fly. Otherwise the scene stayed in its lab mode: the opening showed the monitor's screen close up instead of the robots, and the monitor no longer picked, until the lab was opened again or the page reloaded.
   - The 3:2 gate made this an ordinary path: open the lab at 1440×900, make the window 4:3, press Escape or Back. The same happened before this pass after a resize under 64rem, a browser-closed dialog, or a page restored from the back-forward cache.
   - Reproduced on the production build (`logs/close-without-flight-scratch.log`, `screens/bug-opening-after-leaving-at-4to3-before-fix.jpg`): the monitor picked at 14 grid points before the lab and at 0 after.
   - Now `close()` calls `scene.home()`, which sets the opening's view and re-measures whether or not it flew. After the fix: 12 points (the opening's camera drifts slowly by design), by Escape and by Back, from 1280×960, 900×700 and 1440×560 (`screens/opening-after-leaving-at-4to3-fixed.jpg`). The new `interact.cjs` check fails on the build before the fix and passes after.

### Environment and limits of this pass's checks

- **Local machine:** macOS 26.5.1 on Apple M5 Pro, with the installed Google Chrome (153.0.8010.54) through Playwright 1.63.0 (`channel: 'chrome'`, ANGLE on Metal, `--enable-gpu --ignore-gpu-blocklist`). This is real GPU rendering at 60 Hz, with real Inter.
- **Committed scripts and GPU:** the committed harness scripts launch SwiftShader. Here they ran through a local wrapper module that swapped in that Chrome and those flags; the wrapper is not committed.
- **Not run:**
  - WebKit: Playwright's WebKit isn't installed here, and it isn't Safari in any case.
  - Firefox, real phones and tablets, and screen readers.
- **Phone sizes are emulated windows** (2x, touch, mobile). A real phone's browser toolbars make its window shorter than the device's size, so where the row lands at the first view on a real phone was not measured.

### Commands run in this pass (from the repository root)

```sh
npm run build                 # exit 0: 15 pages; the existing chunk-size warning (logs/build.log)
git diff --check              # exit 0
$TSC --noEmit -p .            # TypeScript 5.9.3 from a scratch install (it isn't a dependency): the same two src/lib/build.ts errors (no Node types), none elsewhere (logs/tsc.log)
# No `astro check`: @astrojs/check isn't installed.

# Playwright isn't a dependency either: each `node` line needs NODE_PATH pointing at an install of it,
# e.g. NODE_PATH=$(npm root -g) with a global one. The committed scripts then launch SwiftShader.

# The production build was served with GitHub Pages' rules (a trailing-slash redirect, 404.html) on :4403, a scratch server;
# `npm run preview -- --host 127.0.0.1 --port 4321` and the scripts' default BASE work too.
H=docs/evidence/lab-2026-09-27/harness
BASE=http://127.0.0.1:4403 node $H/interact.cjs                                        # 28/28
BASE=http://127.0.0.1:4403 S=360x640,390x844,375x667,412x915,430x932,768x1024,844x390 node $H/phonescroll.cjs
RM=1 BASE=http://127.0.0.1:4403 S=360x640,390x844 node $H/phonescroll.cjs
BASE=http://127.0.0.1:4403 node $H/shots.cjs <out> mobile,reduced,nowebgl,pages   # logs/shots.log

# TEST-ONLY probe builds (mktemp copies outside the repository; removed afterwards):
DIST=$(sh $H/probe-build.sh 2>probe-build.log)
python3 -m http.server 4331 --bind 127.0.0.1 --directory "$DIST"
W=1024x768,1200x900,1260x900,1305x900,1350x900,1395x900,1440x900,1200x800,1280x800,1440x960,1512x982,1600x900,1920x1080,1280x1024 \
  T=34 STEP=0.5 node $H/labshot.cjs                                                     # logs/labsweep-fixed-lens.log
W=1350x900,1440x960,1512x982,1280x800,1440x900,1680x1050,1600x900,1920x1080,2560x1440 \
  T=17.2 STEP=0.02 node $H/labshot.cjs                                                  # logs/labsweep-fine.log
W=1024x768,1100x800,1200x800,1279x800,1280x800,1281x800,1360x800,1440x900,1600x900,1920x1080 T=34 STEP=0.5 node $H/sweep.cjs   # logs/opensweep.log
```

(Every `node` line ran with `NODE_PATH` set to the local wrapper, so on the GPU.)

- **The coarse lens sweep** used a probe build made before the aspect gate was added, so the lab still flew at every size. Its lens is the one committed.
- **The fine lens sweep** used a probe build of the final sources. The lab flies there only from 3:2, so it covers only those windows.
- **The opening sweep of `678c33e`** used a probe build made by hand, because `probe-build.sh` needs a git checkout: `git archive 678c33e src public astro.config.mjs package.json tsconfig.json` extracted into a scratch directory, `node_modules` linked, `probe.py` applied to `src/scripts/robot-scene.ts`, then `npx astro build`. It ran at 1024×768, 1280×800, 1440×900 and 1920×1080 only (`logs/opensweep-678c33e.log`).

**Scratch checks** (not committed; their output is kept in `logs/`):
- `interact-scratch.log`: 17 lab checks from an earlier pass, which overlap `interact.cjs`. They add pause/play with both toggles, the page's scroll held under the lab, reduced motion and a phone.
- `race-scratch.log`: Forward pressed just as the lab closes, 3 runs.
- `close-without-flight-scratch.log`: the change 5 repro, before and after the fix.
- `labsweep-fine-worst-scratch.log`: the moment of the terracotta robot's widest reach, for the `widest-reach` screenshots.
- `axe-overflow-scratch.log`:
  - axe (WCAG 2.2 AA tags) on the homepage, `/systems/` and `/projects/cucadence/` at 1440 and 390.
  - Horizontal overflow across all `/systems/?sel=` projects, card overlaps, the header, tab order, reduced motion and the Motion switch.
- `labcheck-gpu-scratch.log`:
  - axe inside the lab dialog and inside its frame.
  - Canvas sizes, frame rate, and GPU memory (Chrome's `gpu/angle/metal` allocator in a memory-infra dump) at 1440×900, 2x.

### Results reproduced in this pass

**Lab framing with the fixed lens, coarse** (`labshot.cjs`, probe build, robot bodies only, dance 0–34 s every 0.5 s; `logs/labsweep-fixed-lens.log`):
- Negative means past the window's right edge.
- "Terracotta in view" is the least share of its bounding box between the dashboard frame and the window's edge. It counts a raised arm.
- 0.5 s steps miss the brief peak of a move, so this table understates the reach. It is kept because it covers the windows under 3:2 that decided the gate; the fine table below replaces it from 3:2 up.

| Window | Aspect | Cream robot, closest to the right edge | Terracotta robot, closest to the right edge | Terracotta in view, least | Lab reveal |
|---|---|---|---|---|---|
| 1280×1024 | 1.25 | −138 px | −243 px | 35% | no: the `/systems/` page |
| 1024×768 | 1.33 | −73 | −151 | 50 | no |
| 1200×900 | 1.33 | −85 | −176 | 50 | no |
| 1260×900 | 1.40 | −56 | −145 | 60 | no |
| 1305×900 | 1.45 | −34 | −122 | 68 | no |
| 1200×800 | 1.50 | −9 | −87 | 75 | yes |
| 1350×900 | 1.50 | −11 | −98 | 75 | yes |
| 1440×960 | 1.50 | −12 | −105 | 75 | yes |
| 1512×982 | 1.54 | +8 | −87 | 80 | yes |
| 1395×900 | 1.55 | +13 | −74 | 81 | yes |
| 1280×800 | 1.60 | +32 | −44 | 88 | yes |
| 1440×900 | 1.60 | +35 | −50 | 87 | yes |
| 1600×900 | 1.78 | +120 | +37 | 91 | yes |
| 1920×1080 | 1.78 | +144 | +45 | 91 | yes |

- **The lens matches `cbfab9d`'s.** At 1024×768, 1280×800, 1440×900, 1920×1080 and 1280×1024 the terracotta robot's figures equal `cbfab9d`'s in the second pass's table (−151, −44, −50, +45, −243).

**Lab framing, fine** (one full loop of the dance, 0–17.2 s every 0.02 s; `logs/labsweep-fine.log`). The dance repeats every 32 beats at 112 BPM (17.14 s), and the robots' poses depend only on the beat:

| Window | Aspect | Cream robot, closest to the right edge | Terracotta robot, closest to the right edge | Terracotta in view, least |
|---|---|---|---|---|
| 1350×900 | 1.50 | −63 px | −139 px | 64% |
| 1440×960 | 1.50 | −67 | −149 | 64 |
| 1512×982 | 1.54 | −49 | −132 | 69 |
| 1280×800 | 1.60 | −15 | −81 | 77 |
| 1440×900 | 1.60 | −17 | −92 | 77 |
| 1680×1050 | 1.60 | −20 | −107 | 77 |
| 1600×900 | 1.78 | +66 | −5 | 89 |
| 1920×1080 | 1.78 | +80 | −6 | 89 |
| 2560×1440 | 1.78 | +17 | −94 | 73 |

- The terracotta robot's widest reach is at 5.56 s in the loop, with both arms up (`logs/labsweep-fine-worst-scratch.log`). At that moment its head and torso are in the picture and only the raised forearm crosses the edge: `screens/lab-1350x900-3to2-widest-reach.jpg`, `screens/lab-1440x900-widest-reach.jpg`, `screens/lab-2560x1440-widest-reach.jpg`.
- The cream robot stands mostly behind the monitor. What crosses the edge is the far end of its box, a raised arm; its own worst moment wasn't screenshotted.
- 2560×1440 reaches further than 1920×1080: the dashboard's frame takes a larger share of that window, which moves the robots toward its edge.
- The first version of this section quoted 125 px at 1350×900 and 77 px at 1440×900 at 22.75 s, and had 16:9 inside the edge. Those came from coarser sampling; review caught it.
- `screens/lab-1024x768-fixed-lens-probe-not-shown.jpg` shows what a 4:3 window would get with this lens (the terracotta robot halved). Visitors at 4:3 get the `/systems/` page instead.

**Desktop opening unchanged** (`sweep.cjs`, 69 samples per size; `logs/opensweep.log`, `logs/opensweep-678c33e.log`). At 1024×768, 1280×800, 1440×900 and 1920×1080, this pass and `678c33e` measure the same:
- desk ↔ text: 56, 124, 169 and 296 px.
- robots ↔ text: 166, 242, 259 and 408 px.
- robots ↔ canvas edge: 29, 32, 34 and 44 px.

The second pass's table has 8 px less desk ↔ text at every size (48 px at 1024). That pass ran with a wider fallback font, and its robot ↔ edge figures are identical to these. Screenshot: `screens/opening-1440x900.jpg`.

**Phone and tablet opening** (`phonescroll.cjs`, production build; `logs/phonescroll.log`, `logs/phonescroll-reduced-motion.log`). All figures are px from the top of the first view.

| Window | Picture | Row | Tab bar top | First view | Control positions between the bars / not hittable |
|---|---|---|---|---|---|
| 360×640 | 564–772 | 777–832 | 584 | the picture starts just above the bar; the row is below the fold | 66 / 0 |
| 375×667 | 567–775 | 779–834 | 611 | as at 360×640 | 68 / 0 |
| 390×844 | 570–778 | 782–837 | 788 | the picture ends 10 px above the bar; the row is under the bar | 92 / 0 |
| 412×915 | 576–784 | 788–843 | 859 | the row ends 16 px above the bar | 96 / 0 |
| 430×932 | 581–800 | 805–859 | 876 | 17 px above the bar | 98 / 0 |
| 768×1024 | 575–959 | 969–1013 | (no bar) | 11 px above the window's foot | 118 / 0 |
| 844×390 | 590–846 | 856–900 | (no bar) | below the fold | 36 / 0 |

- The row is under the picture at every size and every scroll position.
- The scroll pass steps 16 px from the top to two screens down. Wherever a control's centre was between the top bar and the tab bar, a tap there hit that control.
- At every size, pause/play was tapped twice (the state flipped and flipped back) and Enter the lab once (it opened `/systems/`), with no page or console errors.
- **Reduced motion** (360×640 and 390×844): the same geometry, and the scene starts paused with Play offered.
- Screenshots:
  - `screens/phone-390x844-first-view.jpg`
  - `screens/phone-412x915-first-view.jpg`
  - `screens/phone-360x640-row-scrolled-in.jpg`
  - `screens/phone-390x844-row-reduced-motion.jpg`

**Interactions** (production build):
- **`interact.cjs`: 28/28** (`logs/interact.log`, the final build). Covered:
  - Enter the lab by the link and by the monitor, the frame's console, selection, and Expand dashboard.
  - Escape in the frame and on the dialog, Back and Forward (including mid-flight), and focus returned to Enter the lab.
  - Back to portfolio, a case study opened from the frame and Back from it, refresh in the lab, and the `/systems/screen/` redirect.
  - Resizing while open, and the three 4:3 checks, including the opening's view after leaving without the flight.
  - No page or console errors.
- **Scratch:** 17/17, and 0 of 3 runs failed the Forward race.

**Accessibility, layout and GPU:**
- axe found no violations:
  - on the homepage, `/systems/` and `/projects/cucadence/` at 1440 and 390;
  - inside the lab dialog and its frame at 1440.
- No horizontal overflow and no card overlaps at 1440, 1024, 768 and 390.
- Reduced motion at 1440 and 390: nothing is drawn until Play, and Enter the lab opens `/systems/`.
- No WebGL (`shots.cjs`, `logs/shots.log`):
  - At 1024, 1440 and 390 the still illustration stands in, in the picture, and pause/play is hidden.
  - Enter the lab opens `/systems/`: checked at 1440 only.
- `shots.cjs` pages at 1440 and 390 (the homepage, a case study, `/systems/?sel=` and the 404 page): Inter throughout, and the scroll width equals the window.
- GPU at 1440×900, 2x:
  - Canvas 1382×1267 on the opening and 1800×1125 in the lab (`LAB_RATIO` 1.25).
  - GPU memory 251 MB → 322 MB when the lab opens.
  - 60 Hz in both.
- These GPU figures are from one machine; they aren't a benchmark.

### Evidence

- `docs/evidence/lab-2026-09-27-pass3/`: `screens/` (small JPEGs named above) and `logs/` (the runs above).
- The harness stays in `docs/evidence/lab-2026-09-27/harness/`.

### Remaining issues

1. **No lab reveal below 3:2.** 4:3, 5:4 and portrait windows get the dashboard page. This is the deliberate fallback the brief allowed. A composition staged for them, such as the robots below or beside the frame, is art direction and was not attempted.
2. **The terracotta robot's raised forearm leaves the picture** at the height of one move (5.56 s into each 17 s loop), at every window the lab flies in. By up to 149 px at 3:2, 81–107 px at 16:10, 5–6 px at 1600×900 and 1920×1080, and 94 px at 2560×1440. Its head and torso stay in. The cream robot's raised arm also crosses, by up to 67 px at 3:2. Pulling the robots in means changing the lens, the frame or the staging; the brief ruled out widening the lens.
3. **Phone first view at some heights.** Where the text leaves the picture only its minimum height, the row lands wherever the text puts it. At some window heights that is partly behind the tab bar, or close above it, at the first view.
   - At 390 wide in the emulator the row is partly behind the bar from about 840 to 890 px tall, and less than 12 px above it from about 890 to 905. At 390×844 only the row's empty top padding shows above the bar.
   - The no-WebGL fallback's text runs a little shorter, so at 390×844 its caption and the top of Enter the lab show above the bar, cut by it (`screens/phone-390x844-no-webgl-first-view.jpg`).
   - From about 910 px tall the opening fits, and the row ends 0.75rem above the bar.
   - The row scrolls out from behind the bar normally, and it was hittable at every position where its centre was clear of the bars.
   - It was not measured on real phones, whose toolbars change the window's height.
4. **A darker band behind the row on stacked layouts** (found in review, not changed). The picture's scrim fades to the page colour (`--bg`, #131211) at its foot, but the row under it sits on the opening's darker background (#0a0908), and the page below is `--bg` again. So the row reads as a slightly darker strip with an edge above and below (`screens/phone-360x640-row-scrolled-in.jpg`). It's cosmetic; a fix would give the row the page colour or carry the fade through the row, then re-run `phonescroll.cjs` and the screenshots.
5. **Coverage.** Not run: WebKit or Safari, Firefox, real phones and tablets, screen readers, and `astro check`. The second pass's case study redesign now has an axe pass (one page, 1440 and 390), but no screen reader pass.
6. **Carried over from earlier passes:**
   - Moving between displays (a DPR change with no resize) isn't handled.
   - Stale metadata.
   - The chunk-size warning.
   - The two `src/lib/build.ts` type errors (no `@types/node`).
- Superseded from the second pass: its remaining issues 2 and 3 (the lens tradeoff on 4:3, 5:4 and portrait windows, which no longer fly) and 4 (the sticky row, which is gone).

## Earlier checkpoint: second polish pass, `678c33e` (Claude)

Superseded in part by the release pass above: its lens widening (change 2) was reverted, and its sticky phone row (change 4) replaced.

- Branch: `robot-hero-integration`, continuing from `cbfab9d`. This pass is the commit that adds this section: `git log -1 -- docs/lab-scene-handoff.md`.
- Committed locally only. Nothing was pushed, merged or deployed; no branch was deleted or rewritten.
- Scope: five fixes, listed below. The opening composition from `cbfab9d` is kept: at 1024 and at 1440 and up its framing is exactly as before. No framework or dependency changes, and no new models, choreography or robots.

### Changes in this pass

1. **`probe-build.sh` is safe to run.** It used to `rm -rf` `src`, `public` and `dist` under `$WORK`, a path taken from the environment and never checked. Now:
   - Each run copies the sources into a new `mktemp -d` directory (`$TMPDIR/lab-probe.XXXXXX`) and builds there. It deletes nothing and never writes to the repository.
   - It checks that it is in a checkout with `node_modules`, and keeps the copy if the build fails.
   - It prints only the built site's path on stdout; the build log goes to stderr. Usage is under "Commands".
2. **Lab reveal at 1024** (`src/scripts/robot-scene.ts`, `labView()` and `measureReach()`). The dashboard's frame (`labRect`, `src/scripts/lab.ts`) is unchanged, so the map is as readable as before; only the lens changes.
   - The lab lens is still 62° by the window's height (`LAB_FOV`). The first time the lab opens, the scene measures each dancer's widest reach right of the monitor over the whole routine (every eighth of a beat).
   - Where that reach would cross the window's right edge by more than a tenth of the window's height (`LAB_SPILL`), the lens widens just enough, to at most 90° (`LAB_FOV_MAX`). The camera stays square on to the monitor and comes closer, so the screen still covers `labRect` and the robots beyond it stand smaller.
   - The spill is deliberate. Keeping every reach inside the window (tried first, with a 24 px margin) needs a lens so wide that the cream robot, which stands closest behind the monitor, drops behind it even at 1440: 36% of it right of the frame at rest, against 68% before (`logs/labsweep-after2.log`).
   - With the spill, 1920×1080 is exactly as before, and 1280×800 and 1440×900 are within about 1%. 4:3, 5:4 and portrait windows change.
   - The cost where it changes: the closer camera hides more of the cream robot behind the monitor. At 1024×768 and 1280×1024 the terracotta robot now stays in the picture, but the cream robot shows less than before (the lab table below, and remaining issue 2). This is a tradeoff, not a clean fix.
   - The opening is untouched: this lens is used only in the lab.
3. **The opening's framing across 1280** (`src/styles/global.css`). The step at 80rem is gone:
   - `--scene-shift` and `--scene-usable` now ease linearly from their 1024 values (0.31, 0.35) to their full-size values (0.30, 0.38) between 1024 and 1440 px.
   - `--scene-ease` is `clamp(0, (tan(atan2(100vw, 1px)) - 1024) / 416, 1)`: `tan(atan2())` turns `100vw` into a plain number.
   - The two properties are registered with `@property` as `<number>`, so `getComputedStyle` hands `robot-scene.ts` plain numbers even though they are `calc()`s.
   - Where a browser can't resolve them, `robot-scene.ts` falls back to the wide values (0.3, 0.38) instead of `NaN`.
4. **Phone first view** (`global.css`, `src/components/RobotStage.astro`). Under 48rem, where the bottom tab bar (3.5rem) is fixed:
   - The opening fills the first view above the bar (`100svh` minus the bar and the safe area), and the stage takes the height the text leaves, with a minimum (13rem, 16rem from 40rem).
   - The caption, Enter the lab and pause/play form one row at the stage's foot. The row is sticky at the bar's height plus 0.625rem, so it rides above the bar whenever the stage runs on under it.
   - On phones pause/play is an icon button (with its aria-label), and the caption is a size smaller with its note underneath.
   - On screens 30rem tall or less the tab bar already scrolls with the page, so none of this applies there.
5. **Case study pages** (`src/pages/projects/[slug].astro`, `src/layouts/Base.astro`). They now read like the homepage they open from:
   - `Base` has a `story` mode: the homepage's header (mark, Work, Experience, Contact, Systems map, search, Resume) and footer (©, Systems map, Motion, build, Source), linking back to the homepage. There is no rail, breadcrumb bar or status bar. Work is marked current, and the phone tab bar is unchanged.
   - The page has a title band in the opening's warm dark:
     - "All projects" back link.
     - Status, code, date, context and Featured on one line.
     - A large title and the summary.
     - Live demo or Repository, and Show on map.
     - The stats on one rule, as many columns as there are stats (no empty cell).
   - The write-up follows with its cover in a quiet well.
   - Beside it (below it on phones) is a plain column with no panels:
     - **Details**: started, context, team, source and tags.
     - **Connections**: the systems-map links, grouped as before, and the projects sharing the most tags.
   - Previous and next projects close the page.
   - Removed: the "Project object" kicker, the ID and Type rows, the Properties and Linked objects panels, and the Write-up panel's chrome.
   - Kept: every fact from those panels, every link, and the cover.
   - `/systems/` (the detailed dashboard) and the 404 page keep the console chrome, unchanged.

### Correction to the first pass

The first pass put the 1024 lab crop down to the smaller desk (`DESK.scale = 0.72`): "the camera sits closer and the robots read larger". Measured this pass on `cbfab9d`'s probe build, with robot bodies only (`labshot.cjs` with `DESKS`, 0–34 s; `logs/labsweep-desks-before.log`), that is mostly wrong:
- At scale 1 (the b862891 desk) the terracotta robot's reach already crossed the window's right edge at 1024×768, by 120 px. At 0.72 it crosses by 151 px.
- The robots are only 2–6% taller at 0.72.
- The cause is the window's aspect. The lens is set by the height, and a 4:3 window leaves only about 266 px right of the frame at 1024×768. The fix is therefore in the lens (change 2), and the desk scale stays.

### Environment and limits of this pass's checks

Same container and limits as the first pass (below):
- Headless Chromium 141 on SwiftShader at 2–3 fps; nothing here is real-GPU performance.
- Google Fonts blocked, so screenshots use a wider fallback face.
- Playwright 1.56.1 as a global install.

In addition:
- Case study and phone layouts were checked only with that fallback face. Real Inter is narrower, so wrapping will differ slightly; the phone caption row was sized with that margin in mind but not measured with Inter.
- The `@property` / `tan(atan2())` path was run in Chromium only. Safari 16.4+ and Firefox 128+ support both, but they were not run here. Older browsers get the fallback described in change 3.

### Commands run in this pass (from the repository root)

```sh
npm run build                         # exit 0: 15 pages; the existing chunk-size warning
git diff --check                      # exit 0; git diff --cached --check also exit 0 before committing
/opt/node22/bin/tsc --noEmit -p .     # exit 2: the same two src/lib/build.ts errors as before, none elsewhere
npm run preview -- --host 127.0.0.1 --port 4321

H=docs/evidence/lab-2026-09-27/harness
NODE_PATH=$(npm root -g) node $H/interact.cjs                       # 25/25 on this pass's build and on cbfab9d's, after two harness fixes
NODE_PATH=$(npm root -g) node $H/shots.cjs <out> open,lab,mobile,reduced,nowebgl,pages
NODE_PATH=$(npm root -g) node $H/phone.cjs                          # new: phone first view vs the tab bar
RM=1 S=360x640,375x667,390x844,412x915 NODE_PATH=$(npm root -g) node $H/phone.cjs

# TEST-ONLY probe build: a fresh mktemp copy outside the repository. Never deploy it.
DIST=$(sh $H/probe-build.sh 2>probe-build.log)
python3 -m http.server 4331 --bind 127.0.0.1 --directory "$DIST"
W=1024x768,1100x800,1200x800,1279x800,1280x800,1281x800,1360x800,1440x900,1600x900,1920x1080 \
  T=34 STEP=0.5 NODE_PATH=$(npm root -g) node $H/sweep.cjs
W=1024x768,1280x800,1440x900,1920x1080,1280x1024,1024x1366 T=34 STEP=0.5 \
  NODE_PATH=$(npm root -g) node $H/labshot.cjs
DESKS='-0.6,3.6,0.4,1;-0.6,3.6,0.4,0.72' W=1024x768 T=34 STEP=0.5 \
  NODE_PATH=$(npm root -g) node $H/labshot.cjs      # on cbfab9d's probe build: the desk-scale correction
rm -r "$(dirname "$DIST")"
```

The "before" numbers come from the same harness against `cbfab9d`:
- A probe build of the `cbfab9d` sources, made with this pass's `probe-build.sh` and `probe.py` before any source edit, for body-only bounds. Checked: its `global.css`, `RobotStage.astro`, `Base.astro` and `lab.ts` match `cbfab9d`, and its `robot-scene.ts` is `cbfab9d`'s plus the probe.
- A production build (`npm run build`) of `cbfab9d`, taken before editing and served with `python3 -m http.server`, for screenshots, phone geometry and the interaction checks.

Probe changes:
- `__bounds()` now measures each robot's body, not its soft floor shadows (transparent meshes).
- `__reach(D)` reports the body point furthest right of the monitor.
- `labShot` with `T` sweeps the dance in the lab.
- `phone.cjs` is new.
- `interact.cjs`: the `data-lab` trace records every change, and the resize steps wait for the state they expect (see "Interactions and fallbacks").

### Results reproduced in this pass

**Opening composition** (`sweep.cjs`, probe builds, dance and camera drift 0–34 s every 0.5 s: two loops of the routine, 69 samples per size; `logs/opensweep-before.log`, `logs/opensweep-after.log`). The minimum horizontal gap between the desk and the introduction's text and links:

| Window | `cbfab9d` | This pass |
|---|---|---|
| 1024×768 | 48 px | 48 px |
| 1100×800 | 81 | 73 |
| 1200×800 | 120 | 99 |
| 1279×800 | 150 | 116 |
| **1280×800** | **94** | **116** |
| 1281×800 | 95 | 117 |
| 1360×800 | 116 | 129 |
| 1440×900 | 161 | 161 |
| 1600×900 | 204 | 204 |
| 1920×1080 | 288 | 288 |

- The 150 → 94 px jump at 1279 → 1280 is gone; the clearance now rises steadily with the width.
- Between 1100 and 1279 the picture is a little larger than before, so the gap is smaller, but never below 1024's 48 px.
- Robots ↔ text is at least 148 px at every size.
- Robots ↔ window edge is at least 29 px (body only) at every size, both before and after.
- Screenshots: `screens/opening-1279-1280-before.jpg` and `screens/opening-1279-1280-after.jpg`.

**Lab framing** (`labshot.cjs`, probe builds of `cbfab9d` and of this pass, robot bodies only).
- Robot 1 stands furthest back, robot 2 is the cream robot and robot 3 the terracotta robot.
- "Right of the frame" is the share of a robot's on-screen bounding box that lies right of the dashboard frame's right edge. It ignores the monitor's bezel and counts a raised arm, so it overstates how much of a robot reads.
- The resting shares are one moment after landing, and vary by a few points between runs.
- The dancing columns sweep 0–34 s every 0.5 s. The lens itself samples the whole routine every eighth of a beat. That is why 1280×800 and 1440×900 change slightly although this sweep stays within the spill there: over 0–95 s, `cbfab9d` crossed by 81 and 91 px (`logs/labsweep-body-before.log`).

| Window | Right of the frame at rest, robots 1/2/3 | Terracotta robot's closest approach to the right edge while dancing | Cream robot's least share right of the frame while dancing | Cream robot's greatest height |
|---|---|---|---|---|
| 1024×768 | 0/90/58% → 0/70/100% | −151 → −41 px | 57% → 38% | 510 → 441 px |
| 1280×800 | 0/59/100 → 0/51/100 | −44 → −36 | 37 → 36 | 547 → 542 |
| 1440×900 | 0/63/100 → 0/67/100 | −50 → −41 | 37 → 36 | 616 → 610 |
| 1920×1080 | 0/35/100 → 0/35/100 | +45 → +45 | 22 → 22 | 750 → 750 |
| 1280×1024 | 0/96/38 → 0/71/100 | −243 → −58 | 56 → 39 | 673 → 555 |
| 1024×1366 | 6/21/0 → 0/96/37 | −623 → −197 | 20 → 56 | 804 → 539 |

Each cell is `cbfab9d` → this pass (`logs/labsweep-before.log`, `logs/labsweep-after.log`).
- Negative means crossing the right edge. The allowed spill is a tenth of the height: 77 px at 1024×768, 102 px at 1280×1024.
- At 1024×1366 the lens reaches its 90° cap first (remaining issue 3).
- Robot 1 stands behind the monitor at every size, as before.
- The dashboard frame is the same in both builds at every size, so its text is unchanged; for example 26,183 to 758,641 at 1024×768.

Screenshots:
- Production builds (`shots.cjs`, a moment after landing): `screens/lab-1024-before.jpg` and `lab-1024-after.jpg`, and `lab-1440-before.jpg` and `lab-1440-after.jpg`.
  - At 1024, before: the terracotta robot reaches the window's right edge and the cream robot stands clear of the monitor.
  - At 1024, after: the terracotta robot is whole, and the cream robot shows little more than a shoulder and an arm beside the bezel.
  - At 1440 the two are nearly identical.
- From the probe sweep: `screens/lab-1280x1024-before-after.jpg` and `screens/lab-1024x1366-before-after.jpg`.

**Phone first view** (`phone.cjs`, production builds, 2x, touch; `logs/phone-before.log`, `logs/phone-after.log`, `logs/phone-after-reduced-motion.log`). Before, at `cbfab9d`:
- 390×844: the caption was 29 px under the tab bar, and Enter the lab 33 px under it.
- 375×667: pause/play was 6 px under it.

After, the caption, Enter the lab and pause/play are clear of the bar at every size tried:
- **Stage fills to the bar, row just above it:** 390×844, 393×852, 412×915, 430×932, 700×900.
- **Row lifted above the bar, over the robots' feet:** 360×740, 375×812, 414×736. The stage runs on under the bar there.
- **Short phones:** at 375×667 the row sits in the first view's last 44 px.
- **360×640:** the stage starts under the bar (below the fold). As the page scrolls it in, the row comes out from under the bar like any content: 40 px down it is still 10–19 px under. From about 80 px down it is held clear above the bar (`logs/phone-scroll-360x640.log`, a one-off measurement).
- **768×1024:** no tab bar.
- **Reduced motion** (`RM=1`, 360×640 to 412×915): the same geometry.
- Screenshots: `screens/phone-390x844-before-after.jpg` and `screens/phone-375x667-before-after.jpg`.

**Case study pages** (`/projects/smart-bin/`, `/projects/fluxion/`, `/projects/cucadence/`; 1440×900, 1024×768, 768×1024, 390×844):
- No horizontal overflow at any size.
- `shots.cjs` pages, at 1440 and 390: the case study has the homepage's header (56 px). `/systems/` and the 404 page keep the console bar (48 px).
- Screenshots: `screens/case-study-1440-before-after.jpg` (the first view) and `screens/case-study-390-after.jpg` (the full page).

**Interactions and fallbacks** (production build):
- **`interact.cjs`: 25/25** on this pass's build and 25/25 on `cbfab9d`'s, both with the harness as committed (`logs/interact-after.log`, `logs/interact-before.log`).
  - Covered: Enter the lab (the link and the monitor), the frame's shared console, selecting in the frame, and Expand dashboard.
  - Also `/systems/?sel=`, Escape, Back and Forward (including mid-flight), focus return, refresh in the lab, a case study opened from the frame, and resizing while open.
  - No page or console errors.
- **Before two harness fixes, it failed on both builds.** It gave 23/25 and 24/25 on this pass's build and 24/25 on `cbfab9d`'s (`logs/interact-unfixed-*.log`; the first pass had reported 25/25). The two checks at fault were in the harness, not the builds:
  - **"Back during the flight in"** failed in every run on both builds. When Back arrives mid-flight, `lab.ts` sets `data-lab="open"` on landing and, in the same task, closes and sets `return`. The trace recorded one value per observer callback, so it never saw `open`.
    - It passed in the first pass only because that flight landed 26 ms after it began (apparently after a stalled frame), before Back arrived.
    - The trace now records every change; the assertion is unchanged. The log now reads, for example, `open@23445 return@23445` (`logs/interact-tracefix-*.log` is the run with only this fix).
  - **"…and back to 1440"** failed in some runs on both builds. The check read the state a fixed 800 ms after the resize, and under software rendering the resize event itself arrived up to 1.3 s late. Relayout runs in the same task as that event (`logs/resize-timing.log`, a one-off measurement).
    - Both resize steps now wait up to 10 s for the state they expect, then check it.
- **`shots.cjs`** (production build, `logs/shots-after.log`):
  - **Reduced motion** at 1440 and 390: the scene isn't drawn until asked ("Play the robot animation" is offered), and Enter the lab goes straight to `/systems/` with no flight.
  - **No WebGL** at 1024, 1440 and 390: the still image stands in and pause/play is hidden. Enter the lab goes to `/systems/`.
  - **At 390:** no horizontal overflow on the opening, and Enter the lab loads the `/systems/` page (no lab dialog).
  - **Pages** at 1440 and 390: the scroll width equals the window on the homepage, a case study, `/systems/?sel=` and the 404 page.

### Evidence

- In `docs/evidence/lab-2026-09-27-pass2/`:
  - `screens/`: the JPEGs named above.
  - `logs/`: raw output of each run above, before and after, including the build (`build-final.log`) and the screenshot runs (`shots-*.log`).
- The harness stays in `docs/evidence/lab-2026-09-27/harness/`.

### Remaining issues

1. **Real-GPU check.** As in the first pass: GPU memory, frame pacing and the 1.25 lab backdrop were not measured on real hardware.
2. **Lab on 4:3 and 5:4 windows: a tradeoff, not a clean fix.** At 1024×768 and 1280×1024 the terracotta robot now stays in the picture. At the routine's widest a hand still leaves it, by up to 41 and 58 px in the 0–34 s sweep, within the allowed spill.
   - The cost is the cream robot. It stands closest behind the monitor, and the closer camera hides more of it. At rest it shows little more than a shoulder and an arm.
   - Its least share right of the frame while dancing fell from 57% to 38% at 1024×768, and from 56% to 39% at 1280×1024.
   - Making all three robots read at 4:3 needs them staged differently in the lab: closer together, or further right of the monitor. That is art direction, not framing, and was not done.
   - `LAB_SPILL` is the dial between the two:
     - About 0.25 gives back roughly `cbfab9d`'s framing at 1024×768, whose reach crossed the edge by up to 184 px (0.24 of the height, 0–95 s): more of the cream robot, and the terracotta robot cropped.
     - 0 or below hides the cream robot further.
3. **Portrait tablets in the lab.** At 1024×1366 the lens reaches its 90° cap before the terracotta robot fits:
   - The terracotta robot is 37% right of the frame at rest (0% before), and crosses the right edge by up to 197 px while dancing (623 px before).
   - The cream robot now stands clear beside the monitor (96% at rest, 21% before).
   - The monitor spans the width, with a tall band of empty dark room above it.

   A portrait window needs its own staging, for example robots below the frame; that was not attempted. 5:4 (1280×1024) behaves like 4:3 (issue 2). Windows under 64rem wide or 36rem tall don't get the lab's framing at all: the map fills them.
4. **Phone heights in between.** Where the text leaves the stage a sliver of less than about 44 px above the bar, the sticky row can overlap the stage's top edge and the text above. No such size among common phones was found, and it is not covered.
5. **Moving between displays** (a DPR change with no resize) is still not handled; see the first pass.
6. **Coverage.** Only headless Chromium on SwiftShader. Not run: Safari/WebKit, Firefox, real phones, screen readers and axe. The case study redesign in particular has had no screen reader or axe pass.
7. **Type check.** Still no Astro type check; see the first pass.
8. **Stale metadata and the build warning**, as in the first pass.

## Future art direction (not implemented)

Recorded at the user's request on 2026-09-27, for a later pass. Nothing here is built: no new models, choreography, interactions or robots were added.

- **Distinct characters, not variations.** The three robots share one construction and differ mostly in colour and height. They should read as different characters through silhouette, construction, posture, movement timing and temperament.
- **Possible personalities:**
  - A deliberate, heavy industrial robot.
  - A curious, precise robot.
  - A small, energetic improviser.
- **Dancing.** Individual rhythms rather than one shared routine, with occasional reactions to one another.
- **A "rough schematic model" robot.** An unfinished prototype:
  - Exposed joints.
  - Sparse wireframe or construction-line elements.
  - A visibly different material language.

  It must read as intentionally designed and legible, not as a missing texture or a broken render. It could replace one of the existing characters rather than add a fourth, to avoid clutter.
- **Constraints to carry forward:**
  - The lab lens is fixed (62°), and the lab reveal is offered only from a 3:2 window (`roomy` in `lab.ts`). The second pass's `measureReach()` is gone, so new silhouettes and routines are not fitted automatically: re-check the gate with `labshot.cjs`.
  - Re-run `sweep.cjs` (opening) and `labshot.cjs` (lab) after any change to shapes or moves.
  - Where the middle dancer stands behind the monitor decides how much of it the lab shows (the cream robot in the release pass's lens tables).

## Earlier checkpoint: first polish pass, `cbfab9d` (Claude)

Superseded where the second pass (above) says otherwise:
- Its remaining issues 3 (lab at 1024), 4 (the 80rem step) and 5 (phone first view) are addressed there.
- Its explanation of the 1024 lab crop was wrong: the crop comes from the window's aspect, not the smaller desk.
- `probe-build.sh` no longer builds into `/tmp/lab-probe`. It prints the path of a fresh `mktemp` directory; its usage is in the second pass's commands.
- Case study pages no longer use the console chrome described under "Visual consistency".

- Branch: `robot-hero-integration`. Started from `b862891`, confirmed present before editing. This pass is commit `cbfab9d`.
- Committed locally only. Nothing was pushed, merged or deployed; no branch was deleted or rewritten.
- Scope: polish the existing experience, not redesign it. No framework or dependency changes.

### Changes in this pass

- **Smaller workstation at the opening; the introduction keeps its space.** `DESK.scale = 0.72` (`src/scripts/robot-scene.ts`) shrinks the whole workstation in place. Its position and angle are unchanged.
  - Its lamp and screen glow scale with it: intensity × scale², distance × scale, because falloff is physical. It reads the same, only smaller.
  - The lab camera's distance uses the scaled screen width, so the systems map lands on the same on-screen rectangle.
  - The static fallback's desk (`src/components/RobotStage.astro`) is scaled the same way about its floor footprint.
- **Opening framing** (`src/styles/global.css`):
  - From 64rem to below 80rem, where the text column reaches the middle of the window, the picture is a little smaller and further right: `--scene-shift: 0.31`, `--scene-usable: 0.35`.
  - From 64rem up, `--scene-usable` changes from 0.4 to 0.38. The terracotta robot's widest reach previously crossed the right window edge by 4–9 px at 1280–1920; it now stays inside.
- **Lab rendering resolution** (`robot-scene.ts`): the drawing buffer's device-pixel cap is 1.6 at the opening (unchanged) and 1.25 in the lab and in flight (`HERO_RATIO`, `LAB_RATIO`).
  - Only the WebGL backdrop is affected.
  - The systems map is the HTML iframe laid over it, rendered by the browser at full resolution. It is untouched.
- **Unchanged:**
  - `src/scripts/lab.ts`.
  - The dashboard: `Overview.astro` is still shared by `/systems/` and `/systems/screen/`.
  - Page content, the case study pages and the 404 page.

### Environment and limits of this pass's checks

- Container with Node 22.22.2, and Playwright 1.56.1 as a global install (not a project dependency).
- Chromium 141.0.7390.37, headless.
- WebGL ran on **SwiftShader** (`--use-angle=swiftshader --enable-unsafe-swiftshader`), a CPU software renderer, at roughly 2–3 fps here. Nothing below is real-GPU performance.
- Under that load, timers fire late and camera flights often complete in zero or one frames. The harness therefore waits on page state (in-page `MutationObserver`s on `data-lab`), and the timestamps in its log are not real durations.
- Google Fonts is blocked in the container, so screenshots show a fallback face; the computed `font-family` is still Inter.

### Commands run in this pass (from the repository root)

```sh
npm run build                        # exit 0: 15 pages; existing warning: a chunk > 500 kB (Three.js)
git diff --check                     # exit 0; git diff --cached --check also exit 0 before committing
/opt/node22/bin/tsc --noEmit -p .    # tsc 6.0.2 (global; there is no local tsc): exit 2, see below
npm run preview -- --host 127.0.0.1 --port 4321

H=docs/evidence/lab-2026-09-27/harness
NODE_PATH=$(npm root -g) node $H/interact.cjs                # 25/25 PASS
NODE_PATH=$(npm root -g) node $H/shots.cjs /tmp/lab-shots    # parts: open,lab,mobile,reduced,nowebgl,pages,ratio,video

# Opening/lab geometry: TEST-ONLY instrumented copy of the site, built outside the repository
sh $H/probe-build.sh                                          # -> /tmp/lab-probe/dist (never deploy)
python3 -m http.server 4331 --directory /tmp/lab-probe/dist
W=1024x768,1200x800,1279x800,1280x800,1440x900,1920x1080,390x844 STEP=0.5 \
  NODE_PATH=$(npm root -g) node $H/sweep.cjs
NODE_PATH=$(npm root -g) node $H/labshot.cjs

# Baseline buffer sizes: a copy of `npm run build` output taken at b862891 before editing,
# served with python3 -m http.server 4330
BASE=http://127.0.0.1:4330 NODE_PATH=$(npm root -g) node $H/shots.cjs /tmp/lab-base ratio
```

Type check result: exit 2.
- The only errors are two in `src/lib/build.ts` (TS2591: no Node types for `node:child_process` and `process`).
- b862891 gives the same two errors (reproduced by stashing this pass's changes). There are none in the changed files.
- `tsc` does not check `.astro` files, and `astro check` is not installed. There is still no full Astro type check.

### Results reproduced in this pass

**Opening composition** (`sweep.cjs`, probe build). The sweep sets the dance and camera-drift clock from 0 to 95 s every 0.5 s, 191 samples per size. At each sample it measures the horizontal gap between the projected mesh bounds and the introduction's text and link boxes.

| Window | Desk ↔ text (min) | Robots ↔ text (min) | Robots ↔ window edge (min) |
|---|---|---|---|
| 1024×768 | 42 px | 144 px | 15 px |
| 1200×800 | 112 | 172 | 17 |
| 1279×800 | 140 | 183 | 17 |
| 1280×800 | 81 | 151 | 9 |
| 1440×900 | 146 | 170 | 10 |
| 1920×1080 | 264 | 304 | 12 |
| 390×844 | desk hidden | stacked layout | 8 |

Baseline at b862891:
- The desk overlapped the text by 26, 49, 55 and 37 px at 1024, 1280, 1440 and 1920. That was one static measurement, not a sweep.
- The robots' reach crossed the right edge by 4, 5 and 9 px at 1280, 1440 and 1920 (drift sweep at the old framing).
- Screenshots: `screens/before-b862891-desktop-1024-opening.jpg` against `screens/desktop-1024-opening.jpg`.
- In some samples the desk's box overlaps a robot's box. That is depth, not a collision: the desk stands downstage, in front.

**Lab framing** (`labshot.cjs`): the share of each robot's box visible right of the dashboard frame.

| Window | Robot 1 | Robot 2 | Robot 3 |
|---|---|---|---|
| 1024 | 0% | 76% | 56% |
| 1280 | 0% | 58% | 94% |
| 1440 | 0% | 58% | 94% |
| 1920 | 0% | 47% | 100% |

At b862891, 1440 read 0/54/100%. The first robot stands behind the monitor at every size, as before.

**Interactions** (`interact.cjs`, production build, mostly 1440×900): 25/25 PASS (`logs/interact.log`).
- Enter the lab is a real link to `/systems/`.
- Keyboard Enter opens the lab:
  - The URL becomes `/systems/` with lab history state, and the dialog holds focus.
  - The states run fade → fly → open, and the title switches.
  - At rest the frame sits at a whole-pixel translate (sharp text) and loads `/systems/screen/`, showing the shared Overview console.
- Selecting cuCadence in the frame gives `/systems/?sel=project%3Acucadence`, and Expand dashboard follows it.
- With the map expanded, the first Escape collapses only the map. The next Escape flies back to `/`, returns focus to Enter the lab and restores the title.
- Back and Forward:
  - Forward reopens the lab with the selection restored, and Back closes it.
  - Back during the flight in lets it land, then returns.
  - Forward during the return flight reopens after landing.
- Escape on the dialog and the "Back to portfolio" button both leave with focus restored.
- Activating the selected node opens `/projects/cucadence/` in the window, not the frame. Back returns to `/systems/?sel=…`. Here that was the ordinary page, because bfcache didn't restore it; both outcomes are accepted.
- The ordinary `/systems/?sel=` page, with the selection, loads from:
  - Refresh in the lab
  - Expand dashboard
  - A direct link
- `/systems/screen/` opened on its own redirects to `/systems/`, keeping `?sel=`.
- Clicking the monitor enters the lab, and Escape then returns focus to Enter the lab.
- Resize while open:
  - Below 64rem, the map fills the window under the bar and the scene is held.
  - Back at 1440, it is framed on the monitor again and the scene runs.
- No page or console errors.
- Not covered by the harness: pause/play across the lab, screen readers, and axe.

**Lab rendering resolution** (`shots.cjs ratio`, drawing buffer at 1440×900):

| DPR | Opening | Lab and flight | After return |
|---|---|---|---|
| 1 | 864×792 (0.68 MP) | 1440×900 (1.30 MP) | 864×792 |
| 2, this pass | 1382×1267 (1.75 MP) | 1800×1125 (2.02 MP) | 1382×1267 |
| 2, b862891 | 1382×1267 (1.75 MP) | 2304×1440 (3.32 MP) | 1382×1267 |

- The lab buffer on a 2x display has 39% fewer pixels. DPR 1 is unchanged.
- The frame's resting transform is still a whole-pixel `translate(36px, 156px)`, and the dashboard text in the lab screenshots is crisp.
- *Estimate, not a measurement:* the renderer is antialiased (typically 4x MSAA) with depth. At roughly 36–40 bytes per pixel, the lab backbuffer goes from about 120–133 MB to 73–81 MB, about 50 MB less. Compare the earlier report of about 250 MB going to 420 MB on a real GPU.
- Real-GPU memory, frame time and how soft the 1.25 backdrop looks were not measured.

**Fallbacks** (`shots.cjs`; `logs/shots-run1.log`):
- **Phone** (390×844, 2x, touch):
  - No horizontal scroll (scrollWidth 390), and the still desk is hidden.
  - Enter the lab navigates to `/systems/`, with no dialog.
- **Reduced motion** (1440 and 390):
  - The scene is not loaded; the still shows a "Play the robot animation" button.
  - Enter the lab navigates with no flight.
- **No WebGL** (`--disable-webgl --disable-3d-apis`; 1024, 1440, 390):
  - The stage is marked failed and the still is shown: desk on desktop, none on phone.
  - The play/pause toggle is hidden, and Enter the lab navigates.

**Visual consistency** (homepage, `/projects/cucadence/`, 404 and `/systems/`, at 1440 and 390):
- Same background rgb(19,18,17), text rgb(245,242,237) and Inter family, with no horizontal overflow.
- The homepage has its own bar (56 px, h1 weight 650). The other pages use the Base layout: 48 px bar, h1 weight 600, side rail and status bar.
- They read as one site in the screenshots, so nothing was changed.

### Evidence (durable paths)

In `docs/evidence/lab-2026-09-27/`:
- **`screens/`**: JPEGs from the production build (SwiftShader, fallback font).
  - `before-b862891-desktop-{1024,1440}-opening`
  - `desktop-{1024,1280,1440,1920}-opening`
  - `desktop-{1024,1440,1920}-lab-open`
  - `mobile-390-opening`, `mobile-390-systems-page`
  - `{desktop-1440,mobile-390}-reduced-motion`
  - `{desktop-1024,desktop-1440,mobile-390}-no-webgl`
  - `{desktop-1440,mobile-390}-{case-study,404,systems}`
- **`logs/`**: raw output.
  - `sweep.log`, `labshot.log`, `interact.log` and `video.log`.
  - `shots-run1.log`: screenshots and fallbacks. Its ratio step failed on a harness timing bug, since fixed.
  - `shots-run2.log`: buffer sizes. Its video step failed at 1280×800, where the map node sits in a hidden tab; it now records at 1440×900.
  - `base-ratio-b862891.log`.
- **`harness/`**: the scripts above.
- **Recording:** `shots.cjs … video` writes a WebM of about 19 s: opening, Enter, open lab, select cuCadence, Escape, return with focus on Enter the lab.
  - It is 1.3 MB and was delivered with this handoff; it is not committed.
  - Under software rendering the screencast lags, so it shows states, not motion quality.

### Remaining issues

1. **Real-GPU check.** Measure GPU memory, frame pacing and 120 Hz behaviour on real hardware: 1440 on a 2x display, opening against lab (Chrome Task Manager GPU memory and the Performance panel). Judge the 1.25 lab backdrop there. Raise `LAB_RATIO` if it looks soft.
2. **Moving between displays.** A change of pixel density with no change of size (a window dragged to another display) is not handled. The buffer ratio updates only when the stage's CSS size changes (ResizeObserver). A `matchMedia('(resolution: …dppx)')` listener calling `resize()` should fix it; not done or tested here.
3. **Lab at 1024.** The smaller monitor has to fill the same frame, so the camera sits closer and the robots read larger than before. The terracotta robot is cut by the window's right edge (56% visible). Review the art; any fix belongs in the lab framing (`labRect`, FOV), not the dashboard.
4. **The 80rem step.** The opening framing changes at 1280, so the picture grows slightly: desk ↔ text is 140 px at 1279 and 81 px at 1280. Both are clear, but the jump is visible when resizing across it.
5. **Phone first view.** The hero stacks the text, then the stage, and the caption falls under the bottom tab bar in the first viewport. This predates this pass.
6. **Coverage.** Only headless Chromium on SwiftShader was run. Not run in this pass: Safari (real or Playwright WebKit), Firefox, real phones, screen readers and axe.
7. **Type check.** A full Astro check needs `@astrojs/check` and `typescript`, plus `@types/node` for `src/lib/build.ts`. Not added, to avoid new dependencies without approval.
8. **Stale metadata.** `public/og.png` and its alt text, and the README, predate the lab and were not reviewed.
9. **Build warning.** The chunk-size warning remains; the scene is already loaded lazily (`import()` in `RobotStage.astro`).

## Approved direction

A sparse, warm-dark after-hours robotics lab:
- Dancing robots appear immediately, and a subtle workstation hints at a dashboard.
- Entering the lab reveals a large, usable monitor with the robots visible around it.
- Normal portfolio content remains directly accessible.
- Avoid a mandatory game, retro OS, crowded cockpit, or unreadable angled dashboard.

References, used as inspiration only; don't copy assets or migrate frameworks:
- https://henryheffernan.com/ for the computer reveal.
- https://bruno-simon.com/ for personality.
- https://github.com/andrewwoan/sooahs-room-folio for coherent environment composition.

## Architecture (from the b862891 checkpoint)

- `src/scripts/robot-scene.ts`: procedural scene, rendering lifecycle, camera flight API, workstation screen projection, visibility handling, and disposal.
- `src/components/RobotStage.astro`: fallback illustration, lazy scene loading, motion controls, lab dialog, and stage styles.
- `src/scripts/lab.ts`: lab state machine, projected iframe during camera flight, URL/history synchronization, focus restoration, Escape, and responsive fallback.
- `src/pages/systems.astro` and `src/pages/systems/screen.astro`: standalone and embedded wrappers. Both import the same `Overview.astro` dashboard.
- `src/components/Overview.astro`, `SystemsMap.astro`, `src/scripts/selection.ts`, and `src/lib/model.ts`: dashboard integration, selection, and destination links.
- `src/pages/index.astro`, `src/components/Section.astro`, `src/layouts/Base.astro`, and `src/styles/global.css`: homepage hierarchy, shared navigation, palette, responsiveness, and lab presentation.

How the lab behaves:
- It changes the top-level address to `/systems/`. Reloads and shared links open the ordinary dashboard.
- The embedded route uses real HTML, and its links target the top-level page. Frame selection and Escape are sent to the parent.
- Phones, short windows, windows narrower than 3:2 (from the release pass), reduced motion, and unavailable scene rendering skip the flight.

## Earlier checkpoint: b862891 (Codex)

Codex committed Claude's earlier work after Claude's usage ran out.

What that checkpoint added:
- Three.js and its types, procedural dancing robots, workstation and lamp, lighting, camera transitions, and a static SVG fallback.
- The dashboard moved to `/systems/`, with `/systems/screen/` for the monitor's iframe.
- The homepage became an introduction, the robot scene, selected work, remaining projects, and experience.
- Lab modal, history and focus handling; pause/play and reduced motion; and palette updates.
- The readability baseline was preserved. `docs/robot-stage-handoff.md` is the original brief, kept as history.

Checked by Codex at the time:
- `npm run build` passed, with 15 pages and the chunk warning.
- `git diff --check` passed.
- Both systems wrappers use the shared `Overview.astro`.
- No type check was run, and no browser checks.

Claude-reported before that checkpoint, and not reproduced since:
- 17 interaction checks passing in installed Chrome.
- No axe violations on the tested pages.
- 60 Hz rendering.
- GPU memory rising from about 250 MB to 420 MB at 1440 on a 2x display when opening the lab.

These are reports, not a portable benchmark.

## Continuing

- Keep to focused passes, with no extra agents or research rounds unless asked. Preserve unrelated local work.
- Don't commit large recordings or build output.
- The harness needs a global Playwright (`NODE_PATH=$(npm root -g)`). Use real hardware for anything about performance.
- The release pass (`67f036f`) is what main has. Its remaining issues still apply to the released lab.
- The computer-first prototype (top) is on the local branch `computer-first-prototype` and waits for visual approval before any further work.
- On main, `cbfab9d`, `678c33e` and the release pass are one squashed commit; `robot-hero-integration` keeps them separately.
