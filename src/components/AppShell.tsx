import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppData } from '../domain/types';
import { exportCsv, exportJson, exportXlsx } from '../data/exportData';
import { useAppStore } from '../store/useAppStore';
import { cx, InlineText } from './ui';
import { RunningTasks } from './RunningTasks';
import { SidebarNav } from './SidebarNav';
import { RoutineReminders } from './RoutineReminders';
import { WhatsNew } from './WhatsNew';
import { DemoBanner } from './Onboarding';
import { BackupReminder } from './BackupReminder';
import { InstallButton, UpdateBanner } from './AppUpdate';
import { TeamOverlays, TeamPanel } from './team/TeamPanel';
import { useTeamStore } from '../team/teamStore';

function isAppData(x: unknown): x is AppData {
  const d = x as AppData;
  return !!d && Array.isArray(d.nodes) && Array.isArray(d.columns) && typeof d.settings === 'object';
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const { updateSettings, replaceAll, resetAll } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const teamOn = useTeamStore((s) => s.status !== 'off');

  const [exportOpen, setExportOpen] = useState(false);
  const [showNews, setShowNews] = useState(false);
  /** Full data snapshot (every part that is saved, including Today and milestones). */
  const snapshot = (): AppData => {
    const { nodes, columns, settings, today, milestones } = useAppStore.getState();
    return { nodes, columns, settings, today, milestones };
  };
  const runExport = async (kind: 'json' | 'xlsx' | 'csv') => {
    setExportOpen(false);
    if (kind === 'json') {
      exportJson(snapshot());
      updateSettings({ lastBackupAt: new Date().toISOString(), backupSnoozeUntil: null });
    }
    else if (kind === 'csv') exportCsv(snapshot());
    else await exportXlsx(snapshot());
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!isAppData(data)) throw new Error('invalid');
      if (confirm(t('app.importConfirm'))) replaceAll(data);
    } catch {
      alert(t('app.importError'));
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 pb-4 pt-5">
          <div className="text-lg font-bold text-slate-900">
            <span className="text-emerald-600">●</span> {t('app.title')}
          </div>
          <TeamName />
        </div>
        <SidebarNav />
        <TeamPanel />
        <RunningTasks />

        <div className="space-y-3 border-t border-slate-200 p-4 text-sm">
          <div className="flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label={t('app.theme')}>
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <button
                key={mode}
                title={t(`app.themeMode.${mode}`)}
                className={cx('flex-1 py-1.5', settings.theme === mode ? 'bg-slate-800 text-white' : 'hover:bg-slate-100')}
                onClick={() => updateSettings({ theme: mode })}
              >
                {mode === 'light' ? '☀' : mode === 'dark' ? '🌙' : '🖥'}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {(['th', 'en'] as const).map((lng) => (
              <button
                key={lng}
                className={cx('flex-1 py-1.5 font-medium', settings.lang === lng ? 'bg-slate-800 text-white' : 'hover:bg-slate-100')}
                onClick={() => updateSettings({ lang: lng })}
              >
                {lng === 'th' ? 'ไทย' : 'EN'}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-slate-600">
            {t('app.hoursPerDay')}
            <input
              type="number"
              min={1}
              max={24}
              className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-right"
              value={settings.hoursPerDay}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 1 && v <= 24) updateSettings({ hoursPerDay: v });
              }}
            />
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button className="w-full rounded-lg border border-slate-300 py-1.5 hover:bg-slate-100" onClick={() => setExportOpen((v) => !v)}>
                {t('app.export')} ▾
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                  <div className="absolute bottom-full left-0 z-50 mb-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xl">
                    {(['xlsx', 'csv', 'json'] as const).map((k) => (
                      <button key={k} className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => void runExport(k)}>
                        <div className="font-medium">{t(`app.exportAs.${k}`)}</div>
                        <div className="text-xs text-slate-500">{t(`app.exportHint.${k}`)}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button className="flex-1 rounded-lg border border-slate-300 py-1.5 hover:bg-slate-100" onClick={() => fileRef.current?.click()}>
              {t('app.import')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = '';
              }}
            />
          </div>
          <InstallButton />
          <button
            className="w-full text-center text-[11px] text-slate-400 hover:text-emerald-700 hover:underline"
            title={t('app.whatsNew')}
            onClick={() => setShowNews(true)}
          >
            v{__APP_VERSION__} · {t('app.whatsNew')}
          </button>
          <StorageStatus />
          {!teamOn && <button
            className="w-full text-center text-[11px] text-slate-400 hover:text-rose-600 hover:underline"
            onClick={() => confirm(t('onboard.resetConfirm')) && resetAll()}
          >
            {t('onboard.reset')}
          </button>}
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <UpdateBanner />
        <DemoBanner />
        <BackupReminder onBackup={() => void runExport('json')} />
        {children}
      </main>
      {showNews && <WhatsNew onClose={() => setShowNews(false)} />}
      <RoutineReminders />
      <TeamOverlays />
    </div>
  );
}

/** Team / owner line under the app name; click to edit. */
function TeamName() {
  const { t } = useTranslation();
  const teamName = useAppStore((s) => s.settings.teamName);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <InlineText
        autoFocus
        value={teamName}
        placeholder={t('app.teamPlaceholder')}
        className="-ml-1.5 mt-0.5 text-sm font-medium text-emerald-700"
        onCommit={(v) => updateSettings({ teamName: v.trim() })}
        onDone={() => setEditing(false)}
      />
    );
  return (
    <button
      className={cx('cursor-pencil mt-0.5 block max-w-full truncate text-left text-sm', teamName ? 'font-medium text-emerald-700' : 'text-slate-400 hover:text-slate-600')}
      title={t('app.teamEdit')}
      onClick={() => setEditing(true)}
    >
      {teamName || `+ ${t('app.teamAdd')}`}
    </button>
  );
}

/** One-line storage status: persistent or not, and when the last backup was made. */
function StorageStatus() {
  const { t, i18n } = useTranslation();
  const persisted = useAppStore((s) => s.storagePersisted);
  const lastBackupAt = useAppStore((s) => s.settings.lastBackupAt);
  const when = lastBackupAt
    ? new Intl.DateTimeFormat(i18n.language === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(lastBackupAt))
    : t('backup.none');
  return (
    <div
      className="text-center text-[11px] leading-tight text-slate-400"
      title={persisted === false ? t('backup.notPersistedHint') : persisted ? t('backup.persistedHint') : undefined}
    >
      {persisted === null ? '' : persisted ? `🔒 ${t('backup.persisted')} · ` : `⚠ ${t('backup.notPersisted')} · `}
      {t('backup.last')}: {when}
    </div>
  );
}
