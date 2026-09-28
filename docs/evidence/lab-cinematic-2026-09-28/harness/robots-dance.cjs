// The three dancers on the homepage's opening (/; PAGE overrides it) over one loop of the routine (32 beats
// at 112 BPM, 17.14 s), at 1440x900 (W and H override it), DPR 1. The page's clock is Playwright's fake clock, paused before load, so the scene's time
// `t` is known exactly: it is the fake performance.now() of the last animation frame minus the frozen time
// at which the loop started (every frame is 16 ms of fake time, under the scene's 0.1 s dt cap). The idle
// hint is cancelled with a Shift keypress first, so the monitor does not brighten mid-loop.
// Three.js is observed through its own __THREE_DEVTOOLS__ hook (an init script; nothing in src/ changes):
// the scene, and the camera of each draw. From them, every 32 ms of scene time, it logs for each robot:
// - where it is on screen (the projected vertices of its meshes, contact shadows left out), and whether any
//   of them fall inside the opening's text (the text-node and button rects of [data-lab-avoid], as fitHero
//   measures it) or the monitor's screen (__lab.quad(), and that quad grown 6% for the bezel); and its
//   closest approach to each of those text rects, in CSS px;
// - the smallest gap between its meshes' world boxes and another robot's (and Ivory's to the unfinished
//   robot and its stand): a negative gap means the boxes overlap, and is then checked vertex by vertex
//   against the other mesh's own shape (sphere, capsule, cylinder, else its oriented box), with the depth
//   (Ivory against the unfinished robot, and against the stand's parts: its plate, mast, arm, casters and
//   cable, both ways);
// - the lowest point of each foot (the floor is y = 0; the stand's plate top y = 0.135);
// - pelvis, head and hands, the head's heading, and what it points at (within 20 degrees): the camera,
//   another robot, the stand.
// It screenshots every 0.5 s of scene time (35 frames, t = 0 to 17 s) plus four marked moments (Graphite's
// nod, Terracotta's shimmy, Ivory at the stand, the still beat 21.2), composites contact sheets, then takes
// 30 consecutive 60 Hz frames (PNG) for the flicker check on the unfinished robot (robots-flicker.cjs reads
// them), and 30 more with the unfinished robot alone (dancers and dust hidden), each also drawn without its
// construction lines. RUN names the run's folder (run1, run2): two runs of the fake clock should measure
// the same. QUICK=1 measures only: no screenshots, flicker frames or contact sheets. LOOPS=n measures n loops
// (the camera's slow drift is about 48 s). The page's web fonts load (NOFONTS=1 blocks them, for offline
// runs; the text is then set in a fallback face, and the opening frames around that instead).
// The robots are found by their paint, not their floor spots, so the script follows them if they move.
// NODE_PATH=<playwright shim or $(npm root -g)> BASE=http://127.0.0.1:4322 OUT=<scratch dir> RUN=run1 \
//   LOG=../logs/robots-dance.log node robots-dance.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:4322';
const RUN = process.env.RUN || 'run1';
const OUT = path.join(process.env.OUT || path.join(__dirname, 'robots-out'), RUN);
const LOG = process.env.LOG || path.join(__dirname, '../logs/robots-dance.log');
const W = +process.env.W || 1440;
const H = +process.env.H || 900;
const PAGE = process.env.PAGE || '/';
const QUICK = !!process.env.QUICK;
const LOOPS = +process.env.LOOPS || 1;
const BPM = 112;
const BEATS = 32;
const LOOP = (BEATS * 60) / BPM;
const STILL_BEAT = 21.2;
fs.mkdirSync(OUT, { recursive: true });

const lines = [];
const log = (s) => {
  const t = String(s).replace(/[ \t]+$/gm, '');
  lines.push(t);
  console.log(t);
};
const r2 = (x, n = 3) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 10 ** n) / 10 ** n);
const beatOf = (t) => (((t * BPM) / 60) % BEATS + BEATS) % BEATS;
const section = (b) => (b < 8 ? 'warmUp' : b < 16 ? 'gestures' : b < 24 ? 'canon' : 'travel');
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const win = (x, a, b, c, d) => smooth(a, b, x) * (1 - smooth(c, d, x));
// The react() windows in scene.ts (beats, unlagged).
const REACT = {
  'T waves at G': [3, 3.5, 6, 6.6],
  'G turns to T': [5.4, 6.3, 8.4, 9.4],
  'G nods': [6.5, 7, 7.5, 8.2],
  'T hops round to I': [13.8, 14.8, 15.9, 16.9],
  'T shimmies at I': [14.7, 14.95, 15.75, 16],
  'I glances at T': [14.5, 14.9, 16, 16.5],
  'I inspects stand': [25.6, 26.6, 30.8, 31.8],
  'I hand to chin': [26.4, 27.2, 30.2, 31.2],
};
const activeReacts = (b) =>
  Object.entries(REACT)
    .map(([k, w]) => [k, win(b, ...w)])
    .filter(([, v]) => v > 0.05)
    .map(([k, v]) => `${k} ${r2(v, 2)}`);

// --- In-page probe (runs in the page; reads three.js objects the devtools hook handed over) ------------
function installProbe() {
  const S = window.__obs.scene;
  const near = (a, b) => Math.abs(a - b) < 1e-4;
  // A dancer is a group on the floor with a pelvis and two feet, painted its build's colour.
  const PAINT = { graphite: 0x464c54, ivory: 0xdcd5c6, terracotta: 0xb86a4e };
  const roots = {};
  let stand = null;
  for (const c of S.children) {
    const legs = c.type === 'Group' && near(c.position.y, 0) && c.children.filter((k) => k.type === 'Group').length >= 3;
    for (const [n, hex] of Object.entries(PAINT)) {
      let painted = false;
      if (legs) c.traverse((o) => o.isMesh && o.material.color && o.material.color.getHex() === hex && (painted = true));
      if (painted) roots[n] = c;
    }
    if (near(c.position.x, 1.75) && near(c.position.z, -2.0)) stand = c;
  }
  window.__rbRoots = ['graphite', 'ivory', 'terracotta'].map((n) => roots[n]);
  roots.proto = stand.children.find((k) => k.type === 'Group' && near(k.position.y, 0.135));
  const standMeshes = stand.children.filter((k) => k.isMesh);
  const rig = {};
  for (const [n, root] of Object.entries(roots)) {
    const groups = root.children.filter((k) => k.type === 'Group');
    const pelvis = groups[0];
    const feet = groups.slice(1);
    const chest = pelvis.children.find((k) => k.type === 'Group');
    const cg = chest.children.filter((k) => k.type === 'Group');
    const head = cg[0];
    const shoulders = cg.slice(1);
    const hands = shoulders.map((s) => s.children.find((k) => k.type === 'Group').children.find((k) => k.type === 'Group'));
    const parts = [];
    root.traverse((o) => {
      if ((o.isMesh || o.isLine) && !(o.material.transparent && o.material.depthWrite === false)) parts.push(o);
    });
    const footParts = feet.map((f) => {
      const a = [];
      f.traverse((o) => o.isMesh && a.push(o));
      return a;
    });
    let lineSegs = 0;
    root.traverse((o) => {
      if (o.isLine) lineSegs += o.geometry.attributes.position.count / (o.isLineSegments ? 2 : 1);
    });
    rig[n] = { root, pelvis, chest, head, hands, parts, footParts, lineSegs, verts: parts.reduce((s, m) => s + m.geometry.attributes.position.count, 0) };
  }
  // The opening's text, as fitHero measures it.
  const avoid = document.querySelector('[data-lab-avoid]');
  const textRects = [];
  const textLabels = [];
  const range = document.createRange();
  const walk = document.createTreeWalker(avoid, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    range.selectNodeContents(walk.currentNode);
    for (const r of range.getClientRects())
      if (r.width > 0 && r.height > 0) {
        textRects.push([r.left, r.top, r.right, r.bottom]);
        textLabels.push('text: ' + walk.currentNode.textContent.trim().slice(0, 24));
      }
  }
  avoid.querySelectorAll('a, button').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.width > 0) {
      textRects.push([r.left, r.top, r.right, r.bottom]);
      textLabels.push(b.tagName.toLowerCase() + ': ' + b.textContent.trim().slice(0, 24));
    }
  });
  const textBox = [Math.min(...textRects.map((r) => r[0])), Math.min(...textRects.map((r) => r[1])), Math.max(...textRects.map((r) => r[2])), Math.max(...textRects.map((r) => r[3]))];
  const canvas = document.querySelector('[data-lab-stage] canvas');
  const mul = (a, b) => {
    const o = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
    return o;
  };
  const worldBox = (m) => {
    const e = m.matrixWorld.elements;
    const a = m.geometry.attributes.position.array;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (wx < b[0]) b[0] = wx;
      if (wy < b[1]) b[1] = wy;
      if (wz < b[2]) b[2] = wz;
      if (wx > b[3]) b[3] = wx;
      if (wy > b[4]) b[4] = wy;
      if (wz > b[5]) b[5] = wz;
    }
    return b;
  };
  const gap = (a, b) => Math.max(a[0] - b[3], b[0] - a[3], a[1] - b[4], b[1] - a[4], a[2] - b[5], b[2] - a[5]);
  const inPoly = (q, x, y) => {
    let s = 0;
    for (let i = 0; i < q.length; i++) {
      const [ax, ay] = q[i];
      const [bx, by] = q[(i + 1) % q.length];
      const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (c === 0) continue;
      if (s === 0) s = Math.sign(c);
      else if (Math.sign(c) !== s) return false;
    }
    return true;
  };
  const grow = (q, k) => {
    const cx = q.reduce((s, p) => s + p[0], 0) / 4;
    const cy = q.reduce((s, p) => s + p[1], 0) / 4;
    return q.map(([x, y]) => [cx + (x - cx) * (1 + k), cy + (y - cy) * (1 + k)]);
  };
  const standBoxes = standMeshes.map(worldBox);
  const M4 = S.matrixWorld.constructor;
  const inv = new M4();
  const rel = new M4();
  // Vertices of mesh a inside mesh b's own shape (a sphere, capsule or cylinder as such; anything else as its
  // local bounding box), shrunk by 2 mm, and how deep the deepest one is (metres).
  // How deep the point (x, y, z), in mesh b's own frame, is inside b's shape (negative: outside).
  const depthIn = (b, x, y, z) => {
    const g = b.geometry;
    const P = g.parameters || {};
    if (!g.boundingBox) g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    if (g.type === 'SphereGeometry') return P.radius - Math.hypot(x, y, z);
    if (g.type === 'CapsuleGeometry') {
      const L = (P.height ?? P.length) / 2;
      return P.radius - Math.hypot(x, Math.max(0, Math.abs(y) - L), z);
    }
    if (g.type === 'CylinderGeometry') {
      const h = P.height / 2;
      const r = P.radiusBottom + ((P.radiusTop - P.radiusBottom) * (y + h)) / (2 * h);
      return Math.min(r - Math.hypot(x, z), h - Math.abs(y));
    }
    return Math.min(x - min.x, max.x - x, y - min.y, max.y - y, z - min.z, max.z - z);
  };
  // Of the points p (a flat xyz array) under the matrix e, how many are inside mesh b (shrunk by 2 mm), and
  // how deep the deepest is.
  const pointsIn = (p, e, b) => {
    let n = 0;
    let deep = 0;
    for (let i = 0; i < p.length; i += 3) {
      const x = e[0] * p[i] + e[4] * p[i + 1] + e[8] * p[i + 2] + e[12];
      const y = e[1] * p[i] + e[5] * p[i + 1] + e[9] * p[i + 2] + e[13];
      const z = e[2] * p[i] + e[6] * p[i + 1] + e[10] * p[i + 2] + e[14];
      const d = depthIn(b, x, y, z);
      if (d > 0.002) {
        n++;
        if (d > deep) deep = d;
      }
    }
    return [n, deep];
  };
  const inside = (a, b) => pointsIn(a.geometry.attributes.position.array, rel.multiplyMatrices(inv.copy(b.matrixWorld).invert(), a.matrixWorld).elements, b);
  // The stand's meshes are merged into one per material, so their shapes are lost: it is checked against its
  // parts as buildStand (scene.ts) makes them, in the stand's frame: boxes [x, y, z, width, height, depth],
  // with the casters as the boxes around them and the cable as a chain of 2 cm boxes along its curve. Ivory's
  // vertices are tested inside each part, and each part's surface (sampled every 2 cm) inside Ivory's meshes.
  const standParts = [
    [0, 0.09, 0, 0.8, 0.06, 0.8],
    [0, 0.125, 0, 0.84, 0.02, 0.84],
    [0, 1.08, -0.34, 0.07, 1.9, 0.07],
    [0, 1.22, -0.2, 0.07, 0.07, 0.3],
    [0, 1.22, -0.06, 0.36, 0.05, 0.05],
    [0, 1.62, -0.3, 0.12, 0.12, 0.04],
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * 0.34, 0.035, sz * 0.34, 0.03, 0.07, 0.07])),
  ];
  {
    const V = S.position.constructor;
    const C = [new V(0, 1.62, -0.3), new V(0.12, 1.3, -0.24), new V(0.08, 1.05, -0.14)];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const [a, b] = t < 0.5 ? [C[0], C[1]] : [C[1], C[2]];
      const u = t < 0.5 ? t * 2 : t * 2 - 1;
      standParts.push([a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u, 0.02, 0.02, 0.02]);
    }
  }
  const standSurface = standParts.map(([cx, cy, cz, w, h, d]) => {
    const pts = [];
    const steps = (s) => Math.max(1, Math.ceil(s / 0.02));
    const [nx, ny, nz] = [steps(w), steps(h), steps(d)];
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= ny; j++)
        for (let k = 0; k <= nz; k++)
          if (i === 0 || i === nx || j === 0 || j === ny || k === 0 || k === nz) pts.push(cx + w * (i / nx - 0.5), cy + h * (j / ny - 0.5), cz + d * (k / nz - 0.5));
    return pts;
  });
  const standVsIvory = (ivory) => {
    let hits = 0;
    let depth = 0;
    const what = [];
    const toStand = inv.copy(stand.matrixWorld).invert();
    for (const a of ivory) {
      const e = rel.multiplyMatrices(toStand, a.m.matrixWorld).elements;
      const p = a.m.geometry.attributes.position.array;
      const back = new M4().copy(a.m.matrixWorld).invert().multiply(stand.matrixWorld).elements;
      standParts.forEach(([cx, cy, cz, w, h, d], i) => {
        let n = 0;
        let deep = 0;
        for (let v = 0; v < p.length; v += 3) {
          const x = e[0] * p[v] + e[4] * p[v + 1] + e[8] * p[v + 2] + e[12];
          const y = e[1] * p[v] + e[5] * p[v + 1] + e[9] * p[v + 2] + e[13];
          const z = e[2] * p[v] + e[6] * p[v + 1] + e[10] * p[v + 2] + e[14];
          const dd = Math.min(w / 2 - Math.abs(x - cx), h / 2 - Math.abs(y - cy), d / 2 - Math.abs(z - cz));
          if (dd > 0.002) {
            n++;
            if (dd > deep) deep = dd;
          }
        }
        const [n2, d2] = pointsIn(standSurface[i], back, a.m);
        if (n + n2) {
          hits += n + n2;
          depth = Math.max(depth, deep, d2);
          what.push(`${tag(a.m)}~part${i}:${n + n2}/${Math.round(Math.max(deep, d2) * 1000)}mm`);
        }
      });
    }
    what.sort((p, q) => +q.split('/')[1].replace('mm', '') - +p.split('/')[1].replace('mm', ''));
    return { hits, depth, what: what.slice(0, 4) };
  };
  const tag = (m) => `${m.geometry.type.replace('Geometry', '')}#${m.material.color ? m.material.color.getHexString() : ''}`;
  window.__rb = {
    info() {
      return { labels: textLabels, rects: textRects.map((r) => r.map(Math.round)), found: Object.keys(rig), roots: Object.fromEntries(Object.entries(rig).map(([n, r]) => { const e = r.root.matrixWorld.elements; return [n, [e[12], e[14]]]; })), textBox: textBox.map((v) => Math.round(v)), textRects: textRects.length, standMeshes: standMeshes.length, verts: Object.fromEntries(Object.entries(rig).map(([n, r]) => [n, r.verts])), lineSegs: Object.fromEntries(Object.entries(rig).map(([n, r]) => [n, r.lineSegs])) };
    },
    measure() {
      const cam = window.__obs.camera;
      const PV = mul(cam.projectionMatrix.elements, cam.matrixWorldInverse.elements);
      const cr = canvas.getBoundingClientRect();
      const quad = window.__lab.quad();
      const quadB = grow(quad, 0.06);
      const camPos = [cam.position.x, cam.position.y, cam.position.z];
      const out = { robots: {}, quad, cam: camPos };
      const boxes = {};
      const solids = {};
      for (const [n, r] of Object.entries(rig)) {
        let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity, ymin = Infinity;
        const textHit = {};
        let inText = 0, inTextBox = 0, inScreen = 0, inBezel = 0, onScreenPx = 0, offFrame = 0, n0 = 0;
        // Closest approach to each text rect (CSS px; 0 inside it).
        const closest = textRects.map(() => Infinity);
        const mb = [];
        for (const m of r.parts) {
          const e = m.matrixWorld.elements;
          const a = m.geometry.attributes.position.array;
          const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
          for (let i = 0; i < a.length; i += 3) {
            const x = a[i], y = a[i + 1], z = a[i + 2];
            const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
            const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
            const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
            if (wx < b[0]) b[0] = wx;
            if (wy < b[1]) b[1] = wy;
            if (wz < b[2]) b[2] = wz;
            if (wx > b[3]) b[3] = wx;
            if (wy > b[4]) b[4] = wy;
            if (wz > b[5]) b[5] = wz;
            if (wy < ymin) ymin = wy;
            const cw = PV[3] * wx + PV[7] * wy + PV[11] * wz + PV[15];
            if (cw <= 0) continue;
            const px = cr.left + ((PV[0] * wx + PV[4] * wy + PV[8] * wz + PV[12]) / cw + 1) / 2 * cr.width;
            const py = cr.top + (1 - (PV[1] * wx + PV[5] * wy + PV[9] * wz + PV[13]) / cw) / 2 * cr.height;
            n0++;
            if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) offFrame++;
            if (px < sx0) sx0 = px;
            if (py < sy0) sy0 = py;
            if (px > sx1) sx1 = px;
            if (py > sy1) sy1 = py;
            for (let ti = 0; ti < textRects.length; ti++) {
              const q = textRects[ti];
              const d = Math.hypot(Math.max(q[0] - px, 0, px - q[2]), Math.max(q[1] - py, 0, py - q[3]));
              if (d < closest[ti]) closest[ti] = d;
            }
            if (px >= textBox[0] && px <= textBox[2] + 16 && py >= textBox[1] && py <= textBox[3] + 16) {
              inTextBox++;
              for (let ti = 0; ti < textRects.length; ti++) {
                const t = textRects[ti];
                if (px >= t[0] && px <= t[2] && py >= t[1] && py <= t[3]) {
                  inText++;
                  textHit[ti] = (textHit[ti] || 0) + 1;
                  break;
                }
              }
            }
            if (inPoly(quadB, px, py)) {
              inBezel++;
              if (inPoly(quad, px, py)) inScreen++;
            }
          }
          mb.push(b);
        }
        boxes[n] = mb;
        solids[n] = r.parts.map((m, i) => ({ m, b: mb[i] })).filter((p) => p.m.isMesh);
        const feet = r.footParts.map((ps) => Math.min(...ps.map((m) => worldBox(m)[1])));
        const wp = (o) => {
          const e = o.matrixWorld.elements;
          return [e[12], e[13], e[14]];
        };
        const he = r.head.matrixWorld.elements;
        const fwd = [he[8], he[9], he[10]];
        const len = Math.hypot(...fwd);
        out.robots[n] = {
          screen: [sx0, sy0, sx1, sy1].map((v) => Math.round(v * 10) / 10),
          verts: n0,
          offFrame,
          inText,
          closest,
          textHit: Object.entries(textHit).map(([i, c]) => ({ rect: textRects[i].map(Math.round), label: textLabels[i], n: c })),
          inTextBox,
          inScreen,
          inBezel,
          ymin,
          feet,
          pelvis: wp(r.pelvis),
          head: wp(r.head),
          headFwd: fwd.map((v) => v / len),
          hands: r.hands.map(wp),
          pose: { hYaw: r.head.rotation.y, hPitch: r.head.rotation.x, hRoll: r.head.rotation.z, cYaw: r.chest.rotation.y, cPitch: r.chest.rotation.x, cRoll: r.chest.rotation.z, pYaw: r.pelvis.rotation.y },
        };
      }
      // Smallest gap between mesh boxes of different robots (and Ivory to the unfinished robot and stand).
      const names = ['graphite', 'ivory', 'terracotta'];
      out.gaps = {};
      for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++) {
          let g = Infinity;
          for (const a of boxes[names[i]]) for (const b of boxes[names[j]]) g = Math.min(g, gap(a, b));
          out.gaps[`${names[i]}-${names[j]}`] = g;
        }
      let gp = Infinity;
      for (const a of boxes.ivory) for (const b of boxes.proto) gp = Math.min(gp, gap(a, b));
      out.gaps['ivory-proto'] = gp;
      let gs = Infinity;
      for (const a of boxes.ivory) for (const b of standBoxes) gs = Math.min(gs, gap(a, b));
      out.gaps['ivory-stand(merged boxes)'] = gs;
      // Where mesh boxes of two robots overlap, count vertices of each mesh inside the other mesh's own
      // shape (see inside()), shrunk by 2 mm, and keep the deepest: 0 means no interpenetration.
      out.obb = {};
      for (const [x, y] of [['graphite', 'terracotta'], ['graphite', 'ivory'], ['ivory', 'terracotta'], ['ivory', 'proto']]) {
        let hits = 0;
        let depth = 0;
        const what = [];
        for (const a of solids[x])
          for (const b of solids[y]) {
            if (gap(a.b, b.b) > 0) continue;
            const [n1, d1] = inside(a.m, b.m);
            const [n2, d2] = inside(b.m, a.m);
            if (n1 + n2) {
              hits += n1 + n2;
              depth = Math.max(depth, d1, d2);
              what.push(`${tag(a.m)}~${tag(b.m)}:${n1 + n2}/${Math.round(Math.max(d1, d2) * 1000)}mm`);
            }
          }
        what.sort((p, q) => +q.split('/')[1].replace('mm', '') - +p.split('/')[1].replace('mm', ''));
        out.obb[`${x}-${y}`] = { hits, depth, what: what.slice(0, 4) };
      }
      out.obb['ivory-stand'] = standVsIvory(solids.ivory);
      return out;
    },
  };
  return window.__rb.info();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  if (process.env.NOFONTS) await ctx.route(/^https:\/\/fonts\./, (r) => r.abort());
  await ctx.addInitScript(() => {
    window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__obs = { renders: 0 };
    window.__THREE_DEVTOOLS__.addEventListener('observe', (e) => {
      const o = e.detail;
      if (!o.isWebGLRenderer) return;
      const render = o.render;
      o.render = function (s, c) {
        if (s && s.fog) {
          window.__obs.scene = s;
          window.__obs.camera = c;
          window.__obs.renders++;
        }
        return render.call(this, s, c);
      };
    });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-09-27T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-27T12:00:01Z'));
  await page.goto(BASE + PAGE + '?probe', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready); // the text as it is set (Inter), which the opening frames around
  const renderer = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl');
    const d = g && g.getExtension('WEBGL_debug_renderer_info');
    return g ? (d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) : 'no webgl';
  });
  log(`# robots-dance ${new Date().toISOString()} renderer="${renderer}" server=${BASE} viewport=${W}x${H} dpr=1 run=${RUN}`);
  log('# fake clock (Playwright page.clock, paused); scene time t = last rAF time - loop start; beat = t*112/60 mod 32');
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ renderer, server: BASE, run: RUN, at: new Date().toISOString() }));
  // Record the fake time each animation frame ran at.
  await page.evaluate(() => {
    const orig = window.requestAnimationFrame;
    window.__raf = { n: 0, now: null };
    window.requestAnimationFrame = (cb) =>
      orig((ts) => {
        window.__raf.n++;
        window.__raf.now = performance.now();
        cb(ts);
      });
  });
  const poll = async (fn, ms = 60000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await page.evaluate(fn);
      if (v) return v;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };
  await page.clock.runFor(1500); // the idle callback that loads the scene (timeout 1200 ms)
  const drawn = await poll(() => {
    const r = document.querySelector('[data-lab-root]');
    return r && (r.hasAttribute('data-drawn') || r.hasAttribute('data-failed')) && window.__lab && window.__obs.camera && r.dataset.running === 'true' ? (r.hasAttribute('data-failed') ? 'failed' : 'drawn') : 0;
  });
  if (drawn !== 'drawn') {
    log(`FAIL scene did not draw (${drawn}) errors=${JSON.stringify(errors)}`);
    fs.writeFileSync(LOG, lines.join('\n') + '\n');
    await browser.close();
    process.exit(1);
  }
  await page.keyboard.press('Shift'); // cancels the idle hint (endHint), which is not what this checks
  await new Promise((r) => setTimeout(r, 900)); // real time: the canvas's 0.7 s fade-in (a CSS transition)
  const T0 = await page.evaluate(() => performance.now());
  const info = await page.evaluate(installProbe);
  const st0 = await page.evaluate(() => ({ hint: document.querySelector('[data-lab-root]').dataset.hint, pcAble: document.documentElement.hasAttribute('data-pc-able'), stats: window.__lab.stats() }));
  log(`probe ${JSON.stringify(info)}`);
  log(`state hint=${st0.hint} pcAble=${st0.pcAble} heroDist=${r2(st0.stats.heroDist)} lines=${st0.stats.lines} triangles=${st0.stats.triangles} calls=${st0.stats.calls}`);

  const tNow = async () => {
    const n = await page.evaluate(() => window.__raf.now);
    return n == null ? 0 : (n - T0) / 1000;
  };
  const marks = [
    [0, 'f'],
    ...Array.from({ length: 34 }, (_, k) => [(k + 1) * 0.5, 'f']),
    [(7.28 * 60) / BPM, 'nod'],
    [(15.3 * 60) / BPM, 'shimmy'],
    [(STILL_BEAT * 60) / BPM, 'still'],
    [(28.9 * 60) / BPM, 'inspect'],
    [(30.5 * 60) / BPM, 'hop'],
  ].sort((a, b) => a[0] - b[0]);
  const frames = [];
  const series = [];
  let mi = 0;
  const shoot = async (label, t) => {
    if (QUICK) return;
    const b = beatOf(t);
    const name = label === 'f' ? `f${String(frames.filter((f) => f.label === 'f').length).padStart(2, '0')}` : `k-${label}${label === 'text' || label === 'touch' ? '-' + t.toFixed(3) : ''}`;
    const file = path.join(OUT, `${name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
    frames.push({ name, label, t, beat: b, file });
  };
  let touchShots = 0;
  let lastTouch = -1;
  const sample = async () => {
    const t = await tNow();
    const m = await page.evaluate(() => window.__rb.measure());
    series.push({ t, beat: beatOf(t), m });
    // A robot's vertices inside the opening's text, or two robots' meshes inside each other: keep the frame.
    if (Object.values(m.robots).some((r) => r.inText)) await shoot('text', t);
    if (Object.values(m.obb).some((o) => o.depth > 0.01) && touchShots++ < 8 && t - lastTouch > 0.25) {
      lastTouch = t;
      await shoot('touch', t);
    }
    return t;
  };
  // t = 0: the frame drawn at mount.
  let t = await sample();
  while (mi < marks.length && marks[mi][0] <= t + 0.008) await shoot(marks[mi++][1], t);
  const END = LOOP * LOOPS + 0.1;
  while (t < END) {
    await page.clock.runFor(32);
    t = await sample();
    while (mi < marks.length && marks[mi][0] <= t + 0.008) await shoot(marks[mi++][1], t);
  }
  log(`samples ${series.length} (every 32 ms of scene time, t 0 to ${r2(t)} s), frames ${frames.length}, rAF calls ${await page.evaluate(() => window.__raf.n)}`);

  // 30 consecutive 60 Hz frames (PNG) for the flicker check, from t about 17.3 s (beat 0.3, warm-up).
  if (!QUICK) {
  const flick = [];
  for (let i = 0; i < 30; i++) {
    await page.clock.runFor(16);
    const ft = await tNow();
    const file = path.join(OUT, `flick-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    const m = await page.evaluate(() => window.__rb.measure());
    flick.push({ t: ft, file, proto: m.robots.proto.screen, ivory: m.robots.ivory.screen, graphite: m.robots.graphite.screen, terracotta: m.robots.terracotta.screen });
  }
  // The same last frame with the unfinished robot's construction lines hidden (one extra draw at the same
  // t, through __lab.stats()), so robots-flicker.cjs can tell the line pixels apart.
  await page.evaluate(() => {
    const S = window.__obs.scene;
    const stand = S.children.find((c) => Math.abs(c.position.x - 1.75) < 1e-4 && Math.abs(c.position.z + 2.0) < 1e-4);
    window.__protoLines = [];
    stand.traverse((o) => o.isLine && window.__protoLines.push(o));
    window.__protoLines.forEach((o) => (o.visible = false));
    window.__lab.stats();
  });
  await page.screenshot({ path: path.join(OUT, 'flick-nolines.png') });
  await page.evaluate(() => {
    window.__protoLines.forEach((o) => (o.visible = true));
    window.__lab.stats();
  });
  await page.screenshot({ path: path.join(OUT, 'flick-lines.png') });
  fs.writeFileSync(path.join(OUT, 'flicker.json'), JSON.stringify(flick));
  // The next 30 frames with the unfinished robot alone: the three dancers and the dust hidden, so nothing
  // else moves over its box. Each is drawn again at the same t with its construction lines hidden
  // (iso-nl-XX.png, one extra draw through __lab.stats()), which marks the line pixels frame by frame.
  await page.evaluate(() => {
    const S = window.__obs.scene;
    window.__rbRoots.forEach((c) => (c.visible = false));
    S.traverse((o) => o.isPoints && (o.material.visible = false));
  });
  const iso = [];
  for (let i = 0; i < 30; i++) {
    await page.clock.runFor(16);
    const ft = await tNow();
    const n = String(i).padStart(2, '0');
    await page.screenshot({ path: path.join(OUT, `iso-${n}.png`) });
    const m = await page.evaluate(() => window.__rb.measure());
    await page.evaluate(() => {
      window.__protoLines.forEach((o) => (o.visible = false));
      window.__lab.stats();
    });
    await page.screenshot({ path: path.join(OUT, `iso-nl-${n}.png`) });
    await page.evaluate(() => window.__protoLines.forEach((o) => (o.visible = true)));
    iso.push({ t: ft, proto: m.robots.proto.screen });
  }
  fs.writeFileSync(path.join(OUT, 'iso.json'), JSON.stringify(iso));
  fs.writeFileSync(path.join(OUT, 'series.json'), JSON.stringify({ T0, series, frames, info }));
  log(`flicker frames ${flick.length} t ${r2(flick[0].t)} to ${r2(flick[flick.length - 1].t)} s -> ${path.join(OUT, 'flicker.json')}`);
  } else fs.writeFileSync(path.join(OUT, 'series.json'), JSON.stringify({ T0, series, frames, info }));
  log(`page errors ${JSON.stringify(errors)}`);

  // --- Per-frame table ------------------------------------------------------------------------------
  log('');
  log('== frames (t s, beat, section; screen box [x0,y0,x1,y1] client px per robot; reactions active per react())');
  const at = (tt) => series.reduce((best, s) => (Math.abs(s.t - tt) < Math.abs(best.t - tt) ? s : best), series[0]);
  for (const f of frames) {
    const s = at(f.t);
    const R = s.m.robots;
    const box = (n) => `[${R[n].screen.map((v) => Math.round(v)).join(',')}]`;
    const rx = activeReacts(f.beat);
    log(`${f.name.padEnd(9)} t=${r2(f.t, 3).toFixed(3)} beat=${r2(f.beat, 2).toFixed(2)} ${section(f.beat).padEnd(8)} G${box('graphite')} I${box('ivory')} T${box('terracotta')} P${box('proto')}${rx.length ? ' | ' + rx.join('; ') : ''}`);
  }

  // --- Placement checks over every sample -------------------------------------------------------------
  log('');
  log('== placement over all samples');
  const names = ['graphite', 'ivory', 'terracotta', 'proto'];
  const floorOf = { graphite: 0, ivory: 0, terracotta: 0, proto: 0.135 };
  const summary = {};
  for (const n of names) {
    const s = {
      inText: 0, inTextBox: 0, inScreen: 0, inBezel: 0, offFrame: 0, samplesInText: 0, samplesInTextBox: 0, samplesInBezel: 0, samplesOff: 0,
      footMin: Infinity, lowFootMax: -Infinity, lowFootMaxT: 0, bothUp: 0, bothUpT: [], ymin: Infinity,
      minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity,
      clearOfText: Infinity,
    };
    for (const { t: st, m } of series) {
      const r = m.robots[n];
      s.inText += r.inText;
      s.inTextBox += r.inTextBox;
      s.inScreen += r.inScreen;
      s.inBezel += r.inBezel;
      s.offFrame += r.offFrame;
      if (r.inText) s.samplesInText++;
      if (r.inTextBox) s.samplesInTextBox++;
      if (r.inBezel) s.samplesInBezel++;
      if (r.offFrame) s.samplesOff++;
      const f = r.feet.map((y) => y - floorOf[n]);
      s.footMin = Math.min(s.footMin, ...f);
      const low = Math.min(...f);
      if (low > s.lowFootMax) [s.lowFootMax, s.lowFootMaxT] = [low, st];
      if (low > 0.01) {
        s.bothUp++;
        s.bothUpT.push(r2(st, 2));
      }
      s.ymin = Math.min(s.ymin, r.ymin - floorOf[n]);
      [s.minX, s.minY] = [Math.min(s.minX, r.screen[0]), Math.min(s.minY, r.screen[1])];
      [s.maxX, s.maxY] = [Math.max(s.maxX, r.screen[2]), Math.max(s.maxY, r.screen[3])];
    }
    summary[n] = s;
    log(`${n.padEnd(10)} screen extent x ${r2(s.minX, 0)}..${r2(s.maxX, 0)} y ${r2(s.minY, 0)}..${r2(s.maxY, 0)}; vertices in text rects ${s.inText} (${s.samplesInText}/${series.length} samples); in text box+16px ${s.inTextBox} (${s.samplesInTextBox}); in monitor screen ${s.inScreen}, in screen+6% bezel ${s.inBezel} (${s.samplesInBezel}); off-frame vertices in ${s.samplesOff} samples`);
    log(`${''.padEnd(10)} floor: lowest foot min ${r2(s.footMin, 4)} m, lowest mesh point ${r2(s.ymin, 4)} m; both feet above 1 cm in ${s.bothUp}/${series.length} samples${s.bothUp ? ` (max ${r2(s.lowFootMax, 4)} m at t=${r2(s.lowFootMaxT, 2)}; t: ${s.bothUpT.slice(0, 40).join(',')}${s.bothUpT.length > 40 ? ',...' : ''})` : ''}`);
  }
  const textBox = info.textBox;
  log(`text box (text-node + button rects of [data-lab-avoid]) ${JSON.stringify(textBox)}; robot left edges vs its right edge + 16: ${names.map((n) => `${n} ${r2(summary[n].minX - (textBox[2] + 16), 0)}`).join(', ')} px (positive = clear to the right)`);
  const gapKeys = Object.keys(series[0].m.gaps);
  for (const k of gapKeys) {
    let g = Infinity;
    let gt = 0;
    for (const { t: st, m } of series) if (m.gaps[k] < g) [g, gt] = [m.gaps[k], st];
    log(`gap ${k.padEnd(26)} min ${r2(g, 3)} m at t=${r2(gt, 2)} (beat ${r2(beatOf(gt), 2)})${g <= 0 ? '  BOXES OVERLAP' : ''}`);
  }
  for (const k of Object.keys(series[0].m.obb)) {
    const hit = series.filter((x) => x.m.obb[k].hits);
    const runs = [];
    for (const x of hit) {
      const last = runs[runs.length - 1];
      if (last && x.t - last.t1 < 0.05) Object.assign(last, { b1: x.beat, t1: x.t, depth: Math.max(last.depth, x.m.obb[k].depth), worst: x.m.obb[k].depth > last.depth ? x : last.worst });
      else runs.push({ b0: x.beat, b1: x.beat, t0: x.t, t1: x.t, depth: x.m.obb[k].depth, worst: x });
    }
    log(`interpenetration ${k.padEnd(20)} samples with a vertex inside the other robot's shape: ${hit.length}/${series.length}${hit.length ? `, deepest ${r2(Math.max(...hit.map((x) => x.m.obb[k].depth)) * 1000, 0)} mm` : ''}`);
    for (const r of runs) log(`${''.padEnd(17)} beats ${r2(r.b0, 2)}-${r2(r.b1, 2)} (t ${r2(r.t0, 2)}-${r2(r.t1, 2)} s) deepest ${r2(r.depth * 1000, 0)} mm at beat ${r2(r.worst.beat, 2)}: ${r.worst.m.obb[k].what.join(' ')}`);
  }
  for (const n of names) {
    const hit = series.filter((x) => x.m.robots[n].inText);
    if (hit.length) log(`text overlap ${n}: ${hit.map((x) => `t=${r2(x.t, 3)} beat ${r2(x.beat, 2)} ${x.m.robots[n].textHit.map((h) => `${h.n} vertices in ${h.label} ${JSON.stringify(h.rect)}`).join('; ')} (robot box ${JSON.stringify(x.m.robots[n].screen)})`).join(' | ')}`);
  }
  // How close each dancer comes to the opening's text: every text rect, and the Contact link on its own.
  for (const n of ['graphite', 'ivory', 'terracotta']) {
    const worst = (only) => {
      let best = Infinity;
      let bi = -1;
      let bs = null;
      for (const x of series)
        x.m.robots[n].closest.forEach((d, i) => {
          if ((only == null || i === only) && d < best) [best, bi, bs] = [d, i, x];
        });
      return `${r2(best, 1)} px to ${info.labels[bi]} ${JSON.stringify(info.rects[bi])} at t=${r2(bs.t, 3)} beat ${r2(bs.beat, 2)}`;
    };
    const contact = info.labels.findIndex((l) => /^a: Contact/.test(l));
    log(`text clearance ${n.padEnd(10)} closest ${worst()}${contact >= 0 ? `; Contact link ${worst(contact)}` : ''}`);
  }
  // Depth from the camera (root positions), and floor positions.
  const cam = series[0].m.cam;
  const roots = info.roots;
  log(`camera at t=0 ${JSON.stringify(cam.map((v) => r2(v, 2)))}; distance to each robot's floor spot: ${Object.entries(roots).map(([n, [x, z]]) => `${n} ${r2(Math.hypot(x - cam[0], z - cam[2]), 2)} m`).join(', ')}`);

  // --- Motion, per robot ------------------------------------------------------------------------------
  log('');
  log('== motion per robot (world metres / radians; from the 32 ms samples)');
  const DT = 0.032;
  const inSec = (lo, hi) => series.filter((s) => s.beat >= lo && s.beat < hi);
  const range = (a) => Math.max(...a) - Math.min(...a);
  const std = (a) => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  };
  // Dominant period of a series by autocorrelation (lags 0.15 to 2.5 s).
  const period = (vals) => {
    const m = vals.reduce((x, y) => x + y, 0) / vals.length;
    const v = vals.map((x) => x - m);
    let best = 0;
    let bl = 0;
    const lo = Math.round(0.15 / DT);
    const hi = Math.min(Math.round(2.5 / DT), v.length - 5);
    const ac = [];
    for (let l = 1; l <= hi; l++) {
      let s = 0;
      for (let i = 0; i + l < v.length; i++) s += v[i] * v[i + l];
      ac[l] = s / (v.length - l);
    }
    // first local maximum after the first zero crossing
    let crossed = false;
    for (let l = lo; l < hi; l++) {
      if (ac[l] < 0) crossed = true;
      if (crossed && ac[l] > ac[l - 1] && ac[l] >= ac[l + 1] && ac[l] > 0) {
        bl = l;
        best = ac[l];
        break;
      }
    }
    return bl ? bl * DT : null;
  };
  const beatS = 60 / BPM;
  for (const n of ['graphite', 'ivory', 'terracotta', 'proto']) {
    const all = series.map((s) => s.m.robots[n]);
    const warm = inSec(0.5, 7.5).map((s) => s.m.robots[n]);
    const py = warm.map((r) => r.pelvis[1]);
    const px = warm.map((r) => r.pelvis[0]);
    const bounceP = period(py);
    const swayP = period(px);
    const speeds = (sel) => {
      const out = [];
      for (let i = 1; i < sel.length; i++) {
        for (let h = 0; h < 2; h++) {
          const a = sel[i - 1].hands[h];
          const b = sel[i].hands[h];
          out.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / DT);
        }
      }
      return out.sort((x, y) => x - y);
    };
    const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
    const gest = inSec(8, 16).map((s) => s.m.robots[n]);
    const sp = speeds(gest);
    const spAll = speeds(all);
    const handTop = Math.max(...all.flatMap((r) => r.hands.map((h) => h[1] - r.head[1])));
    const yaw = all.map((r) => Math.atan2(r.headFwd[0], r.headFwd[2]));
    log(`${n.padEnd(10)} bounce (pelvis y, warm-up): range ${r2(range(py), 3)} m, period ${bounceP ? r2(bounceP, 3) + ' s = ' + r2(bounceP / beatS, 2) + ' beats' : 'none'}; sway (pelvis x): range ${r2(range(px), 3)} m, period ${swayP ? r2(swayP, 3) + ' s = ' + r2(swayP / beatS, 2) + ' beats' : 'none'}`);
    const fast = [];
    for (let i = 1; i < series.length; i++)
      for (let h = 0; h < 2; h++) {
        const a = series[i - 1].m.robots[n].hands[h];
        const b = series[i].m.robots[n].hands[h];
        fast.push([Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / DT, series[i].beat, h ? 'R' : 'L']);
      }
    fast.sort((x, y) => y[0] - x[0]);
    const fastest = fast.slice(0, 5).map(([v, b, h]) => `${r2(v, 1)}@${r2(b, 2)}${h}`).join(' ');
    log(`${''.padEnd(10)} fastest hand samples (m/s @ beat, hand): ${fastest}`);
    log(`${''.padEnd(10)} whole loop: pelvis y range ${r2(range(all.map((r) => r.pelvis[1])), 3)} m, pelvis x range ${r2(range(all.map((r) => r.pelvis[0])), 3)}, z range ${r2(range(all.map((r) => r.pelvis[2])), 3)}; head heading range ${r2(range(yaw), 2)} rad (std ${r2(std(yaw), 2)}); hand speed median ${r2(pct(spAll, 0.5), 2)} p95 ${r2(pct(spAll, 0.95), 2)} max ${r2(spAll[spAll.length - 1], 2)} m/s; gestures p95 ${r2(pct(sp, 0.95), 2)} max ${r2(sp[sp.length - 1], 2)} m/s; highest hand ${r2(handTop, 3)} m above head origin`);
  }

  // --- Where each looks ---------------------------------------------------------------------------
  log('');
  log('== where each head points (horizontal heading within 20 deg of a target), share of the loop and by section');
  const targets = { camera: null, graphite: roots.graphite, ivory: roots.ivory, terracotta: roots.terracotta, stand: roots.proto };
  const lookAt = (r, n, camPos) => {
    const hdg = Math.atan2(r.headFwd[0], r.headFwd[2]);
    const res = [];
    for (const [k, p] of Object.entries(targets)) {
      if (k === n || (n === 'proto' && k === 'stand')) continue;
      const [tx, tz] = p ? p : [camPos[0], camPos[2]];
      const a = Math.atan2(tx - r.head[0], tz - r.head[2]);
      let d = Math.abs(Math.atan2(Math.sin(a - hdg), Math.cos(a - hdg))) * (180 / Math.PI);
      res.push([k, d]);
    }
    return res;
  };
  for (const n of ['graphite', 'ivory', 'terracotta', 'proto']) {
    const counts = {};
    const bySec = {};
    for (const s of series) {
      const r = s.m.robots[n];
      const hits = lookAt(r, n, s.m.cam).filter(([, d]) => d < 20).map(([k]) => k);
      const key = hits.length ? hits.join('+') : 'elsewhere';
      counts[key] = (counts[key] || 0) + 1;
      const sec = section(s.beat);
      bySec[sec] = bySec[sec] || {};
      bySec[sec][key] = (bySec[sec][key] || 0) + 1;
    }
    const fmt = (c) => {
      const tot = Object.values(c).reduce((x, y) => x + y, 0);
      return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / tot)}%`).join(', ');
    };
    log(`${n.padEnd(10)} loop: ${fmt(counts)}`);
    for (const [sec, c] of Object.entries(bySec)) log(`${''.padEnd(10)} ${sec.padEnd(8)}: ${fmt(c)}`);
  }

  // --- Reactions: does the pose do what react() says, when it says? ---------------------------------
  log('');
  log('== reactions (react() windows in beats; measured over the 32 ms samples)');
  const angTo = (s, n, target) => {
    const r = s.m.robots[n];
    return lookAt(r, n, s.m.cam).find(([k]) => k === target)[1];
  };
  const spanWhere = (pred) => {
    const hit = series.filter(pred);
    if (!hit.length) return 'never';
    // contiguous runs, in beats
    const runs = [];
    let a = hit[0];
    let b = hit[0];
    for (let i = 1; i < hit.length; i++) {
      if (hit[i].t - b.t > 0.05) {
        runs.push([a.beat, b.beat]);
        a = hit[i];
      }
      b = hit[i];
    }
    runs.push([a.beat, b.beat]);
    return runs.map(([x, y]) => `${r2(x, 2)}-${r2(y, 2)}`).join(', ');
  };
  const minIn = (lo, hi, f) => {
    const sel = series.filter((s) => s.beat >= lo && s.beat <= hi);
    let best = Infinity;
    let bb = null;
    for (const s of sel) {
      const v = f(s);
      if (v < best) [best, bb] = [v, s.beat];
    }
    return [best, bb];
  };
  const maxIn = (lo, hi, f) => {
    const [v, b] = minIn(lo, hi, (s) => -f(s));
    return [-v, b];
  };
  // Terracotta faces Graphite and waves (right hand = hands[1]).
  log(`T faces G (head within 20 deg): beats ${spanWhere((s) => angTo(s, 'terracotta', 'graphite') < 20)}   [code: 3-6.6, full 3.5-6]`);
  {
    const [v, b] = maxIn(3, 6.6, (s) => s.m.robots.terracotta.hands[1][1] - s.m.robots.terracotta.head[1]);
    const [v0] = maxIn(0.5, 2.5, (s) => s.m.robots.terracotta.hands[1][1] - s.m.robots.terracotta.head[1]);
    log(`T right hand height over head origin: max ${r2(v, 3)} m at beat ${r2(b, 2)} in the wave window, vs max ${r2(v0, 3)} m in beats 0.5-2.5; hand raised (> head origin) at beats ${spanWhere((s) => s.m.robots.terracotta.hands[1][1] > s.m.robots.terracotta.head[1])}`);
  }
  log(`G faces T (head within 20 deg): beats ${spanWhere((s) => angTo(s, 'graphite', 'terracotta') < 20)}   [code: 5.4-9.4, full 6.3-8.4]`);
  {
    const base = series.filter((s) => s.beat > 5.8 && s.beat < 6.4).map((s) => s.m.robots.graphite.pose.hPitch);
    const [v, b] = maxIn(6.3, 8.4, (s) => s.m.robots.graphite.pose.hPitch);
    log(`G nod: head pitch max ${r2(v, 3)} rad at beat ${r2(b, 2)} (code adds 0.34 at 7-7.5), vs ${r2(Math.max(...base), 3)} just before (beats 5.8-6.4)`);
  }
  log(`T faces I (head within 20 deg): beats ${spanWhere((s) => angTo(s, 'terracotta', 'ivory') < 20)}   [code: hops round 13.8-14.8, back 15.9-16.9]`);
  {
    const inW = series.filter((s) => s.beat > 14.95 && s.beat < 15.75).map((s) => s.m.robots.terracotta.pose.cRoll);
    const outW = series.filter((s) => s.beat > 12.5 && s.beat < 13.7).map((s) => s.m.robots.terracotta.pose.cRoll);
    log(`T shimmy: chest roll std ${r2(std(inW), 3)} rad in beats 14.95-15.75 vs ${r2(std(outW), 3)} in 12.5-13.7`);
  }
  log(`I faces T (head within 20 deg): beats ${spanWhere((s) => angTo(s, 'ivory', 'terracotta') < 20)}   [code: 14.5-16.5, full 14.9-16]`);
  log(`I faces the stand (head within 20 deg): beats ${spanWhere((s) => angTo(s, 'ivory', 'stand') < 20)}   [code: 25.6-31.8, full 26.6-30.8]`);
  {
    const d = (s) => {
      const r = s.m.robots.ivory;
      return Math.hypot(...r.hands[1].map((v, i) => v - r.head[i]));
    };
    const [v, b] = minIn(26.4, 31.2, d);
    const [v0] = minIn(20, 25, d);
    log(`I right hand to head origin: min ${r2(v, 3)} m at beat ${r2(b, 2)} (hand to chin 27.2-30.2), vs min ${r2(v0, 3)} m in beats 20-25`);
  }
  // Proto: does it dance?
  {
    const P = series.map((s) => s.m.robots.proto);
    const pr = (k, i) => r2(range(P.map((r) => r[k][i])), 4);
    const handR = r2(Math.max(...[0, 1].flatMap((h) => [0, 1, 2].map((i) => range(P.map((r) => r.hands[h][i]))))), 4);
    const yaw = P.map((r) => r.pose.hYaw);
    log(`proto (on the stand): pelvis range x ${pr('pelvis', 0)} y ${pr('pelvis', 1)} z ${pr('pelvis', 2)} m; hands range max ${handR} m; head yaw ${r2(Math.min(...yaw), 3)}..${r2(Math.max(...yaw), 3)} rad; construction line segments ${info.lineSegs.proto} (dancers: ${info.lineSegs.graphite}/${info.lineSegs.ivory}/${info.lineSegs.terracotta})`);
  }

  // --- The still beat: how fast is each robot moving there? -------------------------------------------
  log('');
  log(`== the still beat (${STILL_BEAT}, t=${r2((STILL_BEAT * 60) / BPM, 3)} s): each robot's speed there vs its loop`);
  {
    const i = series.findIndex((s) => s.t >= (STILL_BEAT * 60) / BPM);
    for (const n of ['graphite', 'ivory', 'terracotta']) {
      const v = (k) => {
        const a = series[k - 1].m.robots[n];
        const b = series[k].m.robots[n];
        const pts = (r) => [r.head, r.pelvis, ...r.hands];
        const A = pts(a);
        const B = pts(b);
        return Math.max(...A.map((p, j) => Math.hypot(...p.map((x, q) => B[j][q] - x)))) / DT;
      };
      const all = series.slice(1).map((_, k) => v(k + 1)).sort((x, y) => x - y);
      const here = v(i);
      const rank = all.filter((x) => x <= here).length / all.length;
      const r = series[i].m.robots[n];
      log(`${n.padEnd(10)} fastest point (head, pelvis, hands) ${r2(here, 3)} m/s = percentile ${Math.round(rank * 100)} of the loop (median ${r2(all[Math.floor(all.length / 2)], 3)}); feet ${r.feet.map((y) => r2(y, 3)).join('/')} m; hands over head ${r.hands.map((h) => r2(h[1] - r.head[1], 3)).join('/')} m`);
    }
  }

  // --- Contact sheets -------------------------------------------------------------------------------
  if (QUICK) {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.writeFileSync(LOG, lines.join('\n') + '\n');
    await browser.close();
    return;
  }
  const sheetPage = await ctx.newPage();
  // Served from one made-up origin, so the canvas is not tainted and can be exported.
  await sheetPage.route('http://sheet.local/**', (r) => {
    const p = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    if (!p) return r.fulfill({ contentType: 'text/html', body: '<!doctype html><canvas id=c></canvas>' });
    r.fulfill({ path: path.join(OUT, p) });
  });
  await sheetPage.goto('http://sheet.local/');
  const compose = async (list, crop, scale, cols, outName) => {
    const data = await sheetPage.evaluate(
      async ({ list, crop, scale, cols }) => {
        const imgs = await Promise.all(
          list.map(
            (f) =>
              new Promise((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = rej;
                i.src = 'http://sheet.local/' + encodeURIComponent(f.base);
              }),
          ),
        );
        const [cx, cy, cw, ch] = crop;
        const tw = Math.round(cw * scale);
        const th = Math.round(ch * scale);
        const pad = 4;
        const lab = 18;
        const rows = Math.ceil(list.length / cols);
        const c = document.getElementById('c');
        c.width = cols * (tw + pad) + pad;
        c.height = rows * (th + lab + pad) + pad;
        const g = c.getContext('2d');
        g.fillStyle = '#111';
        g.fillRect(0, 0, c.width, c.height);
        list.forEach((f, k) => {
          const x = pad + (k % cols) * (tw + pad);
          const y = pad + Math.floor(k / cols) * (th + lab + pad);
          g.imageSmoothingQuality = 'high';
          g.drawImage(imgs[k], cx, cy, cw, ch, x, y + lab, tw, th);
          g.fillStyle = '#eee';
          g.font = '13px monospace';
          g.fillText(f.caption, x + 2, y + 13);
        });
        return c.toDataURL('image/jpeg', 0.86);
      },
      { list, crop, scale, cols },
    );
    const file = path.join(OUT, outName);
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    log(`sheet ${file}`);
  };
  const cap = (f) => {
    const rx = activeReacts(f.beat)
      .filter((s) => !s.startsWith('I hand'))
      .map((s) => s.split(' ').slice(0, 3).join(' '));
    return `${f.label === 'f' ? f.name : f.label} t${f.t.toFixed(2)} b${f.beat.toFixed(1)}${rx.length ? ' ' + rx.join(',') : ''}`;
  };
  const fr = frames.filter((f) => f.label === 'f').map((f) => ({ base: path.basename(f.file), caption: cap(f) }));
  const keys = frames.filter((f) => f.label !== 'f').map((f) => ({ base: path.basename(f.file), caption: cap(f) }));
  // The robots' part of the frame, from the measured screen extents (all robots, whole loop), padded.
  const ext = ['graphite', 'ivory', 'terracotta', 'proto'].reduce((a, n) => [Math.min(a[0], summary[n].minX), Math.min(a[1], summary[n].minY), Math.max(a[2], summary[n].maxX), Math.max(a[3], summary[n].maxY)], [Infinity, Infinity, -Infinity, -Infinity]);
  const crop = [Math.max(0, Math.floor(ext[0] - 12)), Math.max(0, Math.floor(ext[1] - 12)), 0, 0];
  crop[2] = Math.min(W, Math.ceil(ext[2] + 12)) - crop[0];
  crop[3] = Math.min(H, Math.ceil(ext[3] + 12)) - crop[1];
  log(`robots' crop (whole loop extents + 12 px) ${JSON.stringify(crop)}`);
  await compose(fr, [0, 0, W, H], 0.2, 7, 'sheet-full.jpg');
  await compose(fr.slice(0, 18), crop, 0.5, 6, 'sheet-crop-a.jpg');
  await compose(fr.slice(18), crop, 0.5, 6, 'sheet-crop-b.jpg');
  await compose(keys, crop, 0.75, 2, 'sheet-keys.jpg');

  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, lines.join('\n') + '\n');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
