import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import { InlineText } from '../../components/ui';

/** Popover for showing/hiding, adding, renaming and deleting columns. */
export function ColumnManager({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const columns = useAppStore((s) => s.columns);
  const { updateColumn, addColumn, deleteColumn } = useAppStore();
  const [label, setLabel] = useState('');
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  const add = () => {
    if (!label.trim()) return;
    addColumn(label.trim());
    setLabel('');
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        <p className="mb-2 text-xs text-slate-500">{t('wbs.dragHint')}</p>
        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
          {sorted.map((col) => (
            <li key={col.id} className="flex items-center gap-2 rounded px-1 hover:bg-slate-50">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={col.visible}
                onChange={() => updateColumn(col.id, { visible: !col.visible })}
              />
              <button
                type="button"
                title={col.pinned ? t('wbs.unpin') : t('wbs.pin')}
                className={col.pinned ? 'text-sky-600' : 'text-slate-300 hover:text-sky-600'}
                onClick={() => updateColumn(col.id, { pinned: !col.pinned })}
              >
                📌
              </button>
              {col.builtIn ? (
                <span className="flex-1 px-1.5 py-1 text-sm" title={t('wbs.builtInLocked')}>
                  {t(`col.${col.id}`)} <span className="text-xs text-slate-400">🔒</span>
                </span>
              ) : (
                <>
                  <InlineText value={col.label} onCommit={(v) => v.trim() && updateColumn(col.id, { label: v.trim() })} className="flex-1 text-sm" />
                  <button
                    className="rounded px-1.5 text-slate-400 hover:text-rose-600"
                    aria-label={t('wbs.delete')}
                    onClick={() => confirm(t('wbs.deleteColumnConfirm', { name: col.label })) && deleteColumn(col.id)}
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          <input
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-500"
            placeholder={t('wbs.columnName')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700" onClick={add}>
            {t('wbs.addColumn')}
          </button>
        </div>
      </div>
    </>
  );
}
