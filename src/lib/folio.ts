// PROTOTYPE (lab-cinematic, 2026-09-28): the Work section's projects, in its order, for
// src/components/FolioWork.astro and for the lab monitor's picture of it (src/components/LabStage.astro).
import { getCollection, type CollectionEntry } from 'astro:content';
import { fmtMonth } from './format';
import { getModel } from './model';

export const workLede = 'Projects in GPU software, robotics and simulation, and a few from before. Each opens its case study.';

/** A project's line above its title: when it started, and where. */
export const workMeta = (d: CollectionEntry<'projects'>['data']) => `${fmtMonth(d.start)}${d.context ? ` · ${d.context}` : ''}`;

/** Featured projects with a picture lead; the rest follow, those with a picture first so text-only
 *  cards share rows. Newest first within each. */
export async function workProjects() {
  const model = await getModel();
  const all = (await getCollection('projects'))
    .sort((a, b) => b.data.code.localeCompare(a.data.code))
    .map((p) => ({ p, still: model.get(`project:${p.id}`).media[0] }));
  const lead = all.filter(({ p, still }) => p.data.featured && still);
  const rest = all.filter((x) => !lead.includes(x)).sort((a, b) => Number(!a.still) - Number(!b.still));
  return { lead, rest };
}
