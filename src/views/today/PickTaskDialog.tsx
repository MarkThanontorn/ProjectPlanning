import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { comparePriority, placement } from '../../domain/eisenhower';
import { useComputed, useLeafTasks, useNow } from '../../hooks';
import { MAX_HIGHLIGHTS, useAppStore } from '../../store/useAppStore';
import { useDaysLeftLabel } from '../../components/EisenhowerControls';
import { cx, RankBadge } from '../../components/ui';

/**
 * Lists open tasks in priority order (urgent inserts, Rank, nearest Plan End)
 * to add to a day's list or to its highlights.
 */
export function PickTaskDialog({ date, mode, onClose }: { date: string; mode: 'today' | 'highlight'; onClose: () => void }) {
  const { t } = useTranslation();
  const tasks = useLeafTasks();
  const settings = useAppStore((s) => s.settings);
  const highlights = useAppStore((s) => s.today.highlights[date] ?? []);
  const { setTaskDay, toggleHighlight } = useAppStore();
  const computed = useComputed(useNow(60_000));
  const daysLabel = useDaysLeftLabel();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const options = tasks
    .filter((n) => n.status !== 'done')
    .filter((n) => !q || [n.name, n.detail, n.inCharge, ...(computed.get(n.id)?.path ?? [])].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => comparePriority(a, b, settings, date));
  const full = highlights.length >= MAX_HIGHLIGHTS;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{mode === 'highlight' ? `☆ ${t('today.pickHighlight')}` : t('today.pickTitle')}</h2>
          <button className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label={t('detail.close')}>
            ✕
          </button>
        </div>
        <input
          autoFocus
          className="mb-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
          placeholder={t('board.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>{t('today.suggested')}</span>
          <span className="italic text-emerald-700">{t('today.strategy')}</span>
        </p>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {options.map((n) => {
            const selected = mode === 'highlight' ? highlights.includes(n.id) : n.todayDate === date;
            const disabled = mode === 'highlight' && !selected && full;
            const p = placement(n, settings, date);
            const label = daysLabel(p.daysLeft);
            return (
              <li key={n.id}>
                <button
                  disabled={disabled}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left disabled:opacity-40',
                    selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50',
                  )}
                  onClick={() => (mode === 'highlight' ? toggleHighlight(n.id, date) : setTaskDay(n.id, selected ? null : date))}
                >
                  <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded border text-xs', selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300')}>
                    {selected && '✓'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{n.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {computed.get(n.id)?.path.join(' / ')}
                      {label && (
                        <span className={cx(p.daysLeft! < 0 ? 'text-rose-600' : p.urgent ? 'text-amber-700' : '')}> · {label}</span>
                      )}
                    </span>
                  </span>
                  {n.eisenhower?.urgent === true && <span className="text-xs text-rose-600">⚡</span>}
                  <RankBadge rank={n.rank} />
                </button>
              </li>
            );
          })}
          {options.length === 0 && <li className="py-6 text-center text-sm text-slate-400">{t('board.empty')}</li>}
        </ul>
        <button className="mt-3 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700" onClick={onClose}>
          {t('detail.close')}
        </button>
      </div>
    </div>
  );
}
