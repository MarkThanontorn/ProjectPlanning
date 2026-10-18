import type { ReactNode } from 'react';
import type { DateRange, NumRange } from '../domain/listFilter';
import { cx } from './ui';

/** Shared filter widgets (Task List panel, board "All" column). */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      {children}
    </div>
  );
}

/** Toggle chips for multi-select filters. */
export function Chips<T extends string>({ options, selected, onChange }: { options: { value: T; label: string }[]; selected: T[]; onChange: (v: T[]) => void }) {
  if (options.length === 0) return <span className="text-sm text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value || '__empty'}
            type="button"
            className={cx(
              'rounded-full border px-2.5 py-0.5 text-xs',
              on ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400',
              !o.value && !on && 'italic text-slate-500',
            )}
            onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function DateRangeInput({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const cls = 'w-[9.5rem] rounded border border-slate-300 px-1.5 py-1 text-sm';
  return (
    <div className="flex items-center gap-1.5">
      <input type="date" className={cls} value={value.from ?? ''} max={value.to ?? undefined} onChange={(e) => onChange({ ...value, from: e.target.value || null })} />
      <span className="text-slate-400">–</span>
      <input type="date" className={cls} value={value.to ?? ''} min={value.from ?? undefined} onChange={(e) => onChange({ ...value, to: e.target.value || null })} />
    </div>
  );
}

/** Min–max numeric range; with `options` it becomes two dropdowns (e.g. Progress steps). */
export function NumRangeInput({ value, onChange, options }: { value: NumRange; onChange: (v: NumRange) => void; options?: number[] }) {
  const parse = (s: string) => (s.trim() === '' ? null : Number(s));
  const cls = 'w-24 rounded border border-slate-300 px-1.5 py-1 text-sm';
  const field = (k: 'min' | 'max') =>
    options ? (
      <select className={cls} value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: parse(e.target.value) })}>
        <option value="">{k === 'min' ? 'min' : 'max'}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : (
      <input
        type="number"
        min={0}
        step={0.5}
        placeholder={k}
        className={cls}
        value={value[k] ?? ''}
        onChange={(e) => onChange({ ...value, [k]: parse(e.target.value) })}
      />
    );
  return (
    <div className="flex items-center gap-1.5">
      {field('min')}
      <span className="text-slate-400">–</span>
      {field('max')}
    </div>
  );
}
