const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-05" -> "May 2026", "2023" -> "2023" */
export function fmtMonth(ym?: string): string {
  if (!ym) return 'Present';
  const [y, m] = ym.split('-');
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
}

/** "2026-05" -> "2026.05" for dense readouts */
export function fmtDot(ym?: string): string {
  if (!ym) return 'NOW';
  return ym.replace('-', '.');
}

/** Months since year 0; year-only values count as mid-year. */
export function monthIndex(ym: string): number {
  const [y, m] = ym.split('-');
  return Number(y) * 12 + (m ? Number(m) - 1 : 6);
}

export function nowYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive duration, e.g. "1 yr 5 mo" */
export function duration(start: string, end?: string): string {
  const months = monthIndex(end ?? nowYM()) - monthIndex(start) + 1;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || '1 mo';
}

export const statusLabel = { active: 'Active', shipped: 'Shipped', archived: 'Archived' } as const;
