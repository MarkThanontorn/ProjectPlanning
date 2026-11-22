import { splitPeople } from './people';
import type { Status, WbsNode } from './types';

/** Lowest Progress of a task that has started. */
export const STARTED_PROGRESS = 5;
/** Progress of a task waiting for review. */
export const REVIEW_PROGRESS = 95;
/** Highest Progress while still being worked on. */
const LAST_WORK_STEP = 75;

/** 0% = Queue · 5–75% = In Progress · 95% = Reviewing · 100% = Done */
export function statusForProgress(progress: number): Status {
  if (progress <= 0) return 'queue';
  if (progress >= 100) return 'done';
  return progress >= REVIEW_PROGRESS ? 'reviewing' : 'in_progress';
}

/** Progress that goes with a status, keeping the current value when it already fits. */
export function progressForStatus(status: Status, progress: number): number {
  switch (status) {
    case 'queue':
      return 0;
    case 'done':
      return 100;
    case 'reviewing':
      return REVIEW_PROGRESS;
    case 'in_progress':
      return progress <= 0 ? STARTED_PROGRESS : progress >= REVIEW_PROGRESS ? LAST_WORK_STEP : progress;
  }
}

/**
 * Keeps a saved or imported task's Status and Progress saying the same thing.
 * The store's actions keep this true while editing.
 */
export function alignTask(n: WbsNode): WbsNode {
  if (n.kind !== 'task') return n;
  if (n.status === 'done') return n.progress === 100 ? n : { ...n, progress: 100 };
  if (n.progress >= 100) return { ...n, status: 'done', progress: 100 };
  if (n.status === 'reviewing') return n.progress === REVIEW_PROGRESS ? n : { ...n, progress: REVIEW_PROGRESS };
  if (n.progress <= 0) return n.status === 'queue' ? n : { ...n, progress: STARTED_PROGRESS };
  const status = statusForProgress(n.progress);
  return status === n.status ? n : { ...n, status };
}

export interface DueRange {
  from: string | null;
  to: string | null;
  /** Also show tasks with neither a Due Date nor a Plan End. */
  includeUndated: boolean;
}

export interface RowFilterSpec {
  /** '' stands for tasks nobody is assigned to; empty list = everyone. */
  people: string[];
  due: DueRange;
}

export const rowFilterActive = (f: RowFilterSpec) => f.people.length > 0 || !!f.due.from || !!f.due.to;

/**
 * Rows to show in WBS / Gantt: items that match the people and the date range
 * (Due Date, or Plan End when there is none), plus the projects and groups above them.
 * Null = no filter.
 */
export function rowFilterIds(nodes: WbsNode[], f: RowFilterSpec): Set<string> | null {
  if (!rowFilterActive(f)) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Set(nodes.map((n) => n.parentId));
  const keep = new Set<string>();
  for (const n of nodes) {
    const task = n.kind === 'task' && !parents.has(n.id);
    if (f.people.length) {
      const who = splitPeople(n.inCharge);
      const ok = who.length ? who.some((p) => f.people.includes(p)) : task && f.people.includes('');
      if (!ok) continue;
    }
    if (f.due.from || f.due.to) {
      const date = n.dueDate ?? n.planEnd;
      if (!date ? !(task && f.due.includeUndated) : (f.due.from && date < f.due.from) || (f.due.to && date > f.due.to)) continue;
    }
    for (let x: WbsNode | undefined = n; x && !keep.has(x.id); x = x.parentId ? byId.get(x.parentId) : undefined) keep.add(x.id);
  }
  return keep;
}

/** Shortcut for the people part only. */
export const inChargeRowIds = (nodes: WbsNode[], people: string[]) => rowFilterIds(nodes, { people, due: { from: null, to: null, includeUndated: true } });
