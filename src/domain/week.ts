import { endOfWeek, startOfWeek } from 'date-fns';
import { toIsoDate } from './calc';
import type { Computed, Milestone, WbsNode } from './types';

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
  // Taken off the boards by hand: stays off for the rest of that week.
  if (node.boardOffWeek === start) return false;
  if (node.todayDate === toIsoDate(now)) return true;
  // A card taken off by hand no longer stays just for being open: its plan or due date brings it back.
  if (!node.boardOffWeek && (node.status === 'in_progress' || node.status === 'reviewing')) return true;
  if (node.dueDate && node.dueDate >= start && node.dueDate <= end) return true;
  if (node.planStart && node.planEnd && node.planStart <= end && node.planEnd >= start) return true;
  if (node.actualEnd && node.actualEnd >= start && node.actualEnd <= end) return true;
  return false;
}

/**
 * Gantt focus: rows with something happening between `start` and `end` (ISO dates) —
 * a plan that overlaps, a due date inside, work in progress, or a milestone —
 * plus the projects and groups above them.
 */
export function focusRowIds(nodes: WbsNode[], computed: Map<string, Computed>, milestones: Milestone[], start: string, end: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Set(nodes.map((n) => n.parentId));
  const keep = new Set<string>();
  const add = (id: string | null) => {
    for (let n = id ? byId.get(id) : undefined; n && !keep.has(n.id); n = n.parentId ? byId.get(n.parentId) : undefined) keep.add(n.id);
  };
  for (const n of nodes) {
    if (parents.has(n.id)) continue;
    const c = computed.get(n.id);
    const planned = !!c?.planStart && !!c.planEnd && c.planStart <= end && c.planEnd >= start;
    const due = !!n.dueDate && n.dueDate >= start && n.dueDate <= end;
    if (planned || due || n.status === 'in_progress' || n.status === 'reviewing') add(n.id);
  }
  for (const m of milestones) if (m.date >= start && m.date <= end) add(m.projectId);
  return keep;
}
