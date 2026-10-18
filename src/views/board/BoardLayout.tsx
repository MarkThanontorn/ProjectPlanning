import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { todayIso } from '../../domain/calc';
import { placement } from '../../domain/eisenhower';
import { RANKS, STATUSES, WIP_LIMIT, type Status, type WbsNode } from '../../domain/types';
import { activeCount, emptyFilter, matches, type ListFilter } from '../../domain/listFilter';
import { completedIds } from '../../domain/completion';
import { Chips, DateRangeInput, Field } from '../../components/filters';
import { useComputed, useLeafTasks, useNow } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import { MiniCard } from '../../components/TaskCard';
import { cx, FocusWarning, ViewTitle } from '../../components/ui';
import { Draggable, DropZone } from './dnd';
import { TodayColumn } from './TodayColumn';

export { Draggable, DropZone };

const COLLAPSE_KEY = 'pp.board.allCollapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Layout shared by both boards: "All" list | day column | right panel.
 * Handles every drop and maps it to a store action.
 */
export function BoardLayout({ navKey, children }: { navKey: 'matrix' | 'status'; children: ReactNode }) {
  const { t } = useTranslation();
  const tasks = useLeafTasks();
  const { setTaskDay, setEisenhower, setStatus, setBoardDay } = useAppStore();
  const settings = useAppStore((s) => s.settings);
  const now = useNow(60_000);
  const computed = useComputed(now);
  const today = todayIso(now);
  // The day shown in the day column (shared by both boards; resets to today on reload).
  const day = useAppStore((s) => s.boardDay) ?? today;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ListFilter>(emptyFilter);
  const [notOnDay, setNotOnDay] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const nodes = useAppStore((s) => s.nodes);
  const completed = useMemo(() => completedIds(nodes), [nodes]);
  const rootOf = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return (id: string) => {
      let n = byId.get(id);
      while (n?.parentId) n = byId.get(n.parentId);
      return n?.id ?? id;
    };
  }, [nodes]);
  const [active, setActive] = useState<WbsNode | null>(null);
  const [allCollapsed, setAllCollapsed] = useState(readCollapsed);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggleAll = () => {
    setAllCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1');
      } catch {
        // Storage unavailable: the choice just isn't remembered.
      }
      return !v;
    });
  };

  // "All" list: open tasks, narrowed by the search box and the filter popover.
  const fullFilter = { ...filter, text: query };
  const allTasks = tasks.filter(
    (n) =>
      (showCompleted || !completed.has(n.id)) &&
      (!notOnDay || n.todayDate !== day) &&
      matches(n, fullFilter, { computed: computed.get(n.id), rootId: rootOf(n.id), hoursPerDay: settings.hoursPerDay, today }),
  );
  const nFilters = activeCount(filter) + (notOnDay ? 1 : 0) + (showCompleted ? 1 : 0);
  const openTotal = tasks.filter((n) => showCompleted || !completed.has(n.id)).length;
  const people = [...new Set(tasks.map((n) => n.inCharge.trim()))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  const projects = nodes.filter((n) => n.parentId === null);
  const setF = (patch: Partial<ListFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const inProgress = tasks.filter((n) => n.status === 'in_progress').length;

  const onDragStart = (e: DragStartEvent) => setActive(tasks.find((n) => n.id === e.active.data.current?.taskId) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const taskId = e.active.data.current?.taskId as string | undefined;
    const from = e.active.data.current?.zone as string;
    const to = e.over?.id ? String(e.over.id) : null;
    if (!taskId || !to || to === from) return;

    if (to === 'today') setTaskDay(taskId, day);
    else if (to === 'all') {
      if (from === 'today') setTaskDay(taskId, null);
      if (from.startsWith('q:')) setEisenhower(taskId, null);
    } else if (to.startsWith('q:')) {
      const [, imp, urg] = to.split(':');
      const node = tasks.find((n) => n.id === taskId);
      if (!node) return;
      // Pin only the axes that differ from the automatic placement.
      const auto = placement({ ...node, eisenhower: null }, settings, today);
      const important = imp === '1' === auto.important ? null : imp === '1';
      const urgent = urg === '1' === auto.urgent ? null : urg === '1';
      setEisenhower(taskId, important === null && urgent === null ? null : { important, urgent });
    } else if (to.startsWith('st:')) setStatus(taskId, to.slice(3) as Status);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      {/* Fills the viewport; every column scrolls on its own. */}
      <div className="flex h-[calc(100vh-3rem)] flex-col">
        <ViewTitle navKey={navKey} className="shrink-0" aside={<FocusWarning kind="wip" count={inProgress} limit={WIP_LIMIT} />} />
        <div className={cx('grid min-h-0 flex-1 gap-4', allCollapsed ? 'grid-cols-[2.75rem_22rem_minmax(0,1fr)]' : 'grid-cols-[14rem_22rem_minmax(0,1fr)]')}>
          {allCollapsed ? (
            <DropZone id="all" className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-3">
              <button className="mb-3 grid h-7 w-7 place-items-center rounded hover:bg-slate-100" title={t('board.expandAll')} onClick={toggleAll}>
                »
              </button>
              <span className="text-xs font-semibold text-slate-500 [writing-mode:vertical-rl]">
                {t('board.all')} ({allTasks.length})
              </span>
            </DropZone>
          ) : (
            <DropZone id="all" className="flex flex-col rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t('board.all')}</h2>
                <button className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100" title={t('board.collapseAll')} onClick={toggleAll}>
                  «
                </button>
              </div>
              <div className="relative mb-3">
                <div className="flex gap-1">
                  <input
                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-500"
                    placeholder={t('board.search')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button
                    className={cx(
                      'shrink-0 rounded border px-2 text-sm',
                      nFilters || showFilter ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-slate-300 hover:bg-slate-100',
                    )}
                    title={t('list.filters')}
                    onClick={() => setShowFilter((v) => !v)}
                  >
                    ⚲{nFilters > 0 && <span className="ml-0.5 text-xs font-semibold">{nFilters}</span>}
                  </button>
                </div>
                {(nFilters > 0 || query) && (
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{t('list.countOf', { n: allTasks.length, total: openTotal })}</span>
                    <button
                      className="hover:text-rose-600 hover:underline"
                      onClick={() => {
                        setFilter(emptyFilter());
                        setNotOnDay(false);
                        setShowCompleted(false);
                        setQuery('');
                      }}
                    >
                      ✕ {t('list.clearFilters')}
                    </button>
                  </div>
                )}
                {showFilter && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowFilter(false)} />
                    <div className="absolute left-0 top-full z-40 mt-1 max-h-[70vh] w-80 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                      <Field label={t('col.path')}>
                        <Chips options={projects.map((p) => ({ value: p.id, label: p.name }))} selected={filter.projects} onChange={(v) => setF({ projects: v })} />
                      </Field>
                      <Field label={t('col.status')}>
                        <Chips
                          options={STATUSES.filter((s) => s !== 'done').map((s) => ({ value: s, label: t(`status.${s}`) }))}
                          selected={filter.statuses}
                          onChange={(v) => setF({ statuses: v })}
                        />
                      </Field>
                      <Field label={t('col.rank')}>
                        <Chips options={[...RANKS.map((r) => ({ value: r, label: r })), { value: 'none' as const, label: '—' }]} selected={filter.ranks} onChange={(v) => setF({ ranks: v })} />
                      </Field>
                      <Field label={t('col.inCharge')}>
                        <Chips options={people.map((p) => ({ value: p, label: p || t('list.nobody') }))} selected={filter.inCharge} onChange={(v) => setF({ inCharge: v })} />
                      </Field>
                      <Field label={t('col.planEnd')}>
                        <DateRangeInput value={filter.planEnd} onChange={(v) => setF({ planEnd: v })} />
                      </Field>
                      <Field label={t('list.quick')}>
                        <div className="space-y-1 text-sm">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={notOnDay} onChange={(e) => setNotOnDay(e.target.checked)} />
                            {t('board.notOnDay')}
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 accent-rose-600" checked={filter.overdueOnly} onChange={(e) => setF({ overdueOnly: e.target.checked })} />
                            {t('list.overdueOnly')}
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
                            {t('complete.showFilter')}
                          </label>
                        </div>
                      </Field>
                    </div>
                  </>
                )}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {allTasks.map((n) => (
                  <Draggable key={n.id} zone="all" taskId={n.id}>
                    <MiniCard node={n} computed={computed.get(n.id)} />
                  </Draggable>
                ))}
                {allTasks.length === 0 && <p className="text-sm text-slate-400">{t('board.empty')}</p>}
              </div>
            </DropZone>
          )}

          <TodayColumn date={day} onDateChange={(d) => setBoardDay(d === today ? null : d)} computed={computed} />

          <div className="min-h-0 min-w-0">{children}</div>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="w-64 rotate-2 opacity-90">
            <MiniCard node={active} computed={computed.get(active.id)} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
