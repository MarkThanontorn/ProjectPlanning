import { useTranslation } from 'react-i18next';
import type { WbsNode } from '../domain/types';
import { useAppStore } from '../store/useAppStore';
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
