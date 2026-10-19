import { describe, expect, it } from 'vitest';
import { createNode, defaultColumns } from '../domain/factory';
import type { WbsNode } from '../domain/types';
import { TeamClient, lockState } from './client';
import type { SharedData } from './model';

const t0 = new Date('2026-10-19T09:00:00Z');
const at = (min: number) => new Date(t0.getTime() + min * 60_000);

function start() {
  const project = { ...createNode('project', null, 'Project A', 0), id: 'p1' };
  const task = { ...createNode('task', 'p1', 'Task a', 0), id: 't1', progress: 25 };
  const task2 = { ...createNode('task', 'p1', 'Task b', 1), id: 't2' };
  const data: SharedData = { nodes: [project, task, task2], milestones: [{ id: 'm1', projectId: 'p1', name: 'M1', date: '2026-11-01', done: false }], columns: defaultColumns() };
  const a = new TeamClient({ id: 'userA', name: 'A' });
  a.seed(data, t0);
  const b = new TeamClient({ id: 'userB', name: 'B' }, [], [a.dataFile(t0)]);
  return { a, b };
}

/** Both read each other's latest file (what OneDrive syncing + "Sync now" does). */
function sync(...clients: TeamClient[]) {
  const files = clients.map((c) => c.dataFile());
  for (const c of clients) c.setOthers(files.filter((f) => f.userId !== c.me.id));
}

const node = (c: TeamClient, id: string) => c.mat.data.nodes.find((n) => n.id === id);
/** Applies a local edit to a client, like the app store does. */
function edit(c: TeamClient, id: string, patch: Partial<WbsNode>, now: Date) {
  const prev = c.mat.data;
  const next = { ...prev, nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
  c.recordChanges(prev, next, now);
}
function remove(c: TeamClient, ids: string[], now: Date) {
  const prev = c.mat.data;
  c.recordChanges(prev, { ...prev, nodes: prev.nodes.filter((n) => !ids.includes(n.id)), milestones: prev.milestones.filter((m) => !ids.includes(m.projectId)) }, now);
}

describe('team sync', () => {
  it('a joining member sees the team data', () => {
    const { b } = start();
    expect(b.mat.data.nodes.map((n) => n.name).sort()).toEqual(['Project A', 'Task a', 'Task b']);
    expect(b.mat.data.milestones).toHaveLength(1);
    expect(b.mat.conflicts).toEqual([]);
  });

  it('merges edits to different fields of the same task without a conflict', () => {
    const { a, b } = start();
    edit(a, 't1', { planEnd: '2026-10-25' }, at(1));
    edit(b, 't1', { progress: 50 }, at(1));
    sync(a, b);
    for (const c of [a, b]) {
      expect(node(c, 't1')).toMatchObject({ planEnd: '2026-10-25', progress: 50 });
      expect(c.mat.conflicts).toEqual([]);
    }
  });

  it('flags the same field edited by two people, records who set what, and resolves for everyone', () => {
    const { a, b } = start();
    edit(a, 't1', { progress: 50 }, at(1));
    edit(b, 't1', { progress: 75 }, at(2));
    sync(a, b);
    const [c] = b.mat.conflicts;
    expect(c).toMatchObject({ kind: 'field', e: 't1', f: 'progress', base: 25 });
    if (c.kind !== 'field') throw new Error();
    expect(c.options.map((o) => [o.by, o.v])).toEqual([['userA', 50], ['userB', 75]]);
    expect(node(b, 't1')!.progress).toBe(75); // newest shown until someone decides
    b.resolveField(c, c.options[0].opId, at(3));
    sync(a, b);
    for (const cl of [a, b]) {
      expect(cl.mat.conflicts).toEqual([]);
      expect(node(cl, 't1')!.progress).toBe(50);
    }
  });

  it('no conflict when both set the same value, or when the second edit saw the first', () => {
    const { a, b } = start();
    edit(a, 't1', { rank: 'A' }, at(1));
    edit(b, 't1', { rank: 'A' }, at(1));
    sync(a, b);
    expect(b.mat.conflicts).toEqual([]);
    edit(a, 't1', { name: 'Renamed' }, at(2));
    sync(a, b);
    edit(b, 't1', { name: 'Renamed again' }, at(3));
    sync(a, b);
    expect(a.mat.conflicts).toEqual([]);
    expect(node(a, 't1')!.name).toBe('Renamed again');
  });

  it('a delete that crosses someone else\'s edit keeps the task until the team decides', () => {
    const { a, b } = start();
    remove(a, ['t1'], at(1));
    edit(b, 't1', { detail: 'important notes' }, at(2));
    sync(a, b);
    expect(node(a, 't1')).toBeDefined();
    expect(a.mat.conflicts[0]).toMatchObject({ kind: 'delete', e: 't1', deletedBy: 'userA' });
    a.resolveDelete(a.mat.conflicts[0] as never, 'delete', at(3));
    sync(a, b);
    expect(node(b, 't1')).toBeUndefined();
    expect(b.mat.conflicts).toEqual([]);
    expect(b.mat.trash.map((x) => x.e)).toEqual(['t1']);
  });

  it('a task added inside a group someone deleted keeps the group, and restore brings it back', () => {
    const { a, b } = start();
    remove(a, ['p1', 't1', 't2'], at(1));
    const prev = b.mat.data;
    b.recordChanges(prev, { ...prev, nodes: [...prev.nodes, { ...createNode('task', 'p1', 'New', 2), id: 't3' }] }, at(2));
    sync(a, b);
    expect(node(a, 'p1')).toBeDefined();
    expect(node(a, 't3')!.parentId).toBe('p1');
    expect(a.mat.conflicts.map((c) => c.e)).toEqual(['p1']);
    b.resolveDelete(b.mat.conflicts[0] as never, 'restore', at(3));
    sync(a, b);
    expect(a.mat.conflicts).toEqual([]);
    expect(node(a, 'p1')).toBeDefined();
  });

  it('restoring from the trash brings back what was deleted together', () => {
    const { a, b } = start();
    remove(a, ['p1', 't1', 't2'], at(1));
    sync(a, b);
    expect(b.mat.data.nodes).toEqual([]);
    expect(b.mat.data.milestones).toEqual([]);
    b.restore('node', 'p1', at(2));
    sync(a, b);
    expect(a.mat.data.nodes.map((n) => n.id).sort()).toEqual(['p1', 't1', 't2']);
  });

  it('keeps everyone\'s time logs and never shares personal fields', () => {
    const { a, b } = start();
    edit(a, 't1', { timeLogs: [{ start: '2026-10-19T09:00:00Z', end: '2026-10-19T10:00:00Z' }], todayDate: '2026-10-19', collapsed: true }, at(1));
    edit(b, 't1', { timeLogs: [{ start: '2026-10-19T11:00:00Z', end: null }] }, at(1));
    sync(a, b);
    expect(node(b, 't1')!.timeLogs).toHaveLength(2);
    expect(node(b, 't1')!.todayDate).toBeNull();
    expect(b.mat.conflicts).toEqual([]);
  });

  it('collapses rapid edits that nobody has seen yet into one history entry', () => {
    const { a } = start();
    const before = a.myOps.length;
    edit(a, 't1', { progress: 50 }, at(1));
    edit(a, 't1', { progress: 75 }, at(1.1));
    expect(a.myOps.length).toBe(before + 1);
    a.dataFile(at(1.2)); // written to the folder: others may have seen it
    edit(a, 't1', { progress: 95 }, at(1.3));
    expect(a.myOps.length).toBe(before + 2);
  });

  it('sibling order follows the newest change without asking', () => {
    const { a, b } = start();
    edit(a, 't1', { order: 5 }, at(1));
    edit(b, 't1', { order: 7 }, at(2));
    sync(a, b);
    expect(a.mat.conflicts).toEqual([]);
    expect(node(a, 't1')!.order).toBe(7);
  });

  it('editing locks expire on their own', () => {
    const lock = { t: 'node' as const, e: 't1', since: t0.toISOString(), beat: t0.toISOString() };
    expect(lockState(lock, at(1))).toBe('active');
    expect(lockState(lock, at(3))).toBe('stale');
    expect(lockState(lock, at(6))).toBeNull();
  });
});
