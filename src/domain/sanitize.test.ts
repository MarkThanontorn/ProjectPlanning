import { describe, expect, it } from 'vitest';
import { toCsv } from '../data/exportData';
import { createNode, defaultColumns, defaultSettings, defaultToday } from './factory';
import { normalizeData } from './normalize';
import { csvSafe, sanitizeNode } from './sanitize';
import { TeamClient } from '../team/client';
import type { AppData } from './types';

describe('untrusted data', () => {
  it('repairs wrong types and rejects records without an id', () => {
    const n = sanitizeNode({ id: 'x', name: { evil: 1 }, progress: 900, status: 'hacked', checklist: 'nope', timeLogs: [{ start: 'bad' }], custom: { __proto__: 'x', c1: 5 } });
    expect(n).toMatchObject({ name: '', progress: 100, status: 'queue', checklist: [], timeLogs: [], custom: { c1: '5' } });
    expect(Object.getPrototypeOf(n!.custom)).toBe(Object.prototype);
    expect(sanitizeNode({ name: 'no id' })).toBeNull();
  });

  it('a broken backup imports without crashing', () => {
    const bad = { nodes: [{ id: 'a', kind: 'task', name: 'ok' }, null, 'junk'], columns: [{ id: '__proto__' }], settings: { workDays: 'x', theme: 'neon' }, today: 5, milestones: [{ id: 'm' }] } as unknown as AppData;
    const d = normalizeData(bad);
    expect(d.nodes.map((n) => n.name)).toEqual(['ok']);
    expect(d.milestones).toEqual([]);
    expect(d.settings.workDays).toEqual(defaultSettings().workDays);
    expect(d.settings.theme).toBe('system');
    expect(d.today).toEqual(defaultToday());
  });

  it('CSV cells cannot become spreadsheet formulas', () => {
    expect(csvSafe('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(csvSafe('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csvSafe('normal')).toBe('normal');
    expect(toCsv([{ name: '+cmd', n: -5 }])).toContain(`'+cmd,-5`);
  });

  it('ignores malformed or impersonating ops in a teammate file', () => {
    const a = new TeamClient({ id: 'userA', name: 'A' });
    a.seed({ nodes: [{ ...createNode('task', null, 'T', 0), id: 't1' }], milestones: [], columns: defaultColumns() });
    const evil = {
      format: 'pp-team/1' as const,
      userId: 'userB',
      name: 'B',
      savedAt: new Date().toISOString(),
      ops: [
        { id: 'b1', by: 'userA', at: new Date().toISOString(), t: 'node', e: 't1', f: 'name', v: 'pretending to be A', seen: [] },
        { id: 'b2', by: 'userB', at: 'not a date', t: 'node', e: 't1', f: 'name', v: 'x', seen: [] },
        { id: 'b3', by: 'userB', at: new Date().toISOString(), t: 'node', e: 't1', f: '__proto__', v: { polluted: true }, seen: [] },
        { id: 'b4', by: 'userB', at: new Date().toISOString(), t: 'node', e: 't1', f: 'timeLogs', v: 42, seen: [] },
        { id: 'b5', by: 'userB', at: new Date().toISOString(), t: 'node', e: 't1', f: 'name', v: { not: 'text' }, seen: [] },
        null,
      ],
    };
    a.setOthers([evil as never]);
    const t1 = a.mat.data.nodes.find((n) => n.id === 't1')!;
    expect(t1.name).toBe(''); // the object value is cleaned to text, not rendered as an object
    expect(t1.timeLogs).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(a.allOps().some((o) => o.id === 'b1' || o.id === 'b3')).toBe(false);
  });
});
