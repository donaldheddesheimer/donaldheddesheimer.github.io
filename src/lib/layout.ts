// Typed ring layout for the systems map, read the way link-analysis tools read: the person is the
// anchor in the middle, organizations sit on an inner ring, the projects built at each org sit just
// outside it at its angle, personal projects share that ring between the org sectors, and
// capabilities sit on the outer ring near the work that uses them. Pure and dependency-free, in two
// steps: arrange() orders the rings so edges cross less and runs once at build time; layout() fits
// that plan to a frame and nudges apart anything that overlaps, cheaply enough to rerun in the
// browser whenever the map is resized.

export type EntityType = 'person' | 'org' | 'project' | 'skill';
export type LNode = { id: string; type: EntityType; label: string };
export type LEdge = { source: string; target: string };
export type Pos = { x: number; y: number };
// A node's place in the plan: its angle in radians, clockwise from 12 o'clock, and its ring as a
// fraction of the frame's half-width / half-height ellipse.
export type Polar = { a: number; r: number };

// labels: whether every label is drawn (full map) or only a few (minimap), which decides how much
// room each node reserves. labelScale: label glyph width relative to 11px text. bottom: px kept clear
// along the bottom edge (the map's hint line).
export type LayoutOpts = { width: number; height: number; pad?: number; labelScale?: number; labels?: boolean; bottom?: number };

// Visual radius and half the hit area of each node type, in px. The map's CSS uses the same numbers.
export const RADIUS: Record<EntityType, number> = { person: 18, org: 11, project: 9, skill: 3.5 };
const HIT: Record<EntityType, number> = { person: 22, org: 14, project: 14, skill: 12 };

const RING: Record<EntityType, number> = { person: 0, org: 0.46, project: 0.8, skill: 1 };
// Arc widths, in project slots: an org takes the same arc on its ring as a project on the project
// ring (or its projects' arc, if wider), and sectors are GAP apart.
const ORG_W = RING.project / RING.org;
const GAP = 0.3;
// Capabilities move toward the work that uses them but stay this share of an even spacing apart.
const SKILL_SPACING = 0.7;
// What a crossing costs: two edges drawn at rest cost most, a capability edge (drawn only while its
// node is traced) across one drawn at rest less, and two capability edges (never drawn together) least.
const COST = { rest: 10, traced: 3, hidden: 1 };
const TAU = Math.PI * 2;

const circMean = (angles: number[]) =>
  Math.atan2(
    angles.reduce((s, a) => s + Math.sin(a), 0),
    angles.reduce((s, a) => s + Math.cos(a), 0),
  );
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const permutations = <T>(xs: T[]): T[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
const side = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));

// The plan. The ring is a sequence of sectors: an org family (a top-level org, the orgs part of it
// and the projects built at them) or one personal project. A local search moves sectors round the
// ring, reorders the orgs and projects inside each family, and swaps capabilities, keeping any change
// that makes the crossings cheaper. Crossings survive stretching the rings into any ellipse, so the
// plan holds at every frame size.
export function arrange(nodes: LNode[], edges: LEdge[]): Polar[] {
  const type = new Map(nodes.map((n) => [n.id, n.type]));
  const list = edges.filter((e) => type.has(e.source) && type.has(e.target));
  const nbrs = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of list) {
    nbrs.get(e.source)!.push(e.target);
    nbrs.get(e.target)!.push(e.source);
  }
  const ids = (t: EntityType) => nodes.filter((n) => n.type === t).map((n) => n.id);
  const linked = (id: string, t: EntityType) => nbrs.get(id)!.filter((m) => type.get(m) === t);

  // An org linked to another org is part of it.
  const parent = new Map(list.filter((e) => type.get(e.source) === 'org' && type.get(e.target) === 'org').map((e) => [e.source, e.target]));
  const top = (id: string) => {
    for (let k = 0; parent.has(id) && k < 8; k++) id = parent.get(id)!;
    return id;
  };
  type Sector = { orgs: string[]; projects: string[] };
  const families = new Map<string, Sector>();
  for (const id of ids('org')) {
    if (!families.has(top(id))) families.set(top(id), { orgs: [], projects: [] });
    families.get(top(id))!.orgs.push(id);
  }
  // A project belongs to the first org it links to, unless it links to the person directly.
  const home = new Map<string, string>();
  const personal: Sector[] = [];
  for (const id of ids('project')) {
    const org = linked(id, 'person').length ? undefined : linked(id, 'org')[0];
    if (org) {
      home.set(id, org);
      families.get(top(org))!.projects.push(id);
    } else personal.push({ orgs: [], projects: [id] });
  }
  const own = (s: Sector, org: string) => s.projects.filter((p) => home.get(p) === org);
  const width = (s: Sector) => (s.orgs.length ? s.orgs.reduce((w, org) => w + Math.max(ORG_W, own(s, org).length), 0) : 1);
  const skills = ids('skill');

  // Lays the sectors out in order, then the capabilities in the given order, or sorted by the mean
  // angle of what uses them.
  const place = (order: Sector[], skillOrder?: string[]) => {
    const at = new Map<string, Polar>(ids('person').map((id) => [id, { a: 0, r: 0 }]));
    const unit = TAU / order.reduce((w, s) => w + width(s) + GAP, 0);
    let a = 0;
    for (const s of order) {
      a += (GAP / 2) * unit;
      if (!s.orgs.length) {
        at.set(s.projects[0], { a: a + unit / 2, r: RING.project });
        a += unit;
      }
      for (const org of s.orgs) {
        const mine = own(s, org);
        const w = Math.max(ORG_W, mine.length) * unit;
        at.set(org, { a: a + w / 2, r: RING.org });
        mine.forEach((p, k) => at.set(p, { a: a + w / 2 + (k - (mine.length - 1) / 2) * unit, r: RING.project }));
        a += w;
      }
      a += (GAP / 2) * unit;
    }
    const mean = new Map(
      skills.map((id) => {
        const placed = nbrs.get(id)!.filter((m) => at.has(m) && type.get(m) !== 'person');
        return [id, placed.length ? circMean(placed.map((m) => at.get(m)!.a)) : 0];
      }),
    );
    const ord = skillOrder ?? [...skills].sort((x, y) => wrap(mean.get(x)!) - wrap(mean.get(y)!));
    const step = TAU / Math.max(ord.length, 1);
    const offset = circMean(ord.map((id, k) => mean.get(id)! - k * step));
    const ang = ord.map((_, k) => offset + k * step);
    const want = ord.map((id, k) => ang[k] + wrap(mean.get(id)! - ang[k]));
    for (let it = 0; it < 40; it++) {
      ang.forEach((x, k) => (ang[k] += (want[k] - x) * 0.3));
      for (let k = 0; k < ang.length; k++) {
        const j = (k + 1) % ang.length;
        const short = step * SKILL_SPACING - (ang[j] - ang[k] + (j === 0 ? TAU : 0));
        if (short > 0) {
          ang[k] -= short / 2;
          ang[j] += short / 2;
        }
      }
    }
    ord.forEach((id, k) => at.set(id, { a: ang[k], r: RING.skill }));
    return { at, skillOrder: ord };
  };

  const isSkill = (id: string) => type.get(id) === 'skill';
  const cost = (at: Map<string, Polar>) => {
    const seg = list.map((e) => {
      const [p, q] = [at.get(e.source)!, at.get(e.target)!];
      return { e, hidden: isSkill(e.source) || isSkill(e.target), p: [Math.sin(p.a) * p.r, -Math.cos(p.a) * p.r], q: [Math.sin(q.a) * q.r, -Math.cos(q.a) * q.r] };
    });
    let c = 0;
    for (let i = 0; i < seg.length; i++)
      for (let j = i + 1; j < seg.length; j++) {
        const [x, y] = [seg[i], seg[j]];
        if (x.e.source === y.e.source || x.e.source === y.e.target || x.e.target === y.e.source || x.e.target === y.e.target) continue;
        if (side(x.p, x.q, y.p) !== side(x.p, x.q, y.q) && side(y.p, y.q, x.p) !== side(y.p, y.q, x.q))
          c += x.hidden && y.hidden ? COST.hidden : x.hidden || y.hidden ? COST.traced : COST.rest;
      }
    return c;
  };

  const search = (start: Sector[]) => {
    let order = start;
    let skillOrder = place(order).skillOrder;
    let best = cost(place(order, skillOrder).at);
    let better = true;
    const attempt = (change: () => void, undo: () => void) => {
      change();
      const c = cost(place(order, skillOrder).at);
      if (c < best) {
        best = c;
        better = true;
      } else undo();
    };
    const swap = (xs: string[], i: number, j: number) => ([xs[i], xs[j]] = [xs[j], xs[i]]);
    const swaps = (xs: string[]) => {
      for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) attempt(() => swap(xs, i, j), () => swap(xs, i, j));
    };
    for (let round = 0; better && round < 10; round++) {
      better = false;
      // Move each sector to every other slot, re-sorting the capabilities to follow.
      for (let i = 0; i < order.length; i++)
        for (let j = 0; j < order.length; j++) {
          if (i === j) continue;
          const [was, wasSkills] = [order, skillOrder];
          const rest = was.filter((_, k) => k !== i);
          attempt(
            () => {
              order = [...rest.slice(0, j), was[i], ...rest.slice(j)];
              skillOrder = place(order).skillOrder;
            },
            () => ([order, skillOrder] = [was, wasSkills]),
          );
        }
      for (const s of order) {
        if (s.orgs.length > 1 && s.orgs.length < 6)
          for (const p of permutations(s.orgs)) {
            const was = s.orgs;
            attempt(() => (s.orgs = p), () => (s.orgs = was));
          }
        if (s.orgs.length) swaps(s.projects);
      }
      swaps(skillOrder);
    }
    return { order, skillOrder, best };
  };

  // Start from every order of the families (there are only a few), with the personal projects dealt
  // between them, and keep the cheapest result.
  const [first, ...others] = [...families.values()];
  const copy = (s: Sector) => ({ orgs: [...s.orgs], projects: [...s.projects] });
  let win = { order: personal, skillOrder: skills, best: Infinity };
  for (const fams of first ? permutations(others).map((rest) => [first, ...rest]) : [[]]) {
    const start = fams.length ? fams.flatMap((f, k) => [f, ...personal.filter((_, j) => j % fams.length === k)]) : personal;
    const r = search(start.map(copy));
    if (r.best < win.best) win = r;
  }
  // Rounded, since the plan is written into the page.
  const { at } = place(win.order, win.skillOrder);
  return nodes.map((n) => {
    const p = at.get(n.id) ?? { a: 0, r: 0 };
    return { a: Math.round((((p.a % TAU) + TAU) % TAU) * 1e4) / 1e4, r: p.r };
  });
}

// The plan fitted to a frame. Every node keeps clear of the others' hit areas, and of their labels
// too when every label is drawn under its node.
export function layout(nodes: LNode[], plan: Polar[], { width, height: frame, pad = 40, labelScale = 1, labels = true, bottom = 0 }: LayoutOpts): Pos[] {
  const height = frame - bottom;
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(width / 2 - pad, 10);
  const ry = Math.max(height / 2 - pad, 10);
  const pos = plan.map(({ a, r }) => ({ x: cx + Math.sin(a) * rx * r, y: cy - Math.cos(a) * ry * r }));

  // Nudge apart any overlapping node + label boxes.
  const halfW = nodes.map((n) => Math.max(HIT[n.type] + 1, labels ? n.label.length * 3.2 * labelScale + 6 : 0));
  const below = nodes.map((n) => (labels ? RADIUS[n.type] + 17 * labelScale : HIT[n.type] + 1));
  const above = nodes.map((n) => (labels ? RADIUS[n.type] + 3 : HIT[n.type] + 1));
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
