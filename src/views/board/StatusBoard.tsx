import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { STATUSES, WIP_LIMIT } from '../../domain/types';
import { isThisWeek, weekRange } from '../../domain/week';
import { useComputed, useLeafTasks, useNow } from '../../hooks';
import { MiniCard } from '../../components/TaskCard';
import { StatusBadge } from '../../components/ui';
import { BoardLayout, Draggable, DropZone } from './BoardLayout';

export function StatusBoard() {
  const { t } = useTranslation();
  const tasks = useLeafTasks();
  const now = useNow(60_000);
  const computed = useComputed(now);
  const week = weekRange(now);
  const thisWeek = tasks.filter((n) => isThisWeek(n, now));
  const fmt = (iso: string) => format(parseISO(iso), 'd MMM');

  return (
    <BoardLayout navKey="status">
      <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">
          {t('board.statusTitle')} <span className="text-sm font-normal text-slate-500">{fmt(week.start)} – {fmt(week.end)}</span>
        </h2>
        <div className="grid min-h-0 flex-1 grid-cols-4 gap-3">
          {STATUSES.map((status) => {
            const items = thisWeek.filter((n) => n.status === status);
            return (
              <DropZone
                key={status}
                id={`st:${status}`}
                className={`flex flex-col overflow-hidden rounded-lg border p-2.5 ${
                  status === 'in_progress' && items.length > WIP_LIMIT ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <StatusBadge status={status} />
                  <span className={`text-xs tabular-nums ${status === 'in_progress' && items.length > WIP_LIMIT ? 'font-bold text-amber-700' : 'text-slate-500'}`}>
                    {items.length}
                    {status === 'in_progress' && ` / ${WIP_LIMIT}`}
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {items.map((n) => (
                    <Draggable key={n.id} zone={`st:${status}`} taskId={n.id}>
                      <MiniCard node={n} computed={computed.get(n.id)} />
                    </Draggable>
                  ))}
                </div>
              </DropZone>
            );
          })}
        </div>
      </div>
    </BoardLayout>
  );
}
