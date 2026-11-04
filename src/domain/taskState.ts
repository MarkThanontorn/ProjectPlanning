import { PROGRESS_STEPS, type WbsNode } from './types';

/** Lowest Progress of a task that has started. */
export const STARTED_PROGRESS = PROGRESS_STEPS[1];

/**
 * Keeps a task's Status and Progress saying the same thing:
 * Queue = 0% · In Progress / Reviewing = between 0 and 100% · Done = 100%.
 * Used for saved or imported data; the store's actions keep this true while editing.
 */
export function alignTask(n: WbsNode): WbsNode {
  if (n.kind !== 'task') return n;
  if (n.status === 'done') return n.progress === 100 ? n : { ...n, progress: 100 };
  if (n.progress >= 100) return { ...n, status: 'done', progress: 100 };
  if (n.status === 'queue') return n.progress > 0 ? { ...n, status: 'in_progress' } : n;
  return n.progress > 0 ? n : { ...n, progress: STARTED_PROGRESS };
}

/**
 * Rows to show for the chosen people: their tasks plus the projects and groups above them.
 * '' stands for tasks nobody is assigned to. Null = no filter.
 */
export function inChargeRowIds(nodes: WbsNode[], selected: string[]): Set<string> | null {
  if (selected.length === 0) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Set(nodes.map((n) => n.parentId));
  const keep = new Set<string>();
  for (const n of nodes) {
    const who = n.inCharge.trim();
    const isLeaf = !parents.has(n.id);
    if (!selected.includes(who) || (who === '' && (!isLeaf || n.kind !== 'task'))) continue;
    for (let x: WbsNode | undefined = n; x && !keep.has(x.id); x = x.parentId ? byId.get(x.parentId) : undefined) keep.add(x.id);
  }
  return keep;
}
