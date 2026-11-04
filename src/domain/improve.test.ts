import { describe, expect, it } from 'vitest';
import { compareBoard } from './boardSort';
import { fmtYmd, parseDateText } from './dates';
import { createNode, defaultSettings } from './factory';
import { sanitizeNode, sanitizeSettings } from './sanitize';
import type { BoardSort, Computed, WbsNode } from './types';
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
  it('hides it this week even if in progress, and lets it return next week', () => {
    const n = task('x', { status: 'in_progress', boardOffWeek: monday });
    expect(isThisWeek(n, now)).toBe(false);
    expect(isThisWeek(n, new Date('2026-11-11T10:00:00'))).toBe(true);
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
