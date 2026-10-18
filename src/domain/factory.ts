import type { BuiltInKey, ColumnDef, NodeKind, Settings, TodayData, WbsNode } from './types';

export const newId = (prefix = 'n') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function createNode(kind: NodeKind, parentId: string | null, name: string, order: number): WbsNode {
  return {
    id: newId(),
    parentId,
    kind,
    name,
    order,
    collapsed: false,
    detail: '',
    planStart: null,
    planEnd: null,
    actualStart: null,
    actualEnd: null,
    dueDate: null,
    rank: null,
    inCharge: '',
    remark: '',
    progress: 0,
    status: 'queue',
    eisenhower: null,
    todayDate: null,
    checklist: [],
    timeLogs: [],
    dependsOn: [],
    leadtimeOverrideHrs: null,
    actualLeadtimeOverrideHrs: null,
    custom: {},
  };
}

export const BUILT_IN_COLUMNS: BuiltInKey[] = [
  'detail',
  'planStart',
  'planEnd',
  'actualStart',
  'actualEnd',
  'leadtime',
  'actualLeadtime',
  'progress',
  'dueDate',
  'rank',
  'inCharge',
  'dependsOn',
  'status',
  'remark',
];

export const defaultColumns = (): ColumnDef[] =>
  BUILT_IN_COLUMNS.map((key, i) => ({
    id: key,
    builtIn: true,
    label: '',
    visible: key !== 'status',
    order: i,
  }));

export const defaultSettings = (): Settings => ({
  hoursPerDay: 8,
  workDays: [1, 2, 3, 4, 5],
  lang: 'th',
  urgentDays: 3,
  urgencyBufferPct: 25,
  ganttScale: 'week',
  hideCompleted: false,
  wbsNameWidth: 352,
  theme: 'system',
  navOrder: [],
  teamName: '',
});

export const defaultToday = (): TodayData => ({ highlights: {}, routines: [], routineDone: {} });
