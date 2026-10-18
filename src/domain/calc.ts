import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { Computed, Settings, TimeLog, WbsNode } from './types';

export const toIsoDate = (d: Date) => format(d, 'yyyy-MM-dd');
export const todayIso = (now: Date = new Date()) => toIsoDate(now);
export const shiftIsoDate = (iso: string, days: number) => toIsoDate(addDays(parseISO(iso), days));

const minDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Inclusive count of working days between two ISO dates. */
export function workingDays(start: string, end: string, workDays: number[]): number {
  const s = parseISO(start);
  const total = differenceInCalendarDays(parseISO(end), s);
  if (total < 0) return 0;
  let count = 0;
  for (let i = 0; i <= total; i++) {
    if (workDays.includes(addDays(s, i).getDay())) count++;
  }
  return count;
}

export function planHours(start: string | null, end: string | null, settings: Settings): number | null {
  if (!start || !end) return null;
  return workingDays(start, end, settings.workDays) * settings.hoursPerDay;
}

export function loggedHours(logs: TimeLog[], now: Date = new Date()): number {
  let ms = 0;
  for (const log of logs) {
    const end = log.end ? new Date(log.end) : now;
    ms += Math.max(0, end.getTime() - new Date(log.start).getTime());
  }
  return ms / 3_600_000;
}

export function leafActualHours(node: WbsNode, now: Date = new Date()): number {
  return node.actualLeadtimeOverrideHrs ?? loggedHours(node.timeLogs, now);
}

export const isRunning = (node: WbsNode) => node.timeLogs.some((l) => l.end === null);

/** Hours logged within the given calendar day (local time). */
export function hoursOnDate(logs: TimeLog[], dateIso: string, now: Date = new Date()): number {
  const dayStart = parseISO(dateIso).getTime();
  const dayEnd = addDays(parseISO(dateIso), 1).getTime();
  let ms = 0;
  for (const log of logs) {
    const s = Math.max(new Date(log.start).getTime(), dayStart);
    const e = Math.min((log.end ? new Date(log.end) : now).getTime(), dayEnd);
    if (e > s) ms += e - s;
  }
  return ms / 3_600_000;
}

export function childrenMap(nodes: WbsNode[]): Map<string | null, WbsNode[]> {
  const map = new Map<string | null, WbsNode[]>();
  for (const n of nodes) {
    const list = map.get(n.parentId) ?? [];
    list.push(n);
    map.set(n.parentId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.order - b.order);
  return map;
}

/**
 * Derives display values for every node. Leaves use their own fields; parents
 * fill empty dates from their children (min/max), sum Actual Leadtime, and
 * weight Progress by each child's planned hours.
 */
export function computeAll(nodes: WbsNode[], settings: Settings, now: Date = new Date()): Map<string, Computed> {
  const kids = childrenMap(nodes);
  const out = new Map<string, Computed>();

  const visit = (node: WbsNode, depth: number, path: string[]): Computed => {
    const children = kids.get(node.id) ?? [];
    const childPath = [...path, node.name];
    if (children.length === 0) {
      const c: Computed = {
        isLeaf: true,
        depth,
        path,
        planStart: node.planStart,
        planEnd: node.planEnd,
        actualStart: node.actualStart,
        actualEnd: node.actualEnd,
        planHours: node.leadtimeOverrideHrs ?? planHours(node.planStart, node.planEnd, settings),
        actualHours: leafActualHours(node, now),
        progress: node.progress,
      };
      out.set(node.id, c);
      return c;
    }

    const cs = children.map((ch) => visit(ch, depth + 1, childPath));
    let planStart = node.planStart;
    let planEnd = node.planEnd;
    let actualStart = node.actualStart;
    let actualEnd = node.actualEnd;
    if (!planStart) for (const c of cs) planStart = minDate(planStart, c.planStart);
    if (!planEnd) for (const c of cs) planEnd = maxDate(planEnd, c.planEnd);
    if (!actualStart) for (const c of cs) actualStart = minDate(actualStart, c.actualStart);
    if (!actualEnd && cs.every((c) => c.actualEnd)) for (const c of cs) actualEnd = maxDate(actualEnd, c.actualEnd);

    const weight = cs.reduce((s, c) => s + (c.planHours ?? 0), 0);
    const progress =
      weight > 0
        ? cs.reduce((s, c) => s + c.progress * (c.planHours ?? 0), 0) / weight
        : cs.reduce((s, c) => s + c.progress, 0) / cs.length;

    const c: Computed = {
      isLeaf: false,
      depth,
      path,
      planStart,
      planEnd,
      actualStart,
      actualEnd,
      // Leadtime is effort, not calendar span: sum the children unless entered manually.
      planHours:
        node.leadtimeOverrideHrs ??
        (cs.some((x) => x.planHours !== null) ? cs.reduce((s, x) => s + (x.planHours ?? 0), 0) : null),
      actualHours: cs.reduce((s, x) => s + x.actualHours, 0),
      progress: Math.round(progress * 10) / 10,
    };
    out.set(node.id, c);
    return c;
  };

  for (const root of kids.get(null) ?? []) visit(root, 0, []);
  return out;
}

/** Depth-first list of visible nodes (children of collapsed nodes are skipped). */
export function flattenTree(nodes: WbsNode[], includeCollapsed = false): WbsNode[] {
  const kids = childrenMap(nodes);
  const out: WbsNode[] = [];
  const walk = (parentId: string | null) => {
    for (const n of kids.get(parentId) ?? []) {
      out.push(n);
      if (includeCollapsed || !n.collapsed) walk(n.id);
    }
  };
  walk(null);
  return out;
}

export function descendantIds(nodes: WbsNode[], id: string): string[] {
  const kids = childrenMap(nodes);
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const n of kids.get(pid) ?? []) {
      out.push(n.id);
      walk(n.id);
    }
  };
  walk(id);
  return out;
}

/**
 * Whether `id` may be moved under `parentId`: projects stay at the root,
 * groups and tasks live inside a project or group, and never inside themselves.
 */
export function canPlace(nodes: WbsNode[], id: string, parentId: string | null): boolean {
  const node = nodes.find((n) => n.id === id);
  if (!node) return false;
  if (parentId === null) return node.kind === 'project';
  if (node.kind === 'project' || parentId === id) return false;
  if (descendantIds(nodes, id).includes(parentId)) return false;
  const parent = nodes.find((n) => n.id === parentId);
  return !!parent && parent.kind !== 'task';
}

export const isLeafTask = (node: WbsNode, nodes: WbsNode[]) =>
  node.kind === 'task' && !nodes.some((n) => n.parentId === node.id);

// ---- Timer transitions (pure) ----

export function startTimer(node: WbsNode, now: Date = new Date()): WbsNode {
  if (isRunning(node)) return node;
  return {
    ...node,
    status: node.status === 'done' ? 'in_progress' : node.status === 'queue' ? 'in_progress' : node.status,
    actualStart: node.actualStart ?? toIsoDate(now),
    actualEnd: node.status === 'done' ? null : node.actualEnd,
    timeLogs: [...node.timeLogs, { start: now.toISOString(), end: null }],
  };
}

export function pauseTimer(node: WbsNode, now: Date = new Date()): WbsNode {
  if (!isRunning(node)) return node;
  return {
    ...node,
    timeLogs: node.timeLogs.map((l) => (l.end === null ? { ...l, end: now.toISOString() } : l)),
  };
}

export function completeTask(node: WbsNode, now: Date = new Date()): WbsNode {
  const paused = pauseTimer(node, now);
  return {
    ...paused,
    status: 'done',
    progress: 100,
    actualStart: paused.actualStart ?? toIsoDate(now),
    actualEnd: toIsoDate(now),
  };
}

// ---- Formatting ----

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function leadtimeParts(hours: number | null, hoursPerDay: number) {
  if (hours === null) return null;
  return { days: round2(hours / hoursPerDay), hours: round2(hours) };
}

export function formatDuration(hours: number): string {
  const totalSec = Math.floor(hours * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
