import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { repeatOf, routineDueOn, WEEKDAYS } from '../../domain/routine';
import type { Routine, RoutineRepeat } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { cx, InlineText } from '../../components/ui';

/** Week order shown in the picker: Mon … Sun (values are Date#getDay). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "Every day" / "Mon–Fri" / "Mon, Wed" / "Every 1st" — short label for a schedule. */
export function useRepeatLabel() {
  const { t } = useTranslation();
  const short = t('routine.weekdaysShort', { returnObjects: true }) as string[];
  return (rep: RoutineRepeat) => {
    if (rep.kind === 'daily') return t('routine.daily');
    if (rep.kind === 'monthly') return t('routine.monthlyLabel', { day: rep.day });
    const days = [...rep.days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
    if (days.length === 7) return t('routine.daily');
    if (days.join() === WEEKDAYS.join()) return t('routine.weekdays');
    if (days.join() === '6,0') return t('routine.weekend');
    return days.map((d) => short[d]).join(' ');
  };
}

/** Daily routines for one day: only those scheduled that day, with a toggle to see/edit the rest. */
export function Routines({ date }: { date: string }) {
  const { t } = useTranslation();
  const routines = useAppStore((s) => s.today.routines);
  const doneIds = useAppStore((s) => s.today.routineDone[date]);
  const { addRoutine, updateRoutine, deleteRoutine, toggleRoutine } = useAppStore();
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const repeatLabel = useRepeatLabel();
  const done = new Set(doneIds ?? []);
  const due = routines.filter((r) => routineDueOn(r, date));
  const notDue = routines.filter((r) => !routineDueOn(r, date));
  const add = () => {
    if (draft.trim()) addRoutine(draft.trim());
    setDraft('');
  };

  const item = (r: Routine, scheduled: boolean) => (
    <li key={r.id} className={cx(!scheduled && 'opacity-50')}>
      <div className="group/r flex items-center gap-1.5">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-600" checked={done.has(r.id)} onChange={() => toggleRoutine(r.id, date)} />
        <InlineText
          value={r.text}
          className={cx('text-sm', done.has(r.id) && 'text-slate-400 line-through')}
          onCommit={(v) => (v.trim() ? updateRoutine(r.id, { text: v.trim() }) : deleteRoutine(r.id))}
        />
        <button
          className={cx(
            'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium',
            editing === r.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          )}
          title={t('routine.edit')}
          onClick={() => setEditing(editing === r.id ? null : r.id)}
        >
          ↻ {repeatLabel(repeatOf(r))}
          {(r.times?.length ?? 0) > 0 && <span className="ml-1">⏰ {r.times!.join(', ')}</span>}
        </button>
        <button className="invisible text-xs text-slate-400 hover:text-rose-600 group-hover/r:visible" aria-label={t('wbs.delete')} onClick={() => deleteRoutine(r.id)}>
          ✕
        </button>
      </div>
      {editing === r.id && (
        <RepeatEditor
          value={repeatOf(r)}
          onChange={(repeat) => updateRoutine(r.id, { repeat })}
          times={r.times ?? []}
          onTimesChange={(times) => updateRoutine(r.id, { times })}
        />
      )}
    </li>
  );

  return (
    <div>
      <ul className="space-y-1">{due.map((r) => item(r, true))}</ul>
      {due.length === 0 && <p className="text-xs text-slate-400">{t('routine.noneToday')}</p>}
      {notDue.length > 0 && (
        <>
          <button className="mt-1 text-[11px] text-slate-500 hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? t('routine.hideOthers') : t('routine.showOthers', { n: notDue.length })}
          </button>
          {showAll && <ul className="mt-1 space-y-1">{notDue.map((r) => item(r, false))}</ul>}
        </>
      )}
      <input
        className="mt-1.5 w-full rounded border border-dashed border-slate-300 px-2 py-1 text-xs outline-none focus:border-emerald-500"
        placeholder={t('today.addRoutine')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        onBlur={add}
      />
    </div>
  );
}

/** Schedule picker: every day / weekdays / chosen days / monthly on a date. */
function RepeatEditor({
  value,
  onChange,
  times,
  onTimesChange,
}: {
  value: RoutineRepeat;
  onChange: (r: RoutineRepeat) => void;
  times: string[];
  onTimesChange: (times: string[]) => void;
}) {
  const { t } = useTranslation();
  const short = t('routine.weekdaysShort', { returnObjects: true }) as string[];
  const isWeekdays = value.kind === 'weekly' && [...value.days].sort().join() === WEEKDAYS.join();
  const mode = value.kind === 'daily' ? 'daily' : value.kind === 'monthly' ? 'monthly' : isWeekdays ? 'weekdays' : 'custom';
  const modes = [
    { key: 'daily', label: t('routine.daily'), apply: (): RoutineRepeat => ({ kind: 'daily' }) },
    { key: 'weekdays', label: t('routine.weekdays'), apply: (): RoutineRepeat => ({ kind: 'weekly', days: [...WEEKDAYS] }) },
    { key: 'custom', label: t('routine.custom'), apply: (): RoutineRepeat => ({ kind: 'weekly', days: value.kind === 'weekly' ? value.days : [new Date().getDay()] }) },
    { key: 'monthly', label: t('routine.monthly'), apply: (): RoutineRepeat => ({ kind: 'monthly', day: new Date().getDate() }) },
  ] as const;

  return (
    <div className="mb-1 ml-5 mt-1 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="flex flex-wrap gap-1">
        {modes.map((m) => (
          <button
            key={m.key}
            className={cx('rounded-full border px-2 py-0.5 text-[11px]', mode === m.key ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white hover:border-slate-400')}
            onClick={() => onChange(m.apply())}
          >
            {m.label}
          </button>
        ))}
      </div>
      {value.kind === 'weekly' && (
        <div className="flex gap-1">
          {WEEK_ORDER.map((d) => {
            const on = value.days.includes(d);
            return (
              <button
                key={d}
                className={cx('grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold', on ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-300')}
                onClick={() => {
                  const days = on ? value.days.filter((x) => x !== d) : [...value.days, d];
                  if (days.length) onChange({ kind: 'weekly', days });
                }}
              >
                {short[d]}
              </button>
            );
          })}
        </div>
      )}
      {value.kind === 'monthly' && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          {t('routine.everyDay')}
          <input
            type="number"
            min={1}
            max={31}
            className="w-14 rounded border border-slate-300 px-1.5 py-0.5"
            value={value.day}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= 31) onChange({ kind: 'monthly', day: n });
            }}
          />
          {t('routine.ofMonth')}
        </label>
      )}
      <ReminderTimes times={times} onChange={onTimesChange} />
    </div>
  );
}

/** Reminder times ("HH:mm") for a routine, plus the browser-notification permission prompt. */
function ReminderTimes({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  const { t } = useTranslation();
  // The time picker only appears after "+ Add time", so it isn't confused with times already set.
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const sorted = (list: string[]) => [...new Set(list)].sort();
  return (
    <div className="border-t border-slate-200 pt-1.5">
      <div className="mb-1 text-[11px] font-semibold text-slate-500">⏰ {t('routine.remindAt')}</div>
      <div className="flex flex-wrap items-center gap-1">
        {times.map((time) => (
          <span key={time} className="inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium ring-1 ring-slate-300">
            {time}
            <button className="text-slate-400 hover:text-rose-600" aria-label={t('wbs.delete')} onClick={() => onChange(times.filter((x) => x !== time))}>
              ✕
            </button>
          </span>
        ))}
        {adding ? (
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-400 bg-white px-1 py-0.5">
            <input
              type="time"
              autoFocus
              className="rounded px-1 text-[11px] outline-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft) {
                  onChange(sorted([...times, draft]));
                  setAdding(false);
                }
                if (e.key === 'Escape') setAdding(false);
              }}
            />
            <button
              className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              disabled={!draft}
              onClick={() => {
                onChange(sorted([...times, draft]));
                setAdding(false);
              }}
            >
              ✓ {t('routine.saveTime')}
            </button>
            <button className="px-1 text-[11px] text-slate-400 hover:text-slate-700" aria-label={t('routine.cancel')} onClick={() => setAdding(false)}>
              ✕
            </button>
          </span>
        ) : (
          <button
            className="rounded border border-emerald-500 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
            onClick={() => {
              setDraft('');
              setAdding(true);
            }}
          >
            + {t('routine.addTime')}
          </button>
        )}
      </div>
      {times.length > 0 && perm === 'default' && (
        <button
          className="mt-1.5 text-[11px] font-medium text-sky-700 hover:underline"
          onClick={() => void Notification.requestPermission().then(setPerm)}
        >
          🔔 {t('routine.enableNotify')}
        </button>
      )}
      {times.length > 0 && perm === 'denied' && <p className="mt-1 text-[10px] text-slate-500">{t('routine.notifyDenied')}</p>}
      {times.length > 0 && <p className="mt-1 text-[10px] text-slate-400">{t('routine.keepOpen')}</p>}
    </div>
  );
}
