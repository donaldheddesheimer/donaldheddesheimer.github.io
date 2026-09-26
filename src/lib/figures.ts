// Write-up figures. Markdown puts an image (or a linked image, or a <video>) alone in a paragraph;
// this turns each one into a <figure> with a caption: a "Fig 2 · Trace" kicker, then the evidence
// caption or the alt text. Traces go in the sideways scroll well (.fig-scroll). The kind and caption
// come from the project's `evidence` list, matched by src.
//
// It is a Sätteri hast plugin, added to Astro's default Markdown processor by the integration at the
// bottom (see astro.config.mjs). Astro's own image and heading-id plugins run after it.
import type { AstroIntegration } from 'astro';
import { mediaKindLabel } from './format';

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] };
type Evidence = { src: string; alt: string; kind: string; caption?: string };
type Ctx = { data: { astro?: { frontmatter?: { evidence?: Evidence[] } } } };

const el = (tagName: string, className: string | null, children: Node[]): Node => ({
  type: 'element',
  tagName,
  properties: className ? { className: [className] } : {},
  children,
});
const text = (value: string): Node => ({ type: 'text', value });
const isTag = (n: Node | undefined, tag: string) => n?.type === 'element' && n.tagName === tag;

/** What a paragraph holds when it is only one piece of media: its nodes, src and alt. */
function soleMedia(p: Node): { nodes: Node[]; src: string; alt: string } | null {
  const nodes = (p.children ?? []).filter((c) => !(c.type === 'text' && !c.value?.trim()));
  const [only] = nodes;
  const img = nodes.length === 1 && (isTag(only, 'a') ? only.children?.find((c) => isTag(c, 'img')) : only);
  if (img && isTag(img, 'img')) return { nodes, src: String(img.properties?.src ?? ''), alt: String(img.properties?.alt ?? '') };
  // Inline HTML arrives as raw strings: "<video ...>" then "</video>".
  const html = nodes.map((c) => (c.type === 'raw' ? c.value : '\0')).join('');
  if (/^<video\b[^>]*>\s*<\/video>$/.test(html)) return { nodes, src: html.match(/\bsrc="([^"]*)"/)?.[1] ?? '', alt: '' };
  return null;
}

const plugin = () => {
  let n = 0; // figure number, per document
  return {
    name: 'figures',
    element: {
      filter: ['p'],
      visit(p: Node, ctx: Ctx) {
        const media = soleMedia(p);
        if (!media) return;
        const ev = ctx.data.astro?.frontmatter?.evidence?.find((e) => e.src === media.src);
        const trace = ev?.kind === 'trace';
        const kicker = [`Fig ${++n}`, ev && mediaKindLabel[ev.kind], trace && 'scroll →'].filter(Boolean).join(' · ');
        const caption = ev?.caption ?? (media.alt || ev?.alt || '');
        return el('figure', null, [
          ...(trace ? [el('div', 'fig-scroll', media.nodes)] : media.nodes),
          el('figcaption', 'fig-cap', [el('span', 'kicker', [text(kicker)]), text(caption)]),
        ]);
      },
    },
  };
};

/** Adds the plugin to the Markdown processor Astro creates by default (Sätteri). */
export function figures(): AstroIntegration {
  return {
    name: 'figures',
    hooks: {
      'astro:config:setup': ({ config }) => {
        const { processor } = config.markdown;
        if (processor.name === 'satteri') (processor.options as { hastPlugins: unknown[] }).hastPlugins.push(plugin);
      },
    },
  };
}
