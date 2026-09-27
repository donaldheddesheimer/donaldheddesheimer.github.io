# Robotics lab implementation handoff

## Checkpoint — 2026-09-27

The user asked Codex to preserve and commit Claude's work after Claude usage ran out. This is an implementation checkpoint, not visual sign-off or a deployment. Codex did not finish the outstanding design changes.

- Branch: `robot-hero-integration`.
- Baseline: `6b47146` (readability/layout work). Find this checkpoint with `git log -1 -- docs/lab-scene-handoff.md`; the document is included in that commit.
- No push, merge, deployment, branch deletion, or history rewriting is authorized by this checkpoint request.
- `skills-lock.json` was pre-existing and unrelated; deliberately left untracked.
- `docs/robot-stage-handoff.md` is the original brief, preserved as historical context. This document describes the newer direction and current state.

## Approved direction

A sparse, warm-dark after-hours robotics lab. Dancing robots appear immediately; a subtle workstation hints at a dashboard. Entering the lab reveals a large, usable monitor with the robots visible around it. Normal portfolio content remains directly accessible. Avoid a mandatory game, retro OS, crowded cockpit, or unreadable angled dashboard.

References: https://henryheffernan.com/ for the computer reveal, https://bruno-simon.com/ for personality, and https://github.com/andrewwoan/sooahs-room-folio for coherent environment composition. Use these as inspiration, not an instruction to copy assets or migrate frameworks.

## What changed

- Added Three.js and its types, procedural dancing robots, workstation/lamp, lighting, camera transitions, and a static SVG fallback.
- Replaced the dashboard-first homepage with an introduction, robot scene, selected work, remaining projects, and retained experience/timeline content.
- Moved the dashboard to `/systems/`; added `/systems/screen/` for the monitor's HTML iframe.
- Added lab modal/history/focus handling, pause/play and reduced-motion behavior, and shared warm-dark palette updates.
- Preserved the readability baseline, fixed evidence-media phone overflow, and updated systems/experience navigation.

### Main files and architecture

- `src/scripts/robot-scene.ts`: procedural scene, rendering lifecycle, camera flight API, workstation screen projection, visibility handling, and disposal.
- `src/components/RobotStage.astro`: fallback illustration, lazy scene loading, motion controls, lab dialog, and stage styles.
- `src/scripts/lab.ts`: lab state machine, projected iframe during camera flight, URL/history synchronization, focus restoration, Escape, and responsive fallback.
- `src/pages/systems.astro` and `src/pages/systems/screen.astro`: standalone and embedded wrappers. Both import the same `Overview.astro` dashboard; the main dashboard markup is not duplicated between these routes.
- `src/components/Overview.astro`, `SystemsMap.astro`, `src/scripts/selection.ts`, and `src/lib/model.ts`: dashboard integration, selection, and destination links.
- `src/pages/index.astro`, `src/components/Section.astro`, `src/layouts/Base.astro`, and `src/styles/global.css`: homepage hierarchy, shared navigation, palette, responsiveness, and lab presentation.
- Remaining edits include icon support, neutral text colors, and systems-map terminology across content configuration, project/404 pages, and rover rendering.

The lab changes the top-level address to `/systems/`. Reload/shared links open the ordinary dashboard. The embedded route uses real HTML and links target the top-level page. Frame selection and Escape communicate to the parent. Phones, short windows, reduced motion, or unavailable scene rendering bypass the flight. Review these behaviors in a browser before sign-off.

## Setup and validation commands

```sh
npm ci
npm run dev -- --host 127.0.0.1
npm run build
npm run preview -- --host 127.0.0.1
git diff --check
```

Use the URL printed by the server. Check `/`, `/systems/`, `/systems/?sel=project:cucadence`, and `/projects/cucadence/`. No automated test script or type-check script is defined in package.json. No reproducible browser harness is included in this checkpoint.

### Independently checked by Codex at checkpoint

- `npm run build`: PASS, 15 static pages, including both systems routes. A chunk larger than 500 kB triggers a build warning.
- `git diff --check`: PASS before documentation was added; checked again before committing.
- Read both systems route wrappers and confirmed shared `Overview.astro` use.
- Full type checking was NOT run: local `node_modules/.bin/tsc` is absent. Astro build success is not full Astro/TypeScript validation.
- No browser, screenshot, accessibility, performance, or device verification was performed by Codex in this checkpoint turn.

### Claude-reported results, not independently verified here

Claude reported 17 production interaction checks passing in installed Chrome, a fixed asynchronous dialog-close/Forward history race, no axe violations on tested pages and the embedded dashboard, phone caption overlap fixed, and a working desktop camera flight. It reported 60 Hz rendering and GPU memory increasing from about 250 MB to 420 MB at 1440 on a 2x display when opening the lab. These are reports, not a portable benchmark or proof of mobile performance.

The last report ended while reviewer checks were still running. It did not supply a final full type-check outcome. Earlier work reported no WebKit/Safari testing. Do not infer broader browser/device coverage.

## Remaining work, in priority order

1. Review opening and open-lab compositions at 1024, 1280, 1440, and 1920. Claude reported only ~7 px between the desk front edge and Contact at 1024: reduce/reposition or partially conceal the opening workstation instead of further compressing the introduction. The full reveal should carry the detail.
2. Recheck embedded links, selection URLs, refresh, Back/Forward during and after transitions, Expand dashboard, Escape, focus restoration, resize, pause, reduced motion, and loading failure. Verify the dashboard stays usable independently of 3D.
3. Measure lower background rendering resolution in lab mode against the reported memory increase. Preserve sharp HTML text and approved lighting; avoid speculative rewrites. Assess high-refresh displays and moving between differing display pixel densities.
4. Produce desktop/mobile/reduced-motion screenshots and a short enter/interact/exit recording. Inspect full homepage and representative case-study/404 pages: a palette change alone is not proof of visual cohesion.
5. Establish a reproducible full type check and browser validation. Record exact commands, hardware, and limitations; avoid claiming Playwright WebKit is real Safari/device testing.
6. Review stale social preview metadata (`og.png`/alt text), README, and other documentation. Do not presume these were completed.

## Evidence and continuation

No screenshots or recordings were supplied as durable repository files in the current working tree. Claude mentioned temporary scratchpad evidence in earlier reports; its paths were not available in the latest report. Do not depend on that evidence being recoverable. Capture fresh evidence and record stable paths for the next handoff; do not commit large generated recordings or build output by default.

Continue with a focused pass, no additional agents/research rounds unless the user requests them. Preserve unrelated local work. This checkpoint records existing code; it does not assert the experience is flawless or ready to ship.
