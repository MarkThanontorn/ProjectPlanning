import { useEffect, useMemo, useState } from 'react';
import { computeAll } from './domain/calc';
import { useAppStore } from './store/useAppStore';

/** Current time, refreshed every `intervalMs`. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Rolled-up values for every node, recomputed when data or `now` changes. */
export function useComputed(now: Date) {
  const nodes = useAppStore((s) => s.nodes);
  const settings = useAppStore((s) => s.settings);
  return useMemo(() => computeAll(nodes, settings, now), [nodes, settings, now]);
}

/** All tasks that have no children, in tree order. */
export function useLeafTasks() {
  const nodes = useAppStore((s) => s.nodes);
  return useMemo(() => {
    const parents = new Set(nodes.map((n) => n.parentId));
    return nodes.filter((n) => n.kind === 'task' && !parents.has(n.id));
  }, [nodes]);
}
