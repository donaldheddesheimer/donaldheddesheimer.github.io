import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One Markdown file per project in src/content/projects/. The file name is the URL slug.
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    code: z.string(), // e.g. "PRJ-07", numbered oldest to newest
    title: z.string(),
    summary: z.string(),
    // How the terminal opens a project (`work <id>`), a line each: what it does, my part, the hard
    // problem, and what it showed. Only what the write-up already supports; leave a line out rather than
    // guess (a TODO below says what's missing). `does` also describes it in `work`'s list.
    brief: z
      .object({
        does: z.string(),
        mine: z.string().optional(),
        hard: z.string().optional(),
        shown: z.string().optional(),
      })
      .optional(),
    // Its row in `work`'s index: what it is in a few words, what it's built with, and at most one
    // result the write-up supports (none rather than a goal or a guess).
    line: z.string().optional(),
    stack: z.string().optional(),
    result: z.string().optional(),
    status: z.enum(['active', 'shipped', 'archived']),
    start: z.string().regex(/^\d{4}(-\d{2})?$/), // "2026-08" or just "2023"
    // Where it happened: an org id from src/data/site.ts (orgs), or leave out for personal projects.
    org: z.string().optional(),
    context: z.string().optional(), // shown as-is, e.g. "SteelHacks 2026"
    related: z.array(z.string()).default([]), // other org ids it connects to
    team: z.string().optional(),
    tags: z.array(z.string()), // canonical names from src/data/site.ts (tagVocabulary) where possible
    repo: z.string().url().optional(),
    repoNote: z.string().optional(), // shown when there is no public repo
    demo: z.string().url().optional(),
    featured: z.boolean().default(false),
    cover: z.string().optional(), // path under public/, e.g. "/projects/traffic-ops.jpg"
    coverAlt: z.string().optional(),
    // A still frame for places that shouldn't animate (the Work cards: gone with the terminal, so not
    // shown anywhere now). Use it when the cover is a GIF.
    poster: z.string().optional(),
    // How the card framed the still (likewise not shown now): photos and UI crop to fill; reports,
    // diagrams, and pixel art are shown whole ("contain") so nothing is cut off.
    cardFit: z.enum(['cover', 'contain']).default('cover'),
    // Real screenshots, diagrams, traces, photos, or video from the project, captioned in the write-up (src/lib/figures.ts).
    evidence: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string(),
          kind: z.enum(['screenshot', 'diagram', 'trace', 'video', 'photo']),
          caption: z.string().optional(),
          poster: z.string().optional(), // video only
        }),
      )
      .default([]),
    stats: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  }),
});

export const collections = { projects };
