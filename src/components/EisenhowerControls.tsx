import { useTranslation } from 'react-i18next';
import { placement } from '../domain/eisenhower';
import { todayIso } from '../domain/calc';
import type { Eisenhower, WbsNode } from '../domain/types';
import { useAppStore } from '../store/useAppStore';
import { cx } from './ui';

/** "Due in 2 days" / "Due today" / "3 days overdue" from a days-left count. */
export function useDaysLeftLabel() {
  const { t } = useTranslation();
  return (d: number | null) =>
    d === null ? null : d < 0 ? t('eis.overdue', { n: -d }) : d === 0 ? t('eis.dueToday') : t('eis.daysLeft', { n: d });
}

/** "Needs 1.5 d · 2 d left" when the task has a Leadtime, else the days-left label. */
export function useUrgencyLabel() {
  const { t } = useTranslation();
  const daysLabel = useDaysLeftLabel();
  const hpd = useAppStore((s) => s.settings.hoursPerDay);
  const r = (h: number) => Math.round((h / hpd) * 10) / 10;
  return (p: { daysLeft: number | null; slack: { remainingHrs: number; availableHrs: number } | null }) =>
    p.daysLeft !== null && p.daysLeft >= 0 && p.slack
      ? t('eis.slack', { need: r(p.slack.remainingHrs), avail: r(p.slack.availableHrs) })
      : daysLabel(p.daysLeft);
}

/** Two Auto / Yes / No switches for the importance and urgency axes. */
export function EisenhowerControls({ node }: { node: WbsNode }) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const setAxis = useAppStore((s) => s.setEisenhowerAxis);
  const p = placement(node, settings, todayIso());
  const label = useUrgencyLabel();

  const row = (axis: keyof Eisenhower, yes: string, no: string, autoValue: boolean, autoHint: string) => {
    const current = node.eisenhower?.[axis] ?? null;
    const opts: { value: boolean | null; text: string }[] = [
      { value: null, text: `${t('eis.auto')} (${autoValue ? yes : no})` },
      { value: true, text: yes },
      { value: false, text: no },
    ];
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs">
          {opts.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              className={cx(
                'border-l border-slate-300 px-2.5 py-1 first:border-l-0',
                current === o.value ? 'bg-slate-800 text-white' : 'bg-white hover:bg-slate-100',
              )}
              onClick={() => setAxis(node.id, axis, o.value)}
            >
              {o.text}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{autoHint}</span>
      </div>
    );
  };

  // Automatic values = what the rule gives with no override on that axis.
  const auto = placement({ ...node, eisenhower: null }, settings, todayIso());
  return (
    <div className="space-y-1.5">
      {row('important', t('board.important'), t('board.notImportant'), auto.important, t('eis.importantHint'))}
      {row('urgent', t('board.urgent'), t('board.notUrgent'), auto.urgent, label(p) ?? t('eis.noDate'))}
    </div>
  );
}
