import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WbsNode } from '../domain/types';
import { useAppStore } from '../store/useAppStore';
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { toIsoDate } from '../domain/calc';
import { knownPeople } from '../domain/people';
import { Chips, DateRangeInput, Field } from './filters';
import { cx } from './ui';

/** ✓ button: mark a task / group / project complete, or reopen it. */
export function CompleteToggle({ node, className }: { node: WbsNode; className?: string }) {
  const { t } = useTranslation();
  const setCompleted = useAppStore((s) => s.setCompleted);
  const done = node.status === 'done';
  return (
    <button
      type="button"
      title={done ? t('complete.reopen') : t('complete.mark', { kind: t(`kind.${node.kind}`) })}
      aria-label={done ? t('complete.reopen') : t('complete.mark', { kind: t(`kind.${node.kind}`) })}
      className={cx(
        'grid h-6 w-6 shrink-0 place-items-center rounded text-sm',
        done ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-700',
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setCompleted(node.id, !done)}
    >
      ✓
    </button>
  );
}

/** Header switch shared by WBS and Gantt: show or hide completed items. */
export function HideCompletedToggle() {
  const { t } = useTranslation();
  const hide = useAppStore((s) => s.settings.hideCompleted);
  const updateSettings = useAppStore((s) => s.updateSettings);
  return (
    <button
      type="button"
      className={cx(
        'shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium',
        hide ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white hover:bg-slate-100',
      )}
      onClick={() => updateSettings({ hideCompleted: !hide })}
    >
      {hide ? `👁 ${t('complete.show')}` : `✓ ${t('complete.hide')}`}
    </button>
  );
}

/** Collapse or expand every project / group (WBS and Gantt). */
export function CollapseAllButtons() {
  const { t } = useTranslation();
  const collapseAll = useAppStore((s) => s.collapseAll);
  const cls = 'border-l border-slate-300 px-2.5 py-1.5 text-sm font-medium first:border-l-0 hover:bg-slate-100';
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white">
      <button type="button" className={cls} title={t('wbs.collapseAllHint')} onClick={() => collapseAll(true)}>
        ⊟ {t('wbs.collapseAll')}
      </button>
      <button type="button" className={cls} title={t('wbs.expandAllHint')} onClick={() => collapseAll(false)}>
        ⊞ {t('wbs.expandAll')}
      </button>
    </div>
  );
}

/** ⊘ / button: mark a task as not ours (done at 100%), or remove the mark. */
export function NotRelevantToggle({ node, wide }: { node: WbsNode; wide?: boolean }) {
  const { t } = useTranslation();
  const setNotRelevant = useAppStore((s) => s.setNotRelevant);
  const on = !!node.notRelevant;
  const hint = t(on ? 'complete.notRelevantUndo' : 'complete.notRelevantHint');
  return (
    <button
      type="button"
      title={hint}
      aria-label={hint}
      className={cx(
        wide ? 'rounded-lg border px-3 py-1.5 text-sm' : 'grid h-6 w-6 shrink-0 place-items-center rounded text-sm',
        on ? 'border-slate-400 bg-slate-200 text-slate-700' : wide ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700',
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setNotRelevant(node.id, !on)}
    >
      ⊘{wide && ` ${t(on ? 'complete.notRelevantUndo' : 'complete.notRelevant')}`}
    </button>
  );
}

/** WBS / Gantt filter: people and a Due Date range (Plan End when there is no Due Date); remembered. */
export function RowFilter() {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const selected = useAppStore((s) => s.settings.inChargeFilter);
  const due = useAppStore((s) => s.settings.dueFilter);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [open, setOpen] = useState(false);
  const people = useMemo(() => [...new Set([...knownPeople(nodes), ...selected.filter(Boolean)])].sort((a, b) => a.localeCompare(b)).concat(''), [nodes, selected]);
  const count = (selected.length ? 1 : 0) + (due.from || due.to ? 1 : 0);
  const today = new Date();
  const preset = (from: Date, to: Date) => updateSettings({ dueFilter: { ...due, from: toIsoDate(from), to: toIsoDate(to) } });
  const chip = 'rounded-full border border-slate-300 px-2.5 py-0.5 text-xs hover:border-slate-400';
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className={cx('rounded-lg border px-3 py-1.5 text-sm font-medium', count ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white hover:bg-slate-100')}
        onClick={() => setOpen((v) => !v)}
      >
        ⚲ {t('list.filters')}
        {count > 0 && ` (${count})`}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 space-y-4 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <Field label={t('col.inCharge')}>
              <Chips
                options={people.map((p) => ({ value: p, label: p || t('list.nobody') }))}
                selected={selected}
                onChange={(v) => updateSettings({ inChargeFilter: v })}
              />
            </Field>
            <Field label={t('filter.dueRange')}>
              <DateRangeInput value={due} onChange={(v) => updateSettings({ dueFilter: { ...due, from: v.from, to: v.to } })} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={chip} onClick={() => preset(startOfWeek(today, { weekStartsOn: 6 }), endOfWeek(today, { weekStartsOn: 6 }))}>
                  {t('filter.thisWeek')}
                </button>
                <button type="button" className={chip} onClick={() => preset(startOfMonth(today), endOfMonth(today))}>
                  {t('filter.thisMonth')}
                </button>
                <button type="button" className={chip} onClick={() => preset(today, addDays(today, 30))}>
                  {t('filter.next30')}
                </button>
                <button type="button" className={chip} onClick={() => preset(addDays(today, -30), addDays(today, 60))}>
                  {t('filter.recent')}
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-600"
                  checked={due.includeUndated}
                  onChange={(e) => updateSettings({ dueFilter: { ...due, includeUndated: e.target.checked } })}
                />
                {t('filter.undated')}
              </label>
            </Field>
            {count > 0 && (
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-rose-600 hover:underline"
                onClick={() => updateSettings({ inChargeFilter: [], dueFilter: { from: null, to: null, includeUndated: true } })}
              >
                ✕ {t('list.clearFilters')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
