import { differenceInCalendarDays, parseISO } from 'date-fns';
import { planHours, workingDays } from './calc';
import type { Rank, Settings, WbsNode } from './types';

/** Calendar days from today to Plan End (or Due Date). Negative = overdue. */
export function daysLeft(node: WbsNode, today: string): number | null {
  const target = node.planEnd ?? node.dueDate;
  return target ? differenceInCalendarDays(parseISO(target), parseISO(today)) : null;
}

export interface Slack {
  /** Work still to do: Leadtime × (1 − progress), in hours. */
  remainingHrs: number;
  /** Working hours from today (inclusive) to Plan End. */
  availableHrs: number;
}

/** Remaining work vs. time left; null when the task has no Leadtime or no end date. */
export function slack(node: WbsNode, settings: Settings, today: string): Slack | null {
  const target = node.planEnd ?? node.dueDate;
  const lead = node.leadtimeOverrideHrs ?? planHours(node.planStart, node.planEnd, settings);
  if (!target || lead === null || lead <= 0) return null;
  return {
    remainingHrs: lead * (1 - Math.min(100, Math.max(0, node.progress)) / 100),
    availableHrs: target < today ? 0 : workingDays(today, target, settings.workDays) * settings.hoursPerDay,
  };
}

/**
 * Automatic urgency: overdue, or the remaining work plus the safety buffer
 * no longer fits in the working time left before Plan End. Without a Leadtime,
 * falls back to "Plan End within `urgentDays`".
 */
export function autoUrgent(node: WbsNode, settings: Settings, today: string): boolean {
  const d = daysLeft(node, today);
  if (d === null) return false;
  if (d < 0) return true;
  const s = slack(node, settings, today);
  if (s) return s.remainingHrs * (1 + settings.urgencyBufferPct / 100) >= s.availableHrs;
  return d <= settings.urgentDays;
}

export interface Placement {
  important: boolean;
  urgent: boolean;
  /** True when that axis comes from a manual override rather than the rule. */
  manualImportant: boolean;
  manualUrgent: boolean;
  daysLeft: number | null;
  slack: Slack | null;
}

/** Rank A/B = important; urgency from `autoUrgent`. Manual overrides win per axis. */
export function placement(node: WbsNode, settings: Settings, today: string): Placement {
  const mi = node.eisenhower?.important ?? null;
  const mu = node.eisenhower?.urgent ?? null;
  return {
    important: mi ?? (node.rank === 'A' || node.rank === 'B'),
    urgent: mu ?? autoUrgent(node, settings, today),
    manualImportant: mi !== null,
    manualUrgent: mu !== null,
    daysLeft: daysLeft(node, today),
    slack: slack(node, settings, today),
  };
}

const RANK_ORDER: Record<Rank, number> = { A: 0, B: 1, C: 2 };

/**
 * Priority order within a quadrant: manual "urgent insert" first, then Rank
 * (A → C, unranked last), then nearest Plan End (no date last).
 */
export function comparePriority(a: WbsNode, b: WbsNode, _settings: Settings, today: string): number {
  const insertA = a.eisenhower?.urgent === true ? 0 : 1;
  const insertB = b.eisenhower?.urgent === true ? 0 : 1;
  if (insertA !== insertB) return insertA - insertB;
  const ra = a.rank ? RANK_ORDER[a.rank] : 3;
  const rb = b.rank ? RANK_ORDER[b.rank] : 3;
  if (ra !== rb) return ra - rb;
  return (daysLeft(a, today) ?? Infinity) - (daysLeft(b, today) ?? Infinity);
}

/** Open tasks that belong on this week's matrix. */
export function onMatrix(node: WbsNode, settings: Settings, today: string, inWeek: boolean): boolean {
  if (node.status === 'done') return false;
  return inWeek || node.eisenhower !== null || autoUrgent(node, settings, today);
}
