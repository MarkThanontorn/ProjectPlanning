import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scheduleConflicts, successorsOf, wouldCycle } from '../domain/deps';
import type { WbsNode } from '../domain/types';
import { useComputed, useLeafTasks, useNow } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { StatusBadge } from './ui';

/** Predecessor list for a task: add / remove links, with loop and schedule checks. */
export function DependencyEditor({ node }: { node: WbsNode }) {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const { addDependency, removeDependency, openTask } = useAppStore();
  const tasks = useLeafTasks();
  const computed = useComputed(useNow(60_000));
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const deps = node.dependsOn.map((id) => nodes.find((n) => n.id === id)).filter((n): n is WbsNode => !!n);
  const conflicts = new Set(scheduleConflicts(node, nodes).map((n) => n.id));
  const successors = successorsOf(nodes, node.id);
  const path = (n: WbsNode) => computed.get(n.id)?.path.join(' / ');

  const q = query.trim().toLowerCase();
  const options = tasks.filter(
    (n) => n.id !== node.id && !node.dependsOn.includes(n.id) && (!q || [n.name, ...(computed.get(n.id)?.path ?? [])].some((s) => s.toLowerCase().includes(q))),
  );

  return (
    <div className="space-y-1.5 text-sm">
      {deps.length === 0 && !adding && <p className="text-slate-400">{t('deps.none')}</p>}
      {deps.map((d) => (
        <div key={d.id} className="group flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1">
          <span>{d.status === 'done' ? '✅' : '🔒'}</span>
          <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openTask(d.id)}>
            {d.name} <span className="text-xs text-slate-400">{path(d)}</span>
          </button>
          {conflicts.has(d.id) && <span className="text-xs text-rose-600" title={t('deps.conflict', { name: d.name })}>⚠</span>}
          <StatusBadge status={d.status} />
          <button className="invisible text-slate-400 hover:text-rose-600 group-hover:visible" aria-label="remove" onClick={() => removeDependency(node.id, d.id)}>
            ✕
          </button>
        </div>
      ))}
      {[...conflicts].length > 0 && (
        <p className="text-xs text-rose-600">⚠ {t('deps.conflict', { name: deps.filter((d) => conflicts.has(d.id)).map((d) => d.name).join(', ') })}</p>
      )}

      {adding ? (
        <div className="rounded-lg border border-slate-300 p-2">
          <input
            autoFocus
            className="mb-1.5 w-full rounded border border-slate-300 px-2 py-1 outline-none focus:border-emerald-500"
            placeholder={t('deps.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setAdding(false))}
          />
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {options.map((n) => {
              const loop = wouldCycle(nodes, node.id, n.id);
              return (
                <li key={n.id}>
                  <button
                    disabled={loop}
                    title={loop ? t('deps.cycle') : undefined}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => {
                      addDependency(node.id, n.id);
                      setAdding(false);
                      setQuery('');
                    }}
                  >
                    <span className="truncate">{n.name}</span>
                    <span className="truncate text-xs text-slate-400">{path(n)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="mt-1 text-xs text-slate-500 hover:underline" onClick={() => setAdding(false)}>
            {t('detail.close')}
          </button>
        </div>
      ) : (
        <button className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => setAdding(true)}>
          {t('deps.add')}
        </button>
      )}

      {successors.length > 0 && (
        <p className="pt-1 text-xs text-slate-500">
          {t('deps.successors')}: {successors.map((s) => s.name).join(', ')}
        </p>
      )}
    </div>
  );
}
