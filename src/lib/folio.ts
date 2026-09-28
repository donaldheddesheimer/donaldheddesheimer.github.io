// The Work section's projects, in its order, for src/components/FolioWork.astro and for the lab
// monitor's picture of it (src/components/LabStage.astro).
import { getCollection, type CollectionEntry } from 'astro:content';
import { fmtMonth } from './format';

export const workLede = 'Projects in GPU software, robotics and simulation, and a few from before. Each opens its case study.';

/** A project's line above its title: when it started, and where. */
export const workMeta = (d: CollectionEntry<'projects'>['data']) => `${fmtMonth(d.start)}${d.context ? ` · ${d.context}` : ''}`;

/** The picture a project's card shows: its still (the poster, or else the cover), with the alt text its
 *  evidence gives it; or else its first piece of evidence. */
function stillOf(d: CollectionEntry<'projects'>['data']): { src: string; alt: string } | undefined {
  const src = d.poster ?? d.cover;
  if (src) return d.evidence.find((m) => m.src === src) ?? { src, alt: d.coverAlt ?? '' };
  return d.evidence[0];
}

/** Featured projects with a picture lead; the rest follow, those with a picture first so text-only
 *  cards share rows. Newest first within each. */
export async function workProjects() {
  const all = (await getCollection('projects'))
    .sort((a, b) => b.data.code.localeCompare(a.data.code))
    .map((p) => ({ p, still: stillOf(p.data) }));
  const lead = all.filter(({ p, still }) => p.data.featured && still);
  const rest = all.filter((x) => !lead.includes(x)).sort((a, b) => Number(!a.still) - Number(!b.still));
  return { lead, rest };
}
