import { BUILT_IN_COLUMNS, defaultSettings, defaultToday } from './factory';
import type { AppData } from './types';

/**
 * Fills in fields added in later versions so older saved data and imported
 * backups keep working: node fields, newly added built-in columns, settings.
 */
export function normalizeData(data: AppData): AppData {
  const columns = [...data.columns];
  let order = Math.max(-1, ...columns.map((c) => c.order));
  for (const key of BUILT_IN_COLUMNS) {
    if (!columns.some((c) => c.id === key)) columns.push({ id: key, builtIn: true, label: '', visible: true, order: ++order });
  }
  return {
    nodes: data.nodes.map((n) => ({
      ...n,
      dependsOn: n.dependsOn ?? [],
      leadtimeOverrideHrs: n.leadtimeOverrideHrs ?? null,
    })),
    columns,
    settings: { ...defaultSettings(), ...data.settings },
    today: { ...defaultToday(), ...data.today },
    milestones: data.milestones ?? [],
  };
}
