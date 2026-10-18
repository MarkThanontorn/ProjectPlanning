import { useTranslation } from 'react-i18next';
import { todayIso } from '../../domain/calc';
import { comparePriority, onMatrix, placement } from '../../domain/eisenhower';
import type { WbsNode } from '../../domain/types';
import { isThisWeek } from '../../domain/week';
import { useComputed, useLeafTasks, useNow } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import { MiniCard } from '../../components/TaskCard';
import { useUrgencyLabel } from '../../components/EisenhowerControls';
import { cx } from '../../components/ui';
import { BoardLayout, Draggable, DropZone } from './BoardLayout';

const QUADRANTS = [
  { important: true, urgent: true, key: 'q_do', tone: 'border-rose-200 bg-rose-50/40' },
  { important: true, urgent: false, key: 'q_plan', tone: 'border-sky-200 bg-sky-50/40' },
  { important: false, urgent: true, key: 'q_delegate', tone: 'border-amber-200 bg-amber-50/40' },
  { important: false, urgent: false, key: 'q_drop', tone: 'border-slate-200 bg-slate-50' },
] as const;

function Badge({ tone, children }: { tone: 'red' | 'amber' | 'slate' | 'violet'; children: React.ReactNode }) {
  const tones = {
    red: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-800',
    slate: 'bg-slate-100 text-slate-600',
    violet: 'bg-violet-100 text-violet-700',
  };
  return <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-medium', tones[tone])}>{children}</span>;
}

export function EisenhowerBoard() {
  const { t } = useTranslation();
  const tasks = useLeafTasks();
  const settings = useAppStore((s) => s.settings);
  const { updateSettings, setEisenhower } = useAppStore();
  const now = useNow(60_000);
  const computed = useComputed(now);
  const today = todayIso(now);
  const urgencyLabel = useUrgencyLabel();

  const onBoard = tasks
    .filter((n) => onMatrix(n, settings, today, isThisWeek(n, now)))
    .sort((a, b) => comparePriority(a, b, settings, today));

  const badges = (n: WbsNode) => {
    const p = placement(n, settings, today);
    const label = urgencyLabel(p);
    const autoUrgent = placement({ ...n, eisenhower: null }, settings, today).urgent;
    return (
      <>
        {n.eisenhower?.urgent === true && <Badge tone="red">⚡ {t('eis.insert')}</Badge>}
        {label && <Badge tone={p.daysLeft! < 0 ? 'red' : autoUrgent ? 'amber' : 'slate'}>{label}</Badge>}
        {(p.manualImportant || p.manualUrgent) && (
          <button
            type="button"
            title={t('eis.reset')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setEisenhower(n.id, null);
            }}
          >
            <Badge tone="violet">📌 {t('eis.manual')} ✕</Badge>
          </button>
        )}
      </>
    );
  };

  return (
    <BoardLayout navKey="matrix">
      <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('board.matrix')}</h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{t('eis.sortHint')}</span>
            <label className="flex items-center gap-1.5" title={t('eis.urgentHint', { pct: settings.urgencyBufferPct })}>
              {t('eis.buffer')}
              <input
                type="number"
                min={0}
                max={200}
                step={5}
                className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-right text-slate-800"
                value={settings.urgencyBufferPct}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 0 && v <= 200) updateSettings({ urgencyBufferPct: v });
                }}
              />
            </label>
            <label className="flex items-center gap-1.5">
              {t('eis.urgentDays')}
              <input
                type="number"
                min={0}
                max={30}
                className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-right text-slate-800"
                value={settings.urgentDays}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 0 && v <= 30) updateSettings({ urgentDays: v });
                }}
              />
            </label>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <div />
          <div className="text-center text-sm font-semibold text-slate-700">{t('board.urgent')}</div>
          <div className="text-center text-sm font-semibold text-slate-700">{t('board.notUrgent')}</div>
          {[true, false].map((important) => (
            <div key={String(important)} className="contents">
              <div className="flex items-center justify-center">
                <span className="-rotate-90 whitespace-nowrap text-sm font-semibold text-slate-700">
                  {important ? t('board.important') : t('board.notImportant')}
                </span>
              </div>
              {QUADRANTS.filter((q) => q.important === important).map((q) => {
                const zone = `q:${q.important ? 1 : 0}:${q.urgent ? 1 : 0}`;
                const items = onBoard.filter((n) => {
                  const p = placement(n, settings, today);
                  return p.important === q.important && p.urgent === q.urgent;
                });
                return (
                  <DropZone key={zone} id={zone} className={`flex flex-col overflow-hidden rounded-lg border-2 p-2.5 ${q.tone}`}>
                    <div className="mb-2 flex shrink-0 items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t(`board.${q.key}`)}
                      <span className="tabular-nums">{items.length}</span>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {items.map((n) => (
                        <Draggable key={n.id} zone={zone} taskId={n.id}>
                          <MiniCard node={n} computed={computed.get(n.id)} extra={badges(n)} />
                        </Draggable>
                      ))}
                      {items.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t('board.dropHere')}</p>}
                    </div>
                  </DropZone>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </BoardLayout>
  );
}
