// What the terminal's `work` and `work <id>` (src/components/TermOutput.astro, TermProject.astro) and a
// case study's page (CaseStudy.astro) say about the projects.
import type { CollectionEntry } from 'astro:content';
import { fmtMonth } from './format';

type Project = CollectionEntry<'projects'>;

/** A project's line under its title: when it started, and where. */
export const workMeta = (d: Project['data']) => `${fmtMonth(d.start)}${d.context ? ` · ${d.context}` : ''}`;

/** The order `work` lists them in: featured first, then the rest; newest first within each. */
export const byWork = (a: Project, b: Project) => Number(b.data.featured) - Number(a.data.featured) || b.data.code.localeCompare(a.data.code);

/** Related work: the (up to three) other projects sharing the most tags with it. */
export function related(project: Project, all: Project[]): Project[] {
  const tags = project.data.tags;
  return all
    .filter((p) => p.id !== project.id)
    .map((p) => ({ p, shared: p.data.tags.filter((t) => tags.includes(t)).length }))
    .filter((r) => r.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.p.data.code.localeCompare(a.p.data.code))
    .slice(0, 3)
    .map((r) => r.p);
}
