import { createNode, defaultColumns, defaultSettings, defaultToday } from '../domain/factory';
import { shiftIsoDate, todayIso } from '../domain/calc';
import type { AppData, WbsNode } from '../domain/types';

/** Sample data mirroring the wireframe, with dates placed around today. */
export function seedData(now: Date = new Date()): AppData {
  const today = todayIso(now);
  const d = (offset: number) => shiftIsoDate(today, offset);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  const projectA: WbsNode = {
    ...createNode('project', null, 'Project A', 0),
    planStart: d(-14),
    planEnd: d(40),
    dueDate: d(14),
    rank: 'C',
    inCharge: 'Thanaton',
  };
  const stage1: WbsNode = {
    ...createNode('group', projectA.id, 'Stage 1', 0),
    dueDate: d(30),
    rank: 'C',
    inCharge: 'Thanaton',
  };
  const taskA: WbsNode = {
    ...createNode('task', stage1.id, 'Task a', 0),
    detail: 'Prepare requirement document',
    planStart: d(0),
    planEnd: d(2),
    dueDate: d(2),
    rank: 'A',
    inCharge: 'Thanaton',
    status: 'in_progress',
    todayDate: today,
    actualStart: d(0),
    timeLogs: [{ start: hoursAgo(3), end: hoursAgo(1.5) }],
    checklist: [
      { id: 'cl1', text: 'List a-1', done: true },
      { id: 'cl2', text: 'List a-2', done: false },
    ],
    progress: 25,
  };
  const taskB: WbsNode = {
    ...createNode('task', stage1.id, 'Task b', 1),
    detail: 'Kick-off meeting',
    planStart: d(-14),
    planEnd: d(-10),
    actualStart: d(-14),
    actualEnd: d(-12),
    dueDate: d(-10),
    rank: 'B',
    inCharge: 'Thanaton',
    status: 'done',
    progress: 100,
    actualLeadtimeOverrideHrs: 15,
  };
  const daily: WbsNode = { ...createNode('project', null, 'Daily', 1) };
  const model01: WbsNode = { ...createNode('group', daily.id, 'Model "01"', 0) };
  const taskC: WbsNode = {
    ...createNode('task', model01.id, 'Task c', 0),
    detail: 'Daily model check',
    planStart: d(-1),
    planEnd: d(3),
    dueDate: d(3),
    rank: 'C',
    inCharge: 'Thanaton',
    status: 'in_progress',
    todayDate: today,
    actualStart: d(-1),
    progress: 25,
  };

  return {
    nodes: [{ ...projectA }, stage1, { ...taskA, dependsOn: [taskB.id] }, taskB, daily, model01, taskC],
    columns: defaultColumns(),
    settings: defaultSettings(),
    today: {
      ...defaultToday(),
      highlights: { [today]: [taskA.id] },
      routines: [
        { id: 'r1', text: 'เช็คอีเมล / ข้อความ' },
        { id: 'r2', text: 'อัปเดตความคืบหน้างาน' },
      ],
    },
    milestones: [
      { id: 'm1', projectId: projectA.id, name: 'Kick-off', date: d(-12), done: true },
      { id: 'm2', projectId: projectA.id, name: 'Requirement sign-off', date: d(7), done: false },
      { id: 'm3', projectId: projectA.id, name: 'Go-live', date: d(40), done: false },
    ],
  };
}
