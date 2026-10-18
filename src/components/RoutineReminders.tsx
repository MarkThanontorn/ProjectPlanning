import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { todayIso } from '../domain/calc';
import { dueReminders, type DueReminder } from '../domain/routine';
import { useNow } from '../hooks';
import { useAppStore } from '../store/useAppStore';

const SHOWN_KEY = 'pp.reminders.shown';

/** Reminder keys already shown, remembered per day so a reload doesn't repeat them. */
function loadShown(day: string): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '{}') as { day?: string; keys?: string[] };
    return new Set(saved.day === day ? saved.keys : []);
  } catch {
    return new Set();
  }
}
function saveShown(day: string, keys: Set<string>) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify({ day, keys: [...keys] }));
  } catch {
    // Storage unavailable: reminders may show again after a reload.
  }
}

/**
 * Checks routine reminder times every 20 s while the app is open. Each due
 * reminder shows once: as a card in the corner, and as a system notification
 * if the browser allows it.
 */
export function RoutineReminders() {
  const { t } = useTranslation();
  const now = useNow(20_000);
  const day = todayIso(now);
  const routines = useAppStore((s) => s.today.routines);
  const doneToday = useAppStore((s) => s.today.routineDone[day]);
  const toggleRoutine = useAppStore((s) => s.toggleRoutine);
  const shown = useRef<{ day: string; keys: Set<string> }>({ day, keys: loadShown(day) });
  const [cards, setCards] = useState<DueReminder[]>([]);

  useEffect(() => {
    if (shown.current.day !== day) shown.current = { day, keys: loadShown(day) };
    const fresh = dueReminders(routines, doneToday ?? [], now, shown.current.keys);
    if (!fresh.length) return;
    for (const r of fresh) shown.current.keys.add(r.key);
    saveShown(day, shown.current.keys);
    setCards((c) => [...c, ...fresh]);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const r of fresh) new Notification(`⏰ ${r.time} · ${r.routine.text}`, { body: t('routine.notifyBody'), tag: r.key });
    }
  }, [now, day, routines, doneToday, t]);

  if (!cards.length) return null;
  const dismiss = (key: string) => setCards((c) => c.filter((x) => x.key !== key));
  return (
    <div className="fixed bottom-4 right-4 z-[60] w-80 space-y-2">
      {cards.map((r) => (
        <div key={r.key} role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">⏰ {t('routine.reminder')} · {r.time}</div>
          <div className="mt-0.5 font-semibold text-slate-900">{r.routine.text}</div>
          <div className="mt-2 flex gap-2">
            <button
              className="flex-1 rounded-md bg-emerald-600 py-1 text-sm font-medium text-white hover:bg-emerald-700"
              onClick={() => {
                if (!(doneToday ?? []).includes(r.routine.id)) toggleRoutine(r.routine.id, day);
                dismiss(r.key);
              }}
            >
              ✓ {t('routine.didIt')}
            </button>
            <button className="flex-1 rounded-md border border-slate-300 bg-white py-1 text-sm hover:bg-slate-50" onClick={() => dismiss(r.key)}>
              {t('routine.dismiss')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
