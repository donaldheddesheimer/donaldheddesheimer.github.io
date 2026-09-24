# donaldheddesheimer.github.io

My personal site, built as a mission-control console. The homepage opens on an active mission (an illustrative rover-autonomy simulation) next to a systems map of my orgs, projects, capabilities, and measured outcomes, with an inspector for whatever is selected. Below that are key metrics, a timeline, the experience log, projects, capabilities, hobbies, and contact.
Built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com), and deployed to GitHub Pages on every push to `main`.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
```

## Editing content

| What | Where |
| --- | --- |
| Profile, socials, orgs, experience, education, metrics, skills, hobbies, the featured mission | [`src/data/site.ts`](src/data/site.ts) |
| Projects (one Markdown file each, with its own page) | [`src/content/projects/`](src/content/projects) |
| Project images and video | `public/projects/` |
| Photos (headshot, hobbies) | `public/images/` |
| Resume (redacted, no phone number) | `public/resume.pdf` |

- **Headshot:** add `public/images/me.jpg` and set `profile.photo`.
- **Hobby photo:** add it to `public/images/` and set `image` on that entry in `offDuty`.
- **New project:** copy an existing file in `src/content/projects/`, give it the next `PRJ-` code, and fill in the frontmatter. The schema is in [`src/content.config.ts`](src/content.config.ts).
- **Project evidence:** list screenshots, diagrams, traces, photos, or video under `evidence` in the project's frontmatter (files go in `public/projects/`). They show in the console when the project is selected and on project cards. A project with no evidence gets a "no screenshots yet" plate, never a stock image.
- **Metrics:** each entry in `metrics` names the experience id or project slug it was measured at (`ref`), and becomes an outcome node linked to it.

The systems map builds itself from this data ([`src/lib/model.ts`](src/lib/model.ts)). Orgs link to the person, their parent org, and the projects built there. A tag becomes a capability node once two or more projects or roles share it. Every link is typed, and the inspector groups linked objects by that type. The map, stage, inspector, and the sections below the fold share one selection, kept in `?sel=` so a view can be linked.

## Layout

| Path | What it is |
| --- | --- |
| `src/pages/index.astro` | Overview console, then metrics, timeline, experience, projects, capabilities, off duty, contact |
| `src/pages/projects/[slug].astro` | Project page: header, stats, write-up, properties, linked objects |
| `src/pages/404.astro` | Not-found page |
| `src/layouts/Base.astro` | App shell: top bar, icon rail with scroll-spy, mobile tab bar, status bar, ⌘K search |
| `src/components/Overview.astro` | Identity strip and the console: three panes on wide screens, Mission / Map / Details tabs below 1024px |
| `src/components/SystemsMap.astro` | The systems map: graph and list views, type filters, expand, keyboard navigation |
| `src/components/Stage.astro`, `Evidence.astro` | Center pane: the mission, or the selected object's evidence |
| `src/components/MissionCanvas.astro` | The rover-autonomy simulation (illustrative, not recorded data) |
| `src/components/Inspector.astro` | Details and linked objects for the selection |
| `src/components/Timeline.astro` | Gantt-style activity timeline |
| `src/components/Panel.astro`, `Icon.astro` | Panel chrome and inline icons |
| `src/lib/model.ts` | Entities and typed relations built from site data and projects (build time) |
| `src/lib/layout.ts` | Radial layout for the map, run at build time and again at the pane's real size |
| `src/scripts/selection.ts` | The shared selection and hover preview |
| `src/scripts/rover-sim.ts`, `rover-render.ts` | Simulation core and canvas renderer |
| `src/lib/format.ts` | Date and duration helpers |
| `src/styles/global.css` | Color tokens (Blueprint dark palette) and shared component styles |
| `.github/workflows/deploy.yml` | GitHub Pages deploy |
