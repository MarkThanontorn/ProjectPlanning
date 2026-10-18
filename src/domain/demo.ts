import type { AppData } from './types';

/** Every id in the sample data starts with this, so it can be removed without touching the user's own data. */
export const DEMO_PREFIX = 'demo_';
export const isDemoId = (id: string) => id.startsWith(DEMO_PREFIX);

/** Re-ids every item in a dataset as demo data, keeping all references consistent. */
export function markDemo(data: AppData): AppData {
  const ids = new Map<string, string>();
  const map = (id: string) => {
    if (isDemoId(id)) return id;
    if (!ids.has(id)) ids.set(id, DEMO_PREFIX + id);
    return ids.get(id)!;
  };
  const mapList = (list: string[]) => list.map(map);
  return {
    ...data,
    nodes: data.nodes.map((n) => ({ ...n, id: map(n.id), parentId: n.parentId && map(n.parentId), dependsOn: mapList(n.dependsOn) })),
    milestones: data.milestones.map((m) => ({ ...m, id: map(m.id), projectId: map(m.projectId) })),
    today: {
      highlights: Object.fromEntries(Object.entries(data.today.highlights).map(([d, list]) => [d, mapList(list)])),
      routines: data.today.routines.map((r) => ({ ...r, id: map(r.id) })),
      routineDone: Object.fromEntries(Object.entries(data.today.routineDone).map(([d, list]) => [d, mapList(list)])),
    },
  };
}

export function hasDemo(data: Pick<AppData, 'nodes' | 'milestones' | 'today'>): boolean {
  return data.nodes.some((n) => isDemoId(n.id)) || data.milestones.some((m) => isDemoId(m.id)) || data.today.routines.some((r) => isDemoId(r.id));
}

/**
 * Removes the sample data only. The user's own items stay; if they were placed
 * inside a demo project/group they move up to the top level of the nearest
 * remaining parent (or become a project when nothing is left above them).
 */
export function stripDemo(data: AppData): AppData {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const keepParent = (parentId: string | null): string | null => {
    let p = parentId;
    while (p && isDemoId(p)) p = byId.get(p)?.parentId ?? null;
    return p;
  };
  const nodes = data.nodes
    .filter((n) => !isDemoId(n.id))
    .map((n) => {
      const parentId = keepParent(n.parentId);
      return {
        ...n,
        parentId,
        // An orphaned task/group can't sit at the root, so it becomes a project.
        kind: parentId === null && n.kind !== 'project' ? ('project' as const) : n.kind,
        dependsOn: n.dependsOn.filter((d) => !isDemoId(d)),
      };
    });
  const clean = (list: string[]) => list.filter((id) => !isDemoId(id));
  return {
    ...data,
    nodes,
    milestones: data.milestones.filter((m) => !isDemoId(m.id) && !isDemoId(m.projectId)),
    today: {
      highlights: Object.fromEntries(Object.entries(data.today.highlights).map(([d, list]) => [d, clean(list)])),
      routines: data.today.routines.filter((r) => !isDemoId(r.id)),
      routineDone: Object.fromEntries(Object.entries(data.today.routineDone).map(([d, list]) => [d, clean(list)])),
    },
  };
}
