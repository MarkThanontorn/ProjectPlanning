import type { WbsNode } from './types';

/** Predecessor ids, tolerating data saved before dependencies existed. */
export const depsOf = (node: WbsNode): string[] => node.dependsOn ?? [];

/** Predecessors that are not done yet — the task is blocked while this is non-empty. */
export function blockers(node: WbsNode, nodes: WbsNode[]): WbsNode[] {
  const ids = new Set(depsOf(node));
  return nodes.filter((n) => ids.has(n.id) && n.status !== 'done');
}

/** True if making `id` depend on `depId` would create a loop (or a self-link). */
export function wouldCycle(nodes: WbsNode[], id: string, depId: string): boolean {
  if (id === depId) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = [depId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = byId.get(cur);
    if (n) stack.push(...depsOf(n));
  }
  return false;
}

/** Predecessors whose Plan End is not before this task's Plan Start. */
export function scheduleConflicts(node: WbsNode, nodes: WbsNode[]): WbsNode[] {
  if (!node.planStart) return [];
  const ids = new Set(depsOf(node));
  return nodes.filter((n) => ids.has(n.id) && n.planEnd !== null && n.planEnd >= node.planStart!);
}

/** Tasks that list `id` as a predecessor. */
export const successorsOf = (nodes: WbsNode[], id: string) => nodes.filter((n) => depsOf(n).includes(id));
