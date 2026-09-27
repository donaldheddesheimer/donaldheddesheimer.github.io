# Robotics lab implementation handoff

## Current checkpoint: release pass, 2026-09-27 (Claude)

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
- The release pass (top) is the checkpoint prepared for main. Its remaining issues still apply.
- On main, `cbfab9d`, `678c33e` and the release pass are one squashed commit; `robot-hero-integration` keeps them separately.
