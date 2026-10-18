import { describe, expect, it } from 'vitest';
import { createNode } from './factory';
import { activeCount, emptyFilter, matches, nextSort, sortRows, type ListFilter, type RowContext } from './listFilter';
import type { Computed, WbsNode } from './types';

const task = (patch: Partial<WbsNode>): WbsNode => ({ ...createNode('task', 'p1', 't', 0), ...patch });
const comp = (planHours: number | null, actualHours = 0): Computed => ({
  isLeaf: true, depth: 2, path: ['P', 'G'], planStart: null, planEnd: null, actualStart: null, actualEnd: null, planHours, actualHours, progress: 0,
});
const ctx = (c: Computed = comp(16), rootId = 'p1'): RowContext => ({ computed: c, rootId, hoursPerDay: 8, today: '2026-10-16' });
const f = (patch: Partial<ListFilter>): ListFilter => ({ ...emptyFilter(), ...patch });

describe('Task List filters', () => {
  const a = task({ name: 'Alpha', inCharge: 'Thanaton', rank: 'A', status: 'in_progress', dueDate: '2026-10-20', planEnd: '2026-10-10', progress: 50 });
  const b = task({ name: 'Beta', inCharge: '', rank: null, status: 'done', dueDate: '2026-11-05', planEnd: '2026-11-01', progress: 100 });

  it('matches everything when empty', () => {
    expect(matches(a, emptyFilter(), ctx())).toBe(true);
    expect(activeCount(emptyFilter())).toBe(0);
  });

  it('filters by in-charge, including "nobody"', () => {
    expect(matches(a, f({ inCharge: ['Thanaton'] }), ctx())).toBe(true);
    expect(matches(b, f({ inCharge: ['Thanaton'] }), ctx())).toBe(false);
    expect(matches(b, f({ inCharge: [''] }), ctx())).toBe(true);
  });

  it('filters by date ranges (inclusive; empty dates excluded when a range is set)', () => {
    const oct = f({ dueDate: { from: '2026-10-01', to: '2026-10-31' } });
    expect(matches(a, oct, ctx())).toBe(true);
    expect(matches(b, oct, ctx())).toBe(false);
    expect(matches(a, f({ dueDate: { from: '2026-10-20', to: null } }), ctx())).toBe(true);
    expect(matches(task({ dueDate: null }), oct, ctx())).toBe(false);
  });

  it('filters by rank (incl. none), status, project and numeric ranges', () => {
    expect(matches(b, f({ ranks: ['none'] }), ctx())).toBe(true);
    expect(matches(a, f({ statuses: ['done'] }), ctx())).toBe(false);
    expect(matches(a, f({ projects: ['p2'] }), ctx())).toBe(false);
    expect(matches(a, f({ progress: { min: 25, max: 75 } }), ctx())).toBe(true);
    expect(matches(a, f({ leadtime: { min: 3, max: null } }), ctx(comp(16)))).toBe(false); // 2 days
    expect(matches(a, f({ actualLeadtime: { min: 1, max: 2 } }), ctx(comp(16, 12)))).toBe(true); // 1.5 days
  });

  it('overdue-only uses Plan End (or Due Date) and skips done tasks', () => {
    expect(matches(a, f({ overdueOnly: true }), ctx())).toBe(true);
    expect(matches({ ...a, status: 'done' }, f({ overdueOnly: true }), ctx())).toBe(false);
  });

  it('counts active filter groups', () => {
    expect(activeCount(f({ inCharge: ['x'], dueDate: { from: '2026-01-01', to: null }, overdueOnly: true }))).toBe(3);
  });
});

describe('Task List sorting', () => {
  it('cycles ascending → descending → none, and restarts on another column', () => {
    let s = nextSort(null, 'dueDate');
    expect(s).toEqual({ key: 'dueDate', dir: 1 });
    s = nextSort(s, 'dueDate');
    expect(s).toEqual({ key: 'dueDate', dir: -1 });
    expect(nextSort(s, 'dueDate')).toBeNull();
    expect(nextSort(s, 'rank')).toEqual({ key: 'rank', dir: 1 });
  });

  it('keeps original order when unsorted and puts empty values last both ways', () => {
    const x = task({ name: 'x', dueDate: '2026-10-20' });
    const y = task({ name: 'y', dueDate: null });
    const z = task({ name: 'z', dueDate: '2026-10-10' });
    const names = (rows: WbsNode[]) => rows.map((r) => r.name);
    expect(names(sortRows([x, y, z], null, () => undefined))).toEqual(['x', 'y', 'z']);
    expect(names(sortRows([x, y, z], { key: 'dueDate', dir: 1 }, () => undefined))).toEqual(['z', 'x', 'y']);
    expect(names(sortRows([x, y, z], { key: 'dueDate', dir: -1 }, () => undefined))).toEqual(['x', 'z', 'y']);
  });
});

describe('hide completed', () => {
  it('hides done tasks and tasks inside a completed project/group', () => {
    const open = task({ status: 'in_progress' });
    const hide = f({ hideCompleted: true });
    expect(matches(open, hide, ctx())).toBe(true);
    expect(matches({ ...open, status: 'done' }, hide, ctx())).toBe(false);
    expect(matches(open, hide, { ...ctx(), completed: true })).toBe(false);
  });
});
