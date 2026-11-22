import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { joinPeople, knownPeople, splitPeople } from '../domain/people';
import { useAppStore } from '../store/useAppStore';
import { cx } from './ui';

/**
 * In-charge as name chips. Click to edit: pick from people used before or type a new name;
 * Enter adds a person (Enter on an empty box saves), Backspace removes the last one, Esc cancels.
 */
export function PeopleField({ value, onChange, fill }: { value: string; onChange: (v: string) => void; fill?: boolean }) {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const known = useMemo(() => knownPeople(nodes), [nodes]);
  const people = splitPeople(value);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const [list, setList] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [active, setActive] = useState(-1);

  const query = text.trim().toLowerCase();
  const suggestions = known.filter((k) => !list.includes(k) && k.toLowerCase().includes(query)).slice(0, 8);
  const add = (name: string) => {
    const more = splitPeople(name).filter((p) => !list.includes(p));
    if (more.length) setList((l) => [...l, ...more]);
    setText('');
    setActive(-1);
  };
  const save = () => {
    const final = [...list, ...splitPeople(text).filter((p) => !list.includes(p))];
    if (joinPeople(final) !== joinPeople(people)) onChange(joinPeople(final));
    setBox(null);
  };

  return (
    <>
      <button
        type="button"
        className={cx('flex min-h-[1.75rem] max-w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100', fill ? 'w-full' : 'min-w-[7rem]')}
        title={t('people.edit')}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setList(people);
          setText('');
          setActive(-1);
          setBox({ left: Math.max(8, Math.min(r.left, window.innerWidth - 336)), top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 330)) });
        }}
      >
        {people.length === 0 && <span className="px-0.5 text-slate-400">—</span>}
        {people.map((p) => (
          <span key={p} className="whitespace-nowrap rounded-full bg-slate-100 px-2 text-xs leading-5 text-slate-700 ring-1 ring-slate-200">
            {p}
          </span>
        ))}
      </button>
      {box &&
        createPortal(
          <div className="fixed inset-0 z-[55]" onMouseDown={save}>
            <div
              role="dialog"
              aria-label={t('col.inCharge')}
              className="fixed w-80 rounded-xl border border-slate-300 bg-white p-2.5 text-sm shadow-2xl"
              style={box}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-300 p-1.5 focus-within:border-emerald-500">
                {list.map((p) => (
                  <span key={p} className="flex items-center gap-0.5 rounded-full bg-emerald-50 py-0.5 pl-2 pr-1 text-xs text-emerald-800 ring-1 ring-emerald-200">
                    {p}
                    <button type="button" className="grid h-4 w-4 place-items-center rounded-full hover:bg-emerald-200" aria-label={t('wbs.delete')} onClick={() => setList((l) => l.filter((x) => x !== p))}>
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  autoFocus
                  className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 outline-none"
                  value={text}
                  placeholder={list.length ? '' : t('people.placeholder')}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Typing a separator adds the name before it.
                    if (/[,;/]/.test(v)) add(v);
                    else {
                      setText(v);
                      setActive(-1);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActive((i) => Math.min(suggestions.length - 1, i + 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActive((i) => Math.max(-1, i - 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (active >= 0 && suggestions[active]) add(suggestions[active]);
                      else if (text.trim()) add(text);
                      else save();
                    } else if (e.key === 'Backspace' && !text && list.length) setList((l) => l.slice(0, -1));
                    else if (e.key === 'Escape') setBox(null);
                  }}
                />
              </div>
              {suggestions.length > 0 && (
                <ul className="mt-1.5 max-h-48 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <li key={s}>
                      <button
                        type="button"
                        className={cx('w-full rounded px-2 py-1 text-left', i === active ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-100')}
                        onClick={() => add(s)}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">{t('people.hint')}</span>
                <button type="button" className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700" onClick={save}>
                  {t('app.save')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
