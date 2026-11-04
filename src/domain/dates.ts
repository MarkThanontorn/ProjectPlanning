import { format, isValid, parseISO } from 'date-fns';

/** How dates are shown everywhere in the app. Stored dates stay ISO (yyyy-MM-dd). */
export const DATE_FORMAT = 'yyyy/MM/dd';

export const fmtYmd = (d: string | Date) => format(typeof d === 'string' ? parseISO(d) : d, DATE_FORMAT);

/** "2026/11/04 14:30" */
export const fmtYmdTime = (d: string | Date) => format(typeof d === 'string' ? new Date(d) : d, `${DATE_FORMAT} HH:mm`);

/**
 * Reads a typed date: 2026/11/04, 2026-11-4, 2026.11.04 or 20261104.
 * Returns the ISO date, or null when it isn't a real calendar date.
 */
export function parseDateText(text: string): string | null {
  const m = text.trim().match(/^(\d{4})[/.-]?(\d{1,2})[/.-]?(\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = parseISO(iso);
  // parseISO rejects month 13, but check the round trip too (e.g. Feb 30).
  return isValid(d) && format(d, 'yyyy-MM-dd') === iso ? iso : null;
}
