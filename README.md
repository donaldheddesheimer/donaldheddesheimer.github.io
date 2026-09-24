# donaldheddesheimer.github.io

My personal site: about, experience, projects, and hobbies, laid out as a bento grid.
Built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com), and deployed to GitHub Pages on every push to `main`.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
```

## Editing content

Everything lives in [`src/data/site.ts`](src/data/site.ts): profile, socials, skills, experience, projects, and hobbies.

- Photo: add `public/images/me.jpg` and set `profile.photo`
- Resume: add `public/resume.pdf`
- Hobby photos: add to `public/images/` and set `image` on a hobby

## Layout

| Path | What it is |
| --- | --- |
| `src/pages/index.astro` | The page: bento hero and sections |
| `src/layouts/Base.astro` | `<head>`, nav, footer, theme toggle |
| `src/styles/global.css` | Color tokens (light and dark), tile/chip styles |
| `.github/workflows/deploy.yml` | GitHub Pages deploy |
