import { differenceInCalendarDays, parseISO } from 'date-fns';
import { isDemoId } from './demo';
import type { Settings, WbsNode } from './types';

/** Remind to back up when the last JSON backup (or first use) is older than this. */
export const BACKUP_REMIND_DAYS = 7;

/**
 * Days since the last backup when a reminder is due, otherwise null.
 * Only nags when there is real (non-sample) data and the reminder isn't snoozed.
 */
export function backupReminderDays(nodes: WbsNode[], settings: Settings, now: Date = new Date()): number | null {
  if (!nodes.some((n) => !isDemoId(n.id))) return null;
  if (settings.backupSnoozeUntil && now < parseISO(settings.backupSnoozeUntil)) return null;
  const since = settings.lastBackupAt ?? settings.firstUsedAt;
  if (!since) return null;
  const days = differenceInCalendarDays(now, parseISO(since));
  return days >= BACKUP_REMIND_DAYS ? days : null;
}
