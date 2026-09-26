// Row packing for the timeline's project markers. Each marker is a ring at x with a label beside it;
// together they are w px wide. A label runs right, or left when running right would cover the NOW
// line; it covers NOW only when neither side can avoid it. Each marker takes the first row where an
// allowed side fits (its preferred side first), so the cluster just before NOW fills the space behind
// it. Pure and dependency-free: it runs at build time for the no-JS view and in the browser whenever
// the chart is resized.

export type Mark = { x: number; w: number };
export type Place = { row: number; left: boolean };
type Span = [number, number];

const GAP = 8; // clear space between two labels on a row
const R = 5; // the ring's radius: the ring is centred on x

export function packMarkers(marks: Mark[], track: number, now: number): Place[] {
  const rows: Span[][] = [];
  const free = (row: Span[], [a, b]: Span) => row.every(([c, d]) => b + GAP <= c || d + GAP <= a);
  return marks.map(({ x, w }) => {
    const right: Span = [x - R, x - R + w];
    const left: Span = [x + R - w, x + R];
    // The label is the part beside the ring; a ring on the NOW line is fine.
    const covers = (s: Span) => {
      const [a, b] = s === right ? [x + R, s[1]] : [s[0], x - R];
      return a < now && b + GAP > now;
    };
    const inTrack = ([a, b]: Span) => a >= 0 && b <= track;
    const order = (covers(right) ? [left, right] : [right, left]).filter(inTrack);
    const clear = order.filter((s) => !covers(s));
    const sides = clear.length ? clear : order.length ? order : [right];
    for (let r = 0; ; r++) {
      const row = (rows[r] ??= []);
      const side = sides.find((s) => free(row, s));
      if (side) {
        row.push(side);
        return { row: r, left: side === left };
      }
    }
  });
}
