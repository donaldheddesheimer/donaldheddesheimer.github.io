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
    // A still frame for places that shouldn't animate (cards, the homepage console). Use it when the cover is a GIF.
    poster: z.string().optional(),
    // Real screenshots, diagrams, traces, photos, or video from the project, shown as evidence on the homepage.
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
