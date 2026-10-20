import { BUILT_IN_COLUMNS } from './factory';
import { sanitizeColumn, sanitizeMilestone, sanitizeNode, sanitizeSettings, sanitizeToday } from './sanitize';
import type { AppData, ColumnDef, Milestone, WbsNode } from './types';

/**
 * Fills in fields added in later versions so older saved data and imported
 * backups keep working: node fields, newly added built-in columns, settings.
 */
export function normalizeData(data: AppData): AppData {
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const columns = list(data.columns).map(sanitizeColumn).filter((c): c is ColumnDef => !!c);
  let order = Math.max(-1, ...columns.map((c) => c.order));
  for (const key of BUILT_IN_COLUMNS) {
    if (!columns.some((c) => c.id === key)) columns.push({ id: key, builtIn: true, label: '', visible: true, order: ++order });
  }
  return {
    nodes: list(data.nodes).map(sanitizeNode).filter((n): n is WbsNode => !!n),
    columns,
    settings: sanitizeSettings(data.settings),
    today: sanitizeToday(data.today),
    milestones: list(data.milestones).map(sanitizeMilestone).filter((m): m is Milestone => !!m),
  };
}
