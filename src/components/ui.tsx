import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { leadtimeParts, round2 } from '../domain/calc';
import { PROGRESS_STEPS, type Rank, type Status } from '../domain/types';
import { useAppStore } from '../store/useAppStore';
import { NAV, type NavItem } from '../nav';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** Text input that commits on blur or Enter and reverts on Escape. */
export function InlineText({
  value,
  onCommit,
  placeholder,
  className,
  multiline,
  autoFocus,
  onDone,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  /** Called after the field loses focus (commit or cancel). */
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
    onDone?.();
  };
  const cls = cx(
    'w-full rounded bg-transparent px-1.5 py-1 outline-none hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-emerald-500',
    className,
  );
  if (multiline)
    return (
      <textarea
        className={cx(cls, 'min-h-[4rem] resize-y')}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    );
  return (
    <input
      className={cls}
      value={draft}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={(e) => autoFocus && e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setTimeout(() => e.currentTarget?.blur());
        }
      }}
    />
  );
}

export function DateInput({
  value,
  onChange,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string | null;
}) {
  return (
    <input
      type="date"
      className={cx(
        'w-[8.5rem] rounded bg-transparent px-1 py-1 text-sm outline-none hover:bg-slate-100 focus:ring-2 focus:ring-emerald-500',
        !value && 'text-slate-400',
      )}
      value={value ?? placeholder ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export const fmtDate = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM') : '—');

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-slate-600">{round2(value)}%</span>
    </div>
  );
}

const rankColor: Record<Rank, string> = {
  A: 'bg-rose-100 text-rose-700',
  B: 'bg-amber-100 text-amber-700',
  C: 'bg-sky-100 text-sky-700',
};

export function RankBadge({ rank }: { rank: Rank | null }) {
  if (!rank) return <span className="text-slate-400">—</span>;
  return <span className={cx('rounded px-1.5 py-0.5 text-xs font-semibold', rankColor[rank])}>{rank}</span>;
}

const statusColor: Record<Status, string> = {
  queue: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-violet-100 text-violet-700',
  done: 'bg-emerald-100 text-emerald-700',
};

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  return <span className={cx('whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium', statusColor[status])}>{t(`status.${status}`)}</span>;
}

/** "3 days (24 work Hr)" */
export function LeadtimeText({ hours }: { hours: number | null }) {
  const { t } = useTranslation();
  const hpd = useAppStore((s) => s.settings.hoursPerDay);
  const p = leadtimeParts(hours, hpd);
  if (!p) return <span className="text-slate-400">TBD</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {t('lt.days', { n: p.days })} <span className="text-xs text-slate-500">({t('lt.hours', { n: p.hours })})</span>
    </span>
  );
}

type HoursField = 'leadtimeOverrideHrs' | 'actualLeadtimeOverrideHrs';

/** "6" = 6 hours, "1.5d" / "2 วัน" = days × hours-per-day. */
export function parseHours(text: string, hoursPerDay: number): number | null {
  const m = text.trim().match(/^(\d+(?:\.\d+)?)\s*(d|day|days|วัน|h|hr|ชม\.?)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] && /^(d|day|days|วัน)$/i.test(m[2]) ? n * hoursPerDay : n;
}

/**
 * Leadtime value that can be overridden by typing hours (or days with "d").
 * An amber "Manual ✕" chip shows when overridden and resets to the automatic value.
 */
function HoursOverrideCell({
  id,
  hours,
  overridden,
  field,
}: {
  id: string;
  hours: number | null;
  overridden: boolean;
  field: HoursField;
}) {
  const { t } = useTranslation();
  const updateNode = useAppStore((s) => s.updateNode);
  const hpd = useAppStore((s) => s.settings.hoursPerDay);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const hint = t(field === 'leadtimeOverrideHrs' ? 'lt.editPlan' : 'lt.edit');

  const parsed = parseHours(draft, hpd);
  if (editing)
    return (
      <div className="relative">
      <input
        autoFocus
        className="w-28 rounded px-1.5 py-1 text-sm outline-none ring-2 ring-emerald-500"
        value={draft}
        placeholder={t('lt.placeholder')}
        title={hint}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          setEditing(false);
          const v = parseHours(draft, hpd);
          if (v !== null) updateNode(id, { [field]: v });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft('');
            setEditing(false);
          }
        }}
      />
      {field === 'leadtimeOverrideHrs' && (
        <div className="absolute left-0 top-full z-30 mt-1 w-max max-w-[16rem] rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 shadow-sm">
          {t('tip.buffer50')}
          {parsed !== null && parsed > 0 && (
            <button
              type="button"
              className="mt-0.5 block font-semibold underline-offset-2 hover:underline"
              // mousedown keeps focus in the input so the new value is committed on blur.
              onMouseDown={(e) => {
                e.preventDefault();
                setDraft(String(round2(parsed * 1.5)));
              }}
            >
              {t('tip.apply', { v: `${round2(parsed * 1.5)} h` })}
            </button>
          )}
        </div>
      )}
      </div>
    );

  return (
    <div className="flex items-center gap-1">
      <button
        className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
        title={hint}
        onClick={() => {
          setDraft(hours !== null ? String(round2(hours)) : '');
          setEditing(true);
        }}
      >
        {hours !== null && (hours > 0 || overridden) ? <LeadtimeText hours={hours} /> : <span className="text-slate-400">TBD</span>}
      </button>
      {overridden && (
        <button
          className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 hover:bg-amber-200"
          title={t(field === 'leadtimeOverrideHrs' ? 'lt.resetPlan' : 'lt.reset')}
          onClick={() => updateNode(id, { [field]: null })}
        >
          {t('lt.override')} ✕
        </button>
      )}
    </div>
  );
}

/** Planned Leadtime: from the plan dates (or children) unless entered manually. */
export function PlanLeadtimeCell({ id, hours, overridden }: { id: string; hours: number | null; overridden: boolean }) {
  return <HoursOverrideCell id={id} hours={hours} overridden={overridden} field="leadtimeOverrideHrs" />;
}

/** Actual Leadtime: the timer total unless entered manually. */
export function ActualLeadtimeCell({ id, hours, overridden }: { id: string; hours: number; overridden: boolean }) {
  return <HoursOverrideCell id={id} hours={hours} overridden={overridden} field="actualLeadtimeOverrideHrs" />;
}

/** Index of the step closest to `value` (legacy off-step values snap for the thumb only). */
const nearestStep = (value: number) => {
  let best = 0;
  PROGRESS_STEPS.forEach((s, i) => {
    if (Math.abs(s - value) < Math.abs(PROGRESS_STEPS[best] - value)) best = i;
  });
  return best;
};

/**
 * Progress slider that only stops on 0 / 5 / 25 / 50 / 75 / 95 / 100 %.
 * The track is evenly spaced per step, with a tick mark at each one.
 */
export function ProgressSlider({ value, onChange, wide }: { value: number; onChange: (v: number) => void; wide?: boolean }) {
  return (
    <div className={cx('flex items-center gap-2', wide ? 'w-full' : 'w-40')}>
      <div className="relative flex-1">
        <input
          type="range"
          min={0}
          max={PROGRESS_STEPS.length - 1}
          step={1}
          value={nearestStep(value)}
          onChange={(e) => onChange(PROGRESS_STEPS[Number(e.target.value)])}
          className="relative z-[1] w-full accent-emerald-600"
          aria-valuetext={`${value}%`}
        />
        <div className="pointer-events-none absolute inset-x-[7px] top-1/2 flex justify-between">
          {PROGRESS_STEPS.map((s) => (
            <span key={s} className={cx('mt-2 h-1.5 w-px', s <= value ? 'bg-emerald-500' : 'bg-slate-300')} />
          ))}
        </div>
        {wide && (
          <div className="mt-1 flex justify-between px-[2px] text-[10px] tabular-nums text-slate-400">
            {PROGRESS_STEPS.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        )}
      </div>
      <span className="w-10 text-right text-xs tabular-nums">{value}%</span>
    </div>
  );
}

/** Quiet "focus" reminder shown when a list holds more than WIP_LIMIT open tasks. */
export function FocusWarning({
  count,
  limit,
  className,
  kind = 'list',
}: {
  count: number;
  limit: number;
  className?: string;
  /** 'wip' = too many tasks In Progress (opened and left unfinished). */
  kind?: 'list' | 'wip';
}) {
  const { t } = useTranslation();
  if (count <= limit) return null;
  const key = kind === 'wip' ? 'focus.wip' : 'focus';
  return (
    <div className={cx('rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800', className)}>
      🎯 <span className="font-semibold">{t(`${key}.title`, { n: count })}</span> {t(`${key}.body`, { limit })}
    </div>
  );
}

export function IconButton({
  title,
  onClick,
  children,
  className,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cx('grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-900', className)}
    >
      {children}
    </button>
  );
}

/**
 * Page header: the view's menu icon in a tile, its name and a one-line purpose,
 * with the page's actions on the right. Title and subtitle default to the nav labels.
 */
export function ViewTitle({
  navKey,
  children,
  subtitle,
  aside,
  className,
}: {
  navKey: NavItem['key'];
  children?: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const icon = NAV.find((n) => n.key === navKey)?.icon;
  return (
    <header className={cx('mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-xl text-white shadow-sm ring-1 ring-black/5">
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold leading-tight tracking-tight text-slate-900">{children ?? t(`nav.${navKey}`)}</h1>
          <p className="truncate text-sm text-slate-500">{subtitle ?? t(`header.${navKey}`)}</p>
        </div>
      </div>
      {aside}
    </header>
  );
}
