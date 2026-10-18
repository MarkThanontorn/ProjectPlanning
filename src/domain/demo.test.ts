import { describe, expect, it } from 'vitest';
import { seedData } from '../data/seed';
import { createNode } from './factory';
import { hasDemo, isDemoId, stripDemo } from './demo';

const now = new Date('2026-10-18T10:00:00');

describe('demo data', () => {
  const demo = seedData(now);

  it('marks every sample item and keeps references consistent', () => {
    expect(demo.nodes.every((n) => isDemoId(n.id))).toBe(true);
    const ids = new Set(demo.nodes.map((n) => n.id));
    expect(demo.nodes.every((n) => n.parentId === null || ids.has(n.parentId))).toBe(true);
    expect(demo.nodes.flatMap((n) => n.dependsOn).every((d) => ids.has(d))).toBe(true);
    expect(demo.milestones.every((m) => ids.has(m.projectId))).toBe(true);
    expect(Object.values(demo.today.highlights).flat().every((id) => ids.has(id))).toBe(true);
    expect(hasDemo(demo)).toBe(true);
  });

  it('removes only the sample data and keeps the user\'s own items', () => {
    const mine = createNode('project', null, 'My project', 5);
    const myTask = createNode('task', mine.id, 'My task', 0);
    const withMine = {
      ...demo,
      nodes: [...demo.nodes, mine, myTask],
      today: { ...demo.today, routines: [...demo.today.routines, { id: 'r_mine', text: 'Mine' }] },
    };
    const out = stripDemo(withMine);
    expect(out.nodes.map((n) => n.name)).toEqual(['My project', 'My task']);
    expect(out.milestones).toEqual([]);
    expect(out.today.routines.map((r) => r.id)).toEqual(['r_mine']);
    expect(hasDemo(out)).toBe(false);
  });

  it('lifts the user\'s items out of demo projects instead of deleting them', () => {
    const stage = demo.nodes.find((n) => n.name === 'Stage 1')!;
    const myTask = createNode('task', stage.id, 'Added inside demo', 9);
    const out = stripDemo({ ...demo, nodes: [...demo.nodes, myTask] });
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0]).toMatchObject({ name: 'Added inside demo', parentId: null, kind: 'project' });
  });
});
