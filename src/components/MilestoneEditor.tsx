import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { todayIso } from '../domain/calc';
import type { Milestone } from '../domain/types';
import { useComputed, useNow } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { useDaysLeftLabel } from './EisenhowerControls';
import { cx, DateInput, fmtDate, InlineText, ProgressBar } from './ui';

/** Milestone state relative to today: done / overdue / upcoming. */
export const milestoneTone = (m: Milestone, today: string) => (m.done ? 'done' : m.date < today ? 'late' : 'open');
export const MILESTONE_DIAMOND: Record<ReturnType<typeof milestoneTone>, string> = {
  done: 'bg-emerald-500 border-emerald-700',
  late: 'bg-rose-500 border-rose-700',
  open: 'bg-white border-slate-800',
};

/** A project's milestones: tick off, rename, re-date, delete, and add new ones. */
export function MilestoneEditor({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const all = useAppStore((s) => s.milestones);
  const { addMilestone, updateMilestone, deleteMilestone } = useAppStore();
  const today = todayIso(useNow(60_000));
  const daysLabel = useDaysLeftLabel();
  const [name, setName] = useState('');
  const [date, setDate] = useState<string | null>(today);
  const ms = all.filter((m) => m.projectId === projectId).sort((a, b) => a.date.localeCompare(b.date));

  const add = () => {
    if (!name.trim() || !date) return;
    addMilestone(projectId, name.trim(), date);
    setName('');
  };

  return (
    <div>
      <ul className="space-y-1">
        {ms.map((m) => {
          const st = milestoneTone(m, today);
          return (
            <li key={m.id} className="group flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-600" checked={m.done} onChange={() => updateMilestone(m.id, { done: !m.done })} />
              <span className={cx('h-2.5 w-2.5 shrink-0 rotate-45 border-2', MILESTONE_DIAMOND[st])} />
              <InlineText
                value={m.name}
                className={m.done ? 'text-slate-400 line-through' : ''}
                onCommit={(v) => (v.trim() ? updateMilestone(m.id, { name: v.trim() }) : deleteMilestone(m.id))}
              />
              <DateInput value={m.date} onChange={(v) => v && updateMilestone(m.id, { date: v })} />
              <span className={cx('w-24 shrink-0 text-right text-xs', st === 'late' ? 'text-rose-600' : st === 'done' ? 'text-emerald-700' : 'text-slate-500')}>
                {st === 'done' ? t('status.done') : daysLabel(differenceInCalendarDays(parseISO(m.date), parseISO(today)))}
              </span>
              <button className="invisible text-slate-400 hover:text-rose-600 group-hover:visible" aria-label={t('wbs.delete')} onClick={() => deleteMilestone(m.id)}>
                ✕
              </button>
            </li>
          );
        })}
        {ms.length === 0 && <li className="text-sm text-slate-400">{t('master.noMilestones')}</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-500"
          placeholder={t('master.addPlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <DateInput value={date} onChange={setDate} />
        <button
          className="rounded-lg bg-slate-800 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          disabled={!name.trim() || !date}
          onClick={add}
        >
          + {t('master.add')}
        </button>
      </div>
    </div>
  );
}

/** Popup opened from a project row in the Gantt: rename the project and edit its milestones. */
export function ProjectMilestoneModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.nodes.find((n) => n.id === projectId));
  const updateNode = useAppStore((s) => s.updateNode);
  const computed = useComputed(useNow(60_000));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!project) return null;
  const c = computed.get(project.id);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">◆ {t('kind.project')}</div>
            <InlineText value={project.name} className="text-xl font-bold" onCommit={(v) => v.trim() && updateNode(project.id, { name: v.trim() })} />
            <div className="px-1.5 text-sm text-slate-500">
              {fmtDate(c?.planStart ?? null)} – {fmtDate(c?.planEnd ?? null)}
            </div>
          </div>
          <button className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label={t('detail.close')}>
            ✕
          </button>
        </div>
        <ProgressBar value={c?.progress ?? 0} className="mb-4" />
        <h3 className="mb-2 text-sm font-semibold">{t('master.milestones')}</h3>
        <MilestoneEditor projectId={project.id} />
        <p className="mt-3 text-xs text-slate-400">{t('master.ganttHint')}</p>
      </div>
    </div>
  );
}
