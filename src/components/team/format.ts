import type { TFunction } from 'i18next';
import { useAppStore } from '../../store/useAppStore';
import { CREATE, DELETED } from '../../team/model';
import { ONLINE_MS } from '../../team/teamStore';

const locale = (lang: string) => (lang === 'th' ? 'th-TH' : 'en-GB');

/** "11:42" today, otherwise "19 Oct 11:42". */
export function fmtWhen(iso: string | null | undefined, lang: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat(locale(lang), today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** "3 min ago" style. */
export function fmtAgo(iso: string, t: TFunction): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return t('team.justNow');
  if (min < 60) return t('team.minAgo', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('team.hourAgo', { n: h });
  return t('team.dayAgo', { n: Math.round(h / 24) });
}

export const isOnline = (beat: string | null) => !!beat && Date.now() - Date.parse(beat) < ONLINE_MS;

export function fieldLabel(f: string, t: TFunction): string {
  if (f === CREATE) return t('team.field.$create');
  if (f === DELETED) return t('team.field.$deleted');
  if (f.startsWith('custom.')) {
    const col = useAppStore.getState().columns.find((c) => c.id === f.slice(7));
    return col?.label || t('team.field.custom');
  }
  return t([`col.${f}`, `team.field.${f}`], { defaultValue: f });
}

const nodeName = (id: string) => useAppStore.getState().nodes.find((n) => n.id === id)?.name ?? id;

export function fmtValue(f: string, v: unknown, t: TFunction): string {
  if (f === CREATE) return t('team.created');
  if (f === DELETED) return v ? t('team.deleted') : t('team.restored');
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (f === 'progress') return `${v}%`;
  if (f === 'status') return t(`status.${v}`);
  if (f === 'kind') return t(`kind.${v}`);
  if (f === 'parentId') return nodeName(String(v));
  if (f === 'dependsOn') return Array.isArray(v) ? v.map((x) => nodeName(String(x))).join(', ') || '—' : '—';
  if (f === 'checklist') {
    if (!Array.isArray(v)) return '—';
    return v.map((i) => `${i?.done ? '☑' : '☐'} ${String(i?.text ?? '')}`).join(' · ') || '—';
  }
  if (f === 'timeLogs') return t('team.logs', { n: Array.isArray(v) ? v.length : 0 });
  if (typeof v === 'object' && f !== 'eisenhower') return '…';
  if (f === 'eisenhower') {
    const e = v as { important: boolean | null; urgent: boolean | null };
    const ax = (x: boolean | null) => (x === null ? t('team.auto') : x ? '✓' : '✗');
    return `${t('team.important')} ${ax(e.important)} · ${t('team.urgent')} ${ax(e.urgent)}`;
  }
  if (f.endsWith('Hrs') && typeof v === 'number') return `${v} h`;
  return String(v);
}
