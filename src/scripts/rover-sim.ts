// Illustrative rover-autonomy simulation core. It shows the approach, not recorded rover data:
// an 8-connected grid A* planner runs on a cost map built from a coarse terrain prior plus
// Gaussian-inflated obstacles that a forward LiDAR reveals as the rover drives to GNSS waypoints,
// and it replans whenever a newly sensed cost change lands on the remaining route.
// Pure and deterministic for a given seed, orientation and the fixed step DT. No DOM, no clocks.
// Units are grid cells; cell (i, j) spans [i, i+1) x [j, j+1); y grows downward.

export const DT = 1 / 60;
export const RANGE = 9; // LiDAR range
export const FOV = Math.PI / 3; // half-angle of the LiDAR wedge (+/-60 degrees)
export const ROBOT_R = 0.8; // added to each rock radius to get its lethal core
export const CUTOFF = 4; // extent of the Gaussian halo beyond the lethal core
export const SEED_CYCLE = 5; // runs cycle through DEFAULT_SEED .. DEFAULT_SEED + 4 (all tested)
export const DEFAULT_SEED = 3;

const SIGMA = 1.5;
const HALO = 3; // halo cost at the lethal boundary
const W_PRIOR = 1.5; // weight of the terrain prior
const LETHAL_STEP = 60; // only reachable when escaping a lethal start cell
const SPEED = 3.5; // cells per second
const TURN = 2.6; // radians per second
const LOOK = 1.7; // pure-pursuit lookahead
const ARRIVE = 0.6;
const HOLD_PLAN = 0.45;
const HOLD_REPLAN = 0.75;
const HOLD_WP = 0.9;
const HOLD_DONE = 2;

export type Orientation = 'landscape' | 'portrait';
export const DIMS: Record<Orientation, readonly [number, number]> = { landscape: [64, 40], portrait: [40, 56] };
export type SimState = 'Planning' | 'Following route' | 'Replanning' | 'Waypoint reached' | 'Waypoint skipped' | 'Run complete';
export type Pt = { x: number; y: number };
export type Rock = Pt & { r: number; seen?: boolean };
export type Waypoint = Pt & { status: 0 | 1 | 2 }; // pending | reached | skipped
export type World = { cols: number; rows: number; prior: Float32Array; rocks: Rock[]; wps: Waypoint[]; start: Pt };

export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** 8-connected A* over a cost grid with a binary heap and the octile heuristic. Lethal cells are impassable
 *  unless the search starts inside one (then it may only climb out, at a steep price). Returns cell indices. */
export function astar(cols: number, rows: number, cost: Float32Array, lethal: Uint8Array, s: number, t: number): number[] | null {
  const n = cols * rows;
  const g = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const hv: number[] = [];
  const hk: number[] = [];
  const tx = t % cols;
  const ty = (t / cols) | 0;
  const h = (i: number) => {
    const dx = Math.abs((i % cols) - tx);
    const dy = Math.abs(((i / cols) | 0) - ty);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const push = (v: number, k: number) => {
    let i = hv.length;
    hv.push(v);
    hk.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hv[i] = hv[p];
      hk[i] = hk[p];
      i = p;
    }
    hv[i] = v;
    hk[i] = k;
  };
  const pop = () => {
    const top = hv[0];
    const v = hv.pop()!;
    const k = hk.pop()!;
    const m = hv.length;
    if (m) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= m) break;
        if (c + 1 < m && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= k) break;
        hv[i] = hv[c];
        hk[i] = hk[c];
        i = c;
      }
      hv[i] = v;
      hk[i] = k;
    }
    return top;
  };
  if (lethal[t]) return null;
  g[s] = 0;
  push(s, h(s));
  while (hv.length) {
    const c = pop();
    if (closed[c]) continue;
    if (c === t) {
      const out = [c];
      for (let i = from[c]; i >= 0; i = from[i]) out.push(i);
      return out.reverse();
    }
    closed[c] = 1;
    const cx = c % cols;
    const cy = (c / cols) | 0;
    const esc = lethal[c];
    for (let k = 0; k < 8; k++) {
      const x = cx + DX[k];
      const y = cy + DY[k];
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const nb = y * cols + x;
      if (closed[nb]) continue;
      if (!esc && (lethal[nb] || (k > 3 && (lethal[cy * cols + x] || lethal[y * cols + cx])))) continue;
      const ng = g[c] + (k > 3 ? Math.SQRT2 : 1) * (1 + cost[nb] + (lethal[nb] ? LETHAL_STEP : 0));
      if (ng < g[nb]) {
        g[nb] = ng;
        from[nb] = c;
        push(nb, ng + h(nb));
      }
    }
  }
  return null;
}

/** Adds a rock's footprint to a cost map: lethal core (rock + robot radius) plus an additive Gaussian falloff. */
export function inflate(cols: number, rows: number, cost: Float32Array, lethal: Uint8Array, k: Rock) {
  const core = k.r + ROBOT_R;
  const R = core + CUTOFF;
  for (let y = Math.max(0, Math.floor(k.y - R)); y < Math.min(rows, Math.ceil(k.y + R)); y++) {
    for (let x = Math.max(0, Math.floor(k.x - R)); x < Math.min(cols, Math.ceil(k.x + R)); x++) {
      const d = Math.hypot(x + 0.5 - k.x, y + 0.5 - k.y);
      const i = y * cols + x;
      if (d <= core) lethal[i] = 1;
      else if (d < R) cost[i] += HALO * Math.exp(-((d - core) ** 2) / (2 * SIGMA * SIGMA));
    }
  }
}

/** Smooth two-octave value noise mapped to a low-to-medium traversal cost (think coarse DEM slope). */
function terrain(cols: number, rows: number, rnd: () => number) {
  const out = new Float32Array(cols * rows);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (const [s, amp] of [
    [11, 0.7],
    [4.5, 0.3],
  ]) {
    const gw = Math.ceil(cols / s) + 2;
    const lat = Float32Array.from({ length: gw * (Math.ceil(rows / s) + 2) }, rnd);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const fx = (x + 0.5) / s;
        const fy = (y + 0.5) / s;
        const ix = fx | 0;
        const iy = fy | 0;
        const u = sm(fx - ix);
        const v = sm(fy - iy);
        const a = lat[iy * gw + ix];
        const b = lat[iy * gw + ix + 1];
        const c = lat[(iy + 1) * gw + ix];
        const d = lat[(iy + 1) * gw + ix + 1];
        out[y * cols + x] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
      }
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of out) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return out.map((v) => 0.05 + 0.55 * ((v - lo) / (hi - lo || 1)) ** 1.3);
}

const cellOf = (cols: number, rows: number, p: Pt) =>
  Math.min(rows - 1, Math.max(0, Math.floor(p.y))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(p.x)));

/** Seeded world: terrain prior, 4 GNSS waypoints zig-zagging along the long axis, 12-16 hidden rocks
 *  (one near each leg so the first route usually runs into something). Re-rolls rocks until every
 *  waypoint is reachable with full knowledge. */
export function makeWorld(seed: number, o: Orientation): World {
  const [cols, rows] = DIMS[o];
  const rnd = mulberry32(seed);
  const prior = terrain(cols, rows, rnd);
  const land = o === 'landscape';
  const L = land ? cols : rows;
  const A = land ? rows : cols;
  const at = (u: number, v: number): Pt => {
    const a = Math.floor(u * L) + 0.5;
    const b = Math.floor(v * A) + 0.5;
    return land ? { x: a, y: b } : { x: b, y: a };
  };
  // Start and waypoints stay clear of the corners where the component's HTML overlays sit
  // (readouts top-left, controls top-right, badge bottom-left).
  const flip = rnd() < 0.5 ? 1 : 0;
  const start = at(0.05, (land ? 0.4 : 0.52) + rnd() * 0.2);
  const us = land ? [0.27, 0.49, 0.7, 0.9] : [0.31, 0.5, 0.68, 0.85];
  const wps: Waypoint[] = us.map((u, k) => ({
    ...at(u + (rnd() - 0.5) * 0.06, (k % 2 === flip ? 0.25 : 0.75) + (rnd() - 0.5) * 0.14),
    status: 0,
  }));
  const legs = [start, ...wps];
  let rocks: Rock[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    rocks = [];
    const n = 12 + Math.floor(rnd() * 5);
    for (let guard = 0; rocks.length < n && guard < 4000; guard++) {
      const r = 1 + rnd() * 1.5;
      let x: number;
      let y: number;
      if (rocks.length < 4) {
        const a = legs[rocks.length];
        const b = legs[rocks.length + 1];
        const t = 0.3 + rnd() * 0.4;
        const off = (rnd() - 0.5) * 2.4;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        x = a.x + dx * t - (dy / len) * off;
        y = a.y + dy * t + (dx / len) * off;
      } else {
        x = 1 + r + rnd() * (cols - 2 - 2 * r);
        y = 1 + r + rnd() * (rows - 2 - 2 * r);
      }
      if (x - r < 1 || y - r < 1 || x + r > cols - 1 || y + r > rows - 1) continue;
      if (Math.hypot(x - start.x, y - start.y) < r + ROBOT_R + 4) continue;
      if (wps.some((w) => Math.hypot(x - w.x, y - w.y) < r + ROBOT_R + 2.5)) continue;
      if (rocks.some((k) => Math.hypot(x - k.x, y - k.y) < r + k.r + 1.2)) continue;
      rocks.push({ x, y, r });
    }
    const cost = prior.map((p) => p * W_PRIOR);
    const lethal = new Uint8Array(cols * rows);
    for (const k of rocks) inflate(cols, rows, cost, lethal, k);
    let ok = true;
    for (let i = 0; ok && i < wps.length; i++) ok = !!astar(cols, rows, cost, lethal, cellOf(cols, rows, legs[i]), cellOf(cols, rows, wps[i]));
    if (ok) break;
  }
  return { cols, rows, prior, rocks, wps, start };
}

export class Sim {
  // `declare`: assigned in the constructor, so no field initializers are emitted.
  declare readonly w: World;
  declare readonly cols: number;
  declare readonly rows: number;
  /** Known cost map (prior + inflation of the rocks seen so far) and its lethal mask. */
  declare readonly cost: Float32Array;
  declare readonly lethal: Uint8Array;
  /** Cells the LiDAR has swept at least once. */
  declare readonly seen: Uint8Array;
  /** Cells revealed since the renderer last drained this list. */
  fresh: number[] = [];
  /** Index of the rock occupying each cell, or -1 (ground truth; the planner never reads it). */
  declare readonly rockAt: Int8Array;
  declare x: number;
  declare y: number;
  /** Heading, radians (y down). */
  declare h: number;
  /** Pose before the latest step, for render interpolation. */
  declare px: number;
  declare py: number;
  declare ph: number;
  /** Planned route as cell centers; `pi` is the index nearest the rover. */
  path: Pt[] = [];
  pi = 0;
  /** Driven track, sampled every 0.3 cells. */
  declare track: Pt[];
  target = 0;
  state: SimState = 'Planning';
  timer = 0;
  t = 0;
  replans = 0;
  replanT = -1;
  seenRocks = 0;
  done = false;

  constructor(w: World) {
    this.w = w;
    const { cols, rows } = w;
    this.cols = cols;
    this.rows = rows;
    this.cost = w.prior.map((p) => p * W_PRIOR);
    this.lethal = new Uint8Array(cols * rows);
    this.seen = new Uint8Array(cols * rows);
    this.rockAt = new Int8Array(cols * rows).fill(-1);
    w.wps.forEach((p) => (p.status = 0));
    w.rocks.forEach((k, j) => {
      k.seen = false;
      for (let y = Math.max(0, Math.floor(k.y - k.r)); y < Math.min(rows, Math.ceil(k.y + k.r)); y++)
        for (let x = Math.max(0, Math.floor(k.x - k.r)); x < Math.min(cols, Math.ceil(k.x + k.r)); x++)
          if (Math.hypot(x + 0.5 - k.x, y + 0.5 - k.y) <= k.r) this.rockAt[y * cols + x] = j;
    });
    const a = w.start;
    const b = w.wps[0];
    this.x = this.px = a.x;
    this.y = this.py = a.y;
    this.h = this.ph = Math.atan2(b.y - a.y, b.x - a.x);
    this.track = [{ x: a.x, y: a.y }];
    this.sense();
    this.next();
  }

  /** Advance one fixed step of DT seconds. */
  step() {
    if (this.done) return;
    this.t += DT;
    this.px = this.x;
    this.py = this.y;
    this.ph = this.h;
    if (this.state === 'Run complete') {
      if ((this.timer -= DT) <= 0) this.done = true;
      return;
    }
    const found = this.sense();
    const rest = this.path.slice(this.pi);
    if (found.some((k) => rest.some((p) => Math.hypot(p.x - k.x, p.y - k.y) < k.r + ROBOT_R + CUTOFF))) this.replan();
    if (this.path.length) {
      this.drive(this.state === 'Planning' ? 0 : this.state === 'Replanning' ? 0.4 : 1);
      const wp = this.w.wps[this.target];
      if (Math.hypot(wp.x - this.x, wp.y - this.y) < ARRIVE) {
        wp.status = 1;
        this.hold('Waypoint reached');
      } else if (this.state !== 'Following route' && (this.timer -= DT) <= 0) this.state = 'Following route';
    } else if ((this.timer -= DT) <= 0) {
      this.target++;
      this.next();
    }
    const last = this.track[this.track.length - 1];
    if (Math.hypot(this.x - last.x, this.y - last.y) > 0.3) this.track.push({ x: this.x, y: this.y });
  }

  private hold(s: SimState) {
    this.state = s;
    this.timer = HOLD_WP;
    this.path = [];
  }

  private next() {
    if (this.target >= this.w.wps.length) {
      this.hold('Run complete');
      this.timer = HOLD_DONE;
    } else if (this.plan()) {
      this.state = 'Planning';
      this.timer = HOLD_PLAN;
    } else this.skip();
  }

  private skip() {
    this.w.wps[this.target].status = 2;
    this.hold('Waypoint skipped');
  }

  private replan() {
    this.replans++;
    this.replanT = this.t;
    if (this.plan()) {
      this.state = 'Replanning';
      this.timer = HOLD_REPLAN;
    } else this.skip();
  }

  private plan() {
    const { cols, rows } = this;
    const p = astar(cols, rows, this.cost, this.lethal, cellOf(cols, rows, this), cellOf(cols, rows, this.w.wps[this.target]));
    this.path = p ? p.map((i) => ({ x: (i % cols) + 0.5, y: ((i / cols) | 0) + 0.5 })) : [];
    this.pi = 0;
    return !!p;
  }

  /** Ray-marched LiDAR sweep over the forward wedge; rocks occlude. Returns rocks seen for the first time. */
  private sense() {
    const { cols, rows, seen, rockAt, fresh } = this;
    const rocks = this.w.rocks;
    const found: Rock[] = [];
    for (let k = 0; k <= 40; k++) {
      const a = this.h - FOV + (FOV * k) / 20;
      const c = Math.cos(a);
      const s = Math.sin(a);
      for (let d = 0.35; d <= RANGE; d += 0.35) {
        const x = Math.floor(this.x + c * d);
        const y = Math.floor(this.y + s * d);
        if (x < 0 || y < 0 || x >= cols || y >= rows) break;
        const i = y * cols + x;
        if (!seen[i]) {
          seen[i] = 1;
          fresh.push(i);
        }
        const j = rockAt[i];
        if (j >= 0) {
          const rk = rocks[j];
          if (!rk.seen) {
            rk.seen = true;
            this.seenRocks++;
            inflate(cols, rows, this.cost, this.lethal, rk);
            found.push(rk);
          }
          break;
        }
      }
    }
    return found;
  }

  /** Pure-pursuit-style follower: steer at a lookahead point on the route with a rate-limited heading. */
  private drive(scale: number) {
    const P = this.path;
    const n = P.length;
    const { x, y } = this;
    const d2 = (p: Pt) => (p.x - x) ** 2 + (p.y - y) ** 2;
    let best = this.pi;
    for (let k = best + 1; k < Math.min(n, this.pi + 12); k++) if (d2(P[k]) < d2(P[best])) best = k;
    this.pi = best;
    let tx = P[n - 1].x;
    let ty = P[n - 1].y;
    for (let k = best; k < n; k++) {
      if (d2(P[k]) < LOOK * LOOK) continue;
      tx = P[k].x;
      ty = P[k].y;
      if (k > best) {
        const a = P[k - 1];
        const dx = tx - a.x;
        const dy = ty - a.y;
        const fx = a.x - x;
        const fy = a.y - y;
        const qa = dx * dx + dy * dy;
        const qb = 2 * (fx * dx + fy * dy);
        const s = (-qb + Math.sqrt(Math.max(0, qb * qb - 4 * qa * (fx * fx + fy * fy - LOOK * LOOK)))) / (2 * qa);
        tx = a.x + dx * s;
        ty = a.y + dy * s;
      }
      break;
    }
    const err = wrap(Math.atan2(ty - y, tx - x) - this.h);
    this.h = wrap(this.h + Math.max(-TURN * DT, Math.min(TURN * DT, err)));
    const v = Math.min(SPEED * scale * Math.max(0, Math.min(1, (Math.cos(err) - 0.3) / 0.7)), 0.6 + 2.5 * Math.sqrt(d2(P[n - 1])));
    this.x = x + Math.cos(this.h) * v * DT;
    this.y = y + Math.sin(this.h) * v * DT;
  }
}

/** Fast-forward headlessly to just after the first replan: the representative still frame. */
export function toFirstReplan(s: Sim, after = 0.6) {
  for (let i = 0; i < 120 / DT && !s.done && !(s.replans && s.t - s.replanT >= after); i++) s.step();
  return s;
}

/** Seed for the k-th run starting from `base`; cycles through SEED_CYCLE tested seeds. */
export const runSeed = (base: number, k: number) => base + (k % SEED_CYCLE);
