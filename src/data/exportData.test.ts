import { describe, expect, it } from 'vitest';
import { seedData } from './seed';
import { buildXlsx, milestoneRows, taskRows, timeLogRows, toCsv, wbsRows } from './exportData';

const now = new Date('2026-10-16T10:00:00');
const data = seedData(now);

describe('export rows', () => {
  it('lists every node in tree order with path and rolled-up values', () => {
    const rows = wbsRows(data, now);
    expect(rows.map((r) => r.Name)).toEqual(['Project A', 'Stage 1', 'Task a', 'Task b', 'Daily', 'Model "01"', 'Task c']);
    const taskA = rows.find((r) => r.Name === 'Task a')!;
    expect(taskA.Path).toBe('Project A / Stage 1');
    expect(taskA.Type).toBe('Task');
    expect(taskA['Depends On']).toBe('Task b');
    expect(taskA.Checklist).toBe('1/2');
  });

  it('keeps a fixed column schema no matter how columns are ordered, hidden or pinned on screen', () => {
    const shuffled = {
      ...data,
      columns: data.columns.map((c, i) => ({ ...c, order: data.columns.length - i, visible: i % 2 === 0, pinned: i < 3 })),
    };
    expect(Object.keys(wbsRows(shuffled, now)[0])).toEqual(Object.keys(wbsRows(data, now)[0]));
  });

  it('appends custom columns at the end', () => {
    const withCustom = {
      ...data,
      columns: [...data.columns, { id: 'c_budget', builtIn: false, label: 'Budget', visible: true, order: 99 }],
      nodes: data.nodes.map((n) => (n.name === 'Task a' ? { ...n, custom: { c_budget: '5000' } } : n)),
    };
    const rows = wbsRows(withCustom, now);
    const keys = Object.keys(rows[0]);
    expect(keys[keys.length - 1]).toBe('Budget');
    expect(rows.find((r) => r.Name === 'Task a')!.Budget).toBe('5000');
  });

  it('has task, milestone and time-log sheets', () => {
    expect(taskRows(data, now).map((r) => r.Name)).toEqual(['Task a', 'Task b', 'Task c']);
    expect(milestoneRows(data).map((r) => r.Milestone)).toEqual(['Kick-off', 'Requirement sign-off', 'Go-live']);
    expect(timeLogRows(data, now)[0]).toMatchObject({ Task: 'Task a', Hours: 1.5 });
  });
});

describe('csv', () => {
  it('adds a BOM and escapes commas, quotes and newlines', () => {
    const csv = toCsv([{ Name: 'A, "quoted"', Note: 'line1\nline2', N: 3 }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual(['Name,Note,N', '"A, ""quoted""","line1\nline2",3']);
  });
});

describe('xlsx', () => {
  it('writes a workbook that reads back with all four sheets and Thai text intact', async () => {
    const XLSX = await import('xlsx');
    const thai = { ...data, nodes: data.nodes.map((n) => (n.name === 'Task a' ? { ...n, detail: 'เตรียมเอกสาร' } : n)) };
    const wb = XLSX.read(await buildXlsx(thai, now), { type: 'array' });
    expect(wb.SheetNames).toEqual(['WBS', 'Tasks', 'Milestones', 'Time Logs']);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.WBS);
    expect(rows.find((r) => r.Name === 'Task a')?.Detail).toBe('เตรียมเอกสาร');
    expect(rows).toHaveLength(7);
  });
});
