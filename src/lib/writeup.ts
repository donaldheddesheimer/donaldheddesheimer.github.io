// A project's write-up, laid out for the lab computer's terminal (TermProse.astro): the HTML the site's
// Markdown processor renders for the project's case study (CaseStudy.astro), with
// - its headings two levels down, under the command's (h2) and the project's name (h3), marked for the
//   terminal's section labels; in the lab's terminal (`ids` false), their ids become data-anchor, as the
//   same project may be printed more than once;
// - its figures (figures.ts) folded away behind a line that says what they show, their media loading only
//   once opened;
// - links off the page opening in a new tab, as the terminal's other links do (↗);
// - its code in the terminal's colours, its tables scrolling sideways on their own if they must.
// Plain string work, on HTML this site's own processor produced (and figures.ts shaped), not a parser.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function writeUp(html: string, opts: { ids?: boolean; posters?: Record<string, string> } = {}): string {
  const { ids = false, posters = {} } = opts;
  return (
    html
      // Headings: h2 → h4 (h3 → h5, h4 → h6).
      .replace(/<h([234])(\s[^>]*)?>/g, (_, n: string, attrs = '') => {
        const a = ids ? attrs : attrs.replace(/\sid="/, ' data-anchor="');
        return `<h${+n + 2} class="t-section"${a}>`;
      })
      .replace(/<\/h([234])>/g, (_, n: string) => `</h${+n + 2}>`)
      // Figures: the caption (its kicker, "Fig 2 · Trace · scroll →", and what it shows) is the line
      // that opens it.
      .replace(
        /<figure>([\s\S]*?)<figcaption class="fig-cap"><span class="kicker">([^<]*)<\/span>([\s\S]*?)<\/figcaption><\/figure>/g,
        (_, media: string, kicker: string, caption: string) => {
          const label = kicker.replace(/ · scroll →$/, '').toLowerCase();
          return `<details class="t-fig"><summary><span class="t-dim">${label}</span> ${caption.trim()}</summary><figure class="t-fig-body">${media}</figure></details>`;
        },
      )
      .replace(/<img(?![^>]*\sloading=)/g, '<img loading="lazy" decoding="async"')
      .replace(/<video([^>]*)>/g, (_, attrs: string) => {
        const src = attrs.match(/\ssrc="([^"]*)"/)?.[1] ?? '';
        let a = attrs.replace(/\spreload="[^"]*"/, '') + ' preload="none"';
        // (In the lab's terminal, the poster waits too: terminal.ts sets it as its figure opens.)
        if (posters[src] && !/\sposter=/.test(a)) a += ` ${ids ? '' : 'data-'}poster="${esc(posters[src])}"`;
        return `<video${a}>`;
      })
      // Links: all but the page's own anchors open in a new tab; a text link says so.
      .replace(/<a href="([^"#][^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (_, href: string, attrs: string, text: string) => {
        const media = /^\s*<(img|video)\b/.test(text);
        const mark = media ? '' : '<span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span>';
        return `<a href="${href}"${attrs} target="_blank" rel="noopener">${text}${mark}</a>`;
      })
      // Code: the terminal's own colours, not the highlighter's.
      .replace(/<pre class="astro-code[^>]*>/g, (tag: string) => {
        const lang = tag.match(/\sdata-language="([^"]*)"/)?.[1];
        return `<pre class="t-code" tabindex="0"${lang ? ` data-language="${lang}"` : ''}>`;
      })
      .replace(/<span style="color:[^"]*">/g, '<span>')
      .replace(/<table>/g, '<div class="t-scroll"><table>')
      .replace(/<\/table>/g, '</table></div>')
  );
}
