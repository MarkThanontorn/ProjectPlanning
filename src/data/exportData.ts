import { computeAll, flattenTree, leadtimeParts, loggedHours, round2, todayIso } from '../domain/calc';
import { csvSafe } from '../domain/sanitize';
import type { AppData, WbsNode } from '../domain/types';

/**
 * Flat, spreadsheet-friendly views of the data.
 *
 * The column layout here is a fixed export schema — independent of how
 * columns are ordered, hidden or pinned on screen — so files stay stable for
 * formulas, pivots and imports elsewhere. Custom columns are appended at the end.
 */
export type Row = Record<string, string | number | null>;

const kindLabel = { project: 'Project', group: 'Group', task: 'Task' } as const;

export function wbsRows(data: AppData, now: Date = new Date()): Row[] {
  const computed = computeAll(data.nodes, data.settings, now);
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const parents = new Set(data.nodes.map((n) => n.parentId));
  const custom = [...data.columns].filter((c) => !c.builtIn).sort((a, b) => a.order - b.order);
  const hpd = data.settings.hoursPerDay;

  return flattenTree(data.nodes, true).map((n) => {
    const c = computed.get(n.id)!;
    const isTask = n.kind === 'task' && !parents.has(n.id);
    const plan = leadtimeParts(c.planHours, hpd);
    const actual = leadtimeParts(c.actualHours, hpd);
    const row: Row = {
      ID: n.id,
      'Parent ID': n.parentId ?? '',
      Level: c.depth,
      Type: kindLabel[n.kind],
      Path: c.path.join(' / '),
      Name: n.name,
      Detail: n.detail,
      'Plan Start': c.planStart ?? '',
      'Plan End': c.planEnd ?? '',
      'Actual Start': c.actualStart ?? '',
      'Actual End': c.actualEnd ?? '',
      'Leadtime (h)': plan?.hours ?? null,
      'Leadtime (days)': plan?.days ?? null,
      'Leadtime manual': n.leadtimeOverrideHrs != null ? 'yes' : '',
      'Actual Leadtime (h)': actual?.hours ?? null,
      'Actual Leadtime (days)': actual?.days ?? null,
      'Actual manual': n.actualLeadtimeOverrideHrs != null ? 'yes' : '',
      'Progress (%)': round2(c.progress),
      'Due Date': n.dueDate ?? '',
      Rank: n.rank ?? '',
      'In-charge': n.inCharge,
      Status: isTask ? n.status : '',
      'Depends On': (n.dependsOn ?? []).map((id) => byId.get(id)?.name ?? id).join(', '),
      Checklist: n.checklist.length ? `${n.checklist.filter((i) => i.done).length}/${n.checklist.length}` : '',
      Remark: n.remark,
    };
    for (const col of custom) row[col.label] = n.custom[col.id] ?? '';
    return row;
  });
}

export function taskRows(data: AppData, now: Date = new Date()): Row[] {
  return wbsRows(data, now).filter((r) => r.Type === 'Task' && !data.nodes.some((n) => n.parentId === r.ID));
}

export function milestoneRows(data: AppData): Row[] {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const today = todayIso();
  return [...data.milestones]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({
      Project: byId.get(m.projectId)?.name ?? '',
      Milestone: m.name,
      Date: m.date,
      Done: m.done ? 'yes' : '',
      Overdue: !m.done && m.date < today ? 'yes' : '',
    }));
}

export function timeLogRows(data: AppData, now: Date = new Date()): Row[] {
  const rows: Row[] = [];
  const pathOf = (n: WbsNode) => {
    const names: string[] = [];
    for (let p = data.nodes.find((x) => x.id === n.parentId); p; p = data.nodes.find((x) => x.id === p!.parentId)) names.unshift(p.name);
    return names.join(' / ');
  };
  for (const n of data.nodes)
    for (const log of n.timeLogs)
      rows.push({
        Task: n.name,
        Path: pathOf(n),
        Start: log.start,
        End: log.end ?? '(running)',
        Hours: round2(loggedHours([log], now)),
      });
  return rows.sort((a, b) => String(a.Start).localeCompare(String(b.Start)));
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel shows Thai correctly. */
export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return '﻿';
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'string' ? csvSafe(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers.map(cell).join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n');
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportJson(data: AppData) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `project-planning-${stamp()}.json`);
}

export function exportCsv(data: AppData) {
  download(new Blob([toCsv(wbsRows(data))], { type: 'text/csv;charset=utf-8' }), `project-planning-wbs-${stamp()}.csv`);
}

/** Excel workbook bytes: WBS, Tasks, Milestones and Time Logs sheets. SheetJS is loaded only when used. */
export async function buildXlsx(data: AppData, now: Date = new Date()): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheet = (rows: Row[], name: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    // Column widths from the longest value (capped), and a frozen header row.
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(40, Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length)) + 2) }));
    ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  sheet(wbsRows(data, now), 'WBS');
  sheet(taskRows(data, now), 'Tasks');
  sheet(milestoneRows(data), 'Milestones');
  sheet(timeLogRows(data, now), 'Time Logs');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export async function exportXlsx(data: AppData) {
  const out = await buildXlsx(data);
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `project-planning-${stamp()}.xlsx`);
}
