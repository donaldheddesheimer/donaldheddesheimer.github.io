# Cinematic robotics portfolio — implementation handoff

## Goal
Implement a reviewable first version of Donald's portfolio with a cinematic opening: three 3D robots dancing in the background. The user wants less dashboard, more movie atmosphere. The scene is playful illustration, not a claim about previous work. Keep the Mission idea if useful; suggested caption: “After hours in the lab.” Prioritize an attractive working scene over further planning.

## Visual direction
- Dark studio stage, warm key light and cool rim light, grounded shadows, restrained palette, clear mechanical silhouettes. Avoid neon overload and control-panel decoration.
- Three articulated robots perform a coherent 15–20-second looping routine: synchronized step/sway, alternating arm gestures, a brief staggered/canon movement, then return seamlessly. Different phase/personality per robot. Feet should appear planted during weight shifts; avoid random spinning primitives.
- Large Donald Heddesheimer identity and “Systems and GPU software engineer,” readable beside the robots. Resume, selected work, contact immediately reachable. On phones compose robots above/below text rather than underneath it.
- Gentle camera drift only. Scene occupies the opening, fades into quieter selected projects and existing record/content below. Avoid forced entry screens, scroll hijacking, sound, or lengthy preloaders.
- Remove persistent dashboard chrome from the homepage where needed. Keep the existing case studies functional. Move the existing map/inspector into a secondary optional archive, or omit them from the homepage in this first version if retaining them complicates the design. Do not delete their source unnecessarily.

## Implementation choices
Keep Astro, Tailwind, TypeScript and static GitHub Pages output. Add Three.js; no React migration, backend, or physics engine. For this first pass, construct appealing original articulated robots from procedural meshes with joint groups and authored motion curves. This avoids asset hunting, licensing ambiguity and Blender dependencies; GLB models can replace them later. Use inexpensive soft contact shadows/floor treatment; real reflections are optional. Keep scene logic in one focused module plus one Astro wrapper.

Text/content must render before the 3D bundle. Lazy-load the scene, cap pixel ratio, resize correctly, stop rendering when offscreen or the tab is hidden, dispose resources. Respect reduced motion and the existing Motion setting; provide a visible pause/resume control and a composed static fallback if WebGL fails. No external asset or API dependency.

## Repository map
Working directory: /Users/donald.heddesheimer/Documents/GitHub/donaldheddesheimer.github.io
Baseline branch: readability-visual-pass, last reviewed commit 6b47146. Check current status before editing; preserve unrelated changes (skills-lock.json was already untracked).
- src/pages/index.astro: homepage and project/experience sections.
- src/components/Overview.astro: current three-pane opening.
- src/components/MissionCanvas.astro and src/scripts/rover-render.ts: existing illustrative scene, available as lifecycle references.
- src/layouts/Base.astro: fixed dashboard shell, navigation, search, Motion setting.
- src/styles/global.css: shared tokens and responsive console rules.
- src/data/site.ts and src/content/projects/: authoritative biography/projects; preserve factual content.
- src/pages/projects/[slug].astro: existing case studies.
Read repository instructions, these relevant files and package.json first; inspect other files only as needed. The prior radar mockup is superseded by the dancing robot direction.

## References (optional; no research round needed)
- https://threejs.org/examples/webgl_animation_skinning_morph — expressive articulated robot motion.
- https://bruno-simon.com/ — playful, cohesive 3D art direction; not the scope of this build.
- https://joseph-san.com/ — cinematic scene composition.
Use original implementation/content; do not copy another portfolio's identity or proprietary assets.

## Efficient execution and completion
Use one agent and one coherent implementation pass. No broad web search, unrelated refactor, multiple competing designs, or long planning output. Choose reasonable defaults and implement. Batch focused reads; keep tool output brief. Use your configured model. Do not commit, push, merge or deploy.

Run npm run build and git diff --check. Inspect desktop (~1440px) and phone (~390px) if browser tooling is available; check text overlap, dance loop, pause/reduced-motion behavior, loading failure fallback and one case-study route. Fix observed issues, then stop after a working first pass. Do not claim browser verification if unavailable. End with a short changed-files summary, verification results, remaining visual limitations and how to preview. If a permission prevents required work, report the exact blocked operation rather than repeatedly retrying.
