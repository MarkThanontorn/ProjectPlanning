import { describe, expect, it } from 'vitest';
import {
  canPlace,
  hoursOnDate,
  completeTask,
  computeAll,
  flattenTree,
  isRunning,
  leadtimeParts,
  loggedHours,
  pauseTimer,
  startTimer,
  workingDays,
} from './calc';
import { createNode, defaultSettings } from './factory';
import { isThisWeek, weekRange } from './week';
import { autoUrgent, comparePriority, placement, slack } from './eisenhower';
import { blockers, scheduleConflicts, wouldCycle } from './deps';
import { completedIds } from './completion';
import type { WbsNode } from './types';

const settings = defaultSettings();
const task = (parentId: string | null, patch: Partial<WbsNode> = {}, order = 0) => ({
  ...createNode('task', parentId, 't', order),
  ...patch,
});

describe('workingDays', () => {
  it('counts Mon–Fri inclusively', () => {
    // 2026-10-12 is a Monday
    expect(workingDays('2026-10-12', '2026-10-16', settings.workDays)).toBe(5);
    expect(workingDays('2026-10-12', '2026-10-18', settings.workDays)).toBe(5);
    expect(workingDays('2026-10-16', '2026-10-19', settings.workDays)).toBe(2);
    expect(workingDays('2026-10-12', '2026-10-12', settings.workDays)).toBe(1);
  });
  it('returns 0 when end is before start', () => {
    expect(workingDays('2026-10-16', '2026-10-12', settings.workDays)).toBe(0);
  });
});

describe('leadtime', () => {
  it('formats days and work hours using hoursPerDay', () => {
    expect(leadtimeParts(16, 8)).toEqual({ days: 2, hours: 16 });
    expect(leadtimeParts(15, 8)).toEqual({ days: 1.88, hours: 15 });
    expect(leadtimeParts(null, 8)).toBeNull();
  });

  it('sums closed and running time logs', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    const logs = [
      { start: '2026-10-13T08:00:00Z', end: '2026-10-13T09:30:00Z' },
      { start: '2026-10-13T11:00:00Z', end: null },
    ];
    expect(loggedHours(logs, now)).toBeCloseTo(2.5);
  });

  it('manual override wins over the timer total', () => {
    const p = createNode('project', null, 'P', 0);
    const t = task(p.id, {
      timeLogs: [{ start: '2026-10-13T08:00:00Z', end: '2026-10-13T10:00:00Z' }],
      actualLeadtimeOverrideHrs: 15,
    });
    expect(computeAll([p, t], settings).get(t.id)!.actualHours).toBe(15);
  });
});

describe('rollup', () => {
  const p = createNode('project', null, 'Project A', 0);
  const s = createNode('group', p.id, 'Stage 1', 0);
  const a = task(s.id, { planStart: '2026-10-12', planEnd: '2026-10-13', progress: 0, actualLeadtimeOverrideHrs: 4 }, 0); // 16h
  const b = task(s.id, { planStart: '2026-10-05', planEnd: '2026-10-07', progress: 100, actualLeadtimeOverrideHrs: 15, actualStart: '2026-10-05', actualEnd: '2026-10-06' }, 1); // 24h
  const other = task(p.id, { progress: 50 }, 1); // no plan → weight 0
  const nodes = [p, s, a, b, other];
  const c = computeAll(nodes, settings);

  it('sums actual leadtime through every level', () => {
    expect(c.get(s.id)!.actualHours).toBe(19);
    expect(c.get(p.id)!.actualHours).toBe(19);
  });

  it('weights progress by planned hours', () => {
    expect(c.get(s.id)!.progress).toBe(60); // (0*16 + 100*24) / 40
    // Project: Stage(40h, 60%) + other(0h) → 60
    expect(c.get(p.id)!.progress).toBe(60);
  });

  it('falls back to a plain average when no child has a plan', () => {
    const g = createNode('group', null, 'G', 0);
    const x = task(g.id, { progress: 20 });
    const y = task(g.id, { progress: 80 }, 1);
    expect(computeAll([g, x, y], settings).get(g.id)!.progress).toBe(50);
  });

  it('derives empty parent dates from children', () => {
    expect(c.get(s.id)!.planStart).toBe('2026-10-05');
    expect(c.get(s.id)!.planEnd).toBe('2026-10-13');
    expect(c.get(s.id)!.actualStart).toBe('2026-10-05');
    expect(c.get(s.id)!.actualEnd).toBeNull(); // task a not finished
  });

  it('keeps manually entered parent dates', () => {
    const pm = { ...p, planStart: '2026-09-01' };
    expect(computeAll([pm, s, a, b, other], settings).get(p.id)!.planStart).toBe('2026-09-01');
  });

  it('tracks depth and path', () => {
    expect(c.get(a.id)!.depth).toBe(2);
    expect(c.get(a.id)!.path).toEqual(['Project A', 'Stage 1']);
  });

  it('flattens in order and hides collapsed children', () => {
    expect(flattenTree(nodes).map((n) => n.id)).toEqual([p.id, s.id, a.id, b.id, other.id]);
    expect(flattenTree([p, { ...s, collapsed: true }, a, b, other]).map((n) => n.id)).toEqual([p.id, s.id, other.id]);
  });
});

describe('timer', () => {
  const t0 = new Date('2026-10-13T08:00:00Z');
  const t1 = new Date('2026-10-13T10:00:00Z');
  const t2 = new Date('2026-10-13T11:00:00Z');
  const t3 = new Date('2026-10-13T12:00:00Z');

  it('start → pause → start → complete', () => {
    let n = task(null);
    n = startTimer(n, t0);
    expect(isRunning(n)).toBe(true);
    expect(n.status).toBe('in_progress');
    expect(n.actualStart).toBe('2026-10-13');

    expect(startTimer(n, t1)).toBe(n); // no double-open log

    n = pauseTimer(n, t1);
    expect(isRunning(n)).toBe(false);
    expect(loggedHours(n.timeLogs, t3)).toBe(2);

    n = startTimer(n, t2);
    n = completeTask(n, t3);
    expect(isRunning(n)).toBe(false);
    expect(n.status).toBe('done');
    expect(n.progress).toBe(100);
    expect(n.actualEnd).toBe('2026-10-13');
    expect(loggedHours(n.timeLogs, t3)).toBe(3);
  });
});

describe('this week', () => {
  const now = new Date('2026-10-14T09:00:00'); // Wednesday
  it('computes the Monday–Sunday range', () => {
    expect(weekRange(now)).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });
  it('matches plan overlap, due date, today and active status', () => {
    expect(isThisWeek(task(null, { planStart: '2026-10-01', planEnd: '2026-10-12' }), now)).toBe(true);
    expect(isThisWeek(task(null, { planStart: '2026-10-19', planEnd: '2026-10-25' }), now)).toBe(false);
    expect(isThisWeek(task(null, { dueDate: '2026-10-18' }), now)).toBe(true);
    expect(isThisWeek(task(null, { todayDate: '2026-10-14' }), now)).toBe(true);
    expect(isThisWeek(task(null, { status: 'reviewing' }), now)).toBe(true);
    expect(isThisWeek(task(null), now)).toBe(false);
  });
});

describe('canPlace', () => {
  const p1 = createNode('project', null, 'P1', 0);
  const p2 = createNode('project', null, 'P2', 1);
  const g = createNode('group', p1.id, 'G', 0);
  const sub = createNode('group', g.id, 'Sub', 0);
  const t = createNode('task', g.id, 'T', 1);
  const nodes = [p1, p2, g, sub, t];

  it('keeps projects at the root', () => {
    expect(canPlace(nodes, p2.id, null)).toBe(true);
    expect(canPlace(nodes, p2.id, p1.id)).toBe(false);
  });
  it('lets groups and tasks move into any project or group', () => {
    expect(canPlace(nodes, t.id, p2.id)).toBe(true);
    expect(canPlace(nodes, t.id, sub.id)).toBe(true);
    expect(canPlace(nodes, g.id, p2.id)).toBe(true);
    expect(canPlace(nodes, t.id, null)).toBe(false);
  });
  it('rejects tasks as parents and cycles', () => {
    expect(canPlace(nodes, sub.id, t.id)).toBe(false);
    expect(canPlace(nodes, g.id, g.id)).toBe(false);
    expect(canPlace(nodes, g.id, sub.id)).toBe(false);
  });
});

describe('manual leadtime', () => {
  it('leaf override wins over the plan span; parents sum children', () => {
    const p = createNode('project', null, 'P', 0);
    const a = task(p.id, { planStart: '2026-10-12', planEnd: '2026-10-16', leadtimeOverrideHrs: 6 }); // span 40h
    const b = task(p.id, { planStart: '2026-10-12', planEnd: '2026-10-13' }, 1); // 16h
    const c = computeAll([p, a, b], settings);
    expect(c.get(a.id)!.planHours).toBe(6);
    expect(c.get(p.id)!.planHours).toBe(22);
    expect(computeAll([{ ...p, leadtimeOverrideHrs: 100 }, a, b], settings).get(p.id)!.planHours).toBe(100);
  });
  it('parent with no planned children has no leadtime', () => {
    const p = createNode('project', null, 'P', 0);
    expect(computeAll([p, task(p.id)], settings).get(p.id)!.planHours).toBeNull();
  });
});

describe('hoursOnDate', () => {
  it('counts only the part of each log inside that day', () => {
    const logs = [
      { start: '2026-10-13T22:00:00', end: '2026-10-14T02:00:00' },
      { start: '2026-10-14T09:00:00', end: null },
    ];
    expect(hoursOnDate(logs, '2026-10-14', new Date('2026-10-14T10:30:00'))).toBeCloseTo(3.5);
    expect(hoursOnDate(logs, '2026-10-13', new Date('2026-10-14T10:30:00'))).toBeCloseTo(2);
  });
});

describe('eisenhower', () => {
  const today = '2026-10-14';
  it('places by rank and plan end, with per-axis overrides', () => {
    const urgentA = task(null, { rank: 'A', planEnd: '2026-10-16' });
    expect(placement(urgentA, settings, today)).toMatchObject({ important: true, urgent: true, daysLeft: 2 });
    const laterC = task(null, { rank: 'C', planEnd: '2026-10-30' });
    expect(placement(laterC, settings, today)).toMatchObject({ important: false, urgent: false });
    const overdue = task(null, { planEnd: '2026-10-10' });
    expect(placement(overdue, settings, today).urgent).toBe(true);
    const inserted = { ...laterC, eisenhower: { important: null, urgent: true } };
    expect(placement(inserted, settings, today)).toMatchObject({ important: false, urgent: true, manualUrgent: true, manualImportant: false });
  });
  it('sorts inserted-urgent first, then rank, then nearest plan end', () => {
    const a1 = task(null, { name: 'a1', rank: 'A', planEnd: '2026-10-20' });
    const a2 = task(null, { name: 'a2', rank: 'A', planEnd: '2026-10-15' });
    const b = task(null, { name: 'b', rank: 'B', planEnd: '2026-10-14' });
    const ins = task(null, { name: 'ins', rank: 'C', eisenhower: { important: null, urgent: true } });
    const sorted = [a1, b, ins, a2].sort((x, y) => comparePriority(x, y, settings, today)).map((n) => n.name);
    expect(sorted).toEqual(['ins', 'a2', 'a1', 'b']);
  });
});

describe('dependencies', () => {
  const a = task(null, { name: 'A', planStart: '2026-10-12', planEnd: '2026-10-14' });
  const b = task(null, { name: 'B', planStart: '2026-10-14', planEnd: '2026-10-16', dependsOn: [a.id] });
  const c = task(null, { name: 'C', dependsOn: [b.id] });
  const nodes = [a, b, c];
  it('blocks until predecessors are done', () => {
    expect(blockers(b, nodes).map((n) => n.name)).toEqual(['A']);
    expect(blockers(b, [{ ...a, status: 'done' }, b, c])).toEqual([]);
  });
  it('rejects links that would form a loop', () => {
    expect(wouldCycle(nodes, a.id, c.id)).toBe(true); // A → C → B → A
    expect(wouldCycle(nodes, a.id, a.id)).toBe(true);
    expect(wouldCycle(nodes, c.id, a.id)).toBe(false);
  });
  it('flags plans that start before a predecessor ends', () => {
    expect(scheduleConflicts(b, nodes).map((n) => n.name)).toEqual(['A']);
    expect(scheduleConflicts({ ...b, planStart: '2026-10-15' }, nodes)).toEqual([]);
  });
});

describe('urgency from slack', () => {
  const today = '2026-10-14'; // Wednesday
  it('is urgent when remaining work + 25% no longer fits before Plan End', () => {
    // 16h left, Plan End Thu → 2 working days = 16h available; 16 × 1.25 ≥ 16 → urgent
    const tight = task(null, { planEnd: '2026-10-15', leadtimeOverrideHrs: 16 });
    expect(autoUrgent(tight, settings, today)).toBe(true);
    // Same work, Plan End next Wed → 6 days = 48h available → not urgent
    expect(autoUrgent({ ...tight, planEnd: '2026-10-21' }, settings, today)).toBe(false);
  });
  it('counts only the work not yet done', () => {
    const half = task(null, { planEnd: '2026-10-15', leadtimeOverrideHrs: 16, progress: 50 });
    expect(slack(half, settings, today)).toEqual({ remainingHrs: 8, availableHrs: 16 });
    expect(autoUrgent(half, settings, today)).toBe(false); // 10h ≤ 16h
  });
  it('falls back to days left without a Leadtime, and overdue is always urgent', () => {
    expect(autoUrgent(task(null, { dueDate: '2026-10-16' }), settings, today)).toBe(true);
    expect(autoUrgent(task(null, { dueDate: '2026-10-30' }), settings, today)).toBe(false);
    expect(autoUrgent(task(null, { planEnd: '2026-10-10', leadtimeOverrideHrs: 1 }), settings, today)).toBe(true);
  });
});

describe('completedIds', () => {
  it('marks a completed project/group and everything inside it', () => {
    const p = { ...createNode('project', null, 'P', 0), status: 'done' as const };
    const g = createNode('group', p.id, 'G', 0);
    const t1 = task(g.id);
    const other = createNode('project', null, 'Q', 1);
    const t2 = task(other.id, { status: 'done' });
    const t3 = task(other.id, {}, 1);
    const ids = completedIds([p, g, t1, other, t2, t3]);
    expect([...ids].sort()).toEqual([p.id, g.id, t1.id, t2.id].sort());
  });
});
