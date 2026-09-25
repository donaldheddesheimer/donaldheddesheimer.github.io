// Canvas2D renderer and playback controller for MissionCanvas.astro. Mounts onto each [data-mission-root].
// Layers: static terrain + coordinate grid (per run/resize), fog (cleared cell by cell as the LiDAR sweeps),
// hazards (redrawn when a rock is first seen), then the moving parts every frame.
import { CUTOFF, DEFAULT_SEED, DIMS, DT, FOV, RANGE, ROBOT_R, Sim, makeWorld, runSeed, toFirstReplan, type Orientation } from './rover-sim';

type RGB = number[];
// Design tokens read from :root at mount. A missing or non-hex token falls back to a neutral gray.
const TOKENS = ['bg', 'panel', 'panel-2', 'line', 'line-2', 'text', 'muted', 'blue-3', 'green', 'green-2', 'orange'] as const;
type Tok = (typeof TOKENS)[number];
const TAU = Math.PI * 2;
const MONO = '500 12px "JetBrains Mono",ui-monospace,monospace';
const hex = (s: string): RGB => {
  const v = parseInt(s.slice(1), 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
};
const rgba = (c: RGB, a = 1) => `rgba(${c},${a})`;
const mix = (a: RGB, b: RGB, t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t))})`;

export function mountAll() {
  document.querySelectorAll<HTMLElement>('[data-mission-root]').forEach(mount);
}

export function mount(root: HTMLElement) {
  if (root.dataset.mounted != null) return;
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  const stage = q('[data-mission-stage]');
  const canvas = q<HTMLCanvasElement>('canvas');
  const toggle = q('[data-mission-toggle]');
  const ctx = canvas?.getContext('2d');
  if (!stage || !canvas || !toggle || !ctx) return;
  root.dataset.mounted = '';

  const out = ['state', 'waypoint', 'obstacles'].map((k) => q(`[data-sim-readout="${k}"]`));
  const cs = getComputedStyle(document.documentElement);
  const C = {} as Record<Tok, RGB>;
  for (const k of TOKENS) {
    const v = cs.getPropertyValue('--' + k).trim();
    C[k] = hex(/^#[\da-f]{6}$/i.test(v) ? v : '#8f99a8');
  }
  const seedAttr = Number(root.dataset.seed);
  const base = Number.isFinite(seedAttr) && root.dataset.seed ? seedAttr : DEFAULT_SEED;
  const html = document.documentElement;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOK = () => !mq.matches && html.dataset.motion !== 'off';
  const layers = [0, 1, 2].map(() => document.createElement('canvas'));
  const [stat, fog, haz] = layers;
  const fctx = fog.getContext('2d')!;
  const hctx = haz.getContext('2d')!;

  let sim: Sim | undefined;
  let orient: Orientation | undefined;
  let run = 0;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let cell = 1;
  let ox = 0;
  let oy = 0;
  let xs: number[] = [];
  let ys: number[] = [];
  let hazN = -1;
  let intent = motionOK(); // wants to play
  let userPaused = false;
  let inView = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let drawn = false;

  const clip = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.rect(ox, oy, sim!.cols * cell, sim!.rows * cell);
    c.clip();
  };
  const clearCell = (i: number) => {
    const x = i % sim!.cols;
    const y = (i / sim!.cols) | 0;
    fctx.clearRect(xs[x], ys[y], xs[x + 1] - xs[x], ys[y + 1] - ys[y]);
  };

  function paintLayers() {
    const s = sim!;
    const { cols, rows } = s;
    const c = stat.getContext('2d')!;
    c.fillStyle = rgba(C.panel);
    c.fillRect(0, 0, stat.width, stat.height);
    // Terrain prior: low-contrast graphite shades, lighter = costlier.
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        c.fillStyle = mix(C['panel-2'], C.line, ((s.w.prior[y * cols + x] - 0.05) / 0.55) * 0.9);
        c.fillRect(xs[x], ys[y], xs[x + 1] - xs[x], ys[y + 1] - ys[y]);
      }
    const lw = Math.max(1, Math.round(dpr));
    const X0 = xs[0];
    const Y0 = ys[0];
    const gw = xs[cols] - X0;
    const gh = ys[rows] - Y0;
    c.fillStyle = rgba(C['line-2'], 0.55);
    for (let i = 8; i < cols; i += 8) c.fillRect(xs[i], Y0, lw, gh);
    for (let j = 8; j < rows; j += 8) c.fillRect(X0, ys[j], gw, lw);
    c.strokeStyle = rgba(C.line);
    c.lineWidth = lw;
    c.strokeRect(X0 + lw / 2, Y0 + lw / 2, gw - lw, gh - lw);
    // Fog of the unexplored: darker, with a sparse diagonal hatch.
    fctx.clearRect(0, 0, fog.width, fog.height);
    fctx.fillStyle = rgba(C.bg, 0.6);
    fctx.fillRect(X0, Y0, gw, gh);
    fctx.save();
    fctx.beginPath();
    fctx.rect(X0, Y0, gw, gh);
    fctx.clip();
    fctx.beginPath();
    for (let d = X0 - gh; d < X0 + gw; d += 9 * dpr) {
      fctx.moveTo(d, Y0 + gh);
      fctx.lineTo(d + gh, Y0);
    }
    fctx.strokeStyle = rgba(C['line-2'], 0.55);
    fctx.lineWidth = dpr;
    fctx.stroke();
    fctx.restore();
    s.seen.forEach((v, i) => v && clearCell(i));
    s.fresh.length = 0;
    hazN = -1;
  }

  function paintHazards() {
    const s = sim!;
    const c = hctx;
    hazN = s.seenRocks;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, haz.width, haz.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    clip(c);
    const rocks = s.w.rocks.filter((k) => k.seen);
    for (const k of rocks) {
      const X = ox + k.x * cell;
      const Y = oy + k.y * cell;
      const r = k.r * cell;
      const core = (k.r + ROBOT_R) * cell;
      const R = core + CUTOFF * cell;
      const g = c.createRadialGradient(X, Y, r, X, Y, R);
      g.addColorStop(0, rgba(C.orange, 0.3));
      g.addColorStop((core - r) / (R - r), rgba(C.orange, 0.18));
      g.addColorStop(1, rgba(C.orange, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(X, Y, R, 0, TAU);
      c.fill();
    }
    for (const k of rocks) {
      const X = ox + k.x * cell;
      const Y = oy + k.y * cell;
      const r = k.r * cell;
      c.beginPath();
      c.arc(X, Y, r, 0, TAU);
      c.fillStyle = rgba(C.panel);
      c.fill();
      c.save();
      c.clip();
      c.beginPath();
      for (let d = -2 * r; d < 2 * r; d += 3.5) {
        c.moveTo(X + d - r, Y + r);
        c.lineTo(X + d + r, Y - r);
      }
      c.strokeStyle = rgba(C.orange, 0.7);
      c.lineWidth = 1;
      c.stroke();
      c.restore();
      c.beginPath();
      c.arc(X, Y, r, 0, TAU);
      c.strokeStyle = rgba(C.orange);
      c.lineWidth = 1.25;
      c.stroke();
    }
    c.restore();
  }

  function draw(alpha: number) {
    const s = sim;
    if (!s || !xs.length) return;
    for (const i of s.fresh) clearCell(i);
    s.fresh.length = 0;
    if (s.seenRocks !== hazN) paintHazards();
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.drawImage(stat, 0, 0);
    ctx!.drawImage(fog, 0, 0);
    ctx!.drawImage(haz, 0, 0);
    const c = ctx!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (v: number) => ox + v * cell;
    const Y = (v: number) => oy + v * cell;
    const a = Math.max(0, Math.min(1, alpha));
    const RX = X(s.px + (s.x - s.px) * a);
    const RY = Y(s.py + (s.y - s.py) * a);
    const RH = s.ph + Math.atan2(Math.sin(s.h - s.ph), Math.cos(s.h - s.ph)) * a;
    c.lineJoin = c.lineCap = 'round';
    c.save();
    clip(c);
    // LiDAR wedge.
    c.beginPath();
    c.moveTo(RX, RY);
    c.arc(RX, RY, RANGE * cell, RH - FOV, RH + FOV);
    c.closePath();
    c.fillStyle = rgba(C['blue-3'], 0.08);
    c.fill();
    c.strokeStyle = rgba(C['blue-3'], 0.6);
    c.lineWidth = 1;
    c.stroke();
    // Driven track: solid.
    c.beginPath();
    s.track.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))));
    c.lineTo(RX, RY);
    c.strokeStyle = rgba(C.green);
    c.lineWidth = 2;
    c.stroke();
    // Planned route: dashed.
    if (s.path.length) {
      c.beginPath();
      c.moveTo(RX, RY);
      for (let k = s.pi + 1; k < s.path.length; k++) c.lineTo(X(s.path[k].x), Y(s.path[k].y));
      c.setLineDash([5, 4]);
      c.strokeStyle = rgba(C['blue-3']);
      c.lineWidth = 1.5;
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();
    // GNSS waypoints: diamonds, filled once reached.
    c.font = MONO;
    c.textBaseline = 'middle';
    const d = Math.max(5, cell * 0.6);
    s.w.wps.forEach((p, k) => {
      const x = X(p.x);
      const y = Y(p.y);
      c.beginPath();
      c.moveTo(x, y - d);
      c.lineTo(x + d, y);
      c.lineTo(x, y + d);
      c.lineTo(x - d, y);
      c.closePath();
      if (p.status === 1) {
        c.fillStyle = rgba(C.green);
        c.fill();
      }
      c.strokeStyle = rgba(p.status === 1 ? C['green-2'] : p.status === 2 ? C.muted : C.text);
      c.lineWidth = 1.5;
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = rgba(C.panel, 0.85);
      c.strokeText(`WP${k + 1}`, x + d + 4, y);
      c.fillStyle = rgba(k === s.target ? C.text : C.muted);
      c.fillText(`WP${k + 1}`, x + d + 4, y);
    });
    // Rover: chassis with a V notch cut into its front edge.
    const L = Math.max(14, cell * 1.8);
    const W = Math.max(10, cell * 1.25);
    c.save();
    c.translate(RX, RY);
    c.rotate(RH);
    c.beginPath();
    c.moveTo(-L / 2, -W / 2);
    c.lineTo(L / 2, -W / 2);
    c.lineTo(L / 2, -W * 0.22);
    c.lineTo(L / 2 - W * 0.4, 0);
    c.lineTo(L / 2, W * 0.22);
    c.lineTo(L / 2, W / 2);
    c.lineTo(-L / 2, W / 2);
    c.closePath();
    c.fillStyle = rgba(C.text);
    c.strokeStyle = rgba(C.panel);
    c.lineWidth = 1;
    c.fill();
    c.stroke();
    c.restore();
    // Brief REPLAN marker beside the rover.
    const age = s.t - s.replanT;
    if (s.replans && age < 1.6) {
      c.globalAlpha = Math.min(1, (1.6 - age) / 0.5);
      const tw = c.measureText('REPLAN').width + 10;
      const bx = Math.min(RX + 10, ox + s.cols * cell - tw - 2);
      const by = Math.max(RY - 28, oy + 2);
      c.fillStyle = rgba(C.panel);
      c.fillRect(bx, by, tw, 18);
      c.strokeStyle = rgba(C['blue-3']);
      c.strokeRect(bx + 0.5, by + 0.5, tw - 1, 17);
      c.fillStyle = rgba(C['blue-3']);
      c.fillText('REPLAN', bx + 5, by + 9);
      c.globalAlpha = 1;
    }
    const n = s.w.wps.length;
    [s.state, `${Math.min(s.target + 1, n)} of ${n}`, String(s.seenRocks)].forEach((v, i) => {
      if (out[i] && out[i]!.textContent !== v) out[i]!.textContent = v;
    });
    if (!drawn) root.setAttribute('data-drawn', ''); // hides the server-rendered poster
    drawn = true;
  }

  function newRun() {
    sim = new Sim(makeWorld(runSeed(base, run), orient!));
    // Reduced motion: show a representative still (just after the first replan) rather than frame 0.
    if (!intent && !motionOK()) toFirstReplan(sim);
    paintLayers();
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    acc += Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    for (; acc >= DT; acc -= DT) {
      sim!.step();
      if (sim!.done) {
        run++;
        newRun();
      }
    }
    draw(acc / DT);
  }

  function sync() {
    const go = !!sim && intent && inView && !document.hidden && !root.hasAttribute('data-suspended');
    if (go && !raf) {
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    } else if (!go && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    root.dataset.running = String(go);
    toggle!.setAttribute('aria-pressed', String(!intent));
  }

  function resize(cw: number, ch: number) {
    const r = Math.min(2, devicePixelRatio || 1);
    if (!cw || !ch || (cw === w && ch === h && r === dpr)) return;
    w = cw;
    h = ch;
    dpr = r;
    const fit = (o: Orientation) => Math.min(w / DIMS[o][0], h / DIMS[o][1]);
    const other: Orientation = orient === 'landscape' ? 'portrait' : 'landscape';
    const o: Orientation = !orient ? (fit('landscape') >= fit('portrait') ? 'landscape' : 'portrait') : fit(other) > fit(orient) * 1.1 ? other : orient;
    const [cols, rows] = DIMS[o];
    for (const el of [canvas!, ...layers]) {
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
    }
    cell = Math.min(w / cols, h / rows);
    ox = (w - cols * cell) / 2;
    oy = (h - rows * cell) / 2;
    xs = Array.from({ length: cols + 1 }, (_, i) => Math.round((ox + i * cell) * dpr));
    ys = Array.from({ length: rows + 1 }, (_, j) => Math.round((oy + j * cell) * dpr));
    if (o !== orient) {
      orient = o;
      newRun();
    } else paintLayers();
    draw(1);
    sync();
  }

  toggle.addEventListener('click', () => {
    intent = !intent;
    userPaused = !intent;
    sync();
  });
  q('[data-mission-restart]')?.addEventListener('click', () => {
    run++;
    if (orient) {
      newRun();
      draw(1);
    }
    sync();
  });
  const onMotion = () => {
    if (!motionOK()) intent = false;
    else if (!userPaused) intent = true;
    sync();
  };
  mq.addEventListener('change', onMotion);
  new MutationObserver(onMotion).observe(html, { attributes: true, attributeFilter: ['data-motion'] });
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-suspended'] });
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    sync();
  }).observe(stage);
  new ResizeObserver(([e]) => resize(e.contentRect.width, e.contentRect.height)).observe(stage);
  document.fonts?.ready.then(() => raf || draw(1));
  sync();
}
