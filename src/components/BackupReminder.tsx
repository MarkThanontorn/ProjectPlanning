import { useTranslation } from 'react-i18next';
import { addDays } from 'date-fns';
import { backupReminderDays } from '../domain/backup';
import { useNow } from '../hooks';
import { useAppStore } from '../store/useAppStore';

/** Gentle reminder to export a JSON backup when the last one is a week old (or never made). */
export function BackupReminder({ onBackup }: { onBackup: () => void }) {
  const { t } = useTranslation();
  const now = useNow(60 * 60_000);
  const nodes = useAppStore((s) => s.nodes);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const days = backupReminderDays(nodes, settings, now);
  if (days === null) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
      <span>💾 {settings.lastBackupAt ? t('backup.since', { n: days }) : t('backup.never', { n: days })}</span>
      <div className="ml-auto flex gap-2">
        <button className="rounded-lg bg-sky-600 px-3 py-1 font-medium text-white hover:bg-sky-700" onClick={onBackup}>
          {t('backup.now')}
        </button>
        <button
          className="rounded-lg border border-sky-300 bg-white px-3 py-1 text-sky-900 hover:bg-sky-100"
          onClick={() => updateSettings({ backupSnoozeUntil: addDays(new Date(), 1).toISOString() })}
        >
          {t('backup.later')}
        </button>
      </div>
    </div>
  );
}
