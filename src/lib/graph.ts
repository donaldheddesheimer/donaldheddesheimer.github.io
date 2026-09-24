// Builds the entity graph (person -> orgs -> projects -> shared skills) and lays it out
// at build time with a small deterministic force simulation, so the page renders without JS.
import type { CollectionEntry } from 'astro:content';
import { education, experience, orgs, profile, type OrgKind } from '../data/site';
import { duration, fmtMonth, statusLabel } from './format';

export type NodeType = 'person' | 'org' | 'project' | 'skill';

export type GNode = {
  id: string;
  type: NodeType;
  label: string;
  r: number;
  status?: string;
  x: number;
  y: number;
};

export type GEdge = { source: string; target: string; weak?: boolean };

export type Detail = {
  title: string;
  kind: string;
  code?: string;
  summary?: string;
  props: [string, string][];
  href?: string;
  hrefLabel?: string;
  links: { id: string; label: string; type: NodeType }[];
};

type Project = CollectionEntry<'projects'>;

const orgKindLabel: Record<OrgKind, string> = {
  education: 'University',
  work: 'Employer',
  research: 'Research group',
  team: 'Student team',
  event: 'Hackathon',
  school: 'High school',
};

const RADIUS: Record<NodeType, number> = { person: 22, org: 14, project: 11, skill: 6 };

export function buildGraph(projects: Project[]) {
  const nodes: Omit<GNode, 'x' | 'y'>[] = [];
  const edges: GEdge[] = [];
  const details: Record<string, Detail> = {};
  const add = (n: Omit<GNode, 'x' | 'y' | 'r'>) => nodes.push({ ...n, r: RADIUS[n.type] });
  const link = (a: string, b: string, weak = false) => edges.push({ source: a, target: b, weak });

  const ME = 'person:me';
  add({ id: ME, type: 'person', label: profile.name });
  details[ME] = {
    title: profile.name,
    kind: 'Person',
    code: 'OBJ-000',
    summary: profile.tagline,
    props: [
      ['Current', profile.status],
      ['Education', profile.school],
      ['GPA', education.gpa],
      ['Location', profile.location],
    ],
    href: '#experience',
    hrefLabel: 'View experience',
    links: [],
  };

  for (const o of orgs) {
    const id = `org:${o.id}`;
    add({ id, type: 'org', label: o.short });
    link(ME, id);
    if (o.parent) link(`org:${o.parent}`, id, true);
    const exp = experience.find((e) => e.org === o.id);
    const props: [string, string][] = [];
    let href: string | undefined;
    if (exp) {
      props.push(['Role', exp.role], ['Period', `${fmtMonth(exp.start)} – ${fmtMonth(exp.end)}`], ['Duration', duration(exp.start, exp.end)], ['Location', exp.location]);
      href = `#exp-${exp.id}`;
    } else if (o.id === education.org) {
      props.push(['Degree', `${education.degree}, ${education.program}`], ['Thread', education.thread], ['GPA', education.gpa], ['Expected', fmtMonth(education.end)]);
      href = '#exp-education';
    }
    details[id] = {
      title: o.name,
      kind: orgKindLabel[o.kind],
      props,
      href,
      hrefLabel: href ? 'Open record' : undefined,
      links: [],
    };
  }

  // Tags shared by at least two objects (projects or roles) become skill nodes.
  const tagUse = new Map<string, string[]>();
  const use = (tag: string, id: string) => tagUse.set(tag, [...(tagUse.get(tag) ?? []), id]);

  for (const p of projects) {
    const id = `project:${p.id}`;
    const d = p.data;
    add({ id, type: 'project', label: d.title.replace(/:.*/, ''), status: d.status });
    if (d.org) link(`org:${d.org}`, id);
    else link(ME, id);
    for (const r of d.related) link(`org:${r}`, id, true);
    d.tags.forEach((t) => use(t, id));
    details[id] = {
      title: d.title,
      kind: 'Project',
      code: d.code,
      summary: d.summary,
      props: [
        ['Status', statusLabel[d.status]],
        ['Started', fmtMonth(d.start)],
        ...(d.context ? ([['Context', d.context]] as [string, string][]) : []),
        ['Stack', d.tags.slice(0, 4).join(', ')],
      ],
      href: `/projects/${p.id}/`,
      hrefLabel: 'Open project',
      links: [],
    };
  }
  for (const e of experience) e.tags.forEach((t) => use(t, `org:${e.org}`));

  for (const [tag, users] of tagUse) {
    if (users.length < 2) continue;
    const id = `skill:${tag}`;
    add({ id, type: 'skill', label: tag });
    users.forEach((u) => link(u, id));
    details[id] = {
      title: tag,
      kind: 'Capability',
      props: [['Linked objects', String(users.length)]],
      links: [],
    };
  }

  // Neighbor lists for the inspector.
  const label = new Map(nodes.map((n) => [n.id, n] as const));
  for (const e of edges) {
    for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) {
      const n = label.get(b)!;
      details[a].links.push({ id: b, label: n.label, type: n.type });
    }
  }
  const order: NodeType[] = ['person', 'org', 'project', 'skill'];
  for (const d of Object.values(details)) d.links.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  return { nodes, edges, details };
}

// --- layout -------------------------------------------------------------------------------
// Radial layout: the person in the middle, then rings of orgs, capabilities, and projects.
// Each ring is ordered by the average angle of its neighbors (repeated a few times), which
// keeps connected things near each other and cuts down on edge crossings.

// labelScale: approximate label glyph width relative to 11px text, used to keep labels apart.
type LayoutOpts = { width: number; height: number; pad?: number; labelScale?: number };

// Ring radius for each type, as a fraction of the half-width / half-height ellipse.
const RING: Record<NodeType, number> = { person: 0, org: 0.34, skill: 0.62, project: 0.9 };
const TAU = Math.PI * 2;

const circMean = (angles: number[]) =>
  Math.atan2(
    angles.reduce((s, a) => s + Math.sin(a), 0),
    angles.reduce((s, a) => s + Math.cos(a), 0),
  );

export function layout(
  graph: { nodes: Omit<GNode, 'x' | 'y'>[]; edges: GEdge[] },
  { width, height, pad = 46, labelScale = 1 }: LayoutOpts,
): GNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - pad;
  const ry = height / 2 - pad;

  const nbrs = new Map<string, string[]>();
  for (const e of graph.edges) {
    nbrs.set(e.source, [...(nbrs.get(e.source) ?? []), e.target]);
    nbrs.set(e.target, [...(nbrs.get(e.target) ?? []), e.source]);
  }
  const ids = (t: NodeType) => graph.nodes.filter((n) => n.type === t).map((n) => n.id);

  const angle = new Map<string, number>();
  const rank = new Map<string, number>();
  ids('org').forEach((id, k, all) => angle.set(id, -Math.PI / 2 + (k / all.length) * TAU));

  const spread = (ring: string[]) => {
    const order = ring
      .map((id) => {
        const placed = (nbrs.get(id) ?? []).filter((m) => angle.has(m));
        return { id, b: placed.length ? circMean(placed.map((m) => angle.get(m)!)) : (angle.get(id) ?? 0) };
      })
      .sort((a, b) => a.b - b.b);
    const step = TAU / ring.length;
    const offset = circMean(order.map((o, k) => o.b - k * step));
    order.forEach((o, k) => {
      angle.set(o.id, offset + k * step);
      rank.set(o.id, k);
    });
  };
  const rings: NodeType[] = ['org', 'skill', 'project'];
  spread(ids('skill'));
  spread(ids('project'));
  for (let i = 0; i < 24; i++) rings.forEach((t) => spread(ids(t)));

  const pos = graph.nodes.map((n) => {
    if (n.type === 'person') return { x: cx, y: cy };
    const a = angle.get(n.id)!;
    // Stagger alternate nodes on the outer rings so neighboring labels have more room.
    const stagger = n.type === 'org' ? 0 : (rank.get(n.id)! % 2 ? -0.045 : 0.045);
    const r = RING[n.type] + stagger;
    return { x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r };
  });

  // Nudge apart any overlapping node + label boxes.
  const halfW = graph.nodes.map((n) => Math.max(n.r, n.label.length * 3.1 * labelScale + 4));
  const below = graph.nodes.map((n) => n.r + 16 * labelScale);
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = graph.nodes[i];
        const b = graph.nodes[j];
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const ox = halfW[i] + halfW[j] - Math.abs(dx);
        const oy = (dy > 0 ? below[i] + b.r : below[j] + a.r) + 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const wi = a.type === 'person' ? 0 : b.type === 'person' ? 1 : 0.5;
        if (oy < ox) {
          const s = Math.sign(dy) || 1;
          pos[i].y -= s * oy * wi;
          pos[j].y += s * oy * (1 - wi);
        } else {
          const s = Math.sign(dx) || 1;
          pos[i].x -= s * ox * wi;
          pos[j].x += s * ox * (1 - wi);
        }
      }
    }
    for (let i = 0; i < pos.length; i++) {
      pos[i].x = Math.min(width - halfW[i] - 4, Math.max(halfW[i] + 4, pos[i].x));
      pos[i].y = Math.min(height - below[i] - 4, Math.max(graph.nodes[i].r + 6, pos[i].y));
    }
    if (!moved) break;
  }

  return graph.nodes.map((n, i) => ({ ...n, x: Math.round(pos[i].x * 10) / 10, y: Math.round(pos[i].y * 10) / 10 }));
}
