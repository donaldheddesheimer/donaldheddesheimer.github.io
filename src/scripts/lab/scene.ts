// The robotics lab of the homepage's opening (/), where the computer on the desk holds the portfolio. It
// began as a fork of the first homepage's robot stage; the rig and the routine are the same. The room: a
// concrete floor with the dance area taped out, a block wall with a high window, a workbench under a
// pendant, an unfinished robot on a service stand, two props (a task chair pushed aside, a tool cart), a
// tripod work light as the key, and the three dancers, given characters through proportion, timing,
// where they stand and how they answer each other. Two camera views: the opening, which the pointer may
// look around a little (lookAround), and reading, square on to the monitor, whose screen the terminal
// covers in real HTML (computer.ts). One flight joins them. Simple geometry throughout.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const BPM = 112;
const BEATS = 32;
const RAMP = 0.35; // beats of crossfade either side of a section boundary
// Reduced motion (or Motion off) holds this moment: each robot in character, arms clear of the opening's text.
const STILL_BEAT = 21.2;
const STILL_T = (STILL_BEAT * 60) / BPM; // the same moment, in seconds

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const win = (x: number, a: number, b: number, c: number, d: number) => smooth(a, b, x) * (1 - smooth(c, d, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Seeded, so every visit (and every screenshot) gets the same dust, blinks and concrete.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Choreography (with each persona's timing) --------------------------------------------------
const CH = [
  'turn',
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

type Key = readonly [at: number, pose: Arm, dur: number];
// `pace` scales each key's ease: the heavy robot arrives late and deliberate, the precise one snaps.
function armKeys(o: Pose, s: Side, keys: readonly Key[], u: number, pace: number) {
  let i = -1;
  while (i + 1 < keys.length && keys[i + 1][0] <= u) i++;
  if (i < 0) return setArm(o, s, keys[0][1]);
  const [at, to, dur] = keys[i];
  const from = i ? keys[i - 1][1] : to;
  const room = i + 1 < keys.length ? keys[i + 1][0] - at : dur * pace;
  const t = smooth(0, 1, (u - at) / Math.min(room, dur * pace));
  for (let j = 0; j < 5; j++) o[armCh(s, j)] = lerp(from[j], to[j], t);
}
const GESTURE: Record<Side, readonly Key[]> = {
  r: [[-1, ARM.pump, 1], [0, ARM.up, 0.7], [2, ARM.hip, 0.7], [4, ARM.robotDown, 0.18], [4.5, ARM.robotUp, 0.18], [5, ARM.robotDown, 0.18], [5.5, ARM.robotUp, 0.18], [6, ARM.v, 0.5], [7, ARM.pump, 0.9]],
  l: [[-1, ARM.pump, 1], [0, ARM.hip, 0.7], [2, ARM.up, 0.7], [4, ARM.robotUp, 0.18], [4.5, ARM.robotDown, 0.18], [5, ARM.robotUp, 0.18], [5.5, ARM.robotDown, 0.18], [6, ARM.v, 0.5], [7, ARM.pump, 0.9]],
};

interface Persona {
  lag: number;
  canon: number;
  sway: number;
  bounce: number;
  arm: number;
  twist: number;
  tilt: number;
  look: number;
  dir: number;
  /** Sway cycles per two beats: 0.5 is half time. */
  groove: number;
  /** Bounces per beat: 2 is double time. */
  dip: number;
  /** Arm-key ease, times the routine's. */
  pace: number;
  /** Extra hip drop (knees bent), leg lengths. */
  low: number;
  /** Step height, times the routine's. */
  hop: number;
  /** Looks around between moves: 0 to 1. */
  curious: number;
  /** Keeps its arms close, 0 to 1: raised straight up rather than out, and swung past the shoulder in
   *  front, elbows bent. */
  close: number;
}

function groove(o: Pose, g: number, p: Persona, k = 1) {
  const sw = Math.sin(Math.PI * g * p.groove);
  const dip = 0.5 + 0.5 * Math.cos(TAU * g * p.dip);
  o.px += sw * p.sway * k;
  o.py += dip * p.bounce * k + p.low;
  o.pRoll += sw * 0.045 * k;
  o.pYaw += Math.sin(Math.PI * g * p.groove - 0.8) * 0.05 * p.twist * k;
  o.cRoll -= sw * 0.06 * k;
  o.cYaw += Math.sin(Math.PI * g * p.groove + 0.4) * 0.09 * p.twist * k;
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

const warmUp: Section = (o, u, g, p) => {
  groove(o, g, p);
  const look = win(u, 3.5, 4.5, 7.2, 8.2) * Math.sin((Math.PI * g) / 2);
  o.hYaw += look * 0.3;
  o.cYaw += look * 0.12;
};

const gestures: Section = (o, u, g, p) => {
  groove(o, g, p, 0.85);
  armKeys(o, 'r', GESTURE.r, u, p.pace);
  armKeys(o, 'l', GESTURE.l, u, p.pace);
  // Bigger arms reach further (terracotta), smaller ones stay close (graphite).
  o.lA *= 0.75 + 0.25 * p.arm;
  o.rA *= 0.75 + 0.25 * p.arm;
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

const travel: Section = (o, u, g, p) => {
  groove(o, g, p, 0.35);
  const S = 0.26;
  const H = 0.09 * p.hop;
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
  // A hop carries the body up with the lifted foot.
  o.py -= Math.max(ly, ry) * 0.5 * Math.max(0, p.hop - 1);
  const mid = (lx + rx) / 2;
  o.px += mid;
  o.pRoll += (ry - ly) * 0.6;
  o.hYaw += mid * 0.9;
  o.cYaw -= mid * 0.4;
  const open = Math.sin((Math.PI * u) / 2) ** 2 * win(u, -0.3, 0.3, 7.7, 8.3);
  o.lA += open * 0.6 * p.arm;
  o.rA += open * 0.6 * p.arm;
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

// Where a curious robot looks between moves (head yaw, roll), a new place every 2.6 s, turning there
// quickly and holding.
const GLANCES: [yaw: number, roll: number][] = [[0, 0], [0.55, 0.14], [0.2, -0.05], [-0.45, -0.16], [-0.1, 0.08], [0.35, 0.2], [-0.3, 0]];
function glance(time: number) {
  const n = GLANCES.length;
  const i = Math.floor(time / 2.6);
  const e = smooth(0, 0.35, time - i * 2.6);
  const a = GLANCES[(((i - 1) % n) + n) % n];
  const b = GLANCES[((i % n) + n) % n];
  return [lerp(a[0], b[0], e), lerp(a[1], b[1], e)];
}

// --- Robots ----------------------------------------------------------------------------------------
interface Build {
  name: string;
  at: [x: number, z: number, yaw: number];
  paint: number;
  trim: number;
  eye: number;
  thigh: number;
  shin: number;
  legR: number;
  hipW: number;
  stance: number;
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
  /** Unfinished: bare aluminium, part primer, the rest in construction lines. */
  schematic?: boolean;
  persona: Persona;
}

const STILL: Persona = { lag: 0, canon: 0, sway: 0, bounce: 0, arm: 0, twist: 0, tilt: 0, look: 0, dir: 1, groove: 1, dip: 1, pace: 1, low: 0, hop: 1, curious: 0, close: 0 };

// Graphite: heavy, grounded, deliberate. The broadest build, thick limbs and a wide low stance; it
// sways at half time, bounces every other beat and arrives late on every arm move, and keeps its arms
// close. It dances just behind the monitor, left of it.
// Ivory: precise, curious, attentive. Tall, slim and long-necked; snaps to each arm key and looks
// around (and tilts its head) between moves. It stands back by the service stand, and leaves the step
// now and then to inspect the unfinished robot on it.
// Terracotta: small, energetic, playful. Bounces twice a beat, hops its steps and throws its arms wide.
// It has the front of the floor, right of the monitor, and starts the exchanges (react()).
// The three stand as a loose triangle round the monitor, not a line: Graphite and Terracotta either side
// of it and a little behind, turned partly toward each other, Ivory further back.
const BUILDS: Build[] = [
  {
    name: 'graphite',
    at: [-1.55, 0.35, 0.55],
    paint: 0x464c54,
    trim: 0x202328,
    eye: 0xc9d6e6,
    thigh: 0.33,
    shin: 0.32,
    legR: 0.086,
    hipW: 0.16,
    stance: 0.23,
    toeOut: 0.16,
    foot: [0.21, 0.09, 0.33],
    pelvis: [0.5, 0.17, 0.3],
    torso: [0.74, 0.54, 0.42, 0.1],
    shoulderW: 0.44,
    upper: 0.28,
    fore: 0.27,
    armR: 0.074,
    neck: 0.035,
    head: 'dome',
    headSize: [0.4, 0.26, 0.33],
    pads: true,
    persona: { lag: 0.12, canon: 0, sway: 0.05, bounce: 0.05, arm: 0.7, twist: 1.2, tilt: 0.3, look: 0.12, dir: 1, groove: 0.5, dip: 0.5, pace: 1.9, low: 0.06, hop: 0.5, curious: 0, close: 1 },
  },
  {
    name: 'ivory',
    at: [0.85, -1.55, 0.25],
    paint: 0xdcd5c6,
    trim: 0x2a2d33,
    eye: 0xffb561,
    thigh: 0.41,
    shin: 0.41,
    legR: 0.048,
    hipW: 0.1,
    stance: 0.13,
    toeOut: 0.1,
    foot: [0.12, 0.07, 0.26],
    pelvis: [0.28, 0.14, 0.2],
    torso: [0.4, 0.5, 0.27, 0.07],
    shoulderW: 0.25,
    upper: 0.3,
    fore: 0.28,
    armR: 0.04,
    neck: 0.13,
    head: 'box',
    headSize: [0.34, 0.27, 0.28],
    antenna: true,
    persona: { lag: 0, canon: 1, sway: 0.05, bounce: 0.05, arm: 0.95, twist: 0.8, tilt: 0.9, look: 0, dir: -1, groove: 1, dip: 1, pace: 0.5, low: 0, hop: 1, curious: 1, close: 0 },
  },
  {
    name: 'terracotta',
    at: [1.85, 1.0, -0.55],
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
    upper: 0.24,
    fore: 0.23,
    armR: 0.042,
    neck: 0.05,
    head: 'ball',
    headSize: [0.37, 0.37, 0.37],
    persona: { lag: -0.05, canon: 2, sway: 0.085, bounce: 0.05, arm: 1.45, twist: 0.9, tilt: 1.6, look: -0.12, dir: 1, groove: 1, dip: 2, pace: 0.8, low: 0.02, hop: 2.4, curious: 0.3, close: 0 },
  },
];

// The unfinished one, on the service stand: a fourth build, not a fourth dancer.
const PROTO: Build = {
  name: 'proto',
  at: [0, 0, 0],
  paint: 0xb9bdc2,
  trim: 0x26282c,
  eye: 0xffb561,
  thigh: 0.36,
  shin: 0.36,
  legR: 0.03,
  hipW: 0.11,
  stance: 0.14,
  toeOut: 0.06,
  foot: [0.13, 0.06, 0.24],
  pelvis: [0.3, 0.13, 0.2],
  torso: [0.42, 0.48, 0.26, 0.05],
  shoulderW: 0.26,
  upper: 0.28,
  fore: 0.26,
  armR: 0.028,
  neck: 0.08,
  head: 'box',
  headSize: [0.3, 0.24, 0.26],
  schematic: true,
  persona: STILL,
};

// --- Relationships ---------------------------------------------------------------------------------
// A few restrained exchanges over the routine, on its beats (32 to a loop, about 17 s):
// - Terracotta turns to Graphite and waves (beats 3 to 6.5); Graphite turns, slowly, and nods once (5.5
//   to 9.4).
// - Between the gestures and the canon, Terracotta hops round to Ivory, behind it (13.8 to 14.8), shimmies
//   at it and hops back (15.9 to 16.9); Ivory glances over.
// - Late in the travel, Ivory leaves the step to inspect the unfinished robot on its stand (25.6 to 31.8):
//   it turns to it, leans in, head tilted, one hand raised to its chin.
const spot = (name: string) => BUILDS.find((b) => b.name === name)!.at;

/** How far round a robot on its spot, facing its own way, would turn to face a point on the floor. */
function bearing(at: Build['at'], x: number, z: number) {
  const a = Math.atan2(x - at[0], z - at[1]) - at[2];
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Turn toward a point on the floor by `k` (0 to 1): the head most of the way, the body the rest. */
function face(o: Pose, at: Build['at'], x: number, z: number, k: number, body = 0.4) {
  if (k <= 0) return;
  let a = bearing(at, x, z) - o.turn;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  o.hYaw = lerp(o.hYaw, Math.max(-0.95, Math.min(0.95, a * (1 - body))), k);
  o.cYaw += a * body * 0.6 * k;
  o.pYaw += a * body * 0.4 * k;
}

/** Two hops over beats `a` to `b`: how far round (0 to 1, turning only while off the floor) and how high. */
function hops(beat: number, a: number, b: number): [round: number, lift: number] {
  const u = clamp01((beat - a) / (b - a)) * 2;
  const i = Math.min(1, Math.floor(u));
  const f = u - i;
  return [(i + smooth(0, 1, f)) / 2, Math.sin(Math.PI * f)];
}

const WAVE: Arm = [0.35, 2.3, 0, 0.55, 0];
const CHIN: Arm = [1.05, 0.28, 0, 2.05, 0.2];
const EASE_ARM: Arm = [0.05, 0.22, 0, 0.3, 0];
const FEET: Ch[] = ['lfx', 'lfy', 'lfz', 'rfx', 'rfy', 'rfz'];

function react(o: Pose, b: Build, beat: number) {
  const at = b.at;
  if (b.name === 'terracotta') {
    const g = spot('graphite');
    const call = win(beat, 3, 3.5, 6, 6.6);
    face(o, at, g[0], g[1], call, 0.5);
    blendArm(o, 'r', WAVE, call);
    o.rE += Math.sin(TAU * (beat - 3)) * 0.4 * call;
    o.cRoll -= call * 0.05;
    // Ivory is behind it, too far round for a look over the shoulder: it turns on its spot most of the
    // way, in hops, and the head and chest do the rest.
    const iv = spot('ivory');
    const [there, up] = hops(beat, 13.8, 14.8);
    const [back, down] = hops(beat, 15.9, 16.9);
    const round = there * (1 - back);
    o.turn = bearing(at, iv[0], iv[1]) * 0.85 * round;
    face(o, at, iv[0], iv[1], round, 0.35);
    const lift = (up + down) * 0.12;
    o.lfy += lift;
    o.rfy += lift;
    o.py -= lift;
    const nudge = win(beat, 14.7, 14.95, 15.75, 16);
    o.cRoll += Math.sin(TAU * beat * 2) * 0.09 * nudge;
    o.cYaw += Math.sin(TAU * beat * 2 + 0.6) * 0.07 * nudge;
  } else if (b.name === 'graphite') {
    const t = spot('terracotta');
    const answer = win(beat, 5.4, 6.3, 8.4, 9.4);
    face(o, at, t[0], t[1], answer, 0.45);
    const nod = win(beat, 6.5, 7, 7.5, 8.2);
    o.hPitch += nod * 0.34;
    o.cPitch += nod * 0.07;
  } else if (b.name === 'ivory') {
    const t = spot('terracotta');
    face(o, at, t[0], t[1], win(beat, 14.5, 14.9, 16, 16.5), 0.2);
    const look = win(beat, 25.6, 26.6, 30.8, 31.8);
    if (look > 0) {
      // Out of the step: feet back under it, the travel's drift gone, arms easing down.
      for (const c of FEET) o[c] *= 1 - look;
      o.px *= 1 - look;
      o.py *= 1 - look * 0.7;
      blendArm(o, 'l', EASE_ARM, look);
      blendArm(o, 'r', CHIN, win(beat, 26.4, 27.2, 30.2, 31.2));
      face(o, at, STAND.x, STAND.z, look, 0.55);
      o.pPitch += look * 0.06;
      o.cPitch += look * 0.16;
      o.hPitch += look * 0.12;
      o.hRoll = lerp(o.hRoll, 0.2 + Math.sin(beat * 0.9) * 0.06, look);
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const dir = new THREE.Vector3();

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
  shell?: THREE.Mesh;
}

// Construction lines: pale, thin and still (no flicker), and only a few.
const lineMat = new THREE.LineBasicMaterial({ color: 0xe8dfcf, transparent: true, opacity: 0.42 });
const dashMat = new THREE.LineDashedMaterial({ color: 0xe8dfcf, transparent: true, opacity: 0.32, dashSize: 0.035, gapSize: 0.03 });

class Robot {
  readonly root = new THREE.Group();
  private readonly pelvis = new THREE.Group();
  private readonly chest = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly eyes = new THREE.Group();
  private readonly arms: Limb[] = [];
  private readonly legs: Leg[] = [];
  private readonly pose = newPose();
  private readonly tmp = newPose();
  private readonly L: number;
  private readonly hipY: number;
  private readonly blinkAt: number;

  constructor(
    private readonly b: Build,
    blobTex: THREE.Texture,
    random: () => number,
  ) {
    const sk = !!b.schematic;
    // Satin paint, matte joints, a visor with one soft highlight. The unfinished robot is bare
    // aluminium (paint), with primer where panels have gone on.
    const paint = sk
      ? new THREE.MeshStandardMaterial({ color: b.paint, roughness: 0.34, metalness: 0.85 })
      : new THREE.MeshStandardMaterial({ color: b.paint, roughness: 0.58, metalness: 0.06 });
    const trim = new THREE.MeshStandardMaterial({ color: b.trim, roughness: 0.78, metalness: 0.12 });
    const primer = new THREE.MeshStandardMaterial({ color: 0x86837d, roughness: 0.92, metalness: 0 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.32, metalness: 0.25 });
    const glow = new THREE.MeshBasicMaterial({ color: b.eye, toneMapped: false });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = mat !== glow;
      parent.add(m);
      return m;
    };
    const lines = (geo: THREE.BufferGeometry, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat);
      geo.dispose();
      l.position.set(x, y, z);
      parent.add(l);
      return l;
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
    this.blinkAt = random() * 4;

    this.root.add(this.pelvis);
    add(box(pw, ph, pd, 0.05), trim, this.pelvis);
    add(new THREE.CylinderGeometry(pw * 0.28, pw * 0.34, ph * 0.9, 16), trim, this.pelvis, 0, ph * 0.55, 0);
    this.chest.position.y = ph * 0.5;
    this.pelvis.add(this.chest);
    const [tw, th, td, tr] = b.torso;
    if (sk) {
      // A spine and the lower half of the shell in primer; the rest of the torso drawn, not built.
      add(new THREE.CylinderGeometry(0.03, 0.03, th, 12), paint, this.chest, 0, th / 2 + 0.02, 0);
      add(box(tw, th * 0.42, td, tr), primer, this.chest, 0, th * 0.21 + 0.02, 0);
      lines(new THREE.BoxGeometry(tw, th, td), this.chest, 0, th / 2 + 0.02, 0);
      add(ball(0.012), glow, this.chest, tw * 0.3, th * 0.3, td / 2 + 0.012);
    } else {
      add(box(tw, th, td, tr), paint, this.chest, 0, th / 2 + 0.02, 0);
      add(box(tw * 0.5, th * 0.38, 0.03, 0.012), trim, this.chest, 0, th * 0.58, td / 2 + 0.005);
      add(ball(0.014), glow, this.chest, tw * 0.13, th * 0.62, td / 2 + 0.024);
      add(box(tw * 0.62, 0.035, td * 1.02, 0.015), trim, this.chest, 0, 0.05, 0);
    }

    const top = th + 0.02;
    add(new THREE.CylinderGeometry(0.035, 0.045, b.neck + 0.04, 12), sk ? paint : trim, this.chest, 0, top + b.neck / 2, 0);
    this.head.position.y = top + b.neck;
    this.chest.add(this.head);
    const [hw, hh, hd] = b.headSize;
    this.head.add(this.eyes);
    if (sk) {
      // The head as a frame: its outline, a visor fitted, one camera eye.
      lines(new THREE.BoxGeometry(hw, hh, hd), this.head, 0, hh / 2, 0);
      add(box(hw * 0.8, hh * 0.44, 0.04, 0.02), visor, this.head, 0, hh * 0.52, hd / 2 - 0.01);
      add(new THREE.BoxGeometry(hw * 0.5, 0.02, hd * 0.8), paint, this.head, 0, 0.01, 0);
      this.eyes.position.set(0, hh * 0.52, hd / 2 + 0.014);
      add(ball(0.016), glow, this.eyes, hw * 0.16, 0, 0);
    } else if (b.head === 'ball') {
      const r = hw / 2;
      add(ball(r), paint, this.head, 0, r, 0);
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

    for (const s of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.rotation.order = 'ZXY';
      shoulder.position.set(s * b.shoulderW, th - b.armR * 1.2, 0);
      this.chest.add(shoulder);
      if (sk) {
        // Exposed joints: a servo drum at each, bare tubes between.
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), trim, shoulder).rotation.z = Math.PI / 2;
        add(new THREE.TorusGeometry(0.047, 0.006, 6, 20), paint, shoulder, s * 0.026, 0, 0).rotation.y = Math.PI / 2;
      } else add(ball(b.armR * (b.pads ? 2.1 : 1.45)), b.pads ? paint : trim, shoulder);
      add(rod(b.armR, b.upper - b.armR * 2), paint, shoulder, 0, -b.upper / 2, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -b.upper;
      shoulder.add(elbow);
      if (sk) add(new THREE.CylinderGeometry(0.034, 0.034, 0.045, 14), trim, elbow).rotation.z = Math.PI / 2;
      else add(ball(b.armR * 1.15), trim, elbow);
      add(rod(b.armR * 0.9, b.fore - b.armR * 2), paint, elbow, 0, -b.fore / 2, 0);
      const hand = new THREE.Group();
      hand.position.y = -b.fore;
      elbow.add(hand);
      if (b.head === 'ball') add(ball(b.armR * 1.5), trim, hand, 0, -b.armR, 0);
      else if (sk) add(box(0.05, 0.07, 0.03, 0.01), trim, hand, 0, -0.035, 0);
      else add(box(b.armR * 2.6, b.armR * 3, b.armR * 1.9, b.armR * 0.7), trim, hand, 0, -b.armR * 1.3, 0);
      this.arms.push({ shoulder, elbow, hand });
    }

    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0.55 });
    for (let i = 0; i < 2; i++) {
      const thigh = add(rod(b.legR, b.thigh - b.legR * 2), paint, this.root);
      const shin = add(new THREE.CylinderGeometry(b.legR * 1.05, b.legR * 0.8, b.shin, 16), paint, this.root);
      const knee = sk ? add(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 14), trim, this.root) : add(ball(b.legR * 1.2), trim, this.root);
      // One shin has its cover on; the other is still bare tube.
      const shell = sk && i === 0 ? add(new THREE.CylinderGeometry(0.052, 0.042, b.shin * 0.7, 16), primer, this.root) : undefined;
      const foot = new THREE.Group();
      this.root.add(foot);
      const [fw, fh, fl] = b.foot;
      add(box(fw, fh, fl, 0.03), trim, foot, 0, -fh / 2, fl * 0.2);
      add(ball(b.legR * 1.05), trim, foot);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(fw * 2.4, fl * 1.6), blobMat.clone());
      blob.rotation.x = -Math.PI / 2;
      blob.renderOrder = 1;
      this.root.add(blob);
      this.legs.push({ thigh, shin, knee, foot, blob, shell });
    }
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(tw * 2.6, tw * 1.9), blobMat);
    pool.material.opacity = 0.42;
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.001;
    pool.renderOrder = 1;
    this.root.add(pool);

    if (sk) {
      // A dashed centreline, floor to crown, and the right shoulder's reach drawn as an arc.
      const height = this.hipY + ph * 0.5 + th + b.neck + hh + 0.12;
      const centre = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, height, 0)]), dashMat);
      centre.computeLineDistances();
      this.root.add(centre);
      // Hanging to raised out to the side, about the right shoulder (the robot's right is -x).
      const reach = b.upper + b.fore;
      const sy = th - b.armR * 1.2;
      const pts = Array.from({ length: 21 }, (_, i) => {
        const a = Math.PI * (0.12 + (i / 20) * 0.46);
        return new THREE.Vector3(-b.shoulderW - Math.sin(a) * reach, sy - Math.cos(a) * reach, 0);
      });
      const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dashMat);
      arc.computeLineDistances();
      this.chest.add(arc);
    }
  }

  /** The outer corners (top-left and bottom-left) of each elbow and hand as posed now, in the room. */
  reach() {
    this.root.updateMatrixWorld(true);
    const r = this.b.armR * 2.2;
    return this.arms.flatMap(({ elbow, hand }) =>
      [elbow.getWorldPosition(new THREE.Vector3()), hand.localToWorld(new THREE.Vector3(0, -this.b.armR * 1.3, 0))].flatMap((p) => [
        p.clone().add(new THREE.Vector3(-r, r, 0)),
        p.add(new THREE.Vector3(-r, -r, 0)),
      ]),
    );
  }

  /** `rest` (0 to 1) eases every joint to standing still, arms down: the robots quiet while reading. */
  update(beat: number, time: number, rest = 0) {
    const b = this.b;
    const p = b.persona;
    const o = this.pose;
    if (b.schematic) {
      // On the stand: arms held out a little for fitting, the head scanning slowly.
      clear(o);
      o.lA = o.rA = 0.34;
      o.lE = o.rE = 0.4;
      o.lF = o.rF = 0.1;
      o.hYaw = Math.sin(time * 0.32) * 0.45;
      o.hPitch = -0.06 + Math.sin(time * 0.21) * 0.04;
    } else {
      choreograph(o, this.tmp, (((beat - p.lag) % BEATS) + BEATS) % BEATS, p);
      if (p.curious) {
        const [yaw, roll] = glance(time + p.canon * 1.3);
        const between = 1 - 0.7 * win(beat % BEATS, 8, 8.4, 15.6, 16);
        o.hYaw += yaw * p.curious * between;
        o.hRoll += roll * p.curious * between;
      }
      react(o, b, beat % BEATS);
      if (p.close)
        for (const s of ['l', 'r'] as const) {
          const A = ch(s, 'A');
          o[A] += (Math.PI - 0.12 - o[A]) * 0.7 * p.close * smooth(1.6, 2.4, o[A]);
          const level = Math.max(0, Math.sin(o[A])) ** 2;
          o[ch(s, 'E')] = Math.max(o[ch(s, 'E')], 1.4 * p.close * level);
          o[ch(s, 'F')] = Math.max(o[ch(s, 'F')], 0.9 * p.close * level);
        }
    }
    if (rest > 0) for (const c of CH) o[c] *= 1 - smooth(0, 1, rest);
    // The whole robot turns about its spot (the unfinished one is held by its stand).
    if (!b.schematic) this.root.rotation.y = b.at[2] + o.turn;
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
    // Blink every few seconds; the unfinished one's status light pulses slowly instead.
    const bt = (time + this.blinkAt) % 4.3;
    this.eyes.scale.setScalar(b.schematic ? (Math.sin(time * 1.6) > -0.2 ? 1 : 0.001) : 1);
    if (!b.schematic) this.eyes.scale.y = bt < 0.12 ? 0.15 : 1;

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
      const pole = v4.set(s * 0.18, 0, 1);
      pole.addScaledVector(d, -pole.dot(d)).normalize();
      const knee = pole.multiplyScalar(b.thigh * Math.sin(a)).addScaledVector(d, b.thigh * Math.cos(a)).add(hip);
      leg.knee.position.copy(knee);
      if (b.schematic) leg.knee.quaternion.setFromUnitVectors(UP, X_AXIS);
      span(leg.thigh, hip, knee);
      span(leg.shin, knee, ankle);
      if (leg.shell) {
        leg.shell.position.lerpVectors(knee, ankle, 0.45);
        leg.shell.quaternion.copy(leg.shin.quaternion);
      }
      leg.foot.position.copy(ankle);
      leg.foot.rotation.set((ankle.y - fh) * 2.2, s * b.toeOut + o[ch(side, 'fYaw')], 0, 'YXZ');
      leg.blob.position.set(ankle.x, 0.002, ankle.z + b.foot[2] * 0.2);
      const lift = clamp01((ankle.y - fh) / 0.12);
      (leg.blob.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - lift * 0.7);
      leg.blob.scale.setScalar(1 + lift * 0.4);
    });
  }
}

// --- Textures --------------------------------------------------------------------------------------
function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function radialTexture(stops: [number, string][], size = 128) {
  return canvasTexture(
    size,
    size,
    (g) => {
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [at, color] of stops) grad.addColorStop(at, color);
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    },
    false,
  );
}

// Sealed concrete: a 2 m slab with its saw-cut joint on two edges, speckle and a few soft stains.
function concreteTexture(random: () => number) {
  const t = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#8c8984';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9; i++) {
      const x = random() * 512;
      const y = random() * 512;
      const r = 40 + random() * 120;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = random() < 0.6;
      grad.addColorStop(0, dark ? 'rgba(40,36,32,0.16)' : 'rgba(255,250,240,0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 5000; i++) {
      const v = random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${0.04 + random() * 0.07})`;
      g.fillRect(random() * 512, random() * 512, 1 + random() * 1.5, 1 + random() * 1.5);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, 512, 3);
    g.fillRect(0, 0, 3, 512);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Painted concrete block, running bond: four blocks wide, eight courses (1.6 m square).
function blockTexture(random: () => number) {
  const t = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#77736c';
    g.fillRect(0, 0, 512, 512);
    const bw = 128;
    const bh = 64;
    for (let row = 0; row < 8; row++)
      for (let col = -1; col < 5; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const v = 180 + Math.round(random() * 14);
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        g.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
      }
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + random() * 0.05})`;
      g.fillRect(random() * 512, random() * 512, 1.5, 1.5);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Pegboard with a few tools hung on it, drawn flat.
function pegboardTexture() {
  return canvasTexture(512, 224, (g) => {
    g.fillStyle = '#6e5b45';
    g.fillRect(0, 0, 512, 224);
    g.fillStyle = '#2e2419';
    for (let y = 8; y < 224; y += 16) for (let x = 8; x < 512; x += 16) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    g.fillStyle = '#26282b';
    g.strokeStyle = '#26282b';
    g.lineCap = 'round';
    // Wrenches, a hammer, pliers, two screwdrivers, a coil of cable.
    for (const [x, len] of [[40, 110], [62, 96], [84, 82]] as const) {
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x, 30);
      g.lineTo(x, 30 + len);
      g.stroke();
      g.beginPath();
      g.arc(x, 30, 9, 0, TAU);
      g.fill();
    }
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(140, 40);
    g.lineTo(140, 170);
    g.stroke();
    g.fillRect(118, 26, 44, 20);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(200, 40);
    g.lineTo(190, 150);
    g.moveTo(210, 40);
    g.lineTo(222, 150);
    g.stroke();
    g.fillStyle = '#7a3b2c';
    g.fillRect(258, 36, 12, 64);
    g.fillRect(290, 36, 12, 64);
    g.fillStyle = '#9ea2a6';
    g.fillRect(262, 100, 4, 70);
    g.fillRect(294, 100, 4, 56);
    g.strokeStyle = '#1d1e20';
    g.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(400, 100, 44 - i * 4, 52 - i * 4, 0, 0, TAU);
      g.stroke();
    }
  });
}

// Yellow and black floor tape.
function tapeTexture() {
  const t = canvasTexture(64, 16, (g) => {
    g.fillStyle = '#c99a2e';
    g.fillRect(0, 0, 64, 16);
    g.fillStyle = '#1a1917';
    for (let x = -16; x < 64; x += 32) {
      g.beginPath();
      g.moveTo(x, 16);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 16);
      g.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Night through the window: dark blue, lighter toward the moon above right.
function nightTexture() {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(118, 4, 4, 118, 4, 150);
    grad.addColorStop(0, '#5d7294');
    grad.addColorStop(0.5, '#1f2a3d');
    grad.addColorStop(1, '#0d121b');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

// The monitor's picture before the terminal is laid over it: the terminal as it waits to start, charcoal
// with its cursor at the first line (src/components/Terminal.astro, src/styles/terminal.css), laid out as
// it is at a 1209 px screen (reading, in a 1440 x 900 window). The terminal itself fades in over it in
// flight.
function terminalTexture() {
  const W = 1280;
  const H = 800;
  const S = W / 1209; // texture px per CSS px
  // terminal.css at a 1209 px screen: type 1.4cqi, padding 3cqi across and 2.6cqi down; the block cursor
  // 1ch x 1.3em, its top 0.16em into the first line (measured in the page).
  const em = 1209 * 0.014;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#171513';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ebe5da';
    g.fillRect(Math.round(1209 * 0.03 * S), Math.round((1209 * 0.026 + 0.16 * em) * S), Math.round(0.6 * em * S), Math.round(1.3 * em * S));
  });
}

// Bakes a group's meshes into one per material: the room and props are still, so they cost a draw
// call per material rather than per part. Meshes marked `userData.live` are left as they are.
function bake(group: THREE.Group, receive = true) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const parts: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.live || Array.isArray(o.material)) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    const list = byMat.get(o.material) ?? [];
    list.push(geo);
    byMat.set(o.material, list);
    parts.push(o);
  });
  for (const o of parts) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    geos.forEach((g) => g.dispose());
    mesh.receiveShadow = receive;
    group.add(mesh);
  }
  return group;
}

type Adder = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D) => THREE.Mesh;
const adder =
  (group: THREE.Object3D): Adder =>
  (geo, mat, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
const boxGeo = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
// A cylinder from a to b.
function strut(add: Adder, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, parent?: THREE.Object3D) {
  const m = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent);
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return m;
}

// --- Materials shared by the room and props ------------------------------------------------------
function materials() {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.7 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.5, metalness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.72 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x2f2822, roughness: 0.68 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.5, metalness: 0.2 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x2b2926, roughness: 0.95 }),
    toolRed: new THREE.MeshStandardMaterial({ color: 0x7a2f22, roughness: 0.5, metalness: 0.3 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffe2b8, toneMapped: false }),
  };
}
type Mats = ReturnType<typeof materials>;

// --- The room ------------------------------------------------------------------------------------
// Back wall at z = -3.1; the dance floor, taped out, in the middle; the window high over it, right of
// centre; the workbench under a pendant at the right, the service stand in front of the bench's end. The
// wall's left half is left bare: the name is over it.
const WALL_Z = -3.1;
export const STAND = { x: 1.75, z: -2.0, yaw: -0.15 };

function buildRoom(random: () => number, mats: Mats) {
  const group = new THREE.Group();
  const add = adder(group);
  const textures: THREE.Texture[] = [];

  const concrete = concreteTexture(random);
  concrete.repeat.set(8, 7);
  textures.push(concrete);
  const floor = add(new THREE.PlaneGeometry(16, 14), new THREE.MeshLambertMaterial({ color: 0x6d6760, map: concrete }), 0, 0, 3.9);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.live = true;

  // The dance area, taped out: one mesh, the tape's stripes along each run.
  const tape = tapeTexture();
  textures.push(tape);
  const [x0, x1, z0, z1, tw] = [-2.15, 2.2, -1.45, 1.25, 0.05];
  const runs: THREE.BufferGeometry[] = [];
  for (const [cx, cz, len, along] of [[(x0 + x1) / 2, z0, x1 - x0, 'x'], [(x0 + x1) / 2, z1, x1 - x0, 'x'], [x0, (z0 + z1) / 2, z1 - z0, 'z'], [x1, (z0 + z1) / 2, z1 - z0, 'z']] as const) {
    const g = new THREE.PlaneGeometry(len, tw);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 0.2));
    g.rotateX(-Math.PI / 2);
    if (along === 'z') g.rotateY(Math.PI / 2);
    g.translate(cx, 0.003, cz);
    runs.push(g);
  }
  const tapeMesh = add(mergeGeometries(runs), new THREE.MeshLambertMaterial({ map: tape, color: 0x9a9080 }), 0, 0, 0);
  tapeMesh.receiveShadow = true;
  tapeMesh.userData.live = true;
  runs.forEach((g) => g.dispose());

  // Wall: painted block, a darker band to 1.2 m.
  const block = blockTexture(random);
  textures.push(block);
  const upper = block.clone();
  upper.repeat.set(10, 2.4);
  upper.offset.y = 0.75;
  block.repeat.set(10, 0.75);
  textures.push(upper);
  const low = add(new THREE.PlaneGeometry(16, 1.2), new THREE.MeshLambertMaterial({ color: 0x3b3a36, map: block }), 0, 0.6, WALL_Z);
  const high = add(new THREE.PlaneGeometry(16, 3.8), new THREE.MeshLambertMaterial({ color: 0x5a5650, map: upper }), 0, 3.1, WALL_Z);
  low.userData.live = high.userData.live = true;
  low.receiveShadow = high.receiveShadow = true;
  // Base and dado trim.
  add(boxGeo(16, 0.1, 0.03), mats.darkSteel, 0, 0.05, WALL_Z + 0.015);
  add(boxGeo(16, 0.04, 0.03), mats.darkSteel, 0, 1.2, WALL_Z + 0.015);

  // The high window: a steel frame of six panes, night beyond.
  const W = { x: 0.75, y: 2.95, w: 2.1, h: 1.15 };
  const night = nightTexture();
  textures.push(night);
  const glass = add(new THREE.PlaneGeometry(W.w, W.h), new THREE.MeshBasicMaterial({ map: night, color: 0x8a96aa }), W.x, W.y, WALL_Z + 0.005);
  glass.userData.live = true;
  for (const dx of [-1, -1 / 3, 1 / 3, 1]) add(boxGeo(0.05, W.h + 0.05, 0.06), mats.darkSteel, W.x + (dx * W.w) / 2, W.y, WALL_Z + 0.03);
  for (const dy of [-1, 0, 1]) add(boxGeo(W.w + 0.05, 0.05, 0.06), mats.darkSteel, W.x, W.y + (dy * W.h) / 2, WALL_Z + 0.03);
  add(boxGeo(W.w + 0.2, 0.05, 0.16), mats.steel, W.x, W.y - W.h / 2 - 0.05, WALL_Z + 0.08);

  // Workbench: a butcher-block top on a steel frame, a shelf under it, pegboard over it.
  const B = { x: 2.55, z: WALL_Z + 0.4, w: 2.0, d: 0.66, y: 0.92 };
  add(boxGeo(B.w, 0.05, B.d), mats.wood, B.x, B.y - 0.025, B.z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(boxGeo(0.05, B.y - 0.05, 0.05), mats.steel, B.x + sx * (B.w / 2 - 0.05), (B.y - 0.05) / 2, B.z + sz * (B.d / 2 - 0.05));
  }
  add(boxGeo(B.w - 0.1, 0.03, B.d - 0.08), mats.darkWood, B.x, 0.2, B.z);
  add(boxGeo(B.w - 0.1, 0.05, 0.03), mats.steel, B.x, B.y - 0.08, B.z + B.d / 2 - 0.04);
  const peg = pegboardTexture();
  textures.push(peg);
  add(new THREE.PlaneGeometry(1.8, 0.79), new THREE.MeshLambertMaterial({ map: peg }), B.x, 1.72, WALL_Z + 0.02);
  // On the bench: a vise, a parts cabinet, a spare head waiting for its robot.
  add(boxGeo(0.12, 0.1, 0.2), mats.steel, B.x + 0.7, B.y + 0.05, B.z + 0.18);
  add(boxGeo(0.2, 0.08, 0.06), mats.steel, B.x + 0.7, B.y + 0.14, B.z + 0.2);
  add(boxGeo(0.46, 0.34, 0.26), mats.darkSteel, B.x - 0.62, B.y + 0.17, B.z - 0.12);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) add(boxGeo(0.12, 0.055, 0.01), mats.steel, B.x - 0.77 + c * 0.15, B.y + 0.06 + r * 0.075, B.z + 0.012);
  add(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshStandardMaterial({ color: 0x86837d, roughness: 0.9 }), B.x + 0.1, B.y + 0.15, B.z + 0.05);
  add(new THREE.TorusGeometry(0.1, 0.018, 8, 24), mats.rubber, B.x + 0.42, B.y + 0.018, B.z - 0.08).rotation.x = Math.PI / 2;

  // The pendant over the bench, its cord up into the dark.
  const P = new THREE.Vector3(B.x, 2.3, B.z + 0.05);
  add(new THREE.CylinderGeometry(0.006, 0.006, 3, 6), mats.rubber, P.x, P.y + 1.6, P.z);
  add(new THREE.ConeGeometry(0.2, 0.18, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f3a33, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }), P.x, P.y, P.z);
  add(new THREE.SphereGeometry(0.05, 14, 10), mats.bulb, P.x, P.y - 0.08, P.z);
  const pendant = new THREE.PointLight(0xffb573, 4.2, 5.5, 2);
  pendant.position.set(P.x, P.y - 0.12, P.z);

  bake(group);
  group.add(pendant);
  return { group, textures, pendant };
}

// The service stand: a plate on casters, a mast, and an arm that holds the unfinished robot at the chest.
function buildStand(mats: Mats, robot: Robot) {
  const group = new THREE.Group();
  group.position.set(STAND.x, 0, STAND.z);
  group.rotation.y = STAND.yaw;
  const add = adder(group);
  add(boxGeo(0.8, 0.06, 0.8), mats.darkSteel, 0, 0.09, 0);
  add(boxGeo(0.84, 0.02, 0.84), new THREE.MeshStandardMaterial({ color: 0xa8842e, roughness: 0.7 }), 0, 0.125, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), mats.rubber, sx * 0.34, 0.035, sz * 0.34).rotation.z = Math.PI / 2;
  add(boxGeo(0.07, 1.9, 0.07), mats.steel, 0, 1.08, -0.34);
  add(boxGeo(0.07, 0.07, 0.3), mats.steel, 0, 1.22, -0.2);
  add(boxGeo(0.36, 0.05, 0.05), mats.steel, 0, 1.22, -0.06);
  add(boxGeo(0.12, 0.12, 0.04), mats.darkSteel, 0, 1.62, -0.3);
  // A cable from the mast into the robot's back.
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.62, -0.3), new THREE.Vector3(0.12, 1.3, -0.24), new THREE.Vector3(0.08, 1.05, -0.14)]);
  add(new THREE.TubeGeometry(curve, 16, 0.01, 6), mats.rubber, 0, 0, 0);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
  });
  bake(group);
  group.children.forEach((o) => (o.castShadow = true));
  robot.root.position.set(0, 0.135, 0);
  robot.root.rotation.y = 0;
  group.add(robot.root);
  return group;
}

// Foreground: the desk's chair rolled back and aside, and a tool cart at the right.
function buildProps(mats: Mats) {
  const chair = new THREE.Group();
  const add = adder(chair);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const leg = add(boxGeo(0.04, 0.03, 0.3), mats.darkSteel, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15);
    leg.rotation.y = a;
    add(new THREE.SphereGeometry(0.025, 10, 8), mats.rubber, Math.sin(a) * 0.3, 0.025, Math.cos(a) * 0.3);
  }
  add(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 12), mats.steel, 0, 0.26, 0);
  add(rbox(0.48, 0.08, 0.46, 0.03), mats.fabric, 0, 0.47, 0);
  add(boxGeo(0.05, 0.36, 0.04), mats.darkSteel, 0, 0.62, -0.22);
  const back = add(rbox(0.44, 0.44, 0.06, 0.03), mats.fabric, 0, 0.9, -0.25);
  back.rotation.x = -0.12;
  for (const s of [-1, 1]) add(boxGeo(0.04, 0.03, 0.26), mats.plastic, s * 0.25, 0.66, -0.02);

  const cart = new THREE.Group();
  const cadd = adder(cart);
  const cartMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.55 });
  for (const y of [0.18, 0.5, 0.82]) {
    cadd(boxGeo(0.76, 0.02, 0.46), cartMat, 0, y, 0);
    cadd(boxGeo(0.76, 0.05, 0.015), cartMat, 0, y + 0.03, 0.23);
    cadd(boxGeo(0.76, 0.05, 0.015), cartMat, 0, y + 0.03, -0.23);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cadd(new THREE.CylinderGeometry(0.014, 0.014, 0.8, 8), mats.steel, sx * 0.37, 0.48, sz * 0.22);
    cadd(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), mats.rubber, sx * 0.34, 0.04, sz * 0.2).rotation.x = Math.PI / 2;
  }
  cadd(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8), mats.steel, 0.42, 0.96, 0).rotation.x = Math.PI / 2;
  // On it: a toolbox, a multimeter, a coil of cable, a spare forearm.
  cadd(rbox(0.4, 0.18, 0.22, 0.015), mats.toolRed, -0.12, 0.92, 0);
  cadd(boxGeo(0.26, 0.02, 0.03), mats.darkSteel, -0.12, 1.03, 0);
  cadd(rbox(0.1, 0.035, 0.17, 0.01), new THREE.MeshStandardMaterial({ color: 0xa8842e, roughness: 0.6 }), 0.24, 0.85, 0.05);
  cadd(new THREE.TorusGeometry(0.1, 0.02, 8, 24), mats.rubber, 0.05, 0.53, 0).rotation.x = Math.PI / 2;
  const arm = cadd(new THREE.CapsuleGeometry(0.035, 0.24, 4, 12), new THREE.MeshStandardMaterial({ color: 0xdcd5c6, roughness: 0.58 }), -0.15, 0.55, 0.02);
  arm.rotation.z = Math.PI / 2;

  // The work light on its tripod, left of the floor: the room's key.
  const tripod = new THREE.Group();
  const tadd = adder(tripod);
  const top = new THREE.Vector3(0, 1.25, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    strut(tadd, mats.darkSteel, new THREE.Vector3(Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42), top, 0.012);
  }
  tadd(new THREE.CylinderGeometry(0.016, 0.016, 0.95, 10), mats.steel, 0, 1.7, 0);
  const head = new THREE.Group();
  head.position.set(0, 2.2, 0);
  tripod.add(head);
  tadd(boxGeo(0.34, 0.24, 0.08), mats.darkSteel, 0, 0, 0, head);
  const face = tadd(new THREE.PlaneGeometry(0.28, 0.18), mats.bulb, 0, 0, 0.041, head);
  face.userData.live = true;
  tadd(boxGeo(0.38, 0.02, 0.02), mats.darkSteel, 0, -0.16, 0, head);

  return { chair: bake(chair), cart: bake(cart), tripod, head };
}

// --- Workstation ---------------------------------------------------------------------------------
// The desk at the front, a little left of centre and turned toward the room: whoever sits there looks
// past the monitor to the dancers. Life size (the robots stand 1.4 to 1.8 m). The monitor is the way
// into the portfolio, and the opening's centre.
export const DESK = { x: 0.1, z: 3.5, yaw: 0.22 };
/** The monitor's screen (16:10), and the height of its centre, about seated eye level. */
export const SCREEN = { w: 0.68, h: 0.425, y: 1.12 };
const SCREEN_Z = -0.1475;
// The screen's white is a little over the page's own white, and it lights the desk. Its page is mostly
// dark, so on the whole it reads dimmer than the floor under the work light: the bezel's glow and the
// brightening under the pointer are what mark it out.
const SCREEN_LIT = 1.08;
const GLOW = 0.5;
/** Where the chair stands, in the desk's frame (metres; x to the desk's right), and its turn. */
const CHAIR = { x: -1.0, z: 0.25, yaw: 1.9 };

function buildWorkstation(mats: Mats, screenMap: THREE.Texture) {
  const group = new THREE.Group();
  group.position.set(DESK.x, 0, DESK.z);
  group.rotation.y = DESK.yaw;
  const keys = new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.62, metalness: 0.1 });
  const screenMat = new THREE.MeshBasicMaterial({ map: screenMap, toneMapped: false });
  const add = adder(group);

  // Desk: 1.4 x 0.7 m, top at 0.74 m.
  add(boxGeo(1.4, 0.035, 0.7), mats.darkWood, 0, 0.7225, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(boxGeo(0.04, 0.705, 0.04), mats.steel, sx * 0.66, 0.3525, sz * 0.31);
    add(boxGeo(0.03, 0.03, 0.62), mats.steel, sx * 0.66, 0.1, 0);
  }
  add(boxGeo(1.32, 0.06, 0.02), mats.steel, 0, 0.675, -0.31);

  const monitor = new THREE.Group();
  group.add(monitor);
  const madd = adder(monitor);
  madd(new RoundedBoxGeometry(SCREEN.w + 0.036, SCREEN.h + 0.036, 0.024, 2, 0.006), mats.plastic, 0, SCREEN.y, SCREEN_Z - 0.0125);
  const screen = madd(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat, 0, SCREEN.y, SCREEN_Z);
  screen.userData.live = true;
  madd(boxGeo(0.36, 0.26, 0.05), mats.plastic, 0, SCREEN.y - 0.02, SCREEN_Z - 0.05);
  madd(boxGeo(0.05, 0.3, 0.022), mats.plastic, 0, 0.89, SCREEN_Z - 0.07);
  madd(new RoundedBoxGeometry(0.26, 0.012, 0.18, 2, 0.004), mats.plastic, 0, 0.746, SCREEN_Z - 0.04);

  add(new RoundedBoxGeometry(0.42, 0.016, 0.135, 2, 0.004), keys, -0.02, 0.748, 0.14);
  add(new RoundedBoxGeometry(0.06, 0.022, 0.1, 2, 0.01), keys, 0.3, 0.751, 0.15);
  // A mug and a notebook, right of the keyboard.
  add(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.4 }), 0.52, 0.79, -0.06);
  add(boxGeo(0.21, 0.014, 0.28), new THREE.MeshStandardMaterial({ color: 0x3d4a3f, roughness: 0.85 }), 0.46, 0.747, 0.16).rotation.y = -0.2;

  // Desk lamp at the left end, set back.
  const base = new THREE.Vector3(-0.58, 0.762, -0.2);
  const elbow = new THREE.Vector3(-0.6, 1.16, -0.28);
  const head = new THREE.Vector3(-0.52, 1.12, 0.02);
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.022, 24), mats.steel, base.x, 0.751, base.z);
  strut(add, mats.steel, base, elbow, 0.009);
  strut(add, mats.steel, elbow, head, 0.008);
  add(new THREE.SphereGeometry(0.016, 12, 8), mats.steel, elbow.x, elbow.y, elbow.z);
  add(new THREE.ConeGeometry(0.07, 0.11, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2c2a27, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide }), head.x, head.y - 0.05, head.z);
  add(new THREE.SphereGeometry(0.026, 16, 10), mats.bulb, head.x, head.y - 0.085, head.z);

  bake(group);
  // Baking leaves the monitor's group empty but for the screen; the pointer picks the screen and bezel.
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w + 0.036, SCREEN.h + 0.036), new THREE.MeshBasicMaterial({ visible: false }));
  bezel.position.set(0, SCREEN.y, SCREEN_Z - 0.001);
  monitor.add(bezel);
  // A faint warm veil over the screen, added for the hover and the idle hint (scene light()).
  const lift = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN.w, SCREEN.h),
    new THREE.MeshBasicMaterial({ color: 0xfff1dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  lift.position.set(0, SCREEN.y, SCREEN_Z + 0.0015);
  lift.visible = false;
  monitor.add(lift);

  const lamp = new THREE.SpotLight(0xffc68c, 3.2, 2.6, 0.95, 0.7, 2);
  lamp.position.set(head.x, head.y - 0.09, head.z);
  lamp.target.position.set(-0.1, 0.74, 0.12);
  group.add(lamp, lamp.target);
  // The screen's light on the keys and the desk's front edge: warm neutral, like the page on it.
  const glow = new THREE.PointLight(0xf2e7d6, GLOW, 1.6, 2);
  glow.position.set(0, SCREEN.y - 0.06, SCREEN_Z + 0.28);
  group.add(glow);

  return { group, monitor, screen, screenMat, glow, lift };
}

export type Quad = [x: number, y: number][];
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Mode = 'hero' | 'read';

export interface LabScene {
  /** Move the camera to a view, the screen's corners (viewport px) passed to `onFrame` as it goes.
   * `rect` is where the screen lands in the reading view (viewport px). `instant` cuts. */
  go(to: Mode, rect: Rect, onFrame: (quad: Quad, p: number) => void, instant?: boolean): Promise<void>;
  /** The reading view's rect moved (a resize): re-aim, and return the screen's corners. */
  setRect(rect: Rect): Quad;
  /** The screen's corners now (viewport px). */
  quad(): Quad;
  /** Back to the opening's view at once (the lab closed without a flight). */
  home(): void;
  /** Robots ease to standing still and drawing stops (reading), or they carry on. */
  quiet(on: boolean): void;
  readonly screenAspect: number;
  /** Whether a point (client px) is over the monitor, from the opening. */
  pick(x: number, y: number): boolean;
  /** Whether the last press on the room turned into a drag (a look around), rather than a click. */
  dragged(): boolean;
  /** Brighten the monitor as the pointer over it does (its link, focused from the keyboard). */
  highlight(on: boolean): void;
  /** The monitor's bezel as drawn now, in the opening (client px). */
  monitor(): Rect;
  /** What the last frame drew, for measurements. */
  stats(): Record<string, number>;
  dispose(): void;
}

interface View {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  f: number;
  cx: number;
  cy: number;
}
const newView = (): View => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), f: 1, cx: 0, cy: 0 });
const copyView = (a: View, b: View) => {
  a.pos.copy(b.pos);
  a.look.copy(b.look);
  a.f = b.f;
  a.cx = b.cx;
  a.cy = b.cy;
};
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

// One lens per view, never widened to fit a window: the opening dollies back instead (or, in a tall
// window, comes in on the monitor and lets the room crop), and a window too small to read on the monitor
// reads across the window instead (computer.ts).
const HERO_FOV = 34;
const READ_FOV = 40;
const tanHalf = (fov: number) => Math.tan(THREE.MathUtils.degToRad(fov / 2));
const PIXEL_RATIO = 1.25;
const FLIGHT: Record<string, number> = { 'hero>read': 1900, 'read>hero': 1500 };
// Looking around the opening (mouse or pen, in windows the lab opens in, with motion on): where the
// pointer is turns the camera a little about the room's centre, and a drag turns it further, never past
// LOOK (radians; `up` raises the camera). Let go, and it settles back to the composed view. Turning to
// positive az swings the monitor toward the left edge, so that side stops sooner where the window needs
// it to (reachAz in mountLab).
const PARALLAX = { az: 0.03, el: 0.015 };
const LOOK = { az: 0.16, down: 0.05, up: 0.07 };
const DRAG_PX = 6; // a press that moves further than this is a drag, not a click
// The monitor brightens once, gently, if nobody has touched anything for a while.
const IDLE_MS = 5000;
const HINT_MS = 2200;

// The opening: from the front and a little right, looking into the room, the desk nearest at the left.
const HERO_LOOK = new THREE.Vector3(-0.6, 1.0, -0.5);
const HERO_DIR = new THREE.Vector3(0.2, 0.14, 1).normalize();
/** `avoid` is the opening's text, where it lies over the picture: the dancers and the monitor keep clear
 *  of it. `onFit` hears where the monitor's bezel is drawn (client px) each time the opening is fitted to
 *  its window, for the link over it (LabStage.astro) to stand there. */
export function mountLab(
  root: HTMLElement,
  { avoid = null as HTMLElement | null, onFit = null as ((monitor: Rect) => void) | null } = {},
): LabScene | null {
  const stage = root.querySelector<HTMLElement>('[data-lab-stage]');
  if (!stage || root.dataset.mounted != null) return null;

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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.append(canvas);
  const random = rng(20260927);

  const scene = new THREE.Scene();
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
  scene.fog = new THREE.Fog(0x0b0a09, 11, 24);

  const camera = new THREE.PerspectiveCamera(HERO_FOV, 1, 0.08, 60);
  const mats = materials();

  // Six lights: the work light (warm key, the one shadow), the moon through the window (the one cool
  // accent, a rim on the robots from behind), the pendant, the desk lamp, the screen's glow, and a low
  // fill so nothing falls to pure black.
  const props = buildProps(mats);
  props.tripod.position.set(-4.6, 0, 3.0); // out of every view: its light, not its lamp, is in the picture
  props.tripod.lookAt(0.2, 0, -0.3);
  props.head.lookAt(new THREE.Vector3(0.2, 0.6, -0.4));
  scene.add(props.tripod);
  scene.updateMatrixWorld();
  const key = new THREE.SpotLight(0xffc38a, 95, 0, 0.62, 0.55, 2);
  props.head.getWorldPosition(key.position);
  key.target.position.set(0.2, 0.5, -0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 10;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  const moon = new THREE.SpotLight(0x9db3d9, 70, 16, 0.42, 0.85, 2);
  moon.position.set(1.4, 4.4, -4.8);
  moon.target.position.set(0.1, 0, 0.2);
  scene.add(key, key.target, moon, moon.target, new THREE.HemisphereLight(0x3a342d, 0x0c0b0a, 0.5));

  const room = buildRoom(random, mats);
  scene.add(room.group);
  const blobTex = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.45, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  const robots = BUILDS.map((b) => new Robot(b, blobTex, random));
  for (const r of robots) scene.add(r.root);
  const proto = new Robot(PROTO, blobTex, random);
  scene.add(buildStand(mats, proto));

  // The chair pushed aside past the desk's left end, out of the way of the monitor, turned half away.
  const [cx, cz] = [CHAIR.x, CHAIR.z];
  props.chair.position.set(DESK.x + cx * Math.cos(DESK.yaw) + cz * Math.sin(DESK.yaw), 0, DESK.z - cx * Math.sin(DESK.yaw) + cz * Math.cos(DESK.yaw));
  props.chair.rotation.y = DESK.yaw + CHAIR.yaw;
  props.cart.position.set(2.3, 0, 2.1);
  props.cart.rotation.y = -0.5;
  scene.add(props.chair, props.cart);

  const screenMap = terminalTexture();
  const desk = buildWorkstation(mats, screenMap);
  scene.add(desk.group);
  scene.updateMatrixWorld(true);
  const screenCorners = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ].map(([sx, sy]) => desk.group.localToWorld(new THREE.Vector3((sx * SCREEN.w) / 2, SCREEN.y + (sy * SCREEN.h) / 2, SCREEN_Z)));
  const screenCentre = desk.group.localToWorld(new THREE.Vector3(0, SCREEN.y, SCREEN_Z));
  const screenNormal = new THREE.Vector3(Math.sin(DESK.yaw), 0, Math.cos(DESK.yaw));
  // The monitor's bezel: what the pointer picks, what the look keeps in the picture, where the link over
  // it stands.
  const bezelCorners = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ].map(([sx, sy]) => desk.group.localToWorld(new THREE.Vector3(sx * (SCREEN.w / 2 + 0.018), SCREEN.y + sy * (SCREEN.h / 2 + 0.018), SCREEN_Z)));

  // What the opening keeps in the picture: the monitor and keyboard, the dancers at the top of a reach,
  // the unfinished robot on its stand. The foreground props and the room's edges may crop.
  const fitPoints = [
    // The monitor and the keyboard's front edge (the desk's ends may crop).
    ...[[-0.45, 0.75, 0.3], [0.45, 0.75, 0.3], [-0.38, 1.36, -0.15], [0.38, 1.36, -0.15]].map(([x, y, z]) => desk.group.localToWorld(new THREE.Vector3(x, y, z))),
    ...robots.flatMap((r) => [new THREE.Vector3(r.root.position.x - 0.55, 2.0, r.root.position.z), new THREE.Vector3(r.root.position.x + 0.55, 0, r.root.position.z)]),
    new THREE.Vector3(STAND.x - 0.35, 2.05, STAND.z),
    new THREE.Vector3(STAND.x + 0.4, 0, STAND.z),
  ];
  // What keeps clear of the opening's text: the top-left of each dancer's head and of the monitor, and
  // (reachPoints) the dancers' elbows and hands wherever the routine takes them, sampled over one loop.
  const clearPoints = [...robots.map((r) => new THREE.Vector3(r.root.position.x - 0.6, 2.05, r.root.position.z)), desk.group.localToWorld(new THREE.Vector3(-0.4, 1.4, -0.15))];
  const reachPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const beat = (i / 64) * BEATS;
    for (const r of robots) {
      r.update(beat, (beat * 60) / BPM);
      reachPoints.push(...r.reach());
    }
  }

  // Dust in the work light's beam.
  const DUST = 120;
  const dustSeed = Float32Array.from({ length: DUST * 4 }, () => random());
  const dustPos = new Float32Array(DUST * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dotTex = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [1, 'rgba(255,255,255,0)'],
  ], 32);
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xffd9ae, map: dotTex, size: 0.028, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scene.add(dust);
  const moveDust = (t: number) => {
    for (let i = 0; i < DUST; i++) {
      const [a, b, c, d] = [dustSeed[i * 4], dustSeed[i * 4 + 1], dustSeed[i * 4 + 2], dustSeed[i * 4 + 3]];
      dustPos[i * 3] = (a - 0.5) * 5 - 0.6 + Math.sin(t * 0.21 + d * TAU) * 0.15;
      dustPos[i * 3 + 1] = ((b * 2.6 + t * (0.03 + d * 0.04)) % 2.6) + 0.1;
      dustPos[i * 3 + 2] = (c - 0.5) * 3 - 0.2 + Math.cos(t * 0.17 + a * TAU) * 0.1;
    }
    dustGeo.attributes.position.needsUpdate = true;
  };

  // --- Lifecycle ---------------------------------------------------------------------------------
  const html = document.documentElement;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOK = () => !mq.matches && html.dataset.motion !== 'off';
  let intent = motionOK();
  let inView = false;
  let raf = 0;
  let last = 0;
  let t = intent ? 0 : STILL_T;
  let w = 0;
  let h = 0;
  let fw = 1;
  let fh = 1;
  let rootX = 0;
  let rootY = 0;
  let ox = 0;
  let oy = 0;
  let heroDist = 10;
  let heroFramed = 10; // the distance before the text had its say
  const heroShift = new THREE.Vector2();
  let mode: Mode = 'hero';
  let readRect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let drawn = false;
  let lost = false;
  let quietOn = false;
  let rest = 0;
  let frames = 0;
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
  const probe = new THREE.PerspectiveCamera();
  const pv = new THREE.Vector3();
  const pose = newView();

  // The opening's distance: the nearest at which every fit point is inside the safe part of the frame
  // (below a band at the top, where the name is, and above the bottom edge) and, where the name lies over
  // the picture, the top-left of each dancer's head and of the monitor is right of it or below it, and
  // no elbow or hand comes within 16 px of a line of it (an arm may reach beside a shorter line).
  // For that the picture may slide right and down (an off-centre view, the same lens and angle), and
  // takes whichever slide keeps the room largest; failing that it shrinks, by no more than a quarter.
  function fitHero(box: DOMRect) {
    const f = fh / 2 / tanHalf(HERO_FOV);
    // The text's own extent (its lines are as wide as they are, not the box they're set in).
    const parts: DOMRect[] = [];
    if (avoid) {
      const range = document.createRange();
      const walk = document.createTreeWalker(avoid, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        range.selectNodeContents(walk.currentNode);
        parts.push(...range.getClientRects());
      }
      avoid.querySelectorAll('a, button').forEach((b) => parts.push(b.getBoundingClientRect()));
    }
    parts.splice(0, parts.length, ...parts.filter((r) => r.width > 0 && r.height > 0));
    const a = parts.length ? new DOMRect(Math.min(...parts.map((r) => r.left)), Math.min(...parts.map((r) => r.top)), 0, 0) : null;
    if (a) {
      a.width = Math.max(...parts.map((r) => r.right)) - a.x;
      a.height = Math.max(...parts.map((r) => r.bottom)) - a.y;
    }
    const text = a?.width && a.right > box.left && a.left < box.right && a.bottom > box.top && a.top < box.bottom ? { r: a.right - box.left + 16, b: a.bottom - box.top + 16 } : null;
    const lines = parts.map((r) => [r.left - box.left - 16, r.top - box.top - 16, r.right - box.left + 16, r.bottom - box.top + 16]);
    let sx = 0;
    let sy = 0;
    const at = (p: THREE.Vector3) => {
      pv.copy(p).applyMatrix4(probe.matrixWorldInverse);
      return pv.z > -0.1 ? null : [fw / 2 + sx + (f * pv.x) / -pv.z, fh / 2 + sy - (f * pv.y) / -pv.z];
    };
    const inside = (d: number, clear: boolean) => {
      probe.position.copy(HERO_DIR).multiplyScalar(d).add(HERO_LOOK);
      probe.lookAt(HERO_LOOK);
      probe.updateMatrixWorld();
      probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
      const framed = fitPoints.every((p) => {
        const q = at(p);
        return !!q && q[0] >= fw * 0.015 && q[0] <= fw * 0.985 && q[1] >= fh * 0.09 && q[1] <= fh * 0.95;
      });
      return framed && (!clear || !text || (clearPoints.every((p) => {
        const q = at(p);
        return !!q && (q[0] >= text.r || q[1] >= text.b);
      }) && reachPoints.every((p) => {
        const q = at(p);
        return !!q && !lines.some(([l, t, r, b]) => q[0] > l && q[0] < r && q[1] > t && q[1] < b);
      })));
    };
    const nearest = (clear: boolean) => {
      let lo = 5;
      let hi = 24;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (inside(mid, clear)) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    const framed = nearest(false);
    heroShift.set(0, 0);
    heroDist = heroFramed = framed;
    // A tall window can't hold the whole room at a size worth seeing. There the monitor keeps a share of
    // the width (the more, the taller the window): the camera comes as close as that takes, the room
    // round it crops, and the picture slides to put the monitor in the middle, a little low.
    const share = Math.min(0.52, 0.12 + (1.3 - fw / fh) * 0.48);
    if (share > 0 && bezelAt(framed).w < share * fw) {
      let lo = 1;
      let hi = framed;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (bezelAt(mid).w > share * fw) lo = mid;
        else hi = mid;
      }
      heroDist = hi;
      const m = drawnBezel();
      heroShift.set(fw * 0.5 - (m.x + m.w / 2), fh * 0.54 - (m.y + m.h / 2));
      return;
    }
    if (!text) return;
    let best = Infinity;
    for (const y of [0, 0.025, 0.05]) {
      for (const x of [0, 0.025, 0.05, 0.075, 0.1]) {
        [sx, sy] = [x * fw, y * fh];
        const d = nearest(true);
        if (d < best - 1e-3) [best, heroShift.x, heroShift.y] = [d, sx, sy];
      }
    }
    heroDist = Math.min(best, framed * 1.25);
  }

  // The monitor's bezel from the opening's angle at distance `d`, unslid (stage px). Nearer than the
  // monitor itself, it is as wide as can be.
  function bezelAt(d: number): Rect {
    const f = fh / 2 / tanHalf(HERO_FOV);
    probe.position.copy(HERO_DIR).multiplyScalar(d).add(HERO_LOOK);
    probe.lookAt(HERO_LOOK);
    probe.updateMatrixWorld();
    probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of bezelCorners) {
      pv.copy(c).applyMatrix4(probe.matrixWorldInverse);
      if (pv.z > -0.1) return { x: -Infinity, y: -Infinity, w: Infinity, h: Infinity };
      xs.push(fw / 2 + (f * pv.x) / -pv.z);
      ys.push(fh / 2 - (f * pv.y) / -pv.z);
    }
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  function measureStage() {
    const r = (mode === 'hero' && !flight ? stage! : root).getBoundingClientRect();
    fw = r.width || 1;
    fh = r.height || 1;
    rootX = r.left;
    rootY = r.top;
    fitHero(r);
    onFit?.(monitorRect());
  }

  const across = new THREE.Vector3();
  const heroView = (v: View) => heroPose(v, look.az, look.el);
  function heroPose(v: View, lookAz: number, lookEl: number, at = t) {
    // A slow drift about the opening's angle, never a cut, and wherever the pointer has turned it.
    const az = Math.sin(at * 0.13) * 0.025 + lookAz;
    const d = heroDist + Math.sin(at * 0.07) * 0.12;
    v.pos.copy(HERO_DIR).applyAxisAngle(UP, az);
    v.pos.applyAxisAngle(across.crossVectors(v.pos, UP).normalize(), lookEl).multiplyScalar(d).add(HERO_LOOK);
    v.pos.y += Math.sin(at * 0.09 + 1.3) * 0.04;
    v.look.copy(HERO_LOOK);
    v.look.x += Math.sin(at * 0.11) * 0.04;
    v.f = fh / 2 / tanHalf(HERO_FOV);
    v.cx = fw / 2 + heroShift.x;
    v.cy = fh / 2 + heroShift.y;
  }
  // Square on to the monitor, near enough that its screen covers readRect.
  function readView(v: View) {
    v.f = h / 2 / tanHalf(READ_FOV);
    v.look.copy(screenCentre);
    v.pos.copy(screenNormal).multiplyScalar((SCREEN.w * v.f) / readRect.w).add(screenCentre);
    v.cx = readRect.x + readRect.w / 2 - rootX;
    v.cy = readRect.y + readRect.h / 2 - rootY;
  }
  const VIEWS: Record<Mode, (v: View) => void> = { hero: heroView, read: readView };

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
    for (const r of robots) r.update(beat, t, rest);
    proto.update(0, t);
    moveDust(t);
    dust.visible = mode !== 'read' || !!flight;
    let p = 1;
    if (flight) {
      p = flight.dur ? clamp01((now - flight.start) / flight.dur) : 1;
      const e = easeInOut(p);
      flight.to(next);
      cur.pos.lerpVectors(flight.from.pos, next.pos, e);
      cur.look.lerpVectors(flight.from.look, next.look, e);
      cur.f = flight.from.f * (next.f / flight.from.f) ** e;
      cur.cx = lerp(flight.from.cx, next.cx, e);
      cur.cy = lerp(flight.from.cy, next.cy, e);
    } else VIEWS[mode](cur);
    place(cur);
    renderer.render(scene, camera);
    frames++;
    if (!drawn) {
      drawn = true;
      idleFrom = now;
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

  // Reading holds still once the robots have come to rest (nothing else in view moves).
  const settled = () => quietOn && rest >= 1 && !flight;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (intent) t += dt;
    rest = quietOn ? Math.min(1, rest + dt / 0.9) : Math.max(0, rest - dt / 0.9);
    steer(dt);
    hint(now, dt);
    render(now);
    if (settled()) sync();
  }

  function sync() {
    const easing = rest > 0 && rest < 1;
    const go = ((intent && inView && !settled()) || !!flight || easing) && !document.hidden && !lost && w > 0;
    if (go && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!go && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    root.dataset.running = String(go && intent);
  }

  function resize(cw: number, ch: number) {
    if (!cw || !ch) return;
    measureStage();
    const hero = mode === 'hero' && !flight;
    ox = hero ? 0 : -rootX;
    oy = hero ? 0 : -rootY;
    const ratio = Math.min(devicePixelRatio || 1, PIXEL_RATIO);
    const sized = renderer.getPixelRatio() !== ratio || cw !== w || ch !== h;
    if (sized) {
      w = cw;
      h = ch;
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
    }
    // A resized buffer is blank until drawn. Otherwise a running loop draws the next frame: only aim the
    // camera now (quad() reads it), rather than drawing twice in one frame.
    if (!lost && (sized || !raf)) render();
    else if (!lost && !flight) {
      VIEWS[mode](cur);
      place(cur);
    }
    sync();
  }
  const settle = () => {
    const r = stage!.getBoundingClientRect();
    resize(Math.round(r.width), Math.round(r.height));
  };

  // The Motion switch (Settings) and the system setting: off holds one composed moment, and there
  // is no looking around. Turned off mid-dance, the room goes to that moment (the one it opens on with
  // motion off), not wherever the dance was: the look undone, the hint's light gone, drawn once.
  const onMotion = () => {
    intent = motionOK();
    if (!intent) {
      endHint();
      unlook();
      t = STILL_T;
      hintK = 0;
      light();
    }
    // The opening is fitted to the drift, or to the moment held (monitorRect()).
    if (w > 0) measureStage();
    if (!intent && drawn && !lost && !flight && w > 0) render();
    sync();
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    root.dataset.failed = '';
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
  mq.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  const motionObs = new MutationObserver(onMotion);
  motionObs.observe(html, { attributes: true, attributeFilter: ['data-motion'] });
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
  // The text reflows when its web font arrives: fit the opening again.
  const textRo = new ResizeObserver(() => w && settle());
  if (avoid) textRo.observe(avoid);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = false;
  let lit = false; // the monitor, hovered or its link focused

  // The screen's light: brighter under the pointer, and while the idle hint plays.
  let hintK = 0;
  function light() {
    const k = (hovered || lit ? 1 : 0) * 0.6 + hintK;
    desk.screenMat.color.setScalar(SCREEN_LIT * (1 + 0.14 * k));
    desk.lift.material.opacity = 0.05 * k;
    desk.lift.visible = k > 0.002;
    desk.glow.intensity = GLOW * (1 + 1.2 * k);
  }
  light();

  // --- The idle hint -------------------------------------------------------------------------------
  // Once: if nothing has moved the pointer, scrolled or pressed a key for IDLE_MS since the room first
  // drew, the monitor brightens and dims again over HINT_MS. Any press, a drag or going in ends it for
  // good. It needs motion (the frame loop only runs with it), and the whole screen inside the window:
  // until then it waits.
  let hintState: 'wait' | 'on' | 'off' = 'wait';
  let hintStart = 0;
  let idleFrom = performance.now();
  function endHint() {
    if (hintState === 'off') return;
    root.dataset.hint = hintState === 'on' ? 'stopped' : 'cancelled';
    hintState = 'off';
  }
  // Where the screen's corners fall in the window now (the stage may have scrolled since it was measured).
  function screenShown() {
    const r = stage!.getBoundingClientRect();
    const [vw, vh] = [html.clientWidth, html.clientHeight];
    return screenCorners.every((c) => {
      corner.copy(c).project(camera);
      const x = r.left + ((corner.x + 1) / 2) * w;
      const y = r.top + ((1 - corner.y) / 2) * h;
      return corner.z < 1 && x >= 0 && x <= vw && y >= 0 && y <= vh;
    });
  }
  function hint(now: number, dt: number) {
    if (hintState === 'wait' && drawn && inView && intent && mode === 'hero' && !flight && !html.dataset.pc && !press && now - idleFrom >= IDLE_MS && screenShown()) {
      hintState = 'on';
      hintStart = now;
      root.dataset.hint = 'on';
    }
    const was = hintK;
    if (hintState === 'on') {
      const p = (now - hintStart) / HINT_MS;
      hintK = p >= 1 ? 0 : Math.sin(Math.PI * p) ** 2;
      if (p >= 1) {
        hintState = 'off';
        root.dataset.hint = 'done';
      }
    } else hintK = hintK < 0.002 ? 0 : hintK * Math.exp(-dt * 8);
    if (hintK !== was) light();
  }
  const idle = () => {
    idleFrom = performance.now();
  };
  const idleEvents: [string, () => void][] = [
    ['pointermove', idle],
    ['wheel', idle],
    ['scroll', idle],
    ['pointerdown', endHint],
    ['keydown', endHint],
  ];
  for (const [type, fn] of idleEvents) addEventListener(type, fn, { capture: true, passive: true });

  // --- Looking around ------------------------------------------------------------------------------
  // `par` follows the pointer over the stage, `drag` a press moved past DRAG_PX (it eases back to nothing
  // once let go), and `look` eases toward their sum, softly held inside LOOK. Mouse and pen only: touch
  // scrolls the page as ever. Links and buttons keep their clicks; the keyboard and the wheel are left alone.
  const par = { az: 0, el: 0 };
  const drag = { az: 0, el: 0 };
  const look = { az: 0, el: 0 };
  let press: { id: number; x: number; y: number; az: number; el: number; moved: boolean } | null = null;
  // Where any mouse or pen press on the room began, look or no look: moved past DRAG_PX it's a drag,
  // and letting go over the monitor isn't a click on it (dragged()).
  let down: { id: number; x: number; y: number } | null = null;
  let wasDrag = false;
  const soft = (x: number, lo: number, hi: number) => (x >= 0 ? hi * Math.tanh(x / hi) : lo * Math.tanh(x / lo));
  const lookOK = () => intent && mode === 'hero' && !flight && !lost && !html.dataset.pc;
  const fine = (e: PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen';
  // Turning to positive az swings the monitor toward the frame's left edge, so that way the look stops
  // where the monitor's bezel would cross the fit's margin, with the drift where it is now: the limit
  // moves with the drift, slowly, and the monitor never leaves the picture. The other way keeps LOOK.az.
  const trial = newView();
  let lookAzMax = LOOK.az;
  function inFrame(az: number) {
    heroPose(trial, az, look.el);
    probe.position.copy(trial.pos);
    probe.lookAt(trial.look);
    probe.updateMatrixWorld();
    probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
    return bezelCorners.every((c) => {
      pv.copy(c).applyMatrix4(probe.matrixWorldInverse);
      return pv.z < -0.1 && trial.cx + (trial.f * pv.x) / -pv.z >= fw * 0.015;
    });
  }
  // The bezel in the opening as drawn now, with the drift and the look where they are (client px).
  function monitorRect(): Rect {
    const r = bezelIn(1, () => heroView(pose));
    return { x: r.x + rootX, y: r.y + rootY, w: r.w, h: r.h };
  }
  // Where the bezel is drawn in the opening without a look (stage px): while the room holds still, where
  // it is; while it doesn't, everywhere the drift takes it (its periods are all under 90 s).
  function drawnBezel() {
    return intent ? bezelIn(96, (i) => heroPose(pose, 0, 0, i * 4.7)) : bezelIn(1, () => heroPose(pose, 0, 0));
  }
  function bezelIn(samples: number, set: (i: number) => void): Rect {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < samples; i++) {
      set(i);
      probe.position.copy(pose.pos);
      probe.lookAt(pose.look);
      probe.updateMatrixWorld();
      probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
      for (const c of bezelCorners) {
        pv.copy(c).applyMatrix4(probe.matrixWorldInverse);
        const x = pose.cx + (pose.f * pv.x) / -pv.z;
        const y = pose.cy - (pose.f * pv.y) / -pv.z;
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function reachAz() {
    if (inFrame(LOOK.az)) return LOOK.az;
    let lo = 0;
    let hi = LOOK.az;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (inFrame(mid)) lo = mid;
      else hi = mid;
    }
    return Math.max(lo, 1e-3);
  }
  function steer(dt: number) {
    if (!press?.moved) {
      const k = Math.exp(-dt * 1.6);
      drag.az *= k;
      drag.el *= k;
    }
    if (lookOK()) lookAzMax = reachAz();
    const k = 1 - Math.exp(-dt * 6);
    look.az += (soft(par.az + drag.az, LOOK.az, lookAzMax) - look.az) * k;
    look.el += (soft(par.el + drag.el, LOOK.down, LOOK.up) - look.el) * k;
  }
  function unlook() {
    if (press && root.hasPointerCapture(press.id)) root.releasePointerCapture(press.id);
    press = null;
    par.az = par.el = drag.az = drag.el = look.az = look.el = 0;
    root.style.cursor = '';
  }
  function cursor(x: number, y: number) {
    root.style.cursor = press?.moved ? 'grabbing' : mode !== 'hero' || flight ? '' : pickAt(x, y) ? 'pointer' : lookOK() ? 'grab' : '';
  }
  const onDown = (e: PointerEvent) => {
    wasDrag = false;
    down = null;
    if (e.button !== 0 || !fine(e) || (e.target as Element).closest('a, button, input, select, textarea, label, [tabindex]')) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (!lookOK()) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, az: drag.az, el: drag.el, moved: false };
    e.preventDefault(); // no text selection while dragging; the click still comes
  };
  const onMove = (e: PointerEvent) => {
    if (!fine(e)) return;
    if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= DRAG_PX) wasDrag = true;
    if (press && e.pointerId === press.id) {
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (!press.moved && Math.hypot(dx, dy) >= DRAG_PX) {
        press.moved = wasDrag = true;
        endHint();
        root.setPointerCapture(e.pointerId);
      }
      if (press.moved) {
        // Grab the room: drag right and it turns right. Wound up no further than the limits.
        drag.az = Math.max(-2 * LOOK.az, Math.min(2 * lookAzMax, press.az - (dx / fw) * 0.9));
        drag.el = Math.max(-2 * LOOK.down, Math.min(2 * LOOK.up, press.el + (dy / fh) * 0.5));
      }
    } else if (lookOK()) {
      const r = stage!.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      par.az = -nx * PARALLAX.az;
      par.el = ny * PARALLAX.el;
    }
    cursor(e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    if (down && e.pointerId === down.id) down = null;
    if (!press || e.pointerId !== press.id) return;
    if (root.hasPointerCapture(press.id)) root.releasePointerCapture(press.id);
    press = null;
    cursor(e.clientX, e.clientY);
  };
  const onLeave = () => {
    par.az = par.el = 0;
    if (!press) pickAt(-1, -1);
    if (!press) root.style.cursor = '';
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('lostpointercapture', onUp);
  root.addEventListener('pointerleave', onLeave);

  function pickAt(x: number, y: number) {
    const r = canvas.getBoundingClientRect();
    let hit = false;
    if (mode === 'hero' && !flight && drawn && r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      hit = raycaster.intersectObject(desk.monitor, true).length > 0;
    }
    if (hit !== hovered) {
      hovered = hit;
      light();
      if (!raf && !lost && w) render();
    }
    return hit;
  }
  const textures = new Set<THREE.Texture>([blobTex, dotTex, screenMap, ...room.textures]);

  return {
    go(to, rect, onFrame, instant = false) {
      return new Promise<void>((resolve) => {
        if (lost) return resolve();
        readRect = rect;
        const from = newView();
        copyView(from, cur);
        const key = `${mode}>${to}`;
        mode = to;
        endHint();
        unlook();
        hovered = false;
        light();
        if (to !== 'hero') {
          // The stage fills the window from here on (computer.ts has set the page's state).
          ox = -rootX;
          oy = -rootY;
        }
        flight = { from, to: VIEWS[to], start: performance.now(), dur: instant ? 0 : (FLIGHT[key] ?? 1200), onFrame, done: resolve };
        settle();
      });
    },
    setRect(rect) {
      readRect = rect;
      if (!flight) settle();
      return quad();
    },
    quad,
    home() {
      mode = 'hero';
      unlook();
      quietOn = false;
      rest = 0;
      settle();
    },
    quiet(on) {
      quietOn = on;
      if (!intent || !motionOK()) {
        // Nothing is moving: go straight to the end state, one frame.
        rest = on ? 1 : 0;
        if (!lost && w) render();
      }
      sync();
    },
    screenAspect: SCREEN.w / SCREEN.h,
    pick: pickAt,
    dragged: () => wasDrag,
    monitor: monitorRect,
    highlight(on) {
      if (on === lit) return;
      lit = on;
      if (on) endHint();
      light();
      if (!raf && !lost && w && mode === 'hero' && !flight) render();
    },
    stats() {
      if (!lost && w) render();
      const info = renderer.info;
      let lights = 0;
      let casters = 0;
      scene.traverse((o) => {
        if (o instanceof THREE.Light && !(o as THREE.Light & { isAmbientLight?: boolean }).isAmbientLight) lights++;
        if (o instanceof THREE.Light && o.castShadow) casters++;
      });
      return {
        calls: info.render.calls,
        triangles: info.render.triangles,
        lines: info.render.lines,
        points: info.render.points,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        lights,
        shadowCasters: casters,
        bufferW: canvas.width,
        bufferH: canvas.height,
        pixelRatio: renderer.getPixelRatio(),
        frames,
        hint: hintK,
        heroDist,
        heroFramed,
        ...(({ x, y, w, h }) => ({ monX: x, monY: y, monW: w, monH: h }))(monitorRect()),
        lookAz: look.az,
        lookAzMax,
        lookEl: look.el,
      };
    },
    dispose() {
      cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      textRo.disconnect();
      motionObs.disconnect();
      mq.removeEventListener('change', onMotion);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('lostpointercapture', onUp);
      root.removeEventListener('pointerleave', onLeave);
      for (const [type, fn] of idleEvents) removeEventListener(type, fn, true);
      document.removeEventListener('visibilitychange', sync);
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) {
          for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
          m.dispose();
        }
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
