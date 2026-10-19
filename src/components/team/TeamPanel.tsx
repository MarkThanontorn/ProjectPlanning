import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportJson } from '../../data/exportData';
import { hasDemo } from '../../domain/demo';
import { useNow } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import { folderPickerSupported, pickFolder, testFolder, type DirHandle } from '../../team/folder';
import type { DeleteConflict, FieldConflict } from '../../team/model';
import {
  connectTeam,
  dismissToast,
  inspectFolder,
  leaveTeam,
  memberName,
  reconnect,
  resolveDelete,
  resolveField,
  restoreFromTrash,
  setTeamTranslator,
  syncNow,
  useTeamStore,
  type FolderInfo,
} from '../../team/teamStore';
import { lockState } from '../../team/client';
import { cx } from '../ui';
import { fieldLabel, fmtAgo, fmtValue, fmtWhen, isOnline } from './format';

const openDialog = (dialog: 'connect' | 'conflicts' | 'trash' | null) => useTeamStore.setState({ dialog });

/** Sidebar block: join a team, or the team's status, members and sync button. */
export function TeamPanel() {
  const { t, i18n } = useTranslation();
  const team = useTeamStore();
  useNow(30_000); // keep "x min ago" fresh
  useEffect(() => setTeamTranslator((k, v) => String(t(k, v))), [t]);

  if (team.status === 'off')
    return (
      <div className="px-4 pb-2">
        <button
          className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-left text-xs text-slate-500 hover:border-emerald-400 hover:text-emerald-700"
          onClick={() => openDialog('connect')}
        >
          👥 {t('team.join')}
        </button>
      </div>
    );

  if (team.status === 'needs-permission')
    return (
      <div className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
        <div className="mb-1">👥 {t('team.needsPermission', { folder: team.folderName })}</div>
        <button className="w-full rounded-md bg-amber-500 py-1 font-medium text-white hover:bg-amber-600" onClick={() => void reconnect()}>
          {t('team.reconnect')}
        </button>
      </div>
    );

  const now = new Date();
  const fieldConflicts = team.conflicts.length;
  return (
    <div className="mx-3 mb-2 rounded-lg border border-slate-200 p-2 text-xs">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700" title={team.folderName}>
          👥 {team.folderName}
        </span>
        <button
          className="shrink-0 rounded-md border border-slate-300 px-2 py-0.5 font-medium hover:bg-slate-100 disabled:opacity-50"
          disabled={team.syncing}
          title={t('team.syncHint')}
          onClick={() => void syncNow()}
        >
          <span className={cx('inline-block', team.syncing && 'animate-spin')}>⟳</span> {t('team.syncNow')}
        </button>
      </div>
      <div className={cx('mt-0.5', team.error ? 'text-rose-600' : 'text-slate-400')} title={team.error ?? undefined}>
        {team.error ? `⚠ ${t('team.syncError')}` : `${t('team.lastSync')} ${fmtWhen(team.lastSyncAt, i18n.language)}`}
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {team.members.map((m) => {
          const lock = lockState(m.editing, now);
          const task = m.editing && lock ? useAppStore.getState().nodes.find((n) => n.id === m.editing!.e)?.name : null;
          return (
            <li key={m.id} className="leading-tight">
              <span className={cx('mr-1', m.me || isOnline(m.beat) ? 'text-emerald-500' : 'text-slate-300')}>●</span>
              <span className="font-medium text-slate-700">{m.name}</span>
              {m.me && <span className="text-slate-400"> ({t('team.you')})</span>}
              <span className="text-slate-400"> · {m.me ? fmtWhen(m.savedAt, i18n.language) : m.savedAt ? fmtAgo(m.savedAt, t) : '—'}</span>
              {task && (
                <div className="ml-3 truncate text-amber-700" title={task}>
                  {lock === 'active' ? '🔒' : '⏳'} {task}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
        {fieldConflicts > 0 && (
          <button className="font-medium text-rose-600 hover:underline" onClick={() => openDialog('conflicts')}>
            ⚠ {t('team.conflictsLink', { n: fieldConflicts })}
          </button>
        )}
        <button className="text-slate-500 hover:underline" onClick={() => openDialog('trash')}>
          🗑 {t('team.trashLink')}
          {team.trash.length ? ` (${team.trash.length})` : ''}
        </button>
        <button className="ml-auto text-slate-400 hover:text-rose-600 hover:underline" onClick={() => confirm(t('team.leaveConfirm')) && void leaveTeam()}>
          {t('team.leave')}
        </button>
      </div>
    </div>
  );
}

/** Join a team folder (or start one). */
export function ConnectTeamDialog() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [dir, setDir] = useState<DirHandle | null>(null);
  const [info, setInfo] = useState<FolderInfo | null>(null);
  const [mode, setMode] = useState<'team' | 'merge'>('team');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOwnData = useAppStore((s) => s.nodes.some((n) => !n.id.startsWith('demo_')));
  const demo = useAppStore((s) => hasDemo(s));
  const supported = folderPickerSupported();

  const choose = async (test = false) => {
    setError(null);
    try {
      const handle = test ? await testFolder() : await pickFolder();
      setDir(handle);
      setInfo(await inspectFolder(handle));
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(String((e as Error)?.message ?? e));
    }
  };

  const connect = async () => {
    if (!dir || !info || !name.trim()) return;
    setBusy(true);
    try {
      // Joining an existing team replaces what's on this computer: keep a backup first.
      if (info.hasData && mode === 'team' && hasOwnData) {
        const { nodes, columns, settings, today, milestones } = useAppStore.getState();
        exportJson({ nodes, columns, settings, today, milestones });
      }
      await connectTeam(dir, name, info.hasData ? mode : 'merge');
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setBusy(false);
    }
  };

  return (
    <Modal title={`👥 ${t('team.connectTitle')}`} onClose={() => openDialog(null)}>
      <p className="text-sm text-slate-600">{t('team.connectIntro')}</p>
      {!supported ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">⚠ {t('team.unsupported')}</p>
      ) : (
        <div className="mt-4 space-y-4 text-sm">
          <label className="block">
            <span className="font-medium text-slate-700">1. {t('team.yourName')}</span>
            <input
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
              value={name}
              placeholder={t('team.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div>
            <div className="font-medium text-slate-700">2. {t('team.chooseFolder')}</div>
            <p className="text-xs text-slate-500">{t('team.chooseFolderHint')}</p>
            <div className="mt-1 flex items-center gap-2">
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100" onClick={() => void choose()}>
                📁 {t('team.pick')}
              </button>
              {import.meta.env.DEV && (
                <button className="text-xs text-slate-400 hover:underline" onClick={() => void choose(true)}>
                  {t('team.testFolder')}
                </button>
              )}
              {dir && <span className="truncate font-medium text-emerald-700">✓ {dir.name}</span>}
            </div>
          </div>
          {info && (
            <div className="rounded-lg bg-slate-50 p-3">
              {info.hasData ? (
                <>
                  <div className="text-slate-700">{t('team.existing', { names: info.members.join(', ') })}</div>
                  {hasOwnData && (
                    <div className="mt-2 space-y-1">
                      <label className="flex gap-2">
                        <input type="radio" checked={mode === 'team'} onChange={() => setMode('team')} />
                        <span>{t('team.modeTeam')}</span>
                      </label>
                      <label className="flex gap-2">
                        <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                        <span>{t('team.modeMerge')}</span>
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-700">
                  {t('team.first')}
                  {demo && <div className="mt-1 text-amber-700">🧪 {t('team.demoWarn')}</div>}
                </div>
              )}
            </div>
          )}
          {error && <p className="text-rose-600">⚠ {error}</p>}
          <div className="flex justify-end gap-2">
            <button className="rounded-lg px-3 py-1.5 hover:bg-slate-100" onClick={() => openDialog(null)}>
              {t('team.cancel')}
            </button>
            <button
              className="rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              disabled={!dir || !info || !name.trim() || busy}
              onClick={() => void connect()}
            >
              {t('team.connect')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function recordName(t: string, e: string): string {
  const s = useAppStore.getState();
  if (t === 'node') return s.nodes.find((n) => n.id === e)?.name ?? e;
  if (t === 'milestone') return s.milestones.find((m) => m.id === e)?.name ?? e;
  return s.columns.find((c) => c.id === e)?.label || e;
}

/** Every unresolved conflict, with the competing values side by side. */
export function ConflictsDialog() {
  const { t } = useTranslation();
  const conflicts = useTeamStore((s) => s.conflicts);
  return (
    <Modal title={`⚠ ${t('team.conflictsTitle')}`} onClose={() => openDialog(null)} wide>
      <p className="text-sm text-slate-600">{t('team.conflictsIntro')}</p>
      {conflicts.length === 0 && <p className="mt-4 text-sm text-emerald-700">✓ {t('team.noConflicts')}</p>}
      <div className="mt-4 space-y-3">
        {conflicts.map((c) => (c.kind === 'field' ? <FieldConflictCard key={c.key} c={c} /> : <DeleteConflictCard key={c.key} c={c} />))}
      </div>
    </Modal>
  );
}

export function FieldConflictCard({ c }: { c: FieldConflict }) {
  const { t, i18n } = useTranslation();
  const [pick, setPick] = useState(c.options[c.options.length - 1].opId);
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-sm">
      <div className="font-medium text-slate-800">
        {recordName(c.t, c.e)} — <span className="text-rose-700">{fieldLabel(c.f, t)}</span>
      </div>
      <div className="text-xs text-slate-500">
        {t('team.before')}: {fmtValue(c.f, c.base, t)}
      </div>
      <div className="mt-2 space-y-1">
        {c.options.map((o) => (
          <label key={o.opId} className="flex items-start gap-2">
            <input type="radio" className="mt-1" checked={pick === o.opId} onChange={() => setPick(o.opId)} />
            <span>
              <span className="font-semibold">{fmtValue(c.f, o.v, t)}</span>
              <span className="text-slate-500">
                {' '}
                · {t('team.editedBy', { name: memberName(o.by) })} · {fmtWhen(o.at, i18n.language)}
              </span>
            </span>
          </label>
        ))}
      </div>
      <button className="mt-2 rounded-lg bg-slate-800 px-3 py-1 text-white hover:bg-slate-700" onClick={() => resolveField(c, pick)}>
        {t('team.keepSelected')}
      </button>
    </div>
  );
}

export function DeleteConflictCard({ c }: { c: DeleteConflict }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-sm">
      <div className="font-medium text-slate-800">
        🗑 {recordName(c.t, c.e)} — {t('team.deletedByAt', { name: memberName(c.deletedBy), when: fmtWhen(c.deletedAt, i18n.language) })}
      </div>
      <div className="mt-1 text-xs text-slate-600">{t('team.butEdited')}</div>
      <ul className="ml-4 list-disc text-xs text-slate-600">
        {c.edits.map((x, i) => (
          <li key={i}>
            {memberName(x.by)} · {x.e !== c.e ? `${recordName(c.t, x.e)}: ` : ''}
            {fieldLabel(x.f, t)} · {fmtWhen(x.at, i18n.language)}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <button className="rounded-lg bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700" onClick={() => resolveDelete(c, 'restore')}>
          {t('team.keepIt')}
        </button>
        <button className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-rose-700 hover:bg-rose-50" onClick={() => resolveDelete(c, 'delete')}>
          {t('team.deleteIt')}
        </button>
      </div>
    </div>
  );
}

/** Deleted items, newest first, each restorable. */
export function TrashDialog() {
  const { t, i18n } = useTranslation();
  const trash = useTeamStore((s) => s.trash);
  const rows = trash.filter((x) => x.t !== 'column');
  return (
    <Modal title={`🗑 ${t('team.trashTitle')}`} onClose={() => openDialog(null)}>
      <p className="text-sm text-slate-600">{t('team.trashIntro')}</p>
      {rows.length === 0 && <p className="mt-4 text-sm text-slate-400">{t('team.trashEmpty')}</p>}
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {rows.map((x) => (
          <li key={`${x.t}|${x.e}`} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{x.t === 'milestone' ? '◆ ' : ''}{x.name}</span>
              <span className="text-xs text-slate-500">
                {' '}
                · {t('team.deletedByAt', { name: memberName(x.by), when: fmtWhen(x.at, i18n.language) })}
              </span>
            </span>
            <button className="shrink-0 rounded-lg border border-slate-300 px-2 py-0.5 hover:bg-slate-100" onClick={() => restoreFromTrash(x.t, x.e)}>
              ↩ {t('team.restore')}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-2xl', wide ? 'max-w-2xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-lg font-bold text-slate-900">{title}</h2>
          <button className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Dialogs and notifications for team mode (rendered once in the shell). */
export function TeamOverlays() {
  const { t } = useTranslation();
  const dialog = useTeamStore((s) => s.dialog);
  const toasts = useTeamStore((s) => s.toasts);
  return (
    <>
      {dialog === 'connect' && <ConnectTeamDialog />}
      {dialog === 'conflicts' && <ConflictsDialog />}
      {dialog === 'trash' && <TrashDialog />}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={cx(
              'pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-2 text-sm shadow-lg',
              x.tone === 'warn' ? 'bg-rose-600 text-white' : x.tone === 'ok' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white',
            )}
          >
            <span>{x.text}</span>
            {x.action === 'conflicts' && (
              <button
                className="shrink-0 rounded-md bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
                onClick={() => {
                  openDialog('conflicts');
                  dismissToast(x.id);
                }}
              >
                {t('team.review')}
              </button>
            )}
            <button className="shrink-0 opacity-70 hover:opacity-100" onClick={() => dismissToast(x.id)} aria-label="close">
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
