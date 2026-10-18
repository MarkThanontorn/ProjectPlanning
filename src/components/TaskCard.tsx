import { useTranslation } from 'react-i18next';
import { formatDuration, isRunning, loggedHours } from '../domain/calc';
import type { Computed, WbsNode } from '../domain/types';
import { useNow } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { blockers } from '../domain/deps';
import { cx, fmtDate, ProgressBar, RankBadge } from './ui';

export const taskTitle = (node: WbsNode, c: Computed | undefined) =>
  c && c.path.length ? `${node.name} (${c.path.join(' / ')})` : node.name;

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
  const { startTimer, pauseTimer, completeTask } = useAppStore();
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
      <button className={cx(btn, 'border-slate-800 bg-slate-800 text-white hover:bg-slate-700')} disabled={done} onClick={stop(() => completeTask(node.id))}>
        {t('timer.complete')}
      </button>
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
      <div className={cx('mb-2 text-sm font-semibold text-slate-900', node.status === 'done' && 'line-through text-slate-400')}>
        {taskTitle(node, computed)}
      </div>
      <BlockedNote node={node} />
      <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
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
      <div className="mb-2 flex justify-end">
        <TimeUsing node={node} />
      </div>
      <TimerButtons node={node} />
    </div>
  );
}

/** Compact one-line card used in the matrix, status columns and "All" list. */
export function MiniCard({ node, computed, extra }: { node: WbsNode; computed: Computed | undefined; extra?: React.ReactNode }) {
  const openTask = useAppStore((s) => s.openTask);
  const running = isRunning(node);
  return (
    <div
      className={cx(
        'cursor-pointer rounded-md border bg-white px-2.5 py-2 text-sm shadow-sm hover:shadow-md',
        running ? 'border-emerald-500' : 'border-slate-300',
      )}
      onClick={() => openTask(node.id)}
    >
      <div className={cx('flex items-start gap-2', node.status === 'done' && 'text-slate-400 line-through')}>
        {running && <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-500" />}
        <span className="flex-1">{taskTitle(node, computed)}</span>
        <RankBadge rank={node.rank} />
      </div>
      <BlockedNote node={node} />
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
        <span>{fmtDate(node.dueDate)}</span>
        {node.inCharge && <span>· {node.inCharge}</span>}
      </div>
      <ProgressBar value={node.progress} className="mt-1.5" />
      {extra && <div className="mt-1.5 flex flex-wrap gap-1">{extra}</div>}
    </div>
  );
}
