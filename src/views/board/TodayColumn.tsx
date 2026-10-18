import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import { formatDuration, hoursOnDate, isRunning, shiftIsoDate, todayIso } from '../../domain/calc';
import { comparePriority, placement } from '../../domain/eisenhower';
import { blockers } from '../../domain/deps';
import { WIP_LIMIT, type Computed, type WbsNode } from '../../domain/types';
import { useLeafTasks, useNow } from '../../hooks';
import { MAX_HIGHLIGHTS, useAppStore } from '../../store/useAppStore';
import { TaskCard, taskTitle } from '../../components/TaskCard';
import { useDaysLeftLabel } from '../../components/EisenhowerControls';
import { cx, FocusWarning, RankBadge } from '../../components/ui';
import { PickTaskDialog } from '../today/PickTaskDialog';
import { routineDueOn } from '../../domain/routine';
import { Routines } from './Routines';
import { Draggable, DropZone } from './dnd';

/**
 * The board's day column — the single place for "what I do today":
 * day picker, summary, focus warning, highlights (full cards), the rest of the
 * day's tasks (compact rows), task picker, routines, done list and a reminder.
 */
export function TodayColumn({ date, onDateChange, computed }: { date: string; onDateChange: (d: string) => void; computed: Map<string, Computed> }) {
  const { t, i18n } = useTranslation();
  const now = useNow(1000);
  const realToday = todayIso(now);
  const tasks = useLeafTasks();
  const nodes = useAppStore((s) => s.nodes);
  const settings = useAppStore((s) => s.settings);
  const todayData = useAppStore((s) => s.today);
  const { setTaskDay, toggleHighlight } = useAppStore();
  const [picker, setPicker] = useState<'today' | 'highlight' | null>(null);

  const highlightIds = todayData.highlights[date] ?? [];
  const onDay = useMemo(() => {
    const list = tasks.filter((n) => n.todayDate === date);
    const open = list.filter((n) => n.status !== 'done').sort((a, b) => comparePriority(a, b, settings, date));
    return [...open, ...list.filter((n) => n.status === 'done')];
  }, [tasks, date, settings]);
  const highlights = highlightIds.map((id) => onDay.find((n) => n.id === id)).filter((n): n is WbsNode => !!n);
  // Full cards: highlights + whatever is being timed right now. Everything else is a compact row.
  const bigCards = [...highlights, ...onDay.filter((n) => isRunning(n) && !highlightIds.includes(n.id))];
  const rows = onDay.filter((n) => !bigCards.includes(n));
  const openCount = onDay.filter((n) => n.status !== 'done').length;
  const doneCount = onDay.length - openCount;
  const hours = nodes.reduce((s, n) => s + hoursOnDate(n.timeLogs, date, now), 0);
  const doneOnDay = tasks.filter((n) => n.status === 'done' && n.actualEnd === date);
  const routineDone = new Set(todayData.routineDone[date] ?? []);
  const dueRoutines = todayData.routines.filter((r) => routineDueOn(r, date));

  const isToday = date === realToday;
  const dayLabel = new Intl.DateTimeFormat(i18n.language === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(parseISO(date));

  return (
    <DropZone id="today" className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Header: which day + navigation */}
      <div className="shrink-0 border-b border-slate-100 px-3 pb-2 pt-3">
        <div className="flex items-center gap-1">
          <h2 className="flex-1 truncate text-lg font-semibold">
            {isToday ? t('board.today') : t('today.planDay')} <span className="text-sm font-normal text-slate-500">· {dayLabel}</span>
          </h2>
          <button className="grid h-7 w-7 place-items-center rounded hover:bg-slate-100" onClick={() => onDateChange(shiftIsoDate(date, -1))} aria-label={t('today.prevDay')}>
            ‹
          </button>
          {!isToday && (
            <button className="rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50" onClick={() => onDateChange(realToday)}>
              {t('today.goToday')}
            </button>
          )}
          <button className="grid h-7 w-7 place-items-center rounded hover:bg-slate-100" onClick={() => onDateChange(shiftIsoDate(date, 1))} aria-label={t('today.nextDay')}>
            ›
          </button>
        </div>
        <div className="text-xs text-slate-500">
          ✓ {t('today.summaryTasks', { done: doneCount, total: onDay.length })} · ⏱ {formatDuration(hours).slice(0, -3)} {t('today.hrs')}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3">
        <FocusWarning count={openCount} limit={WIP_LIMIT} />

        {/* Highlights + running task: full cards */}
        {bigCards.map((n) => {
          const starred = highlightIds.includes(n.id);
          return (
            <div key={n.id} className="group relative">
              <Draggable zone="today" taskId={n.id}>
                <div className={cx(starred && 'rounded-lg ring-2 ring-amber-300')}>
                  <TaskCard node={n} computed={computed.get(n.id)} />
                </div>
              </Draggable>
              <div className="absolute right-1.5 top-1.5 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                <button
                  className={cx('grid h-6 w-6 place-items-center rounded-full border bg-white text-xs shadow', starred ? 'border-amber-300 text-amber-500' : 'hidden border-slate-300 text-slate-400 hover:text-amber-500 group-hover:grid')}
                  title={starred ? t('today.unstar') : t('today.star')}
                  onClick={() => toggleHighlight(n.id, date)}
                >
                  {starred ? '★' : '☆'}
                </button>
                <button
                  className="hidden h-6 w-6 place-items-center rounded-full border border-slate-300 bg-white text-xs text-slate-500 shadow hover:text-rose-600 group-hover:grid"
                  title={t('board.removeToday')}
                  onClick={() => setTaskDay(n.id, null)}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {highlights.length < MAX_HIGHLIGHTS && onDay.some((n) => n.status !== 'done') && (
          <button
            className="w-full rounded-lg border-2 border-dashed border-amber-200 py-1.5 text-xs text-amber-700/80 hover:border-amber-400 hover:bg-amber-50"
            onClick={() => setPicker('highlight')}
          >
            ☆ {t('today.pickHighlight')} ({highlights.length}/{MAX_HIGHLIGHTS})
          </button>
        )}

        {/* Other tasks of the day: compact rows */}
        {rows.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rows.map((n) => (
              <li key={n.id}>
                <Draggable zone="today" taskId={n.id}>
                  <TodayRow node={n} date={date} computed={computed.get(n.id)} canStar={highlights.length < MAX_HIGHLIGHTS} />
                </Draggable>
              </li>
            ))}
          </ul>
        )}

        {onDay.length === 0 && <p className="rounded-lg border-2 border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">{t('today.emptyColumn')}</p>}

        <button className="w-full rounded-lg bg-emerald-600 py-1.5 text-sm font-medium text-white hover:bg-emerald-700" onClick={() => setPicker('today')}>
          + {t('today.pick')}
        </button>

        {/* Routines (collapsed by default) */}
        <Collapsible title={`🌿 ${t('today.routines')}`} count={`${dueRoutines.filter((r) => routineDone.has(r.id)).length}/${dueRoutines.length}`}>
          <Routines date={date} />
        </Collapsible>

        <Collapsible title={`✓ ${t('today.doneToday')}`} count={String(doneOnDay.length)}>
          {doneOnDay.length === 0 ? (
            <p className="text-xs text-slate-400">{t('today.noneDone')}</p>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {doneOnDay.map((n) => (
                <li key={n.id} className="truncate text-slate-500 line-through">
                  {taskTitle(n, computed.get(n.id))}
                </li>
              ))}
            </ul>
          )}
        </Collapsible>

        <p className="border-t border-slate-100 pt-2 text-center text-xs italic text-emerald-800">{t('today.strategy')}</p>
      </div>

      {picker && <PickTaskDialog date={date} mode={picker} onClose={() => setPicker(null)} />}
    </DropZone>
  );
}

/** Compact task row: tick done, open, time, star, remove. */
function TodayRow({ node: n, date, computed, canStar }: { node: WbsNode; date: string; computed: Computed | undefined; canStar: boolean }) {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const settings = useAppStore((s) => s.settings);
  const { completeTask, setStatus, startTimer, pauseTimer, openTask, toggleHighlight, setTaskDay } = useAppStore();
  const daysLabel = useDaysLeftLabel();
  const done = n.status === 'done';
  const running = isRunning(n);
  const waitingFor = done ? [] : blockers(n, nodes);
  const p = placement(n, settings, date);
  const label = daysLabel(p.daysLeft);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="group flex items-center gap-2 px-2 py-1.5">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-emerald-600"
        checked={done}
        onPointerDown={stop}
        onChange={() => (done ? setStatus(n.id, 'in_progress') : completeTask(n.id))}
      />
      <button className="min-w-0 flex-1 text-left" onClick={() => openTask(n.id)}>
        <div className={cx('truncate text-sm font-medium', done && 'text-slate-400 line-through')}>{n.name}</div>
        <div className="flex flex-wrap gap-x-1.5 text-[11px] text-slate-500">
          <span className="truncate">{computed?.path.join(' / ')}</span>
          {label && !done && <span className={cx(p.daysLeft! < 0 ? 'text-rose-600' : p.urgent ? 'text-amber-700' : '')}>· {label}</span>}
          {n.eisenhower?.urgent === true && !done && <span className="text-rose-600">· ⚡</span>}
          {waitingFor.length > 0 && <span className="text-amber-700">· 🔒 {waitingFor.map((b) => b.name).join(', ')}</span>}
        </div>
      </button>
      <RankBadge rank={n.rank} />
      <div className="flex shrink-0 items-center" onPointerDown={stop}>
        {!done && (
          <button
            disabled={!running && waitingFor.length > 0}
            className="grid h-7 w-7 place-items-center rounded-full border border-emerald-500 text-xs text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-30"
            title={waitingFor.length && !running ? t('deps.startBlocked', { names: waitingFor.map((b) => b.name).join(', ') }) : running ? t('timer.pause') : t('timer.start')}
            onClick={() => (running ? pauseTimer(n.id) : startTimer(n.id))}
          >
            {running ? '❚❚' : '▶'}
          </button>
        )}
        <button
          className={cx('ml-0.5 text-base text-slate-300 hover:text-amber-500', (!canStar || done) && 'invisible')}
          title={t('today.star')}
          onClick={() => toggleHighlight(n.id, date)}
        >
          ☆
        </button>
        <button className="invisible text-xs text-slate-400 hover:text-rose-600 group-hover:visible" title={t('today.remove')} onClick={() => setTaskDay(n.id, null)}>
          ✕
        </button>
      </div>
    </div>
  );
}

function Collapsible({ title, count, children }: { title: string; count: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-700">
        <span>
          <span className="mr-1 inline-block text-xs text-slate-400 transition-transform group-open:rotate-90">▸</span>
          {title}
        </span>
        <span className="text-xs font-normal tabular-nums text-slate-500">{count}</span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
