import { STATUSES, type Computed, type Rank, type Status, type WbsNode } from './types';

export interface DateRange {
  from: string | null;
  to: string | null;
}
export interface NumRange {
  min: number | null;
  max: number | null;
}

/** Every Task List filter. Empty lists / null bounds mean "no filter". */
export interface ListFilter {
  text: string;
  /** Root project ids. */
  projects: string[];
  statuses: Status[];
  /** 'none' = no rank set. */
  ranks: (Rank | 'none')[];
  /** '' = nobody assigned. */
  inCharge: string[];
  planStart: DateRange;
  planEnd: DateRange;
  dueDate: DateRange;
  progress: NumRange;
  /** In days. */
  leadtime: NumRange;
  actualLeadtime: NumRange;
  overdueOnly: boolean;
  /** Hide done tasks and tasks inside a completed project/group. */
  hideCompleted: boolean;
}

export const emptyFilter = (): ListFilter => ({
  text: '',
  projects: [],
  statuses: [],
  ranks: [],
  inCharge: [],
  planStart: { from: null, to: null },
  planEnd: { from: null, to: null },
  dueDate: { from: null, to: null },
  progress: { min: null, max: null },
  leadtime: { min: null, max: null },
  actualLeadtime: { min: null, max: null },
  overdueOnly: false,
  hideCompleted: false,
});

export interface RowContext {
  computed: Computed | undefined;
  /** Id of the task's top-level project. */
  rootId: string;
  hoursPerDay: number;
  today: string;
  /** True when the task or a project/group above it is completed. */
  completed?: boolean;
}

const inDate = (v: string | null, r: DateRange) =>
  (!r.from && !r.to) || (v !== null && (!r.from || v >= r.from) && (!r.to || v <= r.to));
const inNum = (v: number | null, r: NumRange) =>
  (r.min === null && r.max === null) || (v !== null && (r.min === null || v >= r.min) && (r.max === null || v <= r.max));

/** Overdue = not done and Plan End (or Due Date) is before today. */
export const isOverdue = (n: WbsNode, today: string) => {
  const end = n.planEnd ?? n.dueDate;
  return n.status !== 'done' && !!end && end < today;
};

export function matches(n: WbsNode, f: ListFilter, ctx: RowContext): boolean {
  const q = f.text.trim().toLowerCase();
  if (q && ![n.name, n.detail, n.inCharge, n.remark, ...(ctx.computed?.path ?? [])].some((s) => s.toLowerCase().includes(q))) return false;
  if (f.projects.length && !f.projects.includes(ctx.rootId)) return false;
  if (f.statuses.length && !f.statuses.includes(n.status)) return false;
  if (f.ranks.length && !f.ranks.includes(n.rank ?? 'none')) return false;
  if (f.inCharge.length && !f.inCharge.includes(n.inCharge.trim())) return false;
  if (!inDate(n.planStart, f.planStart) || !inDate(n.planEnd, f.planEnd) || !inDate(n.dueDate, f.dueDate)) return false;
  if (!inNum(n.progress, f.progress)) return false;
  const days = (h: number | null | undefined) => (h == null ? null : h / ctx.hoursPerDay);
  if (!inNum(days(ctx.computed?.planHours), f.leadtime)) return false;
  if (!inNum(days(ctx.computed?.actualHours), f.actualLeadtime)) return false;
  if (f.overdueOnly && !isOverdue(n, ctx.today)) return false;
  if (f.hideCompleted && (ctx.completed ?? n.status === 'done')) return false;
  return true;
}

/** Number of active filter groups (for the badge and "clear all"). */
export function activeCount(f: ListFilter): number {
  const ranges = [f.planStart, f.planEnd, f.dueDate].filter((r) => r.from || r.to).length;
  const nums = [f.progress, f.leadtime, f.actualLeadtime].filter((r) => r.min !== null || r.max !== null).length;
  const lists = [f.projects, f.statuses, f.ranks, f.inCharge].filter((l) => l.length > 0).length;
  return lists + ranges + nums + (f.text.trim() ? 1 : 0) + (f.overdueOnly ? 1 : 0) + (f.hideCompleted ? 1 : 0);
}

// ---- Sorting ----

export type SortKey = 'name' | 'status' | 'rank' | 'inCharge' | 'planStart' | 'planEnd' | 'dueDate' | 'progress' | 'leadtime' | 'actualLeadtime';
export type SortState = { key: SortKey; dir: 1 | -1 } | null;

/** Header click cycle: ascending → descending → no sort (back to WBS order). */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (!current || current.key !== key) return { key, dir: 1 };
  return current.dir === 1 ? { key, dir: -1 } : null;
}

const sortValue = (key: SortKey, n: WbsNode, c: Computed | undefined): string | number | null => {
  switch (key) {
    case 'status': return STATUSES.indexOf(n.status);
    case 'rank': return n.rank;
    case 'progress': return n.progress;
    case 'leadtime': return c?.planHours ?? null;
    case 'actualLeadtime': return c?.actualHours ?? null;
    case 'planStart':
    case 'planEnd':
    case 'dueDate': return n[key];
    case 'inCharge': return n.inCharge.trim().toLowerCase() || null;
    default: return n.name.toLowerCase();
  }
};

/** Stable sort; empty values always go last regardless of direction. Null sort = keep input order. */
export function sortRows(rows: WbsNode[], sort: SortState, computedOf: (id: string) => Computed | undefined): WbsNode[] {
  if (!sort) return rows;
  return rows
    .map((n, i) => ({ n, i, v: sortValue(sort.key, n, computedOf(n.id)) }))
    .sort((a, b) => {
      if (a.v === null || a.v === '') return b.v === null || b.v === '' ? a.i - b.i : 1;
      if (b.v === null || b.v === '') return -1;
      const d = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      return d * sort.dir || a.i - b.i;
    })
    .map((x) => x.n);
}
