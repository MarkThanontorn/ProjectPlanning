import { describe, expect, it } from 'vitest';
import { compareBoard } from './boardSort';
import { fmtYmd, parseDateText } from './dates';
import { createNode, defaultSettings } from './factory';
import { sanitizeNode, sanitizeSettings } from './sanitize';
import type { BoardSort, Computed, WbsNode } from './types';
import { alignTask, inChargeRowIds, progressForStatus, rowFilterIds, statusForProgress } from './taskState';
import { joinPeople, knownPeople, splitPeople } from './people';
import { focusRowIds, isThisWeek, weekRange } from './week';

const task = (id: string, patch: Partial<WbsNode> = {}): WbsNode => ({ ...createNode('task', 'p', id, 0), id, ...patch });
const settings = defaultSettings();
const today = '2026-11-04';
const order = (list: WbsNode[], sort: BoardSort) => [...list].sort((a, b) => compareBoard(a, b, sort, settings, today)).map((n) => n.id);

describe('dates', () => {
  it('shows YYYY/MM/DD', () => expect(fmtYmd('2026-11-04')).toBe('2026/11/04'));
  it('reads typed dates', () => {
    expect(parseDateText('2026/11/04')).toBe('2026-11-04');
    expect(parseDateText('2026-11-4')).toBe('2026-11-04');
    expect(parseDateText('20261104')).toBe('2026-11-04');
  });
  it('rejects dates that do not exist', () => {
    expect(parseDateText('2026/02/30')).toBeNull();
    expect(parseDateText('2026/13/01')).toBeNull();
    expect(parseDateText('hello')).toBeNull();
  });
});

describe('board sort', () => {
  const a = task('a', { rank: 'C', dueDate: '2026-11-10', progress: 50, name: 'Bravo' });
  const b = task('b', { rank: 'A', dueDate: '2026-11-20', progress: 5, name: 'Alpha' });
  const c = task('c', { rank: null, dueDate: null, progress: 95, name: 'Charlie' });
  it('sorts by each key', () => {
    expect(order([a, b, c], { key: 'rank', dir: 'asc' })).toEqual(['b', 'a', 'c']);
    expect(order([a, b, c], { key: 'dueDate', dir: 'asc' })).toEqual(['a', 'b', 'c']);
    expect(order([a, b, c], { key: 'progress', dir: 'desc' })).toEqual(['c', 'a', 'b']);
    expect(order([a, b, c], { key: 'name', dir: 'asc' })).toEqual(['b', 'a', 'c']);
  });
  it('keeps empty values last in both directions', () => {
    expect(order([a, b, c], { key: 'dueDate', dir: 'desc' })).toEqual(['b', 'a', 'c']);
  });
});

describe('removing a card from this week', () => {
  const now = new Date('2026-11-04T10:00:00');
  const monday = weekRange(now).start;
  it('hides it this week even if in progress', () => {
    expect(isThisWeek(task('x', { status: 'in_progress', boardOffWeek: monday }), now)).toBe(false);
  });
  it('a postponed card comes back in the week of its plan, not before', () => {
    const n = task('x', { status: 'in_progress', boardOffWeek: monday, planStart: '2026-11-23', planEnd: '2026-11-25' });
    expect(isThisWeek(n, new Date('2026-11-11T10:00:00'))).toBe(false);
    expect(isThisWeek(n, new Date('2026-11-24T10:00:00'))).toBe(true);
  });
});

describe('gantt focus', () => {
  const p = { ...createNode('project', null, 'P', 0), id: 'p' };
  const g = { ...createNode('group', 'p', 'G', 0), id: 'g' };
  const inside = task('in', { parentId: 'g' });
  const later = task('later', { parentId: 'p' });
  const due = task('due', { parentId: 'p', dueDate: '2026-11-05' });
  const doing = task('doing', { parentId: 'p', status: 'in_progress' });
  const nodes = [p, g, inside, later, due, doing];
  const computed = new Map(
    nodes.map((n) => [n.id, { planStart: n.id === 'in' ? '2026-11-03' : n.id === 'later' ? '2026-12-01' : null, planEnd: n.id === 'in' ? '2026-11-20' : n.id === 'later' ? '2026-12-05' : null } as Computed]),
  );
  it('keeps work in the range with its parents, and drops the rest', () => {
    const ids = focusRowIds(nodes, computed, [], '2026-11-02', '2026-11-08');
    expect([...ids].sort()).toEqual(['doing', 'due', 'g', 'in', 'p']);
  });
  it('keeps a project with a milestone in the range', () => {
    const ids = focusRowIds([p], new Map(), [{ id: 'm', projectId: 'p', name: 'M', date: '2026-11-03', done: false }], '2026-11-02', '2026-11-08');
    expect(ids.has('p')).toBe(true);
  });
});

describe('saved data keeps the new settings and fields', () => {
  it('settings', () => {
    const s = sanitizeSettings({ ...settings, boardSort: { key: 'name', dir: 'desc' }, ganttNameWidth: 300, ganttFocusWeeks: 2 });
    expect(s).toMatchObject({ boardSort: { key: 'name', dir: 'desc' }, ganttNameWidth: 300, ganttFocusWeeks: 2 });
    expect(sanitizeSettings({ boardSort: { key: 'evil' }, ganttFocusWeeks: 9 })).toMatchObject({ boardSort: { key: 'priority', dir: 'asc' }, ganttFocusWeeks: 0 });
  });
  it('node', () => expect(sanitizeNode({ id: 'x', boardOffWeek: '2026-11-02' })?.boardOffWeek).toBe('2026-11-02'));
});

describe('status and progress agree', () => {
  it('fixes saved tasks', () => {
    expect(alignTask(task('a', { status: 'queue', progress: 25 })).status).toBe('in_progress');
    expect(alignTask(task('a', { status: 'in_progress', progress: 100 })).status).toBe('done');
    expect(alignTask(task('a', { status: 'done', progress: 50 })).progress).toBe(100);
    expect(alignTask(task('a', { status: 'reviewing', progress: 0 })).progress).toBe(95);
    expect(alignTask(task('a', { status: 'in_progress', progress: 95 })).status).toBe('reviewing');
    expect(alignTask(task('a', { status: 'in_progress', progress: 0 })).progress).toBe(5);
  });
  it('leaves correct tasks, and projects / groups, alone', () => {
    const ok = task('a', { status: 'in_progress', progress: 25 });
    expect(alignTask(ok)).toBe(ok);
    const group = { ...createNode('group', null, 'G', 0), status: 'done' as const, progress: 0 };
    expect(alignTask(group)).toBe(group);
  });
});

describe('in-charge filter', () => {
  const p = { ...createNode('project', null, 'P', 0), id: 'p' };
  const g = { ...createNode('group', 'p', 'G', 0), id: 'g' };
  const mine = task('mine', { parentId: 'g', inCharge: ' Mark ' });
  const theirs = task('theirs', { parentId: 'p', inCharge: 'Bee' });
  const nobody = task('nobody', { parentId: 'p' });
  const nodes = [p, g, mine, theirs, nobody];
  it('keeps the person\'s tasks and their parents', () => {
    expect([...inChargeRowIds(nodes, ['Mark'])!].sort()).toEqual(['g', 'mine', 'p']);
  });
  it('finds unassigned tasks, without matching empty projects and groups', () => {
    expect([...inChargeRowIds(nodes, [''])!].sort()).toEqual(['nobody', 'p']);
  });
  it('no selection means no filter', () => expect(inChargeRowIds(nodes, [])).toBeNull());
});

describe('95% = Reviewing', () => {
  it('progress gives the status', () => {
    expect([0, 5, 75, 95, 100].map(statusForProgress)).toEqual(['queue', 'in_progress', 'in_progress', 'reviewing', 'done']);
  });
  it('status gives the progress', () => {
    expect(progressForStatus('reviewing', 25)).toBe(95);
    expect(progressForStatus('in_progress', 95)).toBe(75);
    expect(progressForStatus('in_progress', 50)).toBe(50);
    expect(progressForStatus('in_progress', 0)).toBe(5);
  });
});

describe('several people in In-charge', () => {
  it('reads commas, slashes and semicolons, and writes commas', () => {
    expect(splitPeople('Chavalit/Thanontorn')).toEqual(['Chavalit', 'Thanontorn']);
    expect(splitPeople(' A , B; A ')).toEqual(['A', 'B']);
    expect(joinPeople(['A', 'B'])).toBe('A, B');
  });
  it('lists everyone named anywhere', () => {
    expect(knownPeople([task('1', { inCharge: 'Bee, Mark' }), task('2', { inCharge: 'Mark' })])).toEqual(['Bee', 'Mark']);
  });
  it('the filter finds a task by any of its people', () => {
    expect(inChargeRowIds([task('x', { parentId: null, inCharge: 'Chavalit/Thanontorn' })], ['Thanontorn'])?.has('x')).toBe(true);
  });
});

describe('due date range filter', () => {
  const p = { ...createNode('project', null, 'P', 0), id: 'p' };
  const old = task('old', { parentId: 'p', status: 'done', dueDate: '2026-01-10' });
  const soon = task('soon', { parentId: 'p', dueDate: '2026-11-25' });
  const planned = task('planned', { parentId: 'p', planEnd: '2026-11-28' });
  const none = task('none', { parentId: 'p' });
  const nodes = [p, old, soon, planned, none];
  const due = (includeUndated: boolean) => ({ people: [], due: { from: '2026-11-01', to: '2026-11-30', includeUndated } });
  it('keeps items due in the range (Plan End when there is no Due Date) and drops old ones', () => {
    expect([...rowFilterIds(nodes, due(false))!].sort()).toEqual(['p', 'planned', 'soon']);
  });
  it('can also keep tasks without any date', () => {
    expect(rowFilterIds(nodes, due(true))!.has('none')).toBe(true);
  });
});
