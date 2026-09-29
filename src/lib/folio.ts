// A project's line above its title in the terminal's `work` (src/components/TermOutput.astro): when it
// started, and where.
import type { CollectionEntry } from 'astro:content';
import { fmtMonth } from './format';

export const workMeta = (d: CollectionEntry<'projects'>['data']) => `${fmtMonth(d.start)}${d.context ? ` · ${d.context}` : ''}`;
