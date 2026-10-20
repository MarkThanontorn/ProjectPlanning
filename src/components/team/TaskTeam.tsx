import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import { lockState } from '../../team/client';
import { CREATE, DELETED } from '../../team/model';
import {
  beginEditSession,
  endEditSession,
  historyFor,
  memberName,
  recentEditByOther,
  useTeamStore,
  watchLock,
} from '../../team/teamStore';
import { cx } from '../ui';
import { sanitizeNode } from '../../domain/sanitize';
import { fieldLabel, fmtAgo, fmtValue, fmtWhen } from './format';
import { DeleteConflictCard, FieldConflictCard } from './TeamPanel';

/** Top of the task popup in team mode: who else is editing, recent edits, and this task's conflicts. */
export function TaskTeamBar({ nodeId }: { nodeId: string }) {
  const { t, i18n } = useTranslation();
  const active = useTeamStore((s) => s.status !== 'off');
  const members = useTeamStore((s) => s.members);
  const watching = useTeamStore((s) => s.watching);
  const conflicts = useTeamStore((s) => s.conflicts).filter((c) => c.e === nodeId && c.t === 'node');
  useTeamStore((s) => s.lastSyncAt);
  const now = useNow(30_000);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!active) return;
    beginEditSession(nodeId);
    return () => endEditSession();
  }, [active, nodeId]);

  if (!active) return null;
  const editors = members.filter((m) => !m.me && m.editing?.e === nodeId && lockState(m.editing, now));
  const recent = editors.length ? null : recentEditByOther('node', nodeId);

  return (
    <div className="mb-3 space-y-2">
      {!hidden &&
        editors.map((m) => {
          const state = lockState(m.editing, now)!;
          const watched = watching.some((w) => w.userId === m.id && w.nodeId === nodeId);
          return (
            <div
              key={m.id}
              className={cx(
                'flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm',
                state === 'active' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-600',
              )}
            >
              <span className="flex-1">
                {state === 'active'
                  ? `🔒 ${t('team.lockActive', { name: m.name, since: fmtWhen(m.editing!.since, i18n.language) })}`
                  : `⏳ ${t('team.lockStale', { name: m.name, ago: fmtAgo(m.editing!.beat, t) })}`}
              </span>
              <button
                className="rounded-md border border-current/30 bg-white px-2 py-0.5 disabled:opacity-60"
                disabled={watched}
                onClick={() => watchLock(m.id, nodeId)}
              >
                {watched ? `🔔 ${t('team.watching')}` : `🔔 ${t('team.notifyWhenDone')}`}
              </button>
              <button className="rounded-md px-2 py-0.5 hover:bg-white/60" onClick={() => setHidden(true)}>
                {t('team.editAnyway')}
              </button>
            </div>
          );
        })}
      {recent && (
        <div className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-800">
          ℹ {t('team.recentEdit', { name: memberName(recent.by), ago: fmtAgo(recent.at, t) })}
        </div>
      )}
      {conflicts.map((c) => (c.kind === 'field' ? <FieldConflictCard key={c.key} c={c} /> : <DeleteConflictCard key={c.key} c={c} />))}
    </div>
  );
}

/** Who changed what, newest first; any earlier value can be put back. */
export function TaskHistory({ nodeId }: { nodeId: string }) {
  const { t, i18n } = useTranslation();
  const active = useTeamStore((s) => s.status !== 'off');
  useTeamStore((s) => s.lastSyncAt);
  useAppStore((s) => s.nodes); // refresh after local edits
  const updateNode = useAppStore((s) => s.updateNode);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  if (!active) return null;
  const ops = open ? historyFor('node', nodeId) : [];

  const putBack = (f: string, v: unknown) => {
    const node = useAppStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (f.startsWith('custom.')) return updateNode(nodeId, { custom: { ...node.custom, [f.slice(7)]: String(v ?? '') } });
    // Old values come from other people's files: clean them like any incoming data.
    const fixed = sanitizeNode({ ...node, [f]: v });
    if (fixed && f in fixed) updateNode(nodeId, { [f]: fixed[f as keyof typeof fixed] });
  };

  return (
    <div className="mt-5 border-t border-slate-200 pt-3">
      <button className="text-sm font-medium text-slate-600 hover:text-slate-900" onClick={() => setOpen((x) => !x)}>
        {open ? '▾' : '▸'} 🕘 {t('team.history')}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-xs">
          {ops.length === 0 && <li className="text-slate-400">—</li>}
          {ops.slice(0, limit).map((o) => (
            <li key={o.id} className="group flex items-start gap-2">
              <span className="w-28 shrink-0 text-slate-400">{fmtWhen(o.at, i18n.language)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-700">{memberName(o.by)}</span>{' '}
                <span className="text-slate-500">{fieldLabel(o.f, t)}</span>
                {o.f !== CREATE && o.f !== DELETED && <span className="text-slate-800">: {fmtValue(o.f, o.v, t)}</span>}
              </span>
              {o.f !== CREATE && o.f !== DELETED && o.f !== 'timeLogs' && (
                <button
                  className="shrink-0 rounded px-1.5 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                  title={t('team.useThisHint')}
                  onClick={() => putBack(o.f, o.v)}
                >
                  ↩ {t('team.useThis')}
                </button>
              )}
            </li>
          ))}
          {ops.length > limit && (
            <li>
              <button className="text-slate-500 hover:underline" onClick={() => setLimit((x) => x + 50)}>
                {t('team.more', { n: ops.length - limit })}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Small marker next to a task name: someone is editing it, or it has a conflict. */
export function NodeTeamBadge({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation();
  const conflict = useTeamStore((s) => s.conflicts.some((c) => c.t === 'node' && c.e === nodeId));
  const editor = useTeamStore((s) => s.members.find((m) => !m.me && m.editing?.e === nodeId));
  const now = new Date();
  const lock = editor ? lockState(editor.editing, now) : null;
  if (!conflict && !lock) return null;
  return (
    <span className="ml-1 shrink-0 text-xs" title={conflict ? t('team.badgeConflict') : t('team.badgeEditing', { name: editor!.name })}>
      {conflict ? '⚠' : lock === 'active' ? '🔒' : '⏳'}
    </span>
  );
}
