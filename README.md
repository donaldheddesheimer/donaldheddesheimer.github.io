# donaldheddesheimer.github.io

My personal site. The homepage is a robotics lab after hours, across the whole window: three robots dance round a desk, and the portfolio is on the desk's computer. A click on the monitor goes straight to the screen, a terminal: `help` lists `about`, `work`, `resume` and `contact`, typed or tapped, and each prints as ordinary HTML. In a small window the terminal reads across the window. There is nothing below the lab. Without WebGL the lab is a still of the same room, and without JavaScript the way in is a link to `/computer/`, a plain transcript of every command's output.
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
| Link-preview card (a render of the homepage's opening, 1200×630) | `public/og.jpg` |
| The lab's stills (shown until the scene draws, and without WebGL) | `public/lab/` |

- **Headshot:** add `public/images/me.jpg` and set `profile.photo`.
- **Hobby photo:** add it to `public/images/` and set `image` on that entry in `offDuty`.
- **New project:** copy an existing file in `src/content/projects/`, give it the next `PRJ-` code, and fill in the frontmatter. The schema is in [`src/content.config.ts`](src/content.config.ts).
- **Project images:** list screenshots, diagrams, traces, photos, or video under `evidence` in the project's frontmatter (files go in `public/projects/`). The case study captions them. A project with none gets no picture, never a stock image. `cover` heads the case study. (`poster` and `cardFit` were for the Work cards, which the terminal replaced; nothing shows them now.)

## Addresses

| Address | What it is |
| --- | --- |
| `/` | The lab |
| `/?computer` | The lab with the computer open on the terminal |
| `/?computer=work/<project id>` | The terminal with a project's details open over it |
| `/?computer=<command>`, `/#<command>`, `/computer/<command>/` | Old addresses of `about`, `work`, `resume` and `contact`: the terminal, running that command |
| `/projects/<id>/` | A project's case study, on its own (the address to share and index) |
| `/computer/work/<id>/` | A project's details as the computer shows them (noindex; opened on its own with JavaScript, it goes to `/?computer=work/<id>`; without, it stands alone) |
| `/computer/` | The terminal's transcript: every command's output on one page, for when JavaScript is off or the lab's script fails (noindex; with JavaScript it goes to `/?computer`) |
| `/prototype/`, `/prototype/work/<id>/` | Retired: go to `/` and `/projects/<id>/`, keeping the query and anchor |
| `/systems/`, `/systems/screen/` | Retired: `?sel=project:<id>` goes to that case study, any other selection to `/?computer=work` (the terminal, running `work`), none to `/` |

## Layout

| Path | What it is |
| --- | --- |
| `src/pages/index.astro` | Homepage: the lab, the name and Settings (the monitor is the way in) |
| `src/pages/projects/[slug].astro` | A project's case study |
| `src/pages/computer/` | The terminal's transcript, the projects' details for the computer, and the old commands' redirects |
| `src/pages/prototype*`, `src/pages/systems*` | Redirects from retired addresses |
| `src/pages/404.astro` | Not-found page |
| `src/layouts/Base.astro` | Document shell: head, link preview, the Motion setting before first paint |
| `src/layouts/Screen.astro` | The computer's page shell (also the case studies' and the 404's) |
| `src/layouts/Redirect.astro` | A retired address |
| `src/components/LabStage.astro` | The lab: the scene over a still that stands in without WebGL |
| `src/components/Settings.astro` | The Motion setting |
| `src/components/Terminal.astro`, `TermOutput.astro`, `TermCmd.astro` | The terminal, what its commands print, and a command to tap |
| `src/components/CaseStudy.astro` | A project's case study (`/projects/<id>/` and the computer's details) |
| `src/scripts/lab/scene.ts` | The three.js scene: room, robots, choreography, camera |
| `src/scripts/lab/computer.ts` | Going in and out of the computer, its address and history |
| `src/scripts/lab/terminal.ts` | The terminal: its startup, commands, history and what it keeps for the session |
| `src/scripts/lab/routes.ts` | The computer's paths and addresses |
| `src/lib/terminal.ts`, `folio.ts`, `format.ts`, `figures.ts` | The terminal's lines, project data, date helpers, and captions for project images |
| `src/styles/global.css`, `terminal.css` | Color tokens and shared styles; the terminal and its transcript |
| `.github/workflows/deploy.yml` | GitHub Pages deploy |
