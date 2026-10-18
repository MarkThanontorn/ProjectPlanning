import { describe, expect, it } from 'vitest';
import { backupReminderDays } from './backup';
import { createNode, defaultSettings } from './factory';
import type { Settings } from './types';

const now = new Date('2026-10-20T10:00:00');
const mine = createNode('project', null, 'Mine', 0);
const demo = { ...createNode('project', null, 'Demo', 0), id: 'demo_x' };
const s = (patch: Partial<Settings>): Settings => ({ ...defaultSettings(), ...patch });

describe('backup reminder', () => {
  it('reminds after 7 days without a backup', () => {
    expect(backupReminderDays([mine], s({ lastBackupAt: '2026-10-14T09:00:00' }), now)).toBeNull(); // 6 days
    expect(backupReminderDays([mine], s({ lastBackupAt: '2026-10-13T09:00:00' }), now)).toBe(7);
  });
  it('counts from first use when there was never a backup', () => {
    expect(backupReminderDays([mine], s({ firstUsedAt: '2026-10-01T09:00:00' }), now)).toBe(19);
    expect(backupReminderDays([mine], s({ firstUsedAt: '2026-10-19T09:00:00' }), now)).toBeNull();
  });
  it('stays quiet with only sample data, or while snoozed', () => {
    expect(backupReminderDays([demo], s({ firstUsedAt: '2026-10-01T09:00:00' }), now)).toBeNull();
    expect(backupReminderDays([mine], s({ firstUsedAt: '2026-10-01T09:00:00', backupSnoozeUntil: '2026-10-21T00:00:00' }), now)).toBeNull();
  });
});
