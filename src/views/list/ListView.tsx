import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { todayIso } from '../../domain/calc';
import { completedIds } from '../../domain/completion';
import {
  activeCount,
  emptyFilter,
  isOverdue,
  matches,
  nextSort,
  sortRows,
  type DateRange,
  type ListFilter,
  type NumRange,
  type SortKey,
  type SortState,
} from '../../domain/listFilter';
import { PROGRESS_STEPS, RANKS, STATUSES } from '../../domain/types';
import { useComputed, useLeafTasks, useNow } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import { ActualLeadtimeCell, cx, fmtDate, PlanLeadtimeCell, ProgressBar, RankBadge, StatusBadge, ViewTitle } from '../../components/ui';
import { Chips, DateRangeInput, Field, NumRangeInput } from '../../components/filters';

/** Which filter fields belong to which column (for the header "filtered" dot). */
const COLUMN_FILTERS: Partial<Record<SortKey, (f: ListFilter) => boolean>> = {
  name: (f) => !!f.text.trim() || f.projects.length > 0,
  status: (f) => f.statuses.length > 0,
  rank: (f) => f.ranks.length > 0,
  inCharge: (f) => f.inCharge.length > 0,
  planStart: (f) => !!(f.planStart.from || f.planStart.to),
  planEnd: (f) => !!(f.planEnd.from || f.planEnd.to) || f.overdueOnly,
  dueDate: (f) => !!(f.dueDate.from || f.dueDate.to),
  progress: (f) => f.progress.min !== null || f.progress.max !== null,
  leadtime: (f) => f.leadtime.min !== null || f.leadtime.max !== null,
  actualLeadtime: (f) => f.actualLeadtime.min !== null || f.actualLeadtime.max !== null,
};

/** Flat list of every task, with per-column filters, 3-state sorting and editable Leadtimes. */
export function ListView() {
  const { t } = useTranslation();
  const tasks = useLeafTasks();
  const nodes = useAppStore((s) => s.nodes);
  const hoursPerDay = useAppStore((s) => s.settings.hoursPerDay);
  const openTask = useAppStore((s) => s.openTask);
  const now = useNow(30_000);
  const computed = useComputed(now);
  const today = todayIso(now);
  const [filter, setFilter] = useState<ListFilter>(emptyFilter);
  const [sort, setSort] = useState<SortState>(null);
  const [showFilters, setShowFilters] = useState(false);
  const set = (patch: Partial<ListFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const rootOf = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return (id: string) => {
      let n = byId.get(id);
      while (n?.parentId) n = byId.get(n.parentId);
      return n?.id ?? id;
    };
  }, [nodes]);
  const projects = nodes.filter((n) => n.parentId === null);
  const people = useMemo(() => [...new Set(tasks.map((n) => n.inCharge.trim()))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))), [tasks]);

  const completed = useMemo(() => completedIds(nodes), [nodes]);
  const rows = sortRows(
    tasks.filter((n) => matches(n, filter, { computed: computed.get(n.id), rootId: rootOf(n.id), hoursPerDay, today, completed: completed.has(n.id) })),
    sort,
    (id) => computed.get(id),
  );
  const nActive = activeCount(filter);

  const header = (key: SortKey, label: string) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap border-b border-slate-300 bg-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900"
      title={t('list.sortHint')}
      onClick={() => setSort((s) => nextSort(s, key))}
    >
      {label}
      <span className="ml-1 inline-block w-3 text-emerald-700">{sort?.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
      {COLUMN_FILTERS[key]?.(filter) && <span className="ml-0.5 text-sky-600" title={t('list.filtered')}>●</span>}
    </th>
  );

  // Chips summarising the active filters, each removable on its own.
  const chips: { key: string; text: string; clear: () => void }[] = [];
  const range = (r: DateRange) => `${r.from ? fmtDate(r.from) : '…'} – ${r.to ? fmtDate(r.to) : '…'}`;
  const nums = (r: NumRange, unit: string) => `${r.min ?? '…'} – ${r.max ?? '…'}${unit}`;
  if (filter.text.trim()) chips.push({ key: 'text', text: `"${filter.text.trim()}"`, clear: () => set({ text: '' }) });
  if (filter.projects.length)
    chips.push({ key: 'projects', text: `${t('col.path')}: ${filter.projects.map((id) => projects.find((p) => p.id === id)?.name ?? '?').join(', ')}`, clear: () => set({ projects: [] }) });
  if (filter.statuses.length) chips.push({ key: 'status', text: `${t('col.status')}: ${filter.statuses.map((s) => t(`status.${s}`)).join(', ')}`, clear: () => set({ statuses: [] }) });
  if (filter.ranks.length) chips.push({ key: 'rank', text: `${t('col.rank')}: ${filter.ranks.map((r) => (r === 'none' ? '—' : r)).join(', ')}`, clear: () => set({ ranks: [] }) });
  if (filter.inCharge.length) chips.push({ key: 'who', text: `${t('col.inCharge')}: ${filter.inCharge.map((p) => p || t('list.nobody')).join(', ')}`, clear: () => set({ inCharge: [] }) });
  for (const k of ['planStart', 'planEnd', 'dueDate'] as const)
    if (filter[k].from || filter[k].to) chips.push({ key: k, text: `${t(`col.${k}`)}: ${range(filter[k])}`, clear: () => set({ [k]: { from: null, to: null } }) });
  if (filter.progress.min !== null || filter.progress.max !== null) chips.push({ key: 'progress', text: `${t('col.progress')}: ${nums(filter.progress, '%')}`, clear: () => set({ progress: { min: null, max: null } }) });
  for (const k of ['leadtime', 'actualLeadtime'] as const)
    if (filter[k].min !== null || filter[k].max !== null) chips.push({ key: k, text: `${t(`col.${k}`)}: ${nums(filter[k], ` ${t('list.days')}`)}`, clear: () => set({ [k]: { min: null, max: null } }) });
  if (filter.overdueOnly) chips.push({ key: 'overdue', text: t('list.overdueOnly'), clear: () => set({ overdueOnly: false }) });
  if (filter.hideCompleted) chips.push({ key: 'hideDone', text: t('complete.hide'), clear: () => set({ hideCompleted: false }) });

  return (
    <div>
      <ViewTitle
        navKey="list"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
              placeholder={t('list.search')}
              value={filter.text}
              onChange={(e) => set({ text: e.target.value })}
            />
            <button
              className={cx(
                'rounded-lg border px-3 py-1.5 text-sm font-medium',
                showFilters || nActive ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white hover:bg-slate-100',
              )}
              onClick={() => setShowFilters((v) => !v)}
            >
              ⚲ {t('list.filters')}
              {nActive > 0 && <span className="ml-1.5 rounded-full bg-sky-600 px-1.5 text-xs text-white">{nActive}</span>}
            </button>
            {sort && (
              <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100" onClick={() => setSort(null)}>
                {t('list.clearSort')} ✕
              </button>
            )}
            <span className="text-sm text-slate-500">{t('list.countOf', { n: rows.length, total: tasks.length })}</span>
          </div>
        }
      />

      {showFilters && (
        <section className="mb-4 grid gap-x-6 gap-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-3">
          <Field label={t('col.path')}>
            <Chips options={projects.map((p) => ({ value: p.id, label: p.name }))} selected={filter.projects} onChange={(v) => set({ projects: v })} />
          </Field>
          <Field label={t('col.status')}>
            <Chips options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} selected={filter.statuses} onChange={(v) => set({ statuses: v })} />
          </Field>
          <Field label={t('col.rank')}>
            <Chips options={[...RANKS.map((r) => ({ value: r, label: r })), { value: 'none' as const, label: '—' }]} selected={filter.ranks} onChange={(v) => set({ ranks: v })} />
          </Field>
          <Field label={t('col.inCharge')}>
            <Chips options={people.map((p) => ({ value: p, label: p || t('list.nobody') }))} selected={filter.inCharge} onChange={(v) => set({ inCharge: v })} />
          </Field>
          {(['planStart', 'planEnd', 'dueDate'] as const).map((k) => (
            <Field key={k} label={t(`col.${k}`)}>
              <DateRangeInput value={filter[k]} onChange={(v) => set({ [k]: v })} />
            </Field>
          ))}
          <Field label={`${t('col.progress')} (%)`}>
            <NumRangeInput value={filter.progress} onChange={(v) => set({ progress: v })} options={[...PROGRESS_STEPS]} />
          </Field>
          <Field label={`${t('col.leadtime')} (${t('list.days')})`}>
            <NumRangeInput value={filter.leadtime} onChange={(v) => set({ leadtime: v })} />
          </Field>
          <Field label={`${t('col.actualLeadtime')} (${t('list.days')})`}>
            <NumRangeInput value={filter.actualLeadtime} onChange={(v) => set({ actualLeadtime: v })} />
          </Field>
          <Field label={t('list.quick')}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-rose-600" checked={filter.overdueOnly} onChange={(e) => set({ overdueOnly: e.target.checked })} />
              {t('list.overdueOnly')}
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={filter.hideCompleted} onChange={(e) => set({ hideCompleted: e.target.checked })} />
              {t('complete.hideFilter')}
            </label>
          </Field>
          {/* Bottom-right of the panel: clear every filter at once */}
          <div className="flex items-end justify-end">
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:bg-white disabled:hover:text-slate-700"
              disabled={nActive === 0}
              onClick={() => setFilter(emptyFilter())}
            >
              ✕ {t('list.clearFilters')}
            </button>
          </div>
        </section>
      )}

      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 py-0.5 pl-2.5 pr-1 text-sky-800">
              {c.text}
              <button className="grid h-4 w-4 place-items-center rounded-full hover:bg-sky-200" aria-label={t('list.removeFilter')} onClick={c.clear}>
                ✕
              </button>
            </span>
          ))}
          <button className="ml-1 text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline" onClick={() => setFilter(emptyFilter())}>
            {t('list.clearAll')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {header('name', t('col.name'))}
              {header('status', t('col.status'))}
              {header('rank', t('col.rank'))}
              {header('inCharge', t('col.inCharge'))}
              {header('planStart', t('col.planStart'))}
              {header('planEnd', t('col.planEnd'))}
              {header('dueDate', t('col.dueDate'))}
              {header('progress', t('col.progress'))}
              {header('leadtime', t('col.leadtime'))}
              {header('actualLeadtime', t('col.actualLeadtime'))}
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const c = computed.get(n.id);
              const overdue = isOverdue(n, today);
              return (
                <tr key={n.id} className="border-b border-slate-100 hover:bg-emerald-50/40">
                  <td className="px-3 py-2">
                    <button className="text-left hover:underline" onClick={() => openTask(n.id)}>
                      <div className={cx('font-medium', n.status === 'done' && 'text-slate-400 line-through')}>{n.name}</div>
                      <div className="text-xs text-slate-500">{c?.path.join(' / ')}</div>
                    </button>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={n.status} /></td>
                  <td className="px-3 py-2"><RankBadge rank={n.rank} /></td>
                  <td className="px-3 py-2">{n.inCharge || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(n.planStart)}</td>
                  <td className={cx('whitespace-nowrap px-3 py-2', overdue && 'font-semibold text-rose-600')}>{fmtDate(n.planEnd)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(n.dueDate)}</td>
                  <td className="px-3 py-2"><ProgressBar value={n.progress} className="w-32" /></td>
                  <td className="px-3 py-2">
                    <PlanLeadtimeCell id={n.id} hours={c?.planHours ?? null} overridden={n.leadtimeOverrideHrs != null} />
                  </td>
                  <td className="px-3 py-2">
                    <ActualLeadtimeCell id={n.id} hours={c?.actualHours ?? 0} overridden={n.actualLeadtimeOverrideHrs !== null} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                  {nActive ? t('list.noMatch') : t('board.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
