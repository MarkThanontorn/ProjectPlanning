import { endOfWeek, startOfWeek } from 'date-fns';
import { toIsoDate } from './calc';
import type { WbsNode } from './types';

/** Monday–Sunday range containing `now`, as ISO dates. */
export function weekRange(now: Date = new Date()) {
  return {
    start: toIsoDate(startOfWeek(now, { weekStartsOn: 1 })),
    end: toIsoDate(endOfWeek(now, { weekStartsOn: 1 })),
  };
}

/** Whether a task belongs on this week's boards. */
export function isThisWeek(node: WbsNode, now: Date = new Date()): boolean {
  const { start, end } = weekRange(now);
  if (node.todayDate === toIsoDate(now)) return true;
  if (node.status === 'in_progress' || node.status === 'reviewing') return true;
  if (node.dueDate && node.dueDate >= start && node.dueDate <= end) return true;
  if (node.planStart && node.planEnd && node.planStart <= end && node.planEnd >= start) return true;
  if (node.actualEnd && node.actualEnd >= start && node.actualEnd <= end) return true;
  return false;
}
