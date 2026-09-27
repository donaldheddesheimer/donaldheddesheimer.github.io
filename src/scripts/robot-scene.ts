// Three robots dancing on a dark studio stage: the homepage opening (RobotStage.astro). Illustration,
// not a record of past work. Robots are procedural meshes on joint groups. Arms, spine and head follow
// authored curves; legs solve two-bone IK to feet that stay planted unless a step lifts them. The routine
// is a 32-beat loop at 112 BPM (about 17 s): groove, alternating arm gestures, a canon, a step-touch.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TAU = Math.PI * 2;
const BPM = 112;
const BEATS = 32;
const RAMP = 0.35; // beats of crossfade either side of a section boundary
// Reduced motion (or Motion off) opens on this composed moment of the canon instead of a loop.
const STILL_BEAT = 18.2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Eased trapezoid: rises over [a, b], holds, falls over [c, d].
const win = (x: number, a: number, b: number, c: number, d: number) => smooth(a, b, x) * (1 - smooth(c, d, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- Choreography -------------------------------------------------------------------------------
// Distances are in units of the robot's leg length, so one routine fits all three builds.
// Pelvis: offset, drop (py) and rotation. Chest and head: rotation. Arms per side: forward raise (F),
// abduction (A), twist (T), elbow (E), wrist (W). Feet per side: offset from the rest stance and lift.
const CH = [
  'px', 'py', 'pz', 'pYaw', 'pPitch', 'pRoll',
  'cYaw', 'cPitch', 'cRoll',
  'hYaw', 'hPitch', 'hRoll',
  'lF', 'lA', 'lT', 'lE', 'lW',
  'rF', 'rA', 'rT', 'rE', 'rW',
  'lfx', 'lfy', 'lfz', 'lfYaw',
  'rfx', 'rfy', 'rfz', 'rfYaw',
] as const;
type Ch = (typeof CH)[number];
type Pose = Record<Ch, number>;
type Side = 'l' | 'r';
const newPose = () => Object.fromEntries(CH.map((k) => [k, 0])) as Pose;
const clear = (o: Pose) => {
  for (const k of CH) o[k] = 0;
};

type Arm = readonly [F: number, A: number, T: number, E: number, W: number];
const ARM = {
  pump: [0.3, 0.22, 0, 1.35, 0],
  hip: [-0.12, 0.62, -1.5, 1.65, 0.2],
  up: [0.25, 2.55, 0, 0.12, 0],
  v: [0.12, 2.75, 0, 0.18, 0],
  robotUp: [0, 1.52, 1.57, 1.55, 0],
  robotDown: [0, 1.52, -1.57, 1.55, 0],
  low: [0.6, -0.32, 0, 0.55, 0],
} as const satisfies Record<string, Arm>;
const ARM_CH = ['F', 'A', 'T', 'E', 'W'] as const;
const ch = (s: Side, k: string) => (s + k) as Ch;
const armCh = (s: Side, i: number) => ch(s, ARM_CH[i]);
const setArm = (o: Pose, s: Side, a: Arm) => a.forEach((v, i) => (o[armCh(s, i)] = v));
const blendArm = (o: Pose, s: Side, a: Arm, t: number) => {
  if (t > 0) a.forEach((v, i) => (o[armCh(s, i)] = lerp(o[armCh(s, i)], v, t)));
};
const mixTo = (o: Pose, k: Ch, v: number, t: number) => (o[k] = lerp(o[k], v, t));

// Each key eases from the previous key's pose over `dur` beats.
type Key = readonly [at: number, pose: Arm, dur: number];
function armKeys(o: Pose, s: Side, keys: readonly Key[], u: number) {
  let i = -1;
  while (i + 1 < keys.length && keys[i + 1][0] <= u) i++;
  if (i < 0) return setArm(o, s, keys[0][1]);
  const [at, to, dur] = keys[i];
  const from = i ? keys[i - 1][1] : to;
  const t = smooth(0, 1, (u - at) / dur);
  for (let j = 0; j < 5; j++) o[armCh(s, j)] = lerp(from[j], to[j], t);
}
// Section B: right arm reaches, then the left; robot pops on the half beats; both up in a V.
const GESTURE: Record<Side, readonly Key[]> = {
  r: [[-1, ARM.pump, 1], [0, ARM.up, 0.7], [2, ARM.hip, 0.7], [4, ARM.robotDown, 0.18], [4.5, ARM.robotUp, 0.18], [5, ARM.robotDown, 0.18], [5.5, ARM.robotUp, 0.18], [6, ARM.v, 0.5], [7, ARM.pump, 0.9]],
  l: [[-1, ARM.pump, 1], [0, ARM.hip, 0.7], [2, ARM.up, 0.7], [4, ARM.robotUp, 0.18], [4.5, ARM.robotDown, 0.18], [5, ARM.robotUp, 0.18], [5.5, ARM.robotDown, 0.18], [6, ARM.v, 0.5], [7, ARM.pump, 0.9]],
};

interface Persona {
  lag: number; // beats behind the count: keeps three robots from moving as one
  canon: number; // entry beat in the canon
  sway: number;
  bounce: number;
  arm: number;
  twist: number;
  tilt: number;
  look: number; // resting head yaw, toward the middle of the group
  dir: number; // which way the canon twist turns
}

// The groove under everything: hips pendulum over the feet every two beats and dip on each beat.
function groove(o: Pose, g: number, p: Persona, k = 1) {
  const sw = Math.sin(Math.PI * g);
  const dip = 0.5 + 0.5 * Math.cos(TAU * g);
  o.px += sw * p.sway * k;
  o.py += dip * p.bounce * k;
  o.pRoll += sw * 0.045 * k;
  o.pYaw += Math.sin(Math.PI * g - 0.8) * 0.05 * p.twist * k;
  o.cRoll -= sw * 0.06 * k;
  o.cYaw += Math.sin(Math.PI * g + 0.4) * 0.09 * p.twist * k;
  o.cPitch += (dip - 0.5) * 0.05 * k;
  o.hRoll += sw * 0.07 * p.tilt * k;
  o.hPitch += (dip - 0.5) * 0.1 * k;
  o.hYaw += p.look;
  setArm(o, 'l', ARM.pump);
  setArm(o, 'r', ARM.pump);
  o.lF += sw * 0.2 * p.arm * k;
  o.rF -= sw * 0.2 * p.arm * k;
  o.lE += dip * 0.18 * k;
  o.rE += dip * 0.18 * k;
}

type Section = (o: Pose, u: number, g: number, p: Persona) => void;

// 0-8: groove in unison; heads start trading looks halfway through.
const warmUp: Section = (o, u, g, p) => {
  groove(o, g, p);
  const look = win(u, 3.5, 4.5, 7.2, 8.2) * Math.sin((Math.PI * g) / 2);
  o.hYaw += look * 0.3;
  o.cYaw += look * 0.12;
};

// 8-16: alternating arm gestures.
const gestures: Section = (o, u, g, p) => {
  groove(o, g, p, 0.85);
  armKeys(o, 'r', GESTURE.r, u);
  armKeys(o, 'l', GESTURE.l, u);
  const right = win(u, 0, 0.6, 1.8, 2.4);
  const left = win(u, 2, 2.6, 3.8, 4.4);
  o.hYaw += (left - right) * 0.35;
  o.hPitch -= Math.max(left, right) * 0.22;
  o.cRoll += (right - left) * 0.06;
  const pop = win(u, 3.85, 4.1, 5.9, 6.15);
  const c = Math.cos(TAU * (u - 4));
  const snap = Math.sign(c) * Math.abs(c) ** 0.3 * pop;
  o.cYaw += snap * 0.12;
  o.hYaw -= snap * 0.1;
  const wave = win(u, 6, 6.35, 6.8, 7.3) * Math.sin(TAU * (u - 6));
  o.lA += wave * 0.2;
  o.rA -= wave * 0.2;
  o.cRoll -= wave * 0.05;
};

// 16-24: canon. Each robot crouches, rises into a V and twists, entering one beat after its neighbor;
// then all three land the same pose together.
const canon: Section = (o, u, g, p) => {
  const m = u - p.canon;
  const crouch = win(m, 0, 0.7, 1.0, 1.45);
  const up = win(m, 1.0, 1.45, 2.7, 3.7);
  const twist = win(m, 1.7, 2.3, 2.7, 3.3);
  const hold = win(u, 6.1, 6.45, 7.35, 7.95);
  groove(o, g, p, 1 - 0.8 * Math.max(crouch, up, hold));
  o.py += crouch * 0.15 - up * 0.02;
  o.pPitch += crouch * 0.12;
  o.cPitch += crouch * 0.28 - up * 0.1;
  o.hPitch += crouch * 0.25 - up * 0.3;
  o.cYaw += twist * 0.32 * p.dir;
  o.hYaw += twist * 0.2 * p.dir;
  for (const s of ['l', 'r'] as const) {
    blendArm(o, s, ARM.low, crouch);
    blendArm(o, s, ARM.v, up);
  }
  mixTo(o, 'px', p.sway * 1.4, hold);
  mixTo(o, 'pRoll', 0.07, hold);
  mixTo(o, 'cRoll', -0.07, hold);
  mixTo(o, 'hRoll', 0.16, hold);
  mixTo(o, 'hYaw', -0.22, hold);
  mixTo(o, 'hPitch', -0.18, hold);
  blendArm(o, 'r', ARM.up, hold);
  blendArm(o, 'l', ARM.hip, hold);
};

// 24-32: step-touch to the robots' right and back, twice. Feet leave the floor only here.
const travel: Section = (o, u, g, p) => {
  groove(o, g, p, 0.35);
  const S = 0.26;
  const H = 0.09;
  let lx = 0;
  let rx = 0;
  let ly = 0;
  let ry = 0;
  if (u >= 0 && u < 8) {
    const q = u % 4;
    const e = (x: number) => smooth(0, 1, x);
    const arc = (x: number) => Math.sin(Math.PI * clamp01(x));
    if (q < 1) {
      rx = -S * e(q);
      ry = H * arc(q);
    } else if (q < 2) {
      rx = -S;
      lx = -S * e(q - 1);
      ly = H * 0.6 * arc(q - 1);
    } else if (q < 3) {
      rx = -S;
      lx = -S * (1 - e(q - 2));
      ly = H * arc(q - 2);
    } else {
      rx = -S * (1 - e(q - 3));
      ry = H * 0.6 * arc(q - 3);
    }
  }
  o.lfx += lx;
  o.rfx += rx;
  o.lfy += ly;
  o.rfy += ry;
  const mid = (lx + rx) / 2;
  o.px += mid;
  o.pRoll += (ry - ly) * 0.6;
  o.hYaw += mid * 0.9;
  o.cYaw -= mid * 0.4;
  const open = Math.sin((Math.PI * u) / 2) ** 2 * win(u, -0.3, 0.3, 7.7, 8.3);
  o.lA += open * 0.6;
  o.rA += open * 0.6;
  o.lE -= open * 0.5;
  o.rE -= open * 0.5;
  o.lW += open * 0.4;
  o.rW += open * 0.4;
};

const SECTIONS: readonly [start: number, end: number, fn: Section][] = [
  [0, 8, warmUp],
  [8, 16, gestures],
  [16, 24, canon],
  [24, 32, travel],
];

// Crossfades neighboring sections so every channel stays continuous, including across the loop seam.
function choreograph(out: Pose, tmp: Pose, beat: number, p: Persona) {
  clear(out);
  for (const [start, end, fn] of SECTIONS)
    for (const k of [-BEATS, 0, BEATS]) {
      const x = beat + k;
      const w = win(x, start - RAMP, start + RAMP, end - RAMP, end + RAMP);
      if (w <= 0) continue;
      clear(tmp);
      fn(tmp, x - start, x, p);
      for (const c of CH) out[c] += tmp[c] * w;
    }
}

// --- Robots ---------------------------------------------------------------------------------------
interface Build {
  name: string;
  at: [x: number, z: number, yaw: number];
  paint: number;
  trim: number;
  eye: number;
  thigh: number;
  shin: number;
  legR: number;
  hipW: number; // half spacing of the hip joints
  stance: number; // half spacing of the feet
  toeOut: number;
  foot: [w: number, h: number, l: number];
  pelvis: [w: number, h: number, d: number];
  torso: [w: number, h: number, d: number, r: number];
  shoulderW: number;
  upper: number;
  fore: number;
  armR: number;
  neck: number;
  head: 'box' | 'dome' | 'ball';
  headSize: [w: number, h: number, d: number];
  antenna?: boolean;
  pads?: boolean;
  persona: Persona;
}

const BUILDS: Build[] = [
  {
    name: 'graphite',
    at: [-1.38, -0.49, 0.22],
    paint: 0x58616c,
    trim: 0x202328,
    eye: 0x9cc4ff,
    thigh: 0.32,
    shin: 0.32,
    legR: 0.072,
    hipW: 0.15,
    stance: 0.19,
    toeOut: 0.14,
    foot: [0.18, 0.08, 0.3],
    pelvis: [0.44, 0.16, 0.28],
    torso: [0.66, 0.52, 0.4, 0.1],
    shoulderW: 0.4,
    upper: 0.28,
    fore: 0.27,
    armR: 0.062,
    neck: 0.05,
    head: 'dome',
    headSize: [0.38, 0.27, 0.32],
    pads: true,
    persona: { lag: 0.06, canon: 0, sway: 0.055, bounce: 0.075, arm: 0.8, twist: 1.4, tilt: 0.5, look: 0.12, dir: 1 },
  },
  {
    name: 'ivory',
    at: [0.15, 0.53, 0.04],
    paint: 0xdcd5c6,
    trim: 0x2a2d33,
    eye: 0xffb561,
    thigh: 0.4,
    shin: 0.4,
    legR: 0.052,
    hipW: 0.1,
    stance: 0.13,
    toeOut: 0.12,
    foot: [0.13, 0.07, 0.26],
    pelvis: [0.3, 0.14, 0.2],
    torso: [0.42, 0.5, 0.28, 0.07],
    shoulderW: 0.26,
    upper: 0.3,
    fore: 0.28,
    armR: 0.044,
    neck: 0.07,
    head: 'box',
    headSize: [0.34, 0.27, 0.28],
    antenna: true,
    persona: { lag: 0, canon: 1, sway: 0.07, bounce: 0.06, arm: 1, twist: 1, tilt: 0.8, look: 0, dir: -1 },
  },
  {
    name: 'terracotta',
    at: [1.15, -0.59, -0.16],
    paint: 0xb86a4e,
    trim: 0x2a2d33,
    eye: 0xffe3b8,
    thigh: 0.26,
    shin: 0.25,
    legR: 0.048,
    hipW: 0.09,
    stance: 0.12,
    toeOut: 0.1,
    foot: [0.12, 0.07, 0.22],
    pelvis: [0.26, 0.12, 0.2],
    torso: [0.38, 0.36, 0.32, 0.12],
    shoulderW: 0.23,
    upper: 0.22,
    fore: 0.21,
    armR: 0.04,
    neck: 0.05,
    head: 'ball',
    headSize: [0.37, 0.37, 0.37],
    persona: { lag: -0.05, canon: 2, sway: 0.08, bounce: 0.085, arm: 1.15, twist: 0.8, tilt: 1.6, look: -0.12, dir: 1 },
  },
];

const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const dir = new THREE.Vector3();

// Orients a Y-aligned mesh along the segment a -> b.
function span(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.subVectors(b, a).normalize());
}

interface Limb {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
}
interface Leg {
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  knee: THREE.Mesh;
  foot: THREE.Group;
  blob: THREE.Mesh;
}

class Robot {
  readonly root = new THREE.Group();
  private readonly pelvis = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly eyes = new THREE.Group();
  private readonly arms: Limb[] = [];
  private readonly legs: Leg[] = [];
  private readonly body: THREE.Mesh;
  private readonly pose = newPose();
  private readonly tmp = newPose();
  private readonly L: number;
  private readonly hipY: number;
  private readonly blinkAt: number;

  constructor(
    private readonly b: Build,
    blobTex: THREE.Texture,
  ) {
    // Satin paint, matte rubber-like joints, and a visor that keeps one soft highlight.
    const paint = new THREE.MeshStandardMaterial({ color: b.paint, roughness: 0.58, metalness: 0.06 });
    const trim = new THREE.MeshStandardMaterial({ color: b.trim, roughness: 0.78, metalness: 0.12 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.32, metalness: 0.25 });
    const glow = new THREE.MeshBasicMaterial({ color: b.eye, toneMapped: false });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = mat !== glow;
      parent.add(m);
      return m;
    };
    const box = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
    const ball = (r: number) => new THREE.SphereGeometry(r, 20, 14);
    const rod = (r: number, len: number) => new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 14);

    const [x, z, yaw] = b.at;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    this.L = b.thigh + b.shin;
    const [pw, ph, pd] = b.pelvis;
    const hipDrop = ph * 0.35;
    const ankleH = b.foot[1];
    this.hipY = ankleH + this.L * 0.93 + hipDrop;
    this.blinkAt = Math.random() * 4;

    // Pelvis and spine.
    this.root.add(this.pelvis);
    add(box(pw, ph, pd, 0.05), trim, this.pelvis);
    add(new THREE.CylinderGeometry(pw * 0.28, pw * 0.34, ph * 0.9, 16), trim, this.pelvis, 0, ph * 0.55, 0);
    this.chest.position.y = ph * 0.5;
    this.pelvis.add(this.chest);
    const [tw, th, td, tr] = b.torso;
    this.body = add(box(tw, th, td, tr), paint, this.chest, 0, th / 2 + 0.02, 0);
    add(box(tw * 0.5, th * 0.38, 0.03, 0.012), trim, this.chest, 0, th * 0.58, td / 2 + 0.005);
    add(ball(0.014), glow, this.chest, tw * 0.13, th * 0.62, td / 2 + 0.024);
    add(box(tw * 0.62, 0.035, td * 1.02, 0.015), trim, this.chest, 0, 0.05, 0);

    // Neck and head.
    const top = th + 0.02;
    add(new THREE.CylinderGeometry(0.035, 0.045, b.neck + 0.04, 12), trim, this.chest, 0, top + b.neck / 2, 0);
    this.head.position.y = top + b.neck;
    this.chest.add(this.head);
    const [hw, hh, hd] = b.headSize;
    this.head.add(this.eyes);
    if (b.head === 'ball') {
      const r = hw / 2;
      add(ball(r), paint, this.head, 0, r, 0);
      // Face plate: a band of a slightly larger sphere, centered on +Z.
      add(new THREE.SphereGeometry(r * 1.02, 24, 16, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.32), visor, this.head, 0, r, 0);
      this.eyes.position.set(0, r * 1.06, r * 0.97);
      for (const s of [-1, 1]) add(ball(r * 0.1), glow, this.eyes, s * r * 0.3, 0, 0);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.04, 16), trim, this.head, s * r * 0.98, r, 0).rotation.z = Math.PI / 2;
    } else {
      const dome = b.head === 'dome';
      add(box(hw, hh, hd, dome ? hh * 0.45 : 0.07), paint, this.head, 0, hh / 2, 0);
      add(box(hw * (dome ? 0.92 : 0.8), hh * (dome ? 0.3 : 0.44), 0.05, 0.02), visor, this.head, 0, hh * 0.52, hd / 2 - 0.005);
      this.eyes.position.set(0, hh * 0.52, hd / 2 + 0.022);
      if (dome) add(box(hw * 0.5, hh * 0.07, 0.01, 0.004), glow, this.eyes);
      else for (const s of [-1, 1]) add(box(hw * 0.14, hh * 0.1, 0.01, 0.006), glow, this.eyes, s * hw * 0.18, 0, 0);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(hh * 0.2, hh * 0.2, 0.04, 16), trim, this.head, s * (hw / 2 + 0.01), hh * 0.5, 0).rotation.z = Math.PI / 2;
      if (b.antenna) {
        add(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 8), trim, this.head, hw * 0.22, hh + 0.06, 0);
        add(ball(0.018), glow, this.head, hw * 0.22, hh + 0.13, 0);
      }
    }

    // Arms: shoulder -> elbow -> hand, hanging along -Y. Twist is about the arm, elbow flexes about local X.
    for (const s of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.rotation.order = 'ZXY';
      shoulder.position.set(s * b.shoulderW, th - b.armR * 1.2, 0);
      this.chest.add(shoulder);
      add(ball(b.armR * (b.pads ? 2.1 : 1.45)), b.pads ? paint : trim, shoulder);
      add(rod(b.armR, b.upper - b.armR * 2), paint, shoulder, 0, -b.upper / 2, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -b.upper;
      shoulder.add(elbow);
      add(ball(b.armR * 1.15), trim, elbow);
      add(rod(b.armR * 0.9, b.fore - b.armR * 2), paint, elbow, 0, -b.fore / 2, 0);
      const hand = new THREE.Group();
      hand.position.y = -b.fore;
      elbow.add(hand);
      if (b.head === 'ball') add(ball(b.armR * 1.5), trim, hand, 0, -b.armR, 0);
      else add(box(b.armR * 2.6, b.armR * 3, b.armR * 1.9, b.armR * 0.7), trim, hand, 0, -b.armR * 1.3, 0);
      this.arms.push({ shoulder, elbow, hand });
    }

    // Legs live in root space and are placed by IK each frame.
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0.55 });
    for (let i = 0; i < 2; i++) {
      const thigh = add(rod(b.legR, b.thigh - b.legR * 2), paint, this.root);
      const shin = add(new THREE.CylinderGeometry(b.legR * 1.05, b.legR * 0.8, b.shin, 16), paint, this.root);
      const knee = add(ball(b.legR * 1.2), trim, this.root);
      const foot = new THREE.Group();
      this.root.add(foot);
      const [fw, fh, fl] = b.foot;
      add(box(fw, fh, fl, 0.03), trim, foot, 0, -fh / 2, fl * 0.2);
      add(ball(b.legR * 1.05), trim, foot);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(fw * 2.4, fl * 1.6), blobMat.clone());
      blob.rotation.x = -Math.PI / 2;
      blob.renderOrder = 1;
      this.root.add(blob);
      this.legs.push({ thigh, shin, knee, foot, blob });
    }
    // A soft pool of shadow under the whole robot.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(tw * 2.6, tw * 1.9), blobMat);
    pool.material.opacity = 0.42;
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.001;
    pool.renderOrder = 1;
    this.root.add(pool);
  }

  update(beat: number, time: number) {
    const b = this.b;
    const p = b.persona;
    const o = this.pose;
    choreograph(o, this.tmp, (((beat - p.lag) % BEATS) + BEATS) % BEATS, p);
    const L = this.L;
    this.pelvis.position.set(o.px * L, this.hipY - o.py * L, o.pz * L);
    this.pelvis.rotation.set(o.pPitch, o.pYaw, o.pRoll, 'YXZ');
    this.chest.rotation.set(o.cPitch, o.cYaw, o.cRoll, 'YXZ');
    this.head.rotation.set(o.hPitch, o.hYaw, o.hRoll, 'YXZ');
    (['l', 'r'] as const).forEach((side, i) => {
      const s = i ? -1 : 1;
      const a = this.arms[i];
      a.shoulder.rotation.set(-o[ch(side, 'F')], s * o[ch(side, 'T')], s * o[ch(side, 'A')]);
      a.elbow.rotation.x = -o[ch(side, 'E')];
      a.hand.rotation.x = -o[ch(side, 'W')];
    });
    // Blink every few seconds.
    const bt = (time + this.blinkAt) % 4.3;
    this.eyes.scale.y = bt < 0.12 ? 0.15 : 1;

    // Legs: two-bone IK from each hip joint to its ankle target.
    this.pelvis.updateMatrix();
    const [, fh] = b.foot;
    const hipDrop = b.pelvis[1] * 0.35;
    const reach = b.thigh + b.shin;
    (['l', 'r'] as const).forEach((side, i) => {
      const s = i ? -1 : 1;
      const leg = this.legs[i];
      const fx = o[ch(side, 'fx')] * L;
      const fy = Math.max(0, o[ch(side, 'fy')]) * L;
      const fz = o[ch(side, 'fz')] * L;
      const hip = v1.set(s * b.hipW, -hipDrop, 0).applyMatrix4(this.pelvis.matrix);
      const ankle = v2.set(s * b.stance + fx, fh + fy, fz);
      const d = v3.subVectors(ankle, hip);
      const len = Math.min(reach * 0.999, Math.max(reach * 0.3, d.length()));
      d.normalize();
      ankle.copy(hip).addScaledVector(d, len);
      const cosA = (b.thigh ** 2 + len ** 2 - b.shin ** 2) / (2 * b.thigh * len);
      const a = Math.acos(Math.min(1, Math.max(-1, cosA)));
      // Knees bend forward and slightly out.
      const pole = v4.set(s * 0.18, 0, 1);
      pole.addScaledVector(d, -pole.dot(d)).normalize();
      const knee = pole.multiplyScalar(b.thigh * Math.sin(a)).addScaledVector(d, b.thigh * Math.cos(a)).add(hip);
      leg.knee.position.copy(knee);
      span(leg.thigh, hip, knee);
      span(leg.shin, knee, ankle);
      leg.foot.position.copy(ankle);
      leg.foot.rotation.set((ankle.y - fh) * 2.2, s * b.toeOut + o[ch(side, 'fYaw')], 0, 'YXZ');
      leg.blob.position.set(ankle.x, 0.002, ankle.z + b.foot[2] * 0.2);
      const lift = clamp01((ankle.y - fh) / 0.12);
      (leg.blob.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - lift * 0.7);
      leg.blob.scale.setScalar(1 + lift * 0.4);
    });
  }
}

// --- Stage ---------------------------------------------------------------------------------------
function radialTexture(stops: [number, string][], size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function floorTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, 0, size, 2);
  g.fillRect(0, 0, 2, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// --- Workstation ---------------------------------------------------------------------------------
// A desk at the edge of the light, downstage left of the dancers, where the lab's work goes on after
// hours: a monitor, keyboard and lamp, lit by the lamp (warm) and the screen (a cool glow). Whoever
// sits there faces upstage, past the monitor to the robots. The monitor is the way into the lab: the
// camera flies to face it and the page lays the systems map over its screen (lab.ts), with the
// dancers beyond it on the right. At the opening's framing it sits between the introduction and the
// robots, small enough to keep clear of the text; the reveal carries the detail. Sizes are in metres
// before `scale`, which shrinks the whole workstation (its lights too); the robots stand about 1.9 m.
const DESK = { x: -0.6, z: 3.6, yaw: 0.4, scale: 0.72 };
// Point-light falloff is physical (decay 2), so the desk's lights dim with its size to look the same.
const DESK_LIGHT = DESK.scale ** 2;
const GLOW = 0.3 * DESK_LIGHT;
/** The monitor's screen (16:10), and the height of its centre, about seated eye level. */
export const SCREEN = { w: 0.68, h: 0.425, y: 1.12 };
const SCREEN_Z = -0.1475; // the screen's plane, just proud of the bezel, in the desk's frame

// A dim sketch of the systems map for the screen at a distance: panels, a few linked nodes, a route.
// The real page replaces it when the camera arrives.
function screenTexture() {
  const W = 1024;
  const H = 640;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c0f13';
  g.fillRect(0, 0, W, H);
  const panel = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = '#12161c';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#232a34';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  panel(24, 20, 976, 64);
  panel(24, 100, 600, 516);
  panel(640, 100, 360, 250);
  panel(640, 366, 360, 250);
  g.fillStyle = '#2a323d';
  g.fillRect(48, 44, 220, 16);
  g.fillRect(800, 44, 176, 16);
  const nodes: [number, number][] = [[120, 220], [260, 170], [380, 260], [210, 360], [470, 400], [330, 490], [150, 520], [540, 210]];
  g.strokeStyle = '#26364d';
  g.lineWidth = 3;
  for (const [a, b] of [[0, 1], [1, 2], [0, 3], [3, 5], [2, 4], [4, 5], [3, 6], [2, 7], [1, 7]]) {
    g.beginPath();
    g.moveTo(...nodes[a]);
    g.lineTo(...nodes[b]);
    g.stroke();
  }
  nodes.forEach(([x, y], i) => {
    g.fillStyle = i === 2 ? '#7fa6e0' : '#3a5072';
    g.beginPath();
    g.arc(x, y, i === 2 ? 12 : 8, 0, TAU);
    g.fill();
  });
  g.strokeStyle = '#1c2530';
  g.lineWidth = 1;
  for (let x = 660; x < 990; x += 30) {
    g.beginPath();
    g.moveTo(x, 116);
    g.lineTo(x, 334);
    g.stroke();
  }
  g.strokeStyle = '#2f8a7e';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(670, 310);
  g.bezierCurveTo(740, 300, 760, 170, 850, 200);
  g.bezierCurveTo(920, 222, 930, 150, 975, 140);
  g.stroke();
  g.fillStyle = '#222a33';
  [280, 220, 300, 180, 260, 240, 150].forEach((w, i) => g.fillRect(664, 392 + i * 30, w, 10));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildWorkstation() {
  const group = new THREE.Group();
  group.position.set(DESK.x, 0, DESK.z);
  group.rotation.y = DESK.yaw;
  group.scale.setScalar(DESK.scale);
  // Oiled dark wood on a steel frame; the monitor and keyboard are matte black plastic.
  const wood = new THREE.MeshStandardMaterial({ color: 0x2f2822, roughness: 0.68 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.4, metalness: 0.75 });
  const shell = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.5, metalness: 0.2 });
  const keys = new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.62, metalness: 0.1 });
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffe2b8, toneMapped: false });
  const screenMap = screenTexture();
  const screenMat = new THREE.MeshBasicMaterial({ map: screenMap, toneMapped: false });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  // A cylinder from a to b (the lamp's arms).
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const m = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10), steel, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  };

  // Desk: 1.0 x 0.56 m, top at 0.74 m.
  add(box(1, 0.035, 0.56), wood, 0, 0.7225, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(box(0.035, 0.705, 0.035), steel, sx * 0.465, 0.3525, sz * 0.245);
    add(box(0.03, 0.03, 0.49), steel, sx * 0.465, 0.1, 0);
  }
  add(box(0.93, 0.06, 0.02), steel, 0, 0.675, -0.245);

  // Monitor on a stand. Its meshes are what the pointer can pick.
  const monitor = new THREE.Group();
  group.add(monitor);
  add(new RoundedBoxGeometry(SCREEN.w + 0.036, SCREEN.h + 0.036, 0.024, 2, 0.006), shell, 0, SCREEN.y, SCREEN_Z - 0.0125, monitor);
  const screen = add(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat, 0, SCREEN.y, SCREEN_Z, monitor);
  add(box(0.36, 0.26, 0.05), shell, 0, SCREEN.y - 0.02, SCREEN_Z - 0.05, monitor);
  add(box(0.05, 0.3, 0.022), shell, 0, 0.89, SCREEN_Z - 0.07, monitor);
  add(new RoundedBoxGeometry(0.26, 0.012, 0.18, 2, 0.004), shell, 0, 0.746, SCREEN_Z - 0.04, monitor);

  add(new RoundedBoxGeometry(0.42, 0.016, 0.135, 2, 0.004), keys, -0.04, 0.748, 0.08);
  add(new RoundedBoxGeometry(0.06, 0.022, 0.1, 2, 0.01), keys, 0.27, 0.751, 0.09);

  // Desk lamp at the left-hand end, beside the screen and set back: out of the picture once the
  // camera faces the screen, so its light arrives from off to the left.
  const base = new THREE.Vector3(-0.43, 0.762, -0.17);
  const elbow = new THREE.Vector3(-0.45, 1.13, -0.24);
  const head = new THREE.Vector3(-0.42, 1.1, 0.03);
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.022, 24), steel, base.x, 0.751, base.z);
  rod(base, elbow, 0.009);
  rod(elbow, head, 0.008);
  add(new THREE.SphereGeometry(0.016, 12, 8), steel, elbow.x, elbow.y, elbow.z);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2c2a27, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide });
  add(new THREE.ConeGeometry(0.07, 0.11, 24, 1, true), shadeMat, head.x, head.y - 0.05, head.z);
  add(new THREE.SphereGeometry(0.026, 16, 10), bulb, head.x, head.y - 0.085, head.z);

  const lamp = new THREE.SpotLight(0xffc68c, 3.2 * DESK_LIGHT, 2.6 * DESK.scale, 0.95, 0.7, 2);
  lamp.position.set(head.x, head.y - 0.09, head.z);
  lamp.target.position.set(-0.1, 0.74, 0.12);
  group.add(lamp, lamp.target);
  // The screen's light on the keys and the desk's front edge.
  const glow = new THREE.PointLight(0x9db9ff, GLOW, 1.6 * DESK.scale, 2);
  glow.position.set(0, SCREEN.y - 0.06, SCREEN_Z + 0.28);
  group.add(glow);

  return { group, monitor, screen, screenMat, screenMap, glow };
}

export type Quad = [x: number, y: number][];
/** A box in viewport pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RobotScene {
  /** Fly from the opening to face the monitor, whose screen lands on `rect` (viewport px), or back.
   * `onFrame` gets the screen's corners (viewport px, clockwise from top left) and the progress. */
  fly(to: 'lab' | 'hero', rect: Rect | null, onFrame: (quad: Quad, p: number) => void): Promise<void>;
  /** Re-aim at the monitor after the layout moves its screen (a resize while the lab is open). */
  setRect(rect: Rect): void;
  /** Back to the opening's view, measured now: after the return flight, or in its place when the lab
   * closes without one (a window the lab can't fly in, a browser-closed dialog, a page from the cache). */
  home(): void;
  /** Stop drawing while something opaque covers the whole stage. */
  hold(on: boolean): void;
  /** Width over height of the monitor's screen. */
  readonly screenAspect: number;
  /** Whether a point (client px) is over the monitor, which then shows it can be picked. */
  pick(x: number, y: number): boolean;
  dispose(): void;
}

interface View {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  /** Focal length and principal point, px, with the point relative to the opening's stage. */
  f: number;
  cx: number;
  cy: number;
}
const newView = (): View => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), f: 1, cx: 0, cy: 0 });
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const HERO_FOV = 28;
// One lens in the lab, a little wider than the opening's, so the dancers beyond the monitor stand at a
// size that fits beside it. It is composed for wide windows: lab.ts shows narrower ones the map at full
// width instead of widening the lens to fit them (which only shrinks the robots behind the monitor).
const LAB_FOV = 62;
const TAN_HERO = Math.tan(THREE.MathUtils.degToRad(HERO_FOV / 2));
const TAN_LAB = Math.tan(THREE.MathUtils.degToRad(LAB_FOV / 2));
// Device-pixel caps for the drawing buffer. In the lab (and in flight) the canvas fills the window,
// about 1.7x the opening's canvas, as the backdrop to the systems map (HTML, which this doesn't touch):
// at 1.25 it keeps about the opening's pixel count on a 2x display, 40% fewer than at 1.6.
const HERO_RATIO = 1.6;
const LAB_RATIO = 1.25;

/** `play` starts the dance whatever the Motion setting: the visitor asked for it with the Play button.
 * `toggles` are the play/pause buttons, the stage's own and any others (the lab's). */
export function mountRobots(root: HTMLElement, { play = false, toggles = [] as HTMLButtonElement[] } = {}): RobotScene | null {
  const stage = root.querySelector<HTMLElement>('[data-robot-stage]');
  if (!stage || !toggles.length || root.dataset.mounted != null) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  root.dataset.mounted = '';
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.append(canvas);

  const scene = new THREE.Scene();
  // Just enough environment to shape the paint; the stage light does the rest. The generator and
  // room are freed as soon as the map is made; a context restore empties render targets, so the
  // map is made again then.
  const makeEnv = () => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    pmrem.dispose();
    room.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    return target;
  };
  let env = makeEnv();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.12;

  // The projection is set from a focal length and principal point (View), so the flight can move
  // the picture's centre as well as the camera.
  const camera = new THREE.PerspectiveCamera(HERO_FOV, 1, 0.1, 60);
  // Three-quarter view: the camera orbits a little to the right of the group's front, so the
  // robots turn slightly toward the introduction and their staggered depths read.
  const AZIMUTH = 0.36;
  const camTarget = new THREE.Vector3(0, 0.9, -0.05);
  let dist = 8;

  // A warm spot from above front left pools on the floor (the only shadow caster); cool rims from
  // behind cut the silhouettes out of the dark; the fill is kept low so the surroundings fall off.
  const key = new THREE.SpotLight(0xffc285, 200, 0, 0.36, 0.42, 2);
  key.position.set(-2.3, 6.3, 3.1);
  key.target.position.set(0.15, 0, -0.15);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 3;
  key.shadow.camera.far = 13;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  // The rims sit at chest height behind the group and fade out by 8 units: their light rakes
  // across the floor at a shallow angle, so they edge the robots without tinting the floor.
  const rim = new THREE.SpotLight(0x8fb2ff, 130, 8, 0.5, 0.7, 2);
  rim.position.set(-3.2, 1.5, -3.8);
  rim.target.position.set(0, 1.15, 0.2);
  const rim2 = new THREE.SpotLight(0x9fbcff, 60, 8, 0.5, 0.8, 2);
  rim2.position.set(3.4, 1.4, -3.4);
  rim2.target.position.set(0, 1.1, 0.2);
  scene.add(key, key.target, rim, rim.target, rim2, rim2.target, new THREE.HemisphereLight(0x2c3446, 0x08090c, 0.18));

  // Floor: faint tile seams under a pool of light that fades out to the page. Diffuse only, so the
  // backlight can't glance off it toward the camera and the pool stays warm.
  const floorMap = floorTexture();
  floorMap.repeat.set(24, 24);
  const fade = radialTexture([
    [0, '#fff'],
    [0.3, '#aaa'],
    [0.6, '#2a2a2a'],
    [1, '#000'],
  ]);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshLambertMaterial({ color: 0x51443a, map: floorMap, alphaMap: fade, transparent: true }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -0.6);
  floor.receiveShadow = true;
  scene.add(floor);

  const blobTex = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.45, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  const robots = BUILDS.map((b) => new Robot(b, blobTex));
  for (const r of robots) scene.add(r.root);

  const desk = buildWorkstation();
  scene.add(desk.group);
  scene.updateMatrixWorld();
  const screenCorners = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ].map(([sx, sy]) => desk.group.localToWorld(new THREE.Vector3((sx * SCREEN.w) / 2, SCREEN.y + (sy * SCREEN.h) / 2, SCREEN_Z)));
  const screenCentre = desk.group.localToWorld(new THREE.Vector3(0, SCREEN.y, SCREEN_Z));
  const screenNormal = new THREE.Vector3(Math.sin(DESK.yaw), 0, Math.cos(DESK.yaw));

  // Dust drifting through the key light.
  const DUST = 150;
  const dustSeed = Float32Array.from({ length: DUST * 4 }, () => Math.random());
  const dustPos = new Float32Array(DUST * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dotTex = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [1, 'rgba(255,255,255,0)'],
  ], 32);
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xffd9ae, map: dotTex, size: 0.03, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scene.add(dust);
  const moveDust = (t: number) => {
    for (let i = 0; i < DUST; i++) {
      const [a, b, c, d] = [dustSeed[i * 4], dustSeed[i * 4 + 1], dustSeed[i * 4 + 2], dustSeed[i * 4 + 3]];
      dustPos[i * 3] = (a - 0.5) * 5.5 + Math.sin(t * 0.21 + d * TAU) * 0.15;
      dustPos[i * 3 + 1] = ((b * 3.2 + t * (0.03 + d * 0.04)) % 3.2) + 0.05;
      dustPos[i * 3 + 2] = (c - 0.5) * 3.2 - 0.3 + Math.cos(t * 0.17 + a * TAU) * 0.1;
    }
    dustGeo.attributes.position.needsUpdate = true;
  };

  // --- Lifecycle ---------------------------------------------------------------------------------
  const html = document.documentElement;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOK = () => !mq.matches && html.dataset.motion !== 'off';
  let intent = play || motionOK();
  let userPaused = false;
  let inView = false;
  let raf = 0;
  let last = 0;
  let t = intent ? 0 : (STILL_BEAT * 60) / BPM;
  let w = 0; // canvas size, CSS px
  let h = 0;
  // The opening's picture: its size, and where it sits in the viewport while the lab is open (the page
  // doesn't scroll then). Views are placed relative to it.
  let fw = 1;
  let fh = 1;
  let rootX = 0;
  let rootY = 0;
  let shift = 0;
  // The canvas's top left relative to the stage: right of the text (--scene-crop) in the opening,
  // the viewport's corner while the lab is open.
  let ox = 0;
  let oy = 0;
  let mode: 'hero' | 'lab' = 'hero';
  let labRect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let drawn = false;
  let lost = false;
  let held = false;
  let flight: {
    from: View;
    to: (v: View) => void;
    start: number;
    dur: number;
    onFrame: (quad: Quad, p: number) => void;
    done: () => void;
  } | null = null;
  const cur = newView();
  const next = newView();

  // Fit the group as seen from the three-quarter angle (about 3.8 x 2.2 units, the forward robot
  // included) into the part of the frame the layout leaves for it (--scene-usable, centred at
  // --scene-shift).
  function measureStage() {
    const cs = getComputedStyle(stage!);
    // Registered in global.css, so calc()s arrive as numbers; where @property isn't supported they
    // arrive unresolved, and the wide framing stands in.
    const num = (name: string, fallback: number) => {
      const n = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(n) ? n : fallback;
    };
    shift = num('--scene-shift', 0.3);
    const usable = num('--scene-usable', 0.38) || 1;
    // The picture is the stage. On stacked layouts the figure also holds the caption's row under it;
    // from lg (the only layouts with a lab) the two coincide, so while the stage fills the window for
    // the lab the figure keeps the picture's place.
    const r = (mode === 'hero' && !flight ? stage! : root).getBoundingClientRect();
    fw = r.width || 1;
    fh = r.height || 1;
    rootX = r.left;
    rootY = r.top;
    dist = Math.min(16, Math.max(5.4, 1.2 / TAN_HERO, 1.92 / (TAN_HERO * (fw / fh) * usable)));
  }

  function heroView(v: View) {
    // Gentle drift: a slow orbit and dolly around the three-quarter angle, never a cut.
    const az = AZIMUTH + Math.sin(t * 0.13) * 0.03;
    const r = dist + Math.sin(t * 0.07) * 0.18;
    v.pos.set(camTarget.x + Math.sin(az) * r, camTarget.y + dist * 0.09 + Math.sin(t * 0.09 + 1.3) * 0.06, camTarget.z + Math.cos(az) * r);
    v.look.set(camTarget.x + Math.sin(t * 0.11) * 0.05, camTarget.y, camTarget.z);
    v.f = fh / 2 / TAN_HERO;
    v.cx = fw / 2 + shift * fw;
    v.cy = fh / 2;
  }

  // Square on to the monitor, near enough that its screen covers labRect.
  function labView(v: View) {
    v.f = h / 2 / TAN_LAB;
    v.look.copy(screenCentre);
    v.pos.copy(screenNormal).multiplyScalar((SCREEN.w * DESK.scale * v.f) / labRect.w).add(screenCentre);
    v.cx = labRect.x + labRect.w / 2 - rootX;
    v.cy = labRect.y + labRect.h / 2 - rootY;
  }

  function place(v: View) {
    camera.position.copy(v.pos);
    camera.lookAt(v.look);
    camera.updateMatrixWorld();
    const n = camera.near;
    const cx = v.cx - ox;
    const cy = v.cy - oy;
    camera.projectionMatrix.makePerspective((-cx / v.f) * n, ((w - cx) / v.f) * n, (cy / v.f) * n, (-(h - cy) / v.f) * n, n, camera.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  const corner = new THREE.Vector3();
  function quad(): Quad {
    return screenCorners.map((c) => {
      corner.copy(c).project(camera);
      return [((corner.x + 1) / 2) * w + ox + rootX, ((1 - corner.y) / 2) * h + oy + rootY] as [number, number];
    });
  }

  function render(now = performance.now()) {
    const beat = ((t * BPM) / 60) % BEATS;
    for (const r of robots) r.update(beat, t);
    moveDust(t);
    let p = 1;
    if (flight) {
      p = clamp01((now - flight.start) / flight.dur);
      const e = easeInOut(p);
      flight.to(next);
      cur.pos.lerpVectors(flight.from.pos, next.pos, e);
      cur.look.lerpVectors(flight.from.look, next.look, e);
      cur.f = flight.from.f * (next.f / flight.from.f) ** e;
      cur.cx = lerp(flight.from.cx, next.cx, e);
      cur.cy = lerp(flight.from.cy, next.cy, e);
    } else if (mode === 'lab') labView(cur);
    else heroView(cur);
    place(cur);
    renderer.render(scene, camera);
    if (!drawn) {
      drawn = true;
      root.dataset.drawn = '';
    }
    if (flight) {
      const f = flight;
      f.onFrame(quad(), p);
      if (p >= 1) {
        flight = null;
        f.done();
        sync();
      }
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    // The dance holds while paused; a flight still plays out.
    if (intent) t += Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    render(now);
  }

  function sync() {
    const go = ((intent && inView) || !!flight) && !held && !document.hidden && !lost && w > 0;
    if (go && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!go && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    root.dataset.running = String(go && intent);
    const label = intent ? 'Pause' : 'Play';
    for (const b of toggles) {
      b.setAttribute('aria-label', `${label} the robot animation`);
      b.dataset.state = intent ? 'playing' : 'paused';
      const text = b.querySelector('[data-robot-toggle-label]');
      if (text) text.textContent = label;
    }
  }

  function resize(cw: number, ch: number) {
    if (!cw || !ch) return;
    const crop = Math.min(0.9, Math.max(0, parseFloat(getComputedStyle(stage!).getPropertyValue('--scene-crop')) || 0));
    const nw = Math.round(cw * (1 - crop));
    const nh = ch;
    measureStage();
    const hero = mode === 'hero' && !flight;
    if (hero) {
      ox = cw - nw;
      oy = 0;
    } else {
      // The stage is the viewport now: the canvas's corner is the viewport's.
      ox = -rootX;
      oy = -rootY;
    }
    // setPixelRatio and setSize reallocate (and clear) the drawing buffer, so only when they change
    // (entering and leaving the lab change the size anyway).
    const ratio = Math.min(devicePixelRatio || 1, hero ? HERO_RATIO : LAB_RATIO);
    if (renderer.getPixelRatio() !== ratio || nw !== w || nh !== h) {
      w = nw;
      h = nh;
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
    }
    if (!lost) render();
    sync();
  }
  const settle = () => {
    const r = stage!.getBoundingClientRect();
    resize(Math.round(r.width), Math.round(r.height));
  };

  const onToggle = () => {
    intent = !intent;
    userPaused = !intent;
    sync();
  };
  const onMotion = () => {
    if (!motionOK()) intent = false;
    else if (!userPaused) intent = true;
    sync();
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    root.dataset.failed = '';
    // A flight can't finish without frames: land it.
    if (flight) {
      const f = flight;
      flight = null;
      f.done();
    }
    sync();
  };
  const onRestored = () => {
    lost = false;
    delete root.dataset.failed;
    env.dispose();
    env = makeEnv();
    scene.environment = env.texture;
    render();
    sync();
  };
  for (const b of toggles) b.addEventListener('click', onToggle);
  mq.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  const motionObs = new MutationObserver(onMotion);
  motionObs.observe(html, { attributes: true, attributeFilter: ['data-motion'] });
  // Stop once less than a tenth of the stage is on screen (from lg the stage is the whole opening,
  // and its last strip is under a scrim).
  const io = new IntersectionObserver(
    ([e]) => {
      inView = e.isIntersecting && e.intersectionRatio >= 0.1;
      sync();
    },
    { threshold: [0, 0.1] },
  );
  io.observe(stage);
  const ro = new ResizeObserver(([e]) => resize(Math.round(e.contentRect.width), Math.round(e.contentRect.height)));
  ro.observe(stage);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = false;

  return {
    fly(to, rect, onFrame) {
      return new Promise<void>((resolve) => {
        if (lost) return resolve();
        if (rect) labRect = rect;
        const from = newView();
        from.pos.copy(cur.pos);
        from.look.copy(cur.look);
        from.f = cur.f;
        from.cx = cur.cx;
        from.cy = cur.cy;
        mode = to;
        flight = {
          from,
          to: to === 'lab' ? labView : heroView,
          start: performance.now(),
          // Out is a little slower than back.
          dur: to === 'lab' ? 1500 : 1150,
          onFrame,
          done: resolve,
        };
        settle();
      });
    },
    setRect(rect) {
      labRect = rect;
      if (mode === 'lab' && !flight) settle();
    },
    home() {
      mode = 'hero';
      settle();
    },
    hold(on) {
      held = on;
      sync();
    },
    screenAspect: SCREEN.w / SCREEN.h,
    pick(x, y) {
      const r = canvas.getBoundingClientRect();
      let hit = false;
      if (mode === 'hero' && !flight && r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        hit = raycaster.intersectObject(desk.monitor, true).length > 0;
      }
      if (hit !== hovered) {
        hovered = hit;
        // The screen wakes a little under the pointer.
        desk.screenMat.color.setScalar(hit ? 1.35 : 1);
        desk.glow.intensity = hit ? GLOW * 1.8 : GLOW;
        if (!raf && !lost) render();
      }
      return hit;
    },
    dispose() {
      cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      motionObs.disconnect();
      for (const b of toggles) b.removeEventListener('click', onToggle);
      mq.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', sync);
      const textures = new Set<THREE.Texture>([floorMap, fade, blobTex, dotTex, desk.screenMap]);
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh || o instanceof THREE.Points)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      });
      textures.forEach((tx) => tx.dispose());
      env.dispose();
      renderer.dispose();
      canvas.remove();
      delete root.dataset.mounted;
      delete root.dataset.drawn;
    },
  };
}
