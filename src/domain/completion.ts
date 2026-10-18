import type { WbsNode } from './types';

/** A node counts as completed when it, or any project/group above it, is marked done. */
export function completedIds(nodes: WbsNode[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  for (const n of nodes) {
    for (let cur: WbsNode | undefined = n; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
      if (cur.status === 'done') {
        out.add(n.id);
        break;
      }
    }
  }
  return out;
}
