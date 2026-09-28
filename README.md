# donaldheddesheimer.github.io

My personal site. The homepage opens on a robotics lab after hours: three robots dance beside a desk, and the portfolio is on the desk's computer. "Explore the lab" (or a click on the monitor) takes the camera to the screen, where Work, About, Résumé and Contact read as ordinary HTML. Below the lab, the same four sections are on the page itself, so everything is there without 3D, JavaScript or WebGL, and on small screens.
Built with [Astro](https://astro.build), [Tailwind CSS](https://tailwindcss.com) and [three.js](https://threejs.org), and deployed to GitHub Pages on every push to `main`.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
```

## Editing content

| What | Where |
| --- | --- |
| Profile, socials, orgs, experience, education, skills, hobbies | [`src/data/site.ts`](src/data/site.ts) |
| Projects (one Markdown file each, with its own page) | [`src/content/projects/`](src/content/projects) |
| Project images and video | `public/projects/` |
| Photos (headshot, hobbies) | `public/images/` |
| Resume (redacted, no phone number) | `public/resume.pdf` |
| Link-preview card (a screenshot of the homepage's opening, 1200×630) | `public/og.jpg` |

- **Headshot:** add `public/images/me.jpg` and set `profile.photo`.
- **Hobby photo:** add it to `public/images/` and set `image` on that entry in `offDuty`.
- **New project:** copy an existing file in `src/content/projects/`, give it the next `PRJ-` code, and fill in the frontmatter. The schema is in [`src/content.config.ts`](src/content.config.ts).
- **Project images:** list screenshots, diagrams, traces, photos, or video under `evidence` in the project's frontmatter (files go in `public/projects/`). The case study captions them; `poster` or `cover` picks the one on the Work card. A project with none gets no picture, never a stock image.

## Addresses

| Address | What it is |
| --- | --- |
| `/` | The lab, then Work, About, Résumé and Contact |
| `/?computer=<path>` | The lab with the computer open on a page: `work`, `work/<project id>`, `about`, `resume` or `contact` |
| `/projects/<id>/` | A project's case study |
| `/computer/<path>/` | The page the computer's screen shows (noindex; opened on its own, it goes to the lab or the ordinary page) |
| `/prototype/`, `/prototype/work/<id>/` | Retired: go to `/` and `/projects/<id>/`, keeping the query and anchor |
| `/systems/`, `/systems/screen/` | Retired: `?sel=project:<id>` goes to that case study, any other selection to `/#work`, none to `/` |

## Layout

| Path | What it is |
| --- | --- |
| `src/pages/index.astro` | Homepage: the lab, then the four sections |
| `src/pages/projects/[slug].astro` | A project's case study |
| `src/pages/computer/` | The computer's pages |
| `src/pages/prototype*`, `src/pages/systems*` | Redirects from retired addresses |
| `src/pages/404.astro` | Not-found page |
| `src/layouts/Base.astro` | Page shell: top bar, settings (Motion), mobile tab bar, footer, ⌘K search |
| `src/layouts/Screen.astro` | The computer's page shell |
| `src/layouts/Redirect.astro` | A retired address |
| `src/components/LabStage.astro` | The lab: the scene over a still that stands in without WebGL |
| `src/components/Folio*.astro`, `CaseStudy.astro` | Work, About, Résumé, Contact and the case study, shared by the homepage and the computer |
| `src/scripts/lab/scene.ts` | The three.js scene: room, robots, choreography, camera |
| `src/scripts/lab/computer.ts` | Going in and out of the computer, its address and history |
| `src/scripts/lab/routes.ts` | The computer's paths and addresses |
| `src/lib/folio.ts`, `format.ts`, `figures.ts` | Section data, date helpers, and captions for project images |
| `src/styles/global.css`, `folio.css` | Color tokens and shared styles |
| `.github/workflows/deploy.yml` | GitHub Pages deploy |
