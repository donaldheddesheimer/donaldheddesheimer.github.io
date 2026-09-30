// The lab monitor's screensaver (scene.ts): a ginger cat in a red scarf flying through the stars, trailing
// a rainbow, in pixel art. It is drawn a step at a time on a small canvas (the scene shows it unsmoothed):
// four frames of the cat (legs paddling, tail and scarf flying), and the stars, the trail and a far planet
// scrolling past on a loop. `dissolve` (0 to 1) turns it, a pixel at a time in a fixed scatter, into the
// terminal's charcoal: the screen giving way to the terminal as the camera arrives.

export const SAVER_W = 128;
export const SAVER_H = 80; // the monitor's screen is 16:10
export const SAVER_FPS = 10;

const INK: Record<string, string> = {
  k: '#1c1426', // outline
  o: '#f39343', // ginger
  O: '#c8612c', // stripes
  w: '#fff3e2', // white
  p: '#ff8fae', // pink
  r: '#e8364f', // scarf
  R: '#a81f3a', // scarf, underside
};
const SKY = '#171a45';
const TERM = [23, 21, 19]; // the terminal's charcoal, #171513 (terminal.css)
const TRAIL = ['#ff5d61', '#ffa040', '#ffd84a', '#62d66e', '#46b9ff', '#9d70ff'];

// Face on, the ears up. (Each row 15 wide.)
const HEAD = [
  '.kk.........kk.',
  '.kpk.......kpk.',
  '.kppk.....kppk.',
  '.kooOkkkkkOook.',
  'kooooOoOoOooook',
  'koooooooooooook',
  'kookwoooookwook',
  'kookkoooookkook',
  'kpooowwpwwooopk',
  'koooowkwkwooook',
  '.koooowwwooook.',
  '..kkkkkkkkkkk..',
];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function screensaver() {
  const canvas = document.createElement('canvas');
  canvas.width = SAVER_W;
  canvas.height = SAVER_H;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const random = rng(7);
  // Far stars drift, near ones hurry; a few are sparkles that twinkle.
  const stars = Array.from({ length: 34 }, () => ({
    x: random() * (SAVER_W + 8),
    y: Math.floor(random() * SAVER_H),
    v: [1, 1, 2, 3][Math.floor(random() * 4)],
    big: random() < 0.3,
    at: Math.floor(random() * 6),
  }));
  // The order the pixels give way in.
  const scatter = Float32Array.from({ length: SAVER_W * SAVER_H }, () => random());

  const px = (x: number, y: number, c: string, w = 1, h = 1) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  const art = (rows: readonly string[], x: number, y: number) =>
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') px(x + i, y + j, INK[row[i]]);
    });

  function star(x: number, y: number, big: boolean, lit: boolean) {
    const c = lit ? '#fff8e8' : '#9aa6e6';
    if (!big) return px(x, y, c);
    px(x, y, '#fff8e8');
    const arm = lit ? 2 : 1;
    for (let d = 1; d <= arm; d++) {
      px(x - d, y, c);
      px(x + d, y, c);
      px(x, y - d, c);
      px(x, y + d, c);
    }
  }

  function planet(x: number, y: number) {
    g.fillStyle = '#6a5acd';
    g.fillRect(x + 2, y, 5, 9);
    g.fillRect(x, y + 2, 9, 5);
    g.fillRect(x + 1, y + 1, 7, 7);
    px(x + 2, y + 2, '#8c7ef0', 2, 2);
    px(x - 3, y + 4, '#f2c46d', 15, 1);
    px(x - 1, y + 5, '#c9974a', 11, 1);
  }

  function cat(x: number, y: number, f: number) {
    // The trail first, from the far edge to under the cat, a band a color, rolling.
    const tail = x + 4;
    for (let i = 0; i < tail; i++) {
      const wave = Math.round(Math.sin(((i + f * 3) / 24) * Math.PI * 2) * 1.6 * Math.min(1, (tail - i) / 12));
      TRAIL.forEach((c, b) => px(i, y + 2 + b * 2 + wave, c, 1, 2));
    }
    // The tail: out behind, waving.
    for (let i = 0; i < 8; i++) {
      const ty = y + 4 + Math.round(Math.sin(f * (Math.PI / 2) + i * 0.7) * (i / 5));
      px(x - i, ty - 1, INK.k);
      px(x - i, ty, i > 5 ? INK.O : INK.o, 1, 2);
      px(x - i, ty + 2, INK.k);
    }
    // Back legs, paddling.
    const kick = [0, 1, 2, 1][f];
    for (const [lx, ly] of [[x + 2 - kick, y + 11], [x + 6 + kick, y + 11]]) {
      px(lx, ly, INK.k, 4, 3);
      px(lx + 1, ly, INK.o, 2, 1);
      px(lx + 1, ly + 1, INK.w, 2, 1);
    }
    // The body: rounded, striped, a white belly.
    const bx = x + 1;
    const by = y + 3;
    const bw = 20;
    const bh = 9;
    px(bx + 1, by, INK.k, bw - 2, 1);
    px(bx + 1, by + bh - 1, INK.k, bw - 2, 1);
    px(bx, by + 1, INK.k, 1, bh - 2);
    px(bx + bw - 1, by + 1, INK.k, 1, bh - 2);
    px(bx + 1, by + 1, INK.o, bw - 2, bh - 2);
    for (let s = bx + 3; s < bx + bw - 4; s += 4) px(s, by + 1, INK.O, 1, 4);
    px(bx + 3, by + bh - 3, INK.w, bw - 8, 2);
    // Front paws, reaching ahead under the chin.
    const reach = [0, 1, 1, 0][f];
    for (const py of [y + 10, y + 12]) {
      px(x + 30 + reach, py, INK.k, 5, 2);
      px(x + 31 + reach, py, INK.w, 3, 1);
    }
    // The scarf: round the neck, the ends flying back over the shoulders.
    px(x + 18, y + 10, INK.r, 5, 2);
    px(x + 18, y + 11, INK.R, 5, 1);
    for (let i = 0; i < 9; i++) {
      const sy = y + 1 + Math.round(Math.sin(f * (Math.PI / 2) + i * 0.9) * 0.8 + i * 0.12);
      px(x + 17 - i, sy, i === 8 ? INK.R : INK.r, 1, 2);
      px(x + 17 - i, sy + 1, INK.R);
    }
    art(HEAD, x + 19, y);
  }

  /** Draws step `n` of the loop, `dissolve` of the way to the terminal. */
  function draw(n: number, dissolve = 0) {
    g.fillStyle = SKY;
    g.fillRect(0, 0, SAVER_W, SAVER_H);
    const loop = SAVER_W + 20;
    planet(Math.floor((((100 - n * 0.25) % loop) + loop) % loop) - 10, 9);
    for (const s of stars) {
      const x = Math.floor((((s.x - n * s.v) % (SAVER_W + 8)) + SAVER_W + 8) % (SAVER_W + 8)) - 4;
      star(x, s.y, s.big, (n + s.at) % 6 < 3);
    }
    const f = ((n % 4) + 4) % 4;
    cat(62, 32 + [0, -1, -1, 0][f], f);
    if (dissolve <= 0) return;
    const img = g.getImageData(0, 0, SAVER_W, SAVER_H);
    const d = img.data;
    for (let i = 0; i < scatter.length; i++) {
      if (scatter[i] >= dissolve) continue;
      d[i * 4] = TERM[0];
      d[i * 4 + 1] = TERM[1];
      d[i * 4 + 2] = TERM[2];
    }
    g.putImageData(img, 0, 0);
  }

  draw(0);
  return { canvas, draw };
}
