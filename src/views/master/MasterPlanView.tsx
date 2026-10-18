import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { childrenMap, descendantIds, todayIso } from '../../domain/calc';
import type { WbsNode } from '../../domain/types';
import { MILESTONE_DIAMOND, milestoneTone, MilestoneEditor } from '../../components/MilestoneEditor';
import { CompleteToggle } from '../../components/completion';
import { useComputed, useNow } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import { useDaysLeftLabel } from '../../components/EisenhowerControls';
import { cx, fmtDate, LeadtimeText, ProgressBar, ViewTitle } from '../../components/ui';

const LABEL_W = 'w-56';

const tone = milestoneTone;
const DIAMOND = MILESTONE_DIAMOND;

/** Portfolio view: every project on one timeline with its milestones, plus a card per project. */
export function MasterPlanView() {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const milestones = useAppStore((s) => s.milestones);
  const { addNode, openTask } = useAppStore();
  const now = useNow(60_000);
  const computed = useComputed(now);
  const today = todayIso(now);
  const projects = childrenMap(nodes).get(null) ?? [];

  // Timeline range: whole months covering all projects, milestones and today.
  const range = useMemo(() => {
    const dates = [today, ...milestones.map((m) => m.date)];
    for (const p of projects) {
      const c = computed.get(p.id);
      if (c?.planStart) dates.push(c.planStart);
      if (c?.planEnd) dates.push(c.planEnd);
    }
    dates.sort();
    const start = startOfMonth(parseISO(dates[0]));
    const end = endOfMonth(parseISO(dates[dates.length - 1]));
    return { start, days: differenceInCalendarDays(end, start) + 1 };
  }, [projects, milestones, computed, today]);

  const pct = (iso: string) => (differenceInCalendarDays(parseISO(iso), range.start) / range.days) * 100;
  const months: { key: string; left: number; width: number; label: string }[] = [];
  for (let d = range.start; differenceInCalendarDays(d, range.start) < range.days; d = addDays(endOfMonth(d), 1)) {
    const left = (differenceInCalendarDays(d, range.start) / range.days) * 100;
    const width = ((differenceInCalendarDays(endOfMonth(d), d) + 1) / range.days) * 100;
    months.push({ key: d.toISOString(), left, width, label: format(d, months.length === 0 || d.getMonth() === 0 ? 'MMM yyyy' : 'MMM') });
  }

  return (
    <div>
      <ViewTitle
        navKey="master"
        aside={
          <button
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            onClick={() => addNode(null, 'project', t('wbs.defaultProject'))}
          >
            ⊕ {t('wbs.newProject')}
          </button>
        }
      />

      {/* Portfolio timeline */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex border-b border-slate-200 bg-slate-100">
          <div className={cx(LABEL_W, 'shrink-0 border-r border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600')}>
            {t('master.project')}
          </div>
          <div className="relative h-8 flex-1">
            {months.map((m) => (
              <div key={m.key} className="absolute top-0 h-full truncate border-l border-slate-300 px-1.5 pt-2 text-[11px] font-medium text-slate-600" style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                {m.label}
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          {projects.map((p) => {
            const c = computed.get(p.id);
            const ms = milestones.filter((m) => m.projectId === p.id);
            return (
              <div key={p.id} className="flex border-b border-slate-100 last:border-b-0">
                <div className={cx(LABEL_W, 'shrink-0 border-r border-slate-200 px-3 py-3')}>
                  <div className="truncate font-semibold">{p.name}</div>
                  <ProgressBar value={c?.progress ?? 0} className="mt-1" />
                </div>
                <div className="relative h-[4.5rem] flex-1">
                  {months.map((m) => (
                    <div key={m.key} className="absolute bottom-0 top-0 border-l border-slate-100" style={{ left: `${m.left}%` }} />
                  ))}
                  {c?.planStart && c.planEnd && (
                    <div
                      className="absolute top-3 h-3.5 overflow-hidden rounded-full bg-slate-200"
                      style={{ left: `${pct(c.planStart)}%`, width: `${Math.max(0.5, pct(c.planEnd) - pct(c.planStart) + 100 / range.days)}%` }}
                      title={`${fmtDate(c.planStart)} – ${fmtDate(c.planEnd)} · ${c.progress}%`}
                    >
                      <div className="h-full bg-emerald-600" style={{ width: `${c.progress}%` }} />
                    </div>
                  )}
                  {ms.map((m) => (
                    <div key={m.id} className="absolute top-[0.55rem] -translate-x-1/2" style={{ left: `${pct(m.date) + 50 / range.days}%` }}>
                      <div
                        className={cx('mx-auto h-3.5 w-3.5 rotate-45 border-2 shadow-sm', DIAMOND[tone(m, today)])}
                        title={`${m.name} · ${fmtDate(m.date)}`}
                      />
                      <div className={cx('mt-1.5 max-w-[7rem] truncate text-center text-[10px] leading-tight', m.done ? 'text-slate-400 line-through' : 'text-slate-700')}>
                        {m.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {projects.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t('master.empty')}</p>}
          {/* Today marker over the timeline column */}
          <div className="pointer-events-none absolute bottom-0 top-0 flex" style={{ left: 0, right: 0 }}>
            <div className={cx(LABEL_W, 'shrink-0')} />
            <div className="relative flex-1">
              <div className="absolute bottom-0 top-0 w-0.5 bg-rose-500" style={{ left: `${pct(today) + 50 / range.days}%` }} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          {(['open', 'done', 'late'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cx('h-2.5 w-2.5 rotate-45 border-2', DIAMOND[k])} />
              {t(`master.legend.${k}`)}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-rose-500" /> {t('gantt.today')}
          </span>
        </div>
      </section>

      {/* One card per project */}
      <div className="grid gap-5 xl:grid-cols-2">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onOpenTask={openTask} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpenTask }: { project: WbsNode; onOpenTask: (id: string) => void }) {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const all = useAppStore((s) => s.milestones);
  const now = useNow(60_000);
  const computed = useComputed(now);
  const today = todayIso(now);
  const daysLabel = useDaysLeftLabel();

  const c = computed.get(project.id);
  const ids = new Set(descendantIds(nodes, project.id));
  const parents = new Set(nodes.map((n) => n.parentId));
  const tasks = nodes.filter((n) => ids.has(n.id) && n.kind === 'task' && !parents.has(n.id));
  const doneTasks = tasks.filter((n) => n.status === 'done').length;
  const ms = all.filter((m) => m.projectId === project.id).sort((a, b) => a.date.localeCompare(b.date));
  const next = ms.find((m) => !m.done);
  const lateTasks = tasks.filter((n) => n.status !== 'done' && n.planEnd && n.planEnd < today);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-bold">
            <span className={cx(project.status === 'done' && 'text-slate-400 line-through')}>◆ {project.name}</span>
            <CompleteToggle node={project} />
            {project.status === 'done' && <span className="rounded bg-emerald-100 px-1.5 text-xs font-medium text-emerald-700">{t('complete.done')}</span>}
          </h2>
          <div className="text-sm text-slate-500">
            {fmtDate(c?.planStart ?? null)} – {fmtDate(c?.planEnd ?? null)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{c?.progress ?? 0}%</div>
          <div className="text-xs text-slate-500">{t('master.tasksDone', { done: doneTasks, total: tasks.length })}</div>
        </div>
      </div>
      <ProgressBar value={c?.progress ?? 0} />

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">{t('col.leadtime')}</dt>
          <dd><LeadtimeText hours={c?.planHours ?? null} /></dd>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">{t('col.actualLeadtime')}</dt>
          <dd>{c && c.actualHours > 0 ? <LeadtimeText hours={c.actualHours} /> : <span className="text-slate-400">TBD</span>}</dd>
        </div>
        <div className={cx('col-span-2 rounded-lg px-3 py-2 sm:col-span-1', next && next.date < today ? 'bg-rose-50' : 'bg-amber-50')}>
          <dt className="text-xs text-slate-500">{t('master.next')}</dt>
          <dd className="truncate font-medium">
            {next ? (
              <>
                {next.name} <span className="text-xs font-normal text-slate-500">· {daysLabel(differenceInCalendarDays(parseISO(next.date), parseISO(today)))}</span>
              </>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </dd>
        </div>
      </dl>

      {lateTasks.length > 0 && (
        <p className="mt-3 text-xs text-rose-600">
          ⚠ {t('master.lateTasks', { n: lateTasks.length })}:{' '}
          {lateTasks.slice(0, 4).map((n, i) => (
            <button key={n.id} className="underline-offset-2 hover:underline" onClick={() => onOpenTask(n.id)}>
              {i > 0 && ', '}
              {n.name}
            </button>
          ))}
        </p>
      )}

      <h3 className="mb-2 mt-4 text-sm font-semibold">{t('master.milestones')}</h3>
      <MilestoneEditor projectId={project.id} />
    </section>
  );
}
