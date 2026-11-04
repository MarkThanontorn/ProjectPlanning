import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { newId } from '../domain/factory';
import { RANKS, STATUSES, type Rank, type Status } from '../domain/types';
import { useComputed, useNow } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { DayButtons, TimerButtons, TimeUsing } from './TaskCard';
import { ActualLeadtimeCell, cx, DateInput, InlineText, LeadtimeText, PlanLeadtimeCell, ProgressBar, ProgressSlider } from './ui';
import { CompleteToggle, NotRelevantToggle } from './completion';
import { MilestoneEditor } from './MilestoneEditor';
import { EisenhowerControls } from './EisenhowerControls';
import { DependencyEditor } from './DependencyEditor';
import { TaskHistory, TaskTeamBar } from './team/TaskTeam';

/** Task detail popup. Edits the same node as the WBS row, plus checklist and timer. */
export function TaskDetailModal() {
  const { t } = useTranslation();
  const openTaskId = useAppStore((s) => s.openTaskId);
  const node = useAppStore((s) => s.nodes.find((n) => n.id === s.openTaskId));
  const { openTask, updateNode, setStatus, setProgress } = useAppStore();
  const now = useNow(30_000);
  const computed = useComputed(now);
  const [newItem, setNewItem] = useState('');

  useEffect(() => {
    if (!openTaskId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openTask(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTaskId, openTask]);

  if (!node) return null;
  const c = computed.get(node.id);
  const doneCount = node.checklist.filter((i) => i.done).length;
  /** Projects and groups get the fields that make sense for them: no timer, check-list or links. */
  const isTask = node.kind === 'task' && !!c?.isLeaf;

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    updateNode(node.id, { checklist: [...node.checklist, { id: newId('cl'), text, done: false }] });
    setNewItem('');
  };

  const field = 'grid grid-cols-[8.5rem_1fr] items-center gap-2 text-sm';
  const remarkBox = (
    <div className={cx(field, 'mt-5 !items-start')}>
      <span className="pt-1 text-slate-500">{t('col.remark')}</span>
      <InlineText multiline value={node.remark} className="!min-h-[6rem]" onCommit={(v) => updateNode(node.id, { remark: v })} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onMouseDown={() => openTask(null)}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1">
            <div className="text-xs text-slate-500">
              {!isTask && `${t(`kind.${node.kind}`)} · `}
              {c?.path.join(' / ')}
            </div>
            <InlineText
              value={node.name}
              onCommit={(v) => updateNode(node.id, { name: v || node.name })}
              className="text-xl font-bold"
            />
          </div>
          <button className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={() => openTask(null)} aria-label={t('detail.close')}>
            ✕
          </button>
        </div>

        <TaskTeamBar nodeId={node.id} />
        {isTask && <DayButtons node={node} wide />}
        <div className="space-y-2">
          <div className={cx(field, '!items-start')}>
            <span className="pt-1 text-slate-500">{t('col.detail')}</span>
            <InlineText multiline value={node.detail} className="!min-h-[8rem]" onCommit={(v) => updateNode(node.id, { detail: v })} />
          </div>
          <div className={field}>
            <span className="text-slate-500">{t('col.rank')}</span>
            <select
              className="w-24 rounded border border-slate-300 px-2 py-1"
              value={node.rank ?? ''}
              onChange={(e) => updateNode(node.id, { rank: (e.target.value || null) as Rank | null })}
            >
              <option value="">—</option>
              {RANKS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className={field}>
            <span className="text-slate-500">{t('col.dueDate')}</span>
            <DateInput value={node.dueDate} onChange={(v) => updateNode(node.id, { dueDate: v })} />
          </div>
          <div className={field}>
            <span className="text-slate-500">{t('col.inCharge')}</span>
            <InlineText value={node.inCharge} onCommit={(v) => updateNode(node.id, { inCharge: v })} />
          </div>
          <div className={field}>
            <span className="text-slate-500">{t('col.status')}</span>
            {isTask ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="w-40 rounded border border-slate-300 px-2 py-1"
                  value={node.status}
                  onChange={(e) => setStatus(node.id, e.target.value as Status)}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
                <NotRelevantToggle node={node} wide />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CompleteToggle node={node} />
                <span>{node.status === 'done' ? t('status.done') : '—'}</span>
              </div>
            )}
          </div>
          <div className={field}>
            <span className="text-slate-500">{t('col.progress')}</span>
            {isTask ? <ProgressSlider wide value={node.progress} onChange={(v) => setProgress(node.id, v)} /> : <ProgressBar value={c?.progress ?? 0} />}
          </div>
          <div className={field}>
            <span className="text-slate-500">{t('col.plan')}</span>
            <div className="flex flex-wrap items-center gap-1">
              <DateInput value={node.planStart} placeholder={c?.planStart} onChange={(v) => updateNode(node.id, { planStart: v })} />→
              <DateInput value={node.planEnd} placeholder={c?.planEnd} onChange={(v) => updateNode(node.id, { planEnd: v })} />
            </div>
          </div>
          <div className={field}>
            <span className="text-slate-500">{t('col.leadtime')}</span>
            <PlanLeadtimeCell id={node.id} hours={c?.planHours ?? null} overridden={node.leadtimeOverrideHrs != null} />
          </div>
          {isTask && <p className="-mt-1 pl-[9rem] text-xs text-slate-400">{t('tip.buffer50')}</p>}
          <div className={field}>
            <span className="text-slate-500">{t('col.actual')}</span>
            <div className="flex flex-wrap items-center gap-1">
              <DateInput value={node.actualStart} placeholder={c?.actualStart} onChange={(v) => updateNode(node.id, { actualStart: v })} />→
              <DateInput value={node.actualEnd} placeholder={c?.actualEnd} onChange={(v) => updateNode(node.id, { actualEnd: v })} />
            </div>
          </div>
          <div className={field}>
            <span className="text-slate-500">{t('col.actualLeadtime')}</span>
            {isTask ? (
              <ActualLeadtimeCell id={node.id} hours={c?.actualHours ?? 0} overridden={node.actualLeadtimeOverrideHrs !== null} />
            ) : (
              <LeadtimeText hours={c?.actualHours ?? null} />
            )}
          </div>
          {isTask && (
            <>
              <div className={field + ' items-start'}>
                <span className="pt-1 text-slate-500">Eisenhower</span>
                <EisenhowerControls node={node} />
              </div>
              <div className={field + ' items-start'}>
                <span className="pt-1 text-slate-500" title={t('deps.hint')}>{t('deps.title')}</span>
                <DependencyEditor node={node} />
              </div>
            </>
          )}
        </div>
        {node.parentId === null && (
          <div className="mt-5 rounded-lg border border-slate-200 p-3">
            <MilestoneEditor projectId={node.id} />
          </div>
        )}

        {isTask && (
        <>
        <div className="mt-5 rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            {t('detail.checklist')}
            <span className="text-xs font-normal text-slate-500">{doneCount}/{node.checklist.length}</span>
          </div>
          <ul className="space-y-1">
            {node.checklist.map((item) => (
              <li key={item.id} className="group flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={item.done}
                  onChange={() =>
                    updateNode(node.id, {
                      checklist: node.checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                    })
                  }
                />
                <InlineText
                  value={item.text}
                  className={item.done ? 'text-slate-400 line-through' : ''}
                  onCommit={(v) =>
                    updateNode(node.id, {
                      checklist: v.trim()
                        ? node.checklist.map((i) => (i.id === item.id ? { ...i, text: v } : i))
                        : node.checklist.filter((i) => i.id !== item.id),
                    })
                  }
                />
                <button
                  className="invisible rounded px-1 text-slate-400 hover:text-rose-600 group-hover:visible"
                  aria-label={t('wbs.delete')}
                  onClick={() => updateNode(node.id, { checklist: node.checklist.filter((i) => i.id !== item.id) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <input
            className="mt-2 w-full rounded border border-dashed border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-500"
            placeholder={t('detail.addItem')}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            onBlur={addItem}
          />
        </div>

        {remarkBox}

        <div className="mt-5 flex flex-col gap-3">
          <div className="flex justify-end">
            <TimeUsing node={node} className="text-sm" />
          </div>
          <TimerButtons node={node} size="lg" />
        </div>
        </>
        )}
        {!isTask && remarkBox}
        <TaskHistory nodeId={node.id} />
      </div>
    </div>
  );
}
