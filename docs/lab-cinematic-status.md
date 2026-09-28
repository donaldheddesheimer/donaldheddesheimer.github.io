# Cinematic lab: work-in-progress status (2026-09-28)

This covers the brief "Handoff: Cinematic robotics lab with gentle exploration" (Option A: a cinematic
room with gentle looking around, a simple portfolio inside the computer, and robots with distinct
personalities).

**Status: paused partway through validation.** This is not a finished handoff. The work lives on the
prototype route (`/prototype/`) only. It has not been reviewed, merged or deployed. The final handoff
belongs in `docs/lab-scene-handoff.md`, which this commit doesn't touch yet (see "Still to do").

- **Branch:** `cinematic-lab-prototype`.
- **Base:** `origin/main` at `cc1a6c4`, the merge of PR #2, which contains `796f421`.
- **Build:** `npm run build` builds 42 pages.
- **Types:** `tsc --noEmit -p .` reports only the two known TS2591 errors in `src/lib/build.ts`.

## Changes made

### 1. The monitor is the obvious destination (`scene.ts`, `computer.ts`, `prototype.astro`)
- **Chair and composition**
  - The large foreground chair is moved aside, to `CHAIR = {x: -1.0, z: 0.25, yaw: 1.9}` in the desk's frame, and is now out of frame on the left.
  - Graphite moved from `[-1.05, 0.55]` to `[-0.75, 0.45]`, so the text-avoidance fit no longer shrinks the room. The monitor now reads large at the lower left.
  - The monitor's width in the opening is 262 px at 1280×800, 294 px at 1440×900 and 389 px at 1920×1080.
- **How the text is avoided**
  - `fitHero` measures the text block from per-text-node range rects plus the button rects, not the element boxes, which were wider than the text.
  - It stores the result as `heroFramed`.
- **Lighting and the way in**
  - The screen is slightly over-lit (`SCREEN_LIT`), with a warm `glow` light.
  - Clicking the monitor, or "Explore the lab", goes straight to readable content in one camera flight (`FLIGHT['hero>read']` = 1.9 s).
  - "Use the computer" is gone.
- **Idle hint:** once, after 5 s with no pointer movement, scroll or keypress:
  - the screen and bezel brighten and dim over 2.2 s;
  - the curve is `sin²`, with no outline and no repeat;
  - an additive `lift` plane on the screen carries the extra light, plus the `glow` intensity.
  - A pointer press, a keypress or a drag ends it. It never starts without motion.
  - `root.dataset.hint` reports `on`, `done`, `stopped` or `cancelled`.

### 2. Gentle look-around (`scene.ts`)
- **Pointer parallax:** `PARALLAX = {az: 0.03, el: 0.015}` rad.
- **Drag look**
  - A drag (mouse or pen, past `DRAG_PX = 6`) gives a wider look, softly bounded by `LOOK = {az: 0.16, down: 0.05, up: 0.07}` using tanh.
  - After release it eases back to the composed view.
- **Click versus drag:** `LabScene.dragged()` lets `computer.ts` ignore the click that ends a drag. A drag released over the monitor doesn't enter.
- **What it leaves alone**
  - Touch scrolls the page as before.
  - Links, buttons and focusable elements keep their clicks.
  - The keyboard and the wheel are untouched.
  - There's no pointer lock and no walking.
- **When it's disabled:** the look is off while reading, in flight, without the lab (`data-pc-able`), with reduced motion or with Motion turned off.
- **Cursor:** grab over the room, grabbing while dragging, pointer over the monitor.

### 3. Robot personalities (`scene.ts`)
- The models are kept, with no new characters or assets.
- Graphite is placed by the workstation. Ivory is at `[1.0, -1.85]`, near the schematic robot. Terracotta is at `[0.6, 0.8]`. The spacing is staggered in depth, not a lineup.
- The `react()` relationship beats from the previous session are in place.
- **Not yet verified in this pass:** the personality reads and the reactions (see "Still to do").

### 4. The computer is a simple portfolio
- **Four pages:** Work, About, Résumé and Contact, at `src/pages/computer/{work/index, work/[slug], about, resume, contact}.astro`.
  - They are built from shared components: `FolioWork`, `FolioAbout`, `FolioResume` and `FolioContact`.
  - Shared styles are in `src/styles/folio.css`.
  - The Work data is in `src/lib/folio.ts` (`workLede`, `workMeta`, `workProjects`).
  - A `contact` export was added to `src/data/site.ts`.
- **The ordinary page:** `/prototype/` reuses the same four components below the opening, and `/prototype/work/<id>/` holds the case studies. Nothing is duplicated.
- **What the computer no longer has**
  - No system graph, inspector, telemetry, status bars, "project object" labels, nested windows or fake OS.
  - The old `/computer/` (index), `/computer/systems/` and `/computer/projects/<id>/` pages are deleted.
- **In `CaseStudy.astro`:** new `plain`, `projectHref` and `indexHref` props drop the map and Connections links on these pages.
- **The screen texture:** `portfolioTexture` in `scene.ts` draws the computer's Work page (bar, title, lede, two lead cards), so the screen matches what opens.

### 5. Immersion with accessibility (`LabStage.astro`, `Screen.astro`, `Base.astro`)
- The floating Pause, Back and other pills and toolbars are removed.
- **Inside the computer:** the bar in `Screen.astro` has a discreet "Leave computer" and an "Open ordinary page". They talk to the parent with `postMessage` (`pc:go`, `pc:leave`, `pc:escape`, `pc:page`).
- **Motion:** a Motion switch sits in the page header (`[data-motion-toggle]`, kept in `localStorage` as `motion`), and the scene observes it. Reduced motion is honoured.
- **Escape** leaves, and focus returns to the opener or the enter link.
- **While reading:** the scene is quieted.

### 6. Navigation (`routes.ts`, `computer.ts`, `prototype.astro`)
- **Shareable URLs:** `/prototype/?computer=<path>`, where `<path>` is `work`, `work/<id>`, `about`, `resume` or `contact`. The frame loads `/computer/<path>/`.
- **Other windows:** a window that can't hold the lab is redirected before paint to `/prototype/#<path>` or `/prototype/work/<id>/`.
- **History**
  - Entering pushes an entry. Navigating inside the computer pushes entries, with scroll `y` saved into `history.state`.
  - Back and Forward re-sync the lab from the URL.
  - Leave goes back through the computer's entries, or replaces the entry if the page was opened directly.
  - Back-forward cache restores (`pageshow` persisted) sync instantly.
- **Refresh or a direct link** opens the page flat, without the camera's entrance.
- **The page underneath:** its scroll is locked while the lab is open and restored on leaving.
- **Chrome:** `Base.astro` has a `lab` prop, which gives the header, tab bar and search the four sections and no systems-map links.
- There's one WebGL scene and no nested lab.

## Verified so far
- **Build and types:** see the numbers at the top.
- **Opening composition** at 1280×800, 1440×900 and 1920×1080, by screenshot:
  - the chair is out of the foreground;
  - the monitor is large at the lower left;
  - Graphite is by the desk;
  - the robots are staggered.
- **Look limits at 1440×900** (drag harness, 12 × 60 px):

  | Drag | Look value | Limit |
  | --- | --- | --- |
  | Left | az −0.155 | 0.16 |
  | Right | az +0.152 | 0.16 |
  | Up | el −0.048 | down 0.05 |
  | Down | el +0.068 | up 0.07 |

  The view stays within the composed limits.

Everything else in the brief's validation list is **not yet verified**.

## Known issues found
- **The monitor leaves the frame at the right look limit.** At 1440×900 with az ≈ +0.15 (dragging leftward), the monitor's left part leaves the frame: the screen starts at about x = −60.
  - Suggested fix: make the azimuth limit asymmetric. Keep 0.16 toward the left, and use about 0.07–0.08 toward the right, the direction that pushes the monitor out.
  - Then re-measure with `__lab.quad()` at 1280, 1440 and 1920, and allow for the ±0.025 drift.
  - A scratch probe for this was started but not run.
- **Slower easing under SwiftShader.** `dt` is capped at 0.1 s, so under software rendering a released drag eases back more slowly in wall time than it would on a real GPU. Harness waits must allow for this: the "up" and "down" readings above still carried leftover az (0.08 and 0.02).
- **A stale comment in the harness.** The header of `docs/evidence/lab-cinematic-2026-09-28/harness/shots.cjs` mentions a `FREEZE` option that isn't implemented. Implement it or drop the line.

## Still to do
1. **Monitor and hint (task 13)**
   - Check the monitor's lighting close up. PIL isn't available, so crop with a Playwright canvas.
   - Confirm the idle hint fires once (`data-hint`: `on` then `done`).
   - Confirm a press, key or drag cancels it, and that it never runs with reduced motion or Motion off.
2. **Look-around (task 14)**
   - Fix the right-limit issue above.
   - Screenshot the limits at 1280×800, 1440×900 and 1920×1080 (`STEPS=look`).
   - Verify click versus drag: a click on the monitor enters, and a drag released over it doesn't.
3. **Robots (task 15):** check the personality reads, the placements, the reactions between robots, and the still pose under reduced motion.
4. **Validation (task 17)**
   - Write and run a harness covering:
     - Back/Forward, refresh, direct links, Escape, focus and scroll restore;
     - in-computer navigation;
     - external links and the PDF;
     - mobile at 390×844: page scrolls, no camera gestures;
     - the stacked layout at 1024×768;
     - reduced motion and the Motion switch;
     - the WebGL-failure fallback;
     - resizing in full mode;
     - the back-forward cache.
   - Run the release pixel diff: released pages `/`, `/projects/*` and `/systems/` against the `cc1a6c4` baseline, with `docs/evidence/lab-prototype-2026-09-27/harness/release-diff.cjs`.
   - Measure performance and label it as SwiftShader software rendering, not real-GPU numbers.
   - Take the final screenshots into `docs/evidence/lab-cinematic-2026-09-28/screens/`:
     - the opening at three sizes;
     - the look limits;
     - reading Work, About, Résumé, Contact and a case study;
     - mobile.
   - Optionally make a short recording, kept out of git.
   - Update `docs/lab-scene-handoff.md` with a new top section: changes, validation, limitations and the list below.
   - Run the final build and tsc, commit, and stop for review.

## Legacy to retire, once the prototype is approved (not removed yet)
- **Pages:** `/systems/` (`src/pages/systems.astro`) and `/systems/screen/` (`src/pages/systems/screen.astro`).
- **Components:** `Overview`, `SystemsMap`, `MissionCanvas`, `Inspector`, `Evidence` and `Stage` (its `MissionCanvas` use), plus `RobotStage`.
- **Scripts:** `rover-sim.ts`, `rover-render.ts`, `robot-scene.ts`, `lab.ts` and `selection.ts` (if unused).
- **Data:** the `mission` export in `src/data/site.ts`.
- **Links:** `HomeSections.astro` systems-map links, the command palette's Map group, and the map and Connections links in `CaseStudy.astro`.
- **Already gone:** the removed `/computer/` routes (index, systems, projects/[slug]). No stale links point at them.

## How to run
```sh
npm run build && npm run preview -- --host 127.0.0.1 --port 4321
# screenshots (STEPS: hero, look, read, about, resume, contact, case, work; REDUCE=1 for reduced motion)
cd docs/evidence/lab-cinematic-2026-09-28/harness
NODE_PATH=$(npm root -g) OUT=../screens STEPS=hero,look W=1280x800,1440x900,1920x1080 node shots.cjs
```
`/prototype/?probe` exposes `window.__lab`, whose `stats()` and `quad()` give measurements.
