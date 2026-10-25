import { describe, expect, it } from 'vitest';
import { childrenMap } from '../domain/calc';
import { createNode } from '../domain/factory';
import { resolveRowDrop } from './rowDnd';

const p1 = { ...createNode('project', null, 'P1', 0), id: 'p1' };
const p2 = { ...createNode('project', null, 'P2', 1), id: 'p2' };
const g = { ...createNode('group', 'p1', 'G', 0), id: 'g' };
const a = { ...createNode('task', 'g', 'A', 0), id: 'a' };
const b = { ...createNode('task', 'p1', 'B', 1), id: 'b' };
const nodes = [p1, p2, g, a, b];
const kids = childrenMap(nodes);

describe('moving rows', () => {
  it('top / bottom half of a task = before / after it', () => {
    expect(resolveRowDrop(nodes, kids, 'b', 'a', 0.2)).toMatchObject({ pos: 'before', parentId: 'g', index: 0 });
    expect(resolveRowDrop(nodes, kids, 'b', 'a', 0.8)).toMatchObject({ pos: 'after', parentId: 'g', index: 1 });
  });
  it('middle of a project / group = inside it', () => {
    expect(resolveRowDrop(nodes, kids, 'b', 'p2', 0.5)).toMatchObject({ pos: 'inside', parentId: 'p2', index: 0 });
  });
  it('rejects moving a group into itself or a task under a task', () => {
    expect(resolveRowDrop(nodes, kids, 'g', 'g', 0.5)).toBeNull();
    expect(resolveRowDrop(nodes, kids, 'p1', 'a', 0.8)).toBeNull(); // a project can't go inside its own subtree
  });
});
