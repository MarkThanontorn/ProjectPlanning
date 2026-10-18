import { format, getDaysInMonth, parseISO } from 'date-fns';
import type { Routine, RoutineRepeat } from './types';

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const repeatOf = (r: Routine): RoutineRepeat => r.repeat ?? { kind: 'daily' };

/**
 * Whether a routine is scheduled on the given day. Monthly routines on a day
 * the month doesn't have (e.g. the 31st) fall on the month's last day.
 */
export function routineDueOn(r: Routine, iso: string): boolean {
  const rep = repeatOf(r);
  const d = parseISO(iso);
  switch (rep.kind) {
    case 'daily':
      return true;
    case 'weekly':
      return rep.days.includes(d.getDay());
    case 'monthly':
      return d.getDate() === Math.min(rep.day, getDaysInMonth(d));
  }
}

/** How long after its time a reminder still shows (minutes). */
export const REMINDER_WINDOW_MIN = 60;

export interface DueReminder {
  routine: Routine;
  time: string;
  /** Unique per routine + day + time, to show each reminder once. */
  key: string;
}

/**
 * Reminders to show now: routines scheduled today whose time has passed within
 * the last REMINDER_WINDOW_MIN minutes and that haven't been shown yet.
 * A routine with a single time is skipped once ticked off; one with several
 * times (e.g. email at 08:00 and 15:00) reminds at each of them.
 */
export function dueReminders(routines: Routine[], doneToday: string[], now: Date, shown: Set<string>): DueReminder[] {
  const iso = format(now, 'yyyy-MM-dd');
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const out: DueReminder[] = [];
  for (const r of routines) {
    const times = r.times ?? [];
    if (!routineDueOn(r, iso) || (times.length === 1 && doneToday.includes(r.id))) continue;
    for (const time of times) {
      const [h, m] = time.split(':').map(Number);
      const at = h * 60 + m;
      const key = `${r.id}@${iso}T${time}`;
      if (minutesNow >= at && minutesNow < at + REMINDER_WINDOW_MIN && !shown.has(key)) out.push({ routine: r, time, key });
    }
  }
  return out;
}
