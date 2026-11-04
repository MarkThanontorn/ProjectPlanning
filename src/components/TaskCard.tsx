import { useTranslation } from 'react-i18next';
import { formatDuration, isRunning, loggedHours } from '../domain/calc';
import type { Computed, WbsNode } from '../domain/types';
import { useNow } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { blockers } from '../domain/deps';
import { todayIso } from '../domain/calc';
import { MAX_HIGHLIGHTS } from '../store/useAppStore';
import { cx, fmtDate, NotRelevantBadge, ProgressBar, RankBadge } from './ui';

export const taskTitle = (node: WbsNode, c: Computed | undefined) =>
  c && c.path.length ? `${node.name} (${c.path.join(' / ')})` : node.name;

/** Task name, with its project / group below in small grey text so the two don't read as one title. */
function CardTitle({ node, computed, className }: { node: WbsNode; computed: Computed | undefined; className?: string }) {
  const done = node.status === 'done';
  const path = computed?.path.join(' / ');
  return (
    <div className={cx('min-w-0', className)}>
      <div className={cx('break-words text-sm font-semibold', done ? 'text-slate-400 line-through' : 'text-slate-900')}>
        {node.name}
        {node.notRelevant && <NotRelevantBadge className="ml-1 inline-block align-middle" />}
      </div>
      {path && (
        <div className="truncate text-[11px] leading-tight text-slate-400" title={path}>
          {path}
        </div>
      )}
    </div>
  );
}

/** ☀ / ★ on a card: put the task on the board's day, or make it a highlight of that day. */
export function DayButtons({ node, wide }: { node: WbsNode; wide?: boolean }) {
  const { t } = useTranslation();
  const day = useAppStore((s) => s.boardDay) ?? todayIso();
  const highlights = useAppStore((s) => s.today.highlights[day]) ?? [];
  const setTaskDay = useAppStore((s) => s.setTaskDay);
  const toggleHighlight = useAppStore((s) => s.toggleHighlight);
  if (node.status === 'done') return null;
  const onDay = node.todayDate === day;
  const starred = highlights.includes(node.id);
  const full = !starred && highlights.length >= MAX_HIGHLIGHTS;
  const cls = cx(
    'rounded text-sm leading-none hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40',
    wide ? 'border border-slate-300 px-2.5 py-1.5' : 'grid h-5 w-5 place-items-center',
  );
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <span className={cx('flex shrink-0', wide ? 'mb-3 gap-2' : 'ml-auto gap-0.5')} onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={cx(cls, onDay ? 'text-emerald-600' : wide ? 'text-slate-600 hover:text-emerald-600' : 'text-slate-300 hover:text-emerald-600')}
        title={t(onDay ? 'board.offDay' : 'board.onDay')}
        aria-label={t(onDay ? 'board.offDay' : 'board.onDay')}
        onClick={stop(() => setTaskDay(node.id, onDay ? null : day))}
      >
        ☀{wide && ` ${t(onDay ? 'board.offDay' : 'board.onDay')}`}
      </button>
      <button
        type="button"
        className={cx(cls, starred ? 'text-amber-500' : wide ? 'text-slate-600 hover:text-amber-500' : 'text-slate-300 hover:text-amber-500')}
        title={t(starred ? 'today.unstar' : 'today.star')}
        aria-label={t(starred ? 'today.unstar' : 'today.star')}
        disabled={full}
        onClick={stop(() => toggleHighlight(node.id, day))}
      >
        {starred ? '★' : '☆'}
        {wide && ` ${t(starred ? 'today.unstar' : 'today.star')}`}
      </button>
    </span>
  );
}

/** Open predecessors of a task (empty when it can start). */
export function useBlockers(node: WbsNode) {
  const nodes = useAppStore((s) => s.nodes);
  return node.status === 'done' ? [] : blockers(node, nodes);
}

/** "🔒 Waiting for: Task a" line, shown only while the task is blocked. */
export function BlockedNote({ node }: { node: WbsNode }) {
  const { t } = useTranslation();
  const waitingFor = useBlockers(node);
  if (waitingFor.length === 0) return null;
  return (
    <div className="mb-1 truncate text-xs font-medium text-amber-700">
      🔒 {t('deps.blockedBy', { names: waitingFor.map((b) => b.name).join(', ') })}
    </div>
  );
}

export function TimerButtons({ node, size = 'sm' }: { node: WbsNode; size?: 'sm' | 'lg' }) {
  const { t } = useTranslation();
  const { startTimer, pauseTimer, completeTask, setCompleted } = useAppStore();
  const waitingFor = useBlockers(node);
  const running = isRunning(node);
  const done = node.status === 'done';
  const btn = cx(
    'flex-1 rounded border font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
    size === 'sm' ? 'px-1.5 py-1 text-xs' : 'px-3 py-2 text-sm',
  );
  // Buttons stop propagation so they work inside draggable / clickable cards.
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div className="flex gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
      <button className={cx(btn, 'border-emerald-600 text-emerald-700 hover:bg-emerald-50')} disabled={running || waitingFor.length > 0} title={waitingFor.length ? t('deps.startBlocked', { names: waitingFor.map((b) => b.name).join(', ') }) : undefined} onClick={stop(() => startTimer(node.id))}>
        {t('timer.start')}
      </button>
      <button className={cx(btn, 'border-slate-400 text-slate-700 hover:bg-slate-50')} disabled={!running} onClick={stop(() => pauseTimer(node.id))}>
        {t('timer.pause')}
      </button>
      {done ? (
        <button className={cx(btn, 'border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')} title={t('complete.reopen')} onClick={stop(() => setCompleted(node.id, false))}>
          ↩ {t('timer.reopen')}
        </button>
      ) : (
        <button className={cx(btn, 'border-slate-800 bg-slate-800 text-white hover:bg-slate-700')} onClick={stop(() => completeTask(node.id))}>
          {t('timer.complete')}
        </button>
      )}
    </div>
  );
}

export function TimeUsing({ node, className }: { node: WbsNode; className?: string }) {
  const { t } = useTranslation();
  const running = isRunning(node);
  const now = useNow(running ? 1000 : 60_000);
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs text-slate-600', className)}>
      {running && <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" title={t('timer.running')} />}
      {t('timer.timeUsing')}:
      <span className="rounded border border-slate-300 px-1.5 font-mono tabular-nums text-slate-900">{formatDuration(loggedHours(node.timeLogs, now))}</span>
      Hr
    </span>
  );
}

/** The task's Check-List on a card: tick items without opening the task. */
function Subtasks({ node, limit = 4 }: { node: WbsNode; limit?: number }) {
  const { t } = useTranslation();
  const updateNode = useAppStore((s) => s.updateNode);
  const openTask = useAppStore((s) => s.openTask);
  const items = node.checklist;
  if (items.length === 0) return null;
  const more = items.length - limit;
  return (
    <div className="mt-1.5 border-t border-slate-100 pt-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-0.5 text-[11px] font-medium text-slate-500">
        {t('detail.checklist')} {items.filter((i) => i.done).length}/{items.length}
      </div>
      <ul className="space-y-0.5">
        {items.slice(0, limit).map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-3 w-3 shrink-0 accent-emerald-600"
                checked={item.done}
                onChange={() => updateNode(node.id, { checklist: items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) })}
              />
              <span className={cx('min-w-0 break-words', item.done && 'text-slate-400 line-through')}>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button className="mt-0.5 text-[11px] text-slate-500 hover:underline" onClick={() => openTask(node.id)}>
          {t('board.moreSubtasks', { n: more })}
        </button>
      )}
    </div>
  );
}

/** Full card from the wireframe's "Today" column. */
export function TaskCard({ node, computed }: { node: WbsNode; computed: Computed | undefined }) {
  const { t } = useTranslation();
  const openTask = useAppStore((s) => s.openTask);
  return (
    <div
      className={cx(
        'cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md',
        isRunning(node) ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-300',
      )}
      onClick={() => openTask(node.id)}
    >
      <CardTitle node={node} computed={computed} className="mb-2 pr-14" />
      <BlockedNote node={node} />
      <dl className={cx('mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs', node.status === 'done' && '[&_dd]:!text-slate-400')}>
        <dt className="text-slate-500">{t('col.detail')}</dt>
        <dd className="line-clamp-2 text-slate-800">{node.detail || '—'}</dd>
        <dt className="text-slate-500">{t('col.rank')}</dt>
        <dd><RankBadge rank={node.rank} /></dd>
        <dt className="text-slate-500">{t('col.dueDate')}</dt>
        <dd className="text-slate-800">{fmtDate(node.dueDate)}</dd>
        <dt className="text-slate-500">{t('col.inCharge')}</dt>
        <dd className="text-slate-800">{node.inCharge || '—'}</dd>
        <dt className="text-slate-500">{t('col.progress')}</dt>
        <dd><ProgressBar value={node.progress} /></dd>
      </dl>
      <Subtasks node={node} />
      <div className="mb-2 mt-2 flex justify-end">
        <TimeUsing node={node} />
      </div>
      <TimerButtons node={node} />
    </div>
  );
}

/** Compact one-line card used in the matrix, status columns and "All" list. */
export function MiniCard({
  node,
  computed,
  extra,
  onRemove,
}: {
  node: WbsNode;
  computed: Computed | undefined;
  extra?: React.ReactNode;
  /** Shows a ✕ on hover that takes the card off the board. */
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const openTask = useAppStore((s) => s.openTask);
  const running = isRunning(node);
  return (
    <div
      className={cx(
        'group/card relative cursor-pointer rounded-md border bg-white px-2.5 py-2 text-sm shadow-sm hover:shadow-md',
        running ? 'border-emerald-500' : 'border-slate-300',
      )}
      onClick={() => openTask(node.id)}
    >
      {onRemove && (
        <button
          className="absolute right-0.5 top-0.5 z-10 hidden h-5 w-5 place-items-center rounded-full border border-slate-300 bg-white text-[10px] text-slate-500 shadow hover:text-rose-600 group-hover/card:grid"
          title={t('board.removeHint')}
          aria-label={t('board.removeHint')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      )}
      <div className="flex items-start gap-2">
        {running && <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-500" />}
        <CardTitle node={node} computed={computed} className="flex-1" />
        <RankBadge rank={node.rank} />
      </div>
      <BlockedNote node={node} />
      <div className="mt-1 flex items-center gap-x-2 text-xs text-slate-500">
        <span>{fmtDate(node.dueDate)}</span>
        {node.inCharge && <span className="min-w-0 truncate">· {node.inCharge}</span>}
        <DayButtons node={node} />
      </div>
      <ProgressBar value={node.progress} className="mt-1.5" />
      <Subtasks node={node} />
      {extra && <div className="mt-1.5 flex flex-wrap gap-1">{extra}</div>}
    </div>
  );
}
