// Radial layout for the systems map: the person in the middle, then rings of organizations,
// capabilities, and projects, with measured outcomes parked beside the thing they measure. Each ring
// is ordered by the average angle of its neighbors, so connected things sit near each other and
// edges cross less. Pure and dependency-free: it runs at build time for the no-JS view and in the
// browser whenever the map is resized.

export type EntityType = 'person' | 'org' | 'project' | 'skill' | 'outcome';
export type LNode = { id: string; type: EntityType; label: string };
export type LEdge = { source: string; target: string };
export type Pos = { x: number; y: number };

// labels: whether every label is drawn (full map) or only a few (minimap), which decides how much
// room each node reserves. labelScale: label glyph width relative to 11px text.
export type LayoutOpts = { width: number; height: number; pad?: number; labelScale?: number; labels?: boolean };

// Visual radius of each node type, in px. The map's CSS uses the same numbers.
export const RADIUS: Record<EntityType, number> = { person: 22, org: 13, project: 11, skill: 5, outcome: 6 };

// Ring radius for each type, as a fraction of the half-width / half-height ellipse.
const RING: Record<Exclude<EntityType, 'outcome'>, number> = { person: 0, org: 0.34, skill: 0.62, project: 0.9 };
const TAU = Math.PI * 2;

const circMean = (angles: number[]) =>
  Math.atan2(
    angles.reduce((s, a) => s + Math.sin(a), 0),
    angles.reduce((s, a) => s + Math.cos(a), 0),
  );

export function layout(nodes: LNode[], edges: LEdge[], { width, height, pad = 40, labelScale = 1, labels = true }: LayoutOpts): Pos[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(width / 2 - pad, 10);
  const ry = Math.max(height / 2 - pad, 10);

  const nbrs = new Map<string, string[]>();
  for (const e of edges) {
    nbrs.set(e.source, [...(nbrs.get(e.source) ?? []), e.target]);
    nbrs.set(e.target, [...(nbrs.get(e.target) ?? []), e.source]);
  }
  const ids = (t: EntityType) => nodes.filter((n) => n.type === t).map((n) => n.id);

  const angle = new Map<string, number>();
  const rank = new Map<string, number>();
  ids('org').forEach((id, k, all) => angle.set(id, -Math.PI / 2 + (k / all.length) * TAU));

  const spread = (ring: string[]) => {
    if (!ring.length) return;
    const order = ring
      .map((id) => {
        const placed = (nbrs.get(id) ?? []).filter((m) => angle.has(m) && !m.startsWith('outcome:'));
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
  const rings: EntityType[] = ['org', 'skill', 'project'];
  spread(ids('skill'));
  spread(ids('project'));
  for (let i = 0; i < 24; i++) rings.forEach((t) => spread(ids(t)));

  // Outcomes sit just inside or outside the one node they measure, fanned out if there are several.
  const byParent = new Map<string, string[]>();
  for (const id of ids('outcome')) {
    const parent = (nbrs.get(id) ?? [])[0];
    if (parent) byParent.set(parent, [...(byParent.get(parent) ?? []), id]);
  }
  const satellite = new Map<string, { a: number; r: number }>();
  const typeOf = new Map(nodes.map((n) => [n.id, n.type] as const));
  for (const [parent, kids] of byParent) {
    const pa = angle.get(parent) ?? 0;
    const pt = typeOf.get(parent)!;
    const r = pt === 'org' ? RING.org + 0.14 : pt === 'project' ? RING.project - 0.13 : 0.2;
    kids.forEach((id, k) => satellite.set(id, { a: pa + (k - (kids.length - 1) / 2) * 0.2, r }));
  }

  const pos = nodes.map((n) => {
    if (n.type === 'person') return { x: cx, y: cy };
    if (n.type === 'outcome') {
      const s = satellite.get(n.id) ?? { a: 0, r: 0.5 };
      return { x: cx + Math.cos(s.a) * rx * s.r, y: cy + Math.sin(s.a) * ry * s.r };
    }
    const a = angle.get(n.id)!;
    // Stagger alternate nodes on the outer rings so neighboring labels have more room.
    const stagger = n.type === 'org' ? 0 : rank.get(n.id)! % 2 ? -0.045 : 0.045;
    const r = RING[n.type] + stagger;
    return { x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r };
  });

  // Nudge apart any overlapping node + label boxes.
  const halfW = nodes.map((n) => Math.max(RADIUS[n.type] + 4, labels ? n.label.length * 3.2 * labelScale + 6 : 0));
  const below = nodes.map((n) => RADIUS[n.type] + (labels ? 17 * labelScale : 5));
  const above = nodes.map((n) => RADIUS[n.type] + 3);
  for (let iter = 0; iter < 90; iter++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const ox = halfW[i] + halfW[j] - Math.abs(dx);
        const oy = (dy > 0 ? below[i] + above[j] : below[j] + above[i]) - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const wi = nodes[i].type === 'person' ? 0 : nodes[j].type === 'person' ? 1 : 0.5;
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
      pos[i].x = Math.min(width - halfW[i] - 2, Math.max(halfW[i] + 2, pos[i].x));
      pos[i].y = Math.min(height - below[i] - 2, Math.max(above[i] + 2, pos[i].y));
    }
    if (!moved) break;
  }

  return pos.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
}
