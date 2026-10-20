/**
 * Turns untrusted records (imported backups, teammates' files) into well-formed
 * ones: wrong types fall back to defaults, unknown fields are dropped, and
 * records without an id are rejected — so bad data can't crash the app.
 */
import { defaultSettings, defaultToday, newId } from './factory';
import { RANKS, STATUSES, type ColumnDef, type Milestone, type Settings, type TodayData, type WbsNode } from './types';

type Rec = Record<string, unknown>;

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** Object keys that are safe to assign (no prototype tricks). */
export const safeKey = (k: string) => !BAD_KEYS.has(k);

const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : d);
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const isoTime = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const boolOrNull = (v: unknown) => (typeof v === 'boolean' ? v : null);
const oneOf = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown) => arr(v).filter((x): x is string => typeof x === 'string');

export function sanitizeNode(raw: unknown): WbsNode | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const e = raw.eisenhower;
  const custom: Record<string, string> = {};
  if (isObj(raw.custom)) for (const [k, v] of Object.entries(raw.custom)) if (safeKey(k) && v !== null && v !== undefined) custom[k] = str(v);
  return {
    id: raw.id,
    parentId: strOrNull(raw.parentId),
    kind: oneOf(raw.kind, ['project', 'group', 'task'] as const, 'task'),
    name: str(raw.name),
    order: num(raw.order, 0),
    collapsed: raw.collapsed === true,
    detail: str(raw.detail),
    planStart: isoDate(raw.planStart),
    planEnd: isoDate(raw.planEnd),
    actualStart: isoDate(raw.actualStart),
    actualEnd: isoDate(raw.actualEnd),
    dueDate: isoDate(raw.dueDate),
    rank: oneOf(raw.rank, [...RANKS, null], null),
    inCharge: str(raw.inCharge),
    remark: str(raw.remark),
    progress: Math.min(100, Math.max(0, num(raw.progress, 0))),
    status: oneOf(raw.status, STATUSES, 'queue'),
    eisenhower: isObj(e) ? { important: boolOrNull(e.important), urgent: boolOrNull(e.urgent) } : null,
    todayDate: isoDate(raw.todayDate),
    checklist: arr(raw.checklist)
      .filter(isObj)
      .map((i) => ({ id: str(i.id) || newId('cl'), text: str(i.text), done: i.done === true })),
    timeLogs: arr(raw.timeLogs)
      .filter(isObj)
      .filter((l) => isoTime(l.start))
      .map((l) => ({ start: l.start as string, end: isoTime(l.end) })),
    dependsOn: strings(raw.dependsOn),
    leadtimeOverrideHrs: numOrNull(raw.leadtimeOverrideHrs),
    actualLeadtimeOverrideHrs: numOrNull(raw.actualLeadtimeOverrideHrs),
    custom,
  };
}

export function sanitizeMilestone(raw: unknown): Milestone | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.projectId !== 'string') return null;
  const date = isoDate(raw.date);
  if (!date) return null;
  return { id: raw.id, projectId: raw.projectId, name: str(raw.name), date, done: raw.done === true };
}

export function sanitizeColumn(raw: unknown): ColumnDef | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || !safeKey(raw.id)) return null;
  const col: ColumnDef = { id: raw.id, builtIn: raw.builtIn === true, label: str(raw.label), visible: raw.visible !== false, order: num(raw.order, 0) };
  if (raw.pinned === true) col.pinned = true;
  const width = numOrNull(raw.width);
  if (width !== null && width > 0) col.width = width;
  return col;
}

/** Personal settings from an imported backup: keep only well-typed values. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  return {
    hoursPerDay: Math.min(24, Math.max(1, num(raw.hoursPerDay, d.hoursPerDay))),
    workDays: (() => {
      const days = arr(raw.workDays).filter((x): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6);
      return days.length ? days : d.workDays;
    })(),
    lang: oneOf(raw.lang, ['th', 'en'] as const, d.lang),
    urgentDays: num(raw.urgentDays, d.urgentDays),
    urgencyBufferPct: num(raw.urgencyBufferPct, d.urgencyBufferPct),
    ganttScale: oneOf(raw.ganttScale, ['day', 'week', 'month', 'quarter', 'year'] as const, d.ganttScale),
    hideCompleted: raw.hideCompleted === true,
    wbsNameWidth: num(raw.wbsNameWidth, d.wbsNameWidth),
    theme: oneOf(raw.theme, ['system', 'light', 'dark'] as const, d.theme),
    navOrder: strings(raw.navOrder),
    teamName: str(raw.teamName),
    lastBackupAt: isoTime(raw.lastBackupAt),
    firstUsedAt: isoTime(raw.firstUsedAt),
    backupSnoozeUntil: isoTime(raw.backupSnoozeUntil),
  };
}

export function sanitizeToday(raw: unknown): TodayData {
  const d = defaultToday();
  if (!isObj(raw)) return d;
  const dayMap = (v: unknown) => {
    const out: Record<string, string[]> = {};
    if (isObj(v)) for (const [k, ids] of Object.entries(v)) if (isoDate(k)) out[k] = strings(ids);
    return out;
  };
  return {
    highlights: dayMap(raw.highlights),
    routineDone: dayMap(raw.routineDone),
    routines: arr(raw.routines)
      .filter(isObj)
      .filter((r) => typeof r.id === 'string')
      .map((r) => {
        const rep = r.repeat;
        const repeat =
          isObj(rep) && rep.kind === 'weekly'
            ? { kind: 'weekly' as const, days: arr(rep.days).filter((x): x is number => Number.isInteger(x)) }
            : isObj(rep) && rep.kind === 'monthly'
              ? { kind: 'monthly' as const, day: num(rep.day, 1) }
              : isObj(rep) && rep.kind === 'daily'
                ? { kind: 'daily' as const }
                : undefined;
        const times = strings(r.times).filter((x) => /^\d{2}:\d{2}$/.test(x));
        return { id: r.id as string, text: str(r.text), ...(repeat ? { repeat } : {}), ...(times.length ? { times } : {}) };
      }),
  };
}

/** Text that a spreadsheet app would run as a formula gets a leading ' so it stays plain text. */
export function csvSafe(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
