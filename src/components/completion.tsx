import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WbsNode } from '../domain/types';
import { useAppStore } from '../store/useAppStore';
import { Chips } from './filters';
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

/** Show only some people's tasks in WBS and Gantt; remembered. */
export function InChargeFilter() {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const selected = useAppStore((s) => s.settings.inChargeFilter);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [open, setOpen] = useState(false);
  const people = useMemo(() => {
    const names = new Set([...nodes.filter((n) => n.kind === 'task').map((n) => n.inCharge.trim()), ...selected]);
    return [...names].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [nodes, selected]);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className={cx(
          'rounded-lg border px-3 py-1.5 text-sm font-medium',
          selected.length ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white hover:bg-slate-100',
        )}
        onClick={() => setOpen((v) => !v)}
      >
        👤 {t('col.inCharge')}
        {selected.length > 0 && ` (${selected.length})`}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <Chips
              options={people.map((p) => ({ value: p, label: p || t('list.nobody') }))}
              selected={selected}
              onChange={(v) => updateSettings({ inChargeFilter: v })}
            />
            {selected.length > 0 && (
              <button type="button" className="mt-2 text-xs text-slate-500 hover:text-rose-600 hover:underline" onClick={() => updateSettings({ inChargeFilter: [] })}>
                ✕ {t('list.clearFilters')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
