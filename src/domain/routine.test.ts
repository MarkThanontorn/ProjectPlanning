import { describe, expect, it } from 'vitest';
import { dueReminders, routineDueOn } from './routine';
import type { Routine } from './types';

const r = (repeat?: Routine['repeat']): Routine => ({ id: 'r', text: 'x', repeat });

describe('routine schedule', () => {
  it('defaults to every day', () => {
    expect(routineDueOn(r(), '2026-10-18')).toBe(true);
  });
  it('weekly on chosen weekdays', () => {
    const weekdays = r({ kind: 'weekly', days: [1, 2, 3, 4, 5] });
    expect(routineDueOn(weekdays, '2026-10-19')).toBe(true); // Monday
    expect(routineDueOn(weekdays, '2026-10-18')).toBe(false); // Sunday
    expect(routineDueOn(r({ kind: 'weekly', days: [0] }), '2026-10-18')).toBe(true);
  });
  it('monthly on a date, falling back to the last day of short months', () => {
    expect(routineDueOn(r({ kind: 'monthly', day: 18 }), '2026-10-18')).toBe(true);
    expect(routineDueOn(r({ kind: 'monthly', day: 18 }), '2026-10-19')).toBe(false);
    expect(routineDueOn(r({ kind: 'monthly', day: 31 }), '2026-11-30')).toBe(true);
    expect(routineDueOn(r({ kind: 'monthly', day: 31 }), '2026-11-29')).toBe(false);
  });
});

describe('routine reminders', () => {
  const email: Routine = { id: 'email', text: 'Check email', repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5] }, times: ['08:00', '15:00'] };
  const mon = (hhmm: string) => new Date(`2026-10-19T${hhmm}:00`); // Monday

  it('fires at each time on scheduled days, within the window', () => {
    expect(dueReminders([email], [], mon('07:59'), new Set())).toEqual([]);
    expect(dueReminders([email], [], mon('08:00'), new Set()).map((d) => d.time)).toEqual(['08:00']);
    expect(dueReminders([email], [], mon('08:59'), new Set())).toHaveLength(1);
    expect(dueReminders([email], [], mon('09:00'), new Set())).toEqual([]);
    expect(dueReminders([email], [], mon('15:10'), new Set()).map((d) => d.time)).toEqual(['15:00']);
  });
  it('skips days off, single-time routines already done, and reminders already shown', () => {
    expect(dueReminders([email], [], new Date('2026-10-18T08:05:00'), new Set())).toEqual([]); // Sunday
    // Several times a day: ticking it off in the morning doesn't silence the afternoon reminder
    expect(dueReminders([email], ['email'], mon('15:05'), new Set())).toHaveLength(1);
    const once: Routine = { ...email, times: ['08:00'] };
    expect(dueReminders([once], ['email'], mon('08:05'), new Set())).toEqual([]);
    const [first] = dueReminders([email], [], mon('08:05'), new Set());
    expect(dueReminders([email], [], mon('08:06'), new Set([first.key]))).toEqual([]);
  });
});
