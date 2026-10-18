import { useTranslation } from 'react-i18next';
import { formatDuration, isRunning, loggedHours } from '../domain/calc';
import { blockers } from '../domain/deps';
import type { WbsNode } from '../domain/types';
import { useComputed, useNow } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { cx } from './ui';

/** When the task's timer last stopped (ms), or 0 if it was never timed. */
const lastStopped = (n: WbsNode) => Math.max(0, ...n.timeLogs.map((l) => new Date(l.end ?? l.start).getTime()));

/**
 * Sidebar timer card, always visible: the running task, otherwise the task
 * worked on most recently (paused, ready to continue), otherwise a hint.
 */
export function RunningTasks() {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const { startTimer, pauseTimer, completeTask, openTask } = useAppStore();
  const now = useNow(1000);
  const computed = useComputed(now);

  const running = nodes.filter(isRunning);
  const lastPaused = running.length
    ? []
    : nodes
        .filter((n) => n.kind === 'task' && n.status !== 'done' && n.timeLogs.length > 0)
        .sort((a, b) => lastStopped(b) - lastStopped(a))
        .slice(0, 1);
  const shown = running.length ? running : lastPaused;

  if (shown.length === 0)
    return (
      <div className="px-3 pb-3">
        <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center">
          <div className="font-mono text-2xl tabular-nums text-slate-300">0:00:00</div>
          <div className="mt-1 text-xs text-slate-400">{t('running.idle')}</div>
        </div>
      </div>
    );

  return (
    <div className="space-y-2 px-3 pb-3">
      {shown.map((n) => {
        const live = isRunning(n);
        const waiting = blockers(n, nodes).length > 0;
        return (
          <div
            key={n.id}
            className={cx(
              'cursor-pointer rounded-xl border p-3 shadow-sm hover:shadow-md',
              live ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white',
            )}
            onClick={() => openTask(n.id)}
          >
            <div
              className={cx(
                'mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide',
                live ? 'text-emerald-700' : 'text-slate-500',
              )}
            >
              {live ? <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> : <span>❚❚</span>}
              {live ? t('running.title') : t('running.paused')}
            </div>
            <div className="truncate text-sm font-semibold text-slate-900" title={n.name}>{n.name}</div>
            <div className="truncate text-xs text-slate-500">{computed.get(n.id)?.path.join(' / ')}</div>
            <div className={cx('my-2 font-mono text-2xl tabular-nums', live ? 'text-slate-900' : 'text-slate-500')}>
              {formatDuration(loggedHours(n.timeLogs, now))}
            </div>
            <div className="flex gap-1.5">
              {live ? (
                <button
                  className="flex-1 rounded-md border border-slate-400 bg-white py-1 text-xs font-medium hover:bg-slate-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    pauseTimer(n.id);
                  }}
                >
                  {t('timer.pause')}
                </button>
              ) : (
                <button
                  disabled={waiting}
                  className="flex-1 rounded-md border border-emerald-600 bg-white py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    startTimer(n.id);
                  }}
                >
                  {t('timer.start')}
                </button>
              )}
              <button
                className="flex-1 rounded-md bg-slate-800 py-1 text-xs font-medium text-white hover:bg-slate-700"
                onClick={(e) => {
                  e.stopPropagation();
                  completeTask(n.id);
                }}
              >
                {t('timer.complete')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
