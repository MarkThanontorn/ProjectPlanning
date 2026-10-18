export type NodeKind = 'project' | 'group' | 'task';
export type Status = 'queue' | 'in_progress' | 'reviewing' | 'done';
export type Rank = 'A' | 'B' | 'C';

export const STATUSES: Status[] = ['queue', 'in_progress', 'reviewing', 'done'];
export const RANKS: Rank[] = ['A', 'B', 'C'];
/** Allowed Progress values for tasks; projects and groups are always rolled up. */
export const PROGRESS_STEPS = [0, 5, 25, 50, 75, 95, 100] as const;
/** Above this many open tasks in one list, remind the user to focus. */
export const WIP_LIMIT = 7;

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** ISO datetime strings; `end === null` means the timer is running. */
export interface TimeLog {
  start: string;
  end: string | null;
}

/** Manual Eisenhower overrides; `null` on an axis means "automatic". */
export interface Eisenhower {
  important: boolean | null;
  urgent: boolean | null;
}

export interface WbsNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  order: number;
  collapsed: boolean;
  detail: string;
  /** ISO dates (yyyy-MM-dd) */
  planStart: string | null;
  planEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  dueDate: string | null;
  rank: Rank | null;
  inCharge: string;
  remark: string;
  /** 0-100. Entered manually on tasks, rolled up on parents. */
  progress: number;
  status: Status;
  eisenhower: Eisenhower | null;
  /** The day this task was pulled into the board's "Today" column. */
  todayDate: string | null;
  checklist: ChecklistItem[];
  timeLogs: TimeLog[];
  /** Predecessor task ids (finish-to-start): this task waits until they are done. */
  dependsOn: string[];
  /** Manual planned Leadtime in work hours; wins over the plan date span. */
  leadtimeOverrideHrs: number | null;
  /** Manual override of Actual Leadtime in work hours; wins over the timer total. */
  actualLeadtimeOverrideHrs: number | null;
  custom: Record<string, string>;
}

export type BuiltInKey =
  | 'detail'
  | 'planStart'
  | 'planEnd'
  | 'actualStart'
  | 'actualEnd'
  | 'leadtime'
  | 'actualLeadtime'
  | 'progress'
  | 'dueDate'
  | 'rank'
  | 'inCharge'
  | 'dependsOn'
  | 'status'
  | 'remark';

export interface ColumnDef {
  /** Built-in columns use their key as id; custom columns use `c_<random>`. */
  id: string;
  builtIn: boolean;
  /** Only used by custom columns — built-in labels come from i18n. */
  label: string;
  visible: boolean;
  order: number;
  /** Pinned columns sit right after Name and stay put while scrolling sideways. */
  pinned?: boolean;
  /** User-set width in px; absent = automatic. */
  width?: number;
}

export interface Settings {
  hoursPerDay: number;
  /** Day numbers per Date#getDay (0 = Sunday). */
  workDays: number[];
  lang: 'th' | 'en';
  /** Fallback when a task has no Leadtime: urgent when Plan End is at most this many days away. */
  urgentDays: number;
  /** Safety margin added to the remaining work when judging urgency (25 = +25%). */
  urgencyBufferPct: number;
  ganttScale: GanttScale;
  /** WBS / Gantt: hide completed tasks and completed projects/groups (with everything inside). */
  hideCompleted: boolean;
  /** WBS Name column width in px. */
  wbsNameWidth: number;
  theme: 'system' | 'light' | 'dark';
  /** Sidebar order (nav keys); the first item is the home page. */
  navOrder: string[];
  /** Shown under the app name, e.g. the team that owns this planner. */
  teamName: string;
}

export type GanttScale = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** When a routine repeats. Missing = every day. Days use Date#getDay (0 = Sunday). */
export type RoutineRepeat =
  | { kind: 'daily' }
  | { kind: 'weekly'; days: number[] }
  | { kind: 'monthly'; day: number };

export interface Routine {
  id: string;
  text: string;
  repeat?: RoutineRepeat;
  /** Reminder times on scheduled days, "HH:mm" (local time). */
  times?: string[];
}

/** Data for the Today page. Keys are ISO dates. */
export interface TodayData {
  /** Up to 3 highlighted task ids per day. */
  highlights: Record<string, string[]>;
  routines: Routine[];
  /** Routine ids ticked off per day. */
  routineDone: Record<string, string[]>;
}

/** A dated checkpoint on a project's Master Plan. */
export interface Milestone {
  id: string;
  /** Root project node this milestone belongs to. */
  projectId: string;
  name: string;
  date: string;
  done: boolean;
}

export interface AppData {
  nodes: WbsNode[];
  columns: ColumnDef[];
  settings: Settings;
  today: TodayData;
  milestones: Milestone[];
}

/** Values derived for every node (rolled up for parents). */
export interface Computed {
  isLeaf: boolean;
  depth: number;
  path: string[];
  planStart: string | null;
  planEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  planHours: number | null;
  actualHours: number;
  progress: number;
}
