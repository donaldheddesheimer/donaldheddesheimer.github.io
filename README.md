# donaldheddesheimer.github.io

My personal site, built as a mission-control console: a link-analysis graph of my orgs, projects, and skills, plus a timeline, experience log, project pages, and hobbies.
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
| Profile, socials, orgs, experience, education, metrics, skills, hobbies | [`src/data/site.ts`](src/data/site.ts) |
| Projects (one Markdown file each, with its own page) | [`src/content/projects/`](src/content/projects) |
| Project images and video | `public/projects/` |
| Photos (headshot, hobbies) | `public/images/` |
| Resume (redacted, no phone number) | `public/resume.pdf` |

- **Headshot:** add `public/images/me.jpg` and set `profile.photo`.
- **Hobby photo:** add it to `public/images/` and set `image` on that entry in `offDuty`.
- **New project:** copy an existing file in `src/content/projects/`, give it the next `PRJ-` code, and fill in the frontmatter. The schema is in [`src/content.config.ts`](src/content.config.ts).

The graph builds itself from this data. Orgs link to their projects and experience. A tag becomes a capability node once two or more projects or roles share it. Projects link to other projects through `related`.

## Layout

| Path | What it is |
| --- | --- |
| `src/pages/index.astro` | Overview: subject, graph + inspector, metrics, timeline, experience, projects, capabilities, off duty, contact |
| `src/pages/projects/[slug].astro` | Project page: header, stats, write-up, properties, linked objects |
| `src/pages/404.astro` | Not-found page |
| `src/layouts/Base.astro` | App shell: top bar, icon rail with scroll-spy, mobile tab bar, status bar, ⌘K search |
| `src/components/EntityGraph.astro` | Link-analysis graph and inspector |
| `src/components/Timeline.astro` | Gantt-style activity timeline |
| `src/components/Panel.astro`, `Icon.astro` | Panel chrome and inline icons |
| `src/lib/graph.ts` | Builds the graph from site data and lays it out at build time |
| `src/lib/format.ts` | Date and duration helpers |
| `src/styles/global.css` | Color tokens (Blueprint dark palette) and shared component styles |
| `.github/workflows/deploy.yml` | GitHub Pages deploy |
