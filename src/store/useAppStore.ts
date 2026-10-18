import { create } from 'zustand';
import { arrayMove } from '@dnd-kit/sortable';
import { canPlace, completeTask, descendantIds, isRunning, pauseTimer, startTimer, todayIso } from '../domain/calc';
import { createNode, defaultColumns, defaultSettings, defaultToday, newId } from '../domain/factory';
import type { AppData, ColumnDef, Eisenhower, Milestone, NodeKind, Routine, Settings, Status, WbsNode } from '../domain/types';

export const MAX_HIGHLIGHTS = 3;
import { DexieRepository } from '../data/dexieRepo';
import { normalizeData } from '../domain/normalize';
import { blockers, wouldCycle } from '../domain/deps';
import type { Repository } from '../data/repository';
import { seedData } from '../data/seed';

const repo: Repository = new DexieRepository();

interface AppState extends AppData {
  loaded: boolean;
  /** Task shown in the detail modal. */
  openTaskId: string | null;
  /** Day shown in the board's day column; null = today. Not saved. */
  boardDay: string | null;
  setBoardDay(day: string | null): void;

  init(): Promise<void>;
  replaceAll(data: AppData): void;

  addNode(parentId: string | null, kind: NodeKind, name: string): string;
  updateNode(id: string, patch: Partial<WbsNode>): void;
  deleteNode(id: string): void;
  moveNode(id: string, dir: -1 | 1): void;
  /** Moves a node to `index` among the children of `parentId` (drag & drop). */
  moveNodeTo(id: string, parentId: string | null, index: number): void;
  toggleCollapsed(id: string): void;

  startTimer(id: string): void;
  pauseTimer(id: string): void;
  completeTask(id: string): void;
  setStatus(id: string, status: Status): void;
  /** Mark any node complete (struck through) or reopen it. Tasks use the normal complete flow. */
  setCompleted(id: string, done: boolean): void;
  /** Puts a task on the given day's list (null removes it). */
  setTaskDay(id: string, date: string | null): void;
  setEisenhower(id: string, value: Eisenhower | null): void;
  setEisenhowerAxis(id: string, axis: keyof Eisenhower, value: boolean | null): void;

  addMilestone(projectId: string, name: string, date: string): void;
  updateMilestone(id: string, patch: Partial<Milestone>): void;
  deleteMilestone(id: string): void;

  addDependency(id: string, depId: string): void;
  removeDependency(id: string, depId: string): void;

  toggleHighlight(id: string, date: string): void;
  addRoutine(text: string): void;
  updateRoutine(id: string, patch: Partial<Routine>): void;
  deleteRoutine(id: string): void;
  toggleRoutine(id: string, date: string): void;

  addColumn(label: string): void;
  updateColumn(id: string, patch: Partial<ColumnDef>): void;
  deleteColumn(id: string): void;
  reorderColumns(activeId: string, overId: string): void;

  updateSettings(patch: Partial<Settings>): void;
  openTask(id: string | null): void;
}

let initPromise: Promise<void> | undefined;
let saving = false;
let dirty = false;

/**
 * Saves right away so nothing is lost if the tab closes; changes made while a
 * save is in flight are coalesced into one follow-up save.
 */
const persist = async (get: () => AppState) => {
  dirty = true;
  if (saving) return;
  saving = true;
  try {
    while (dirty) {
      dirty = false;
      const { nodes, columns, settings, today, milestones } = get();
      await repo.save({ nodes, columns, settings, today, milestones });
    }
  } finally {
    saving = false;
  }
};

export const useAppStore = create<AppState>((set, get) => {
  /** Applies a change and schedules a save. */
  const commit = (fn: (s: AppState) => Partial<AppState>) => {
    set(fn);
    void persist(get);
  };
  const mapNode = (id: string, fn: (n: WbsNode) => WbsNode) =>
    commit((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? fn(n) : n)) }));

  return {
    nodes: [],
    columns: defaultColumns(),
    settings: defaultSettings(),
    today: defaultToday(),
    milestones: [],
    loaded: false,
    openTaskId: null,
    boardDay: null,
    setBoardDay(day) {
      set({ boardDay: day });
    },

    init() {
      // Memoised so React StrictMode's double effect doesn't seed twice.
      initPromise ??= (async () => {
        let data = await repo.load();
        if (!data) {
          data = seedData();
          await repo.save(data);
        }
        set({ ...normalizeData(data), loaded: true });
      })();
      return initPromise;
    },

    replaceAll(data) {
      commit(() => ({ ...normalizeData(data), openTaskId: null }));
    },

    addNode(parentId, kind, name) {
      const siblings = get().nodes.filter((n) => n.parentId === parentId);
      const node = createNode(kind, parentId, name, siblings.length ? Math.max(...siblings.map((n) => n.order)) + 1 : 0);
      commit((s) => ({
        nodes: [...s.nodes.map((n) => (n.id === parentId ? { ...n, collapsed: false } : n)), node],
      }));
      return node.id;
    },

    updateNode(id, patch) {
      mapNode(id, (n) => ({ ...n, ...patch }));
    },

    deleteNode(id) {
      const gone = new Set([id, ...descendantIds(get().nodes, id)]);
      commit((s) => ({
        milestones: s.milestones.filter((m) => !gone.has(m.projectId)),
        nodes: s.nodes
          .filter((n) => !gone.has(n.id))
          .map((n) => (n.dependsOn.some((d) => gone.has(d)) ? { ...n, dependsOn: n.dependsOn.filter((d) => !gone.has(d)) } : n)),
        openTaskId: s.openTaskId && gone.has(s.openTaskId) ? null : s.openTaskId,
      }));
    },

    moveNode(id, dir) {
      const node = get().nodes.find((n) => n.id === id);
      if (!node) return;
      const siblings = get()
        .nodes.filter((n) => n.parentId === node.parentId)
        .sort((a, b) => a.order - b.order);
      const i = siblings.findIndex((n) => n.id === id);
      const j = i + dir;
      if (j < 0 || j >= siblings.length) return;
      const reordered = arrayMove(siblings, i, j);
      const order = new Map(reordered.map((n, k) => [n.id, k]));
      commit((s) => ({ nodes: s.nodes.map((n) => (order.has(n.id) ? { ...n, order: order.get(n.id)! } : n)) }));
    },

    moveNodeTo(id, parentId, index) {
      const nodes = get().nodes;
      if (!canPlace(nodes, id, parentId)) return;
      const siblings = nodes.filter((n) => n.parentId === parentId && n.id !== id).sort((a, b) => a.order - b.order);
      const ids = siblings.map((n) => n.id);
      ids.splice(Math.max(0, Math.min(index, ids.length)), 0, id);
      const order = new Map(ids.map((nid, k) => [nid, k]));
      commit((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id === id) return { ...n, parentId, order: order.get(id)! };
          if (n.id === parentId) return { ...n, collapsed: false };
          return order.has(n.id) ? { ...n, order: order.get(n.id)! } : n;
        }),
      }));
    },

    toggleCollapsed(id) {
      mapNode(id, (n) => ({ ...n, collapsed: !n.collapsed }));
    },

    startTimer(id) {
      const target = get().nodes.find((n) => n.id === id);
      if (!target || blockers(target, get().nodes).length > 0) return;
      // One running timer at a time: starting a task pauses the others.
      const now = new Date();
      commit((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? startTimer(n, now) : isRunning(n) ? pauseTimer(n, now) : n)),
      }));
    },
    pauseTimer(id) {
      mapNode(id, (n) => pauseTimer(n));
    },
    completeTask(id) {
      mapNode(id, (n) => completeTask(n));
    },

    setStatus(id, status) {
      if (status === 'done') return get().completeTask(id);
      mapNode(id, (n) => {
        const base = status === 'queue' || status === 'reviewing' ? pauseTimer(n) : n;
        return {
          ...base,
          status,
          actualEnd: n.status === 'done' ? null : base.actualEnd,
          progress: n.status === 'done' && n.progress === 100 ? 95 : base.progress,
        };
      });
    },

    setCompleted(id, done) {
      const node = get().nodes.find((n) => n.id === id);
      if (!node) return;
      const isLeafTask = node.kind === 'task' && !get().nodes.some((n) => n.parentId === id);
      if (isLeafTask) return done ? get().completeTask(id) : get().setStatus(id, 'in_progress');
      // Projects / groups: only the node itself; tasks inside keep their own status.
      mapNode(id, (n) => ({ ...n, status: done ? 'done' : 'queue', actualEnd: done ? todayIso() : null }));
    },

    setTaskDay(id, date) {
      commit((s) => {
        const prev = s.nodes.find((n) => n.id === id)?.todayDate;
        const highlights = { ...s.today.highlights };
        // Leaving a day's list also drops the task from that day's highlights.
        if (prev && prev !== date && highlights[prev]) highlights[prev] = highlights[prev].filter((x) => x !== id);
        return {
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, todayDate: date } : n)),
          today: { ...s.today, highlights },
        };
      });
    },

    setEisenhower(id, value) {
      mapNode(id, (n) => ({ ...n, eisenhower: value }));
    },

    setEisenhowerAxis(id, axis, value) {
      mapNode(id, (n) => {
        const next = { important: n.eisenhower?.important ?? null, urgent: n.eisenhower?.urgent ?? null, [axis]: value };
        return { ...n, eisenhower: next.important === null && next.urgent === null ? null : next };
      });
    },

    addMilestone(projectId, name, date) {
      commit((s) => ({ milestones: [...s.milestones, { id: newId('m'), projectId, name, date, done: false }] }));
    },
    updateMilestone(id, patch) {
      commit((s) => ({ milestones: s.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
    },
    deleteMilestone(id) {
      commit((s) => ({ milestones: s.milestones.filter((m) => m.id !== id) }));
    },

    addDependency(id, depId) {
      if (wouldCycle(get().nodes, id, depId)) return;
      mapNode(id, (n) => (n.dependsOn.includes(depId) ? n : { ...n, dependsOn: [...n.dependsOn, depId] }));
    },
    removeDependency(id, depId) {
      mapNode(id, (n) => ({ ...n, dependsOn: n.dependsOn.filter((d) => d !== depId) }));
    },

    toggleHighlight(id, date) {
      const current = get().today.highlights[date] ?? [];
      if (current.includes(id)) {
        commit((s) => ({ today: { ...s.today, highlights: { ...s.today.highlights, [date]: current.filter((x) => x !== id) } } }));
        return;
      }
      if (current.length >= MAX_HIGHLIGHTS) return;
      commit((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, todayDate: date } : n)),
        today: { ...s.today, highlights: { ...s.today.highlights, [date]: [...current, id] } },
      }));
    },

    addRoutine(text) {
      commit((s) => ({ today: { ...s.today, routines: [...s.today.routines, { id: newId('r'), text }] } }));
    },
    updateRoutine(id, patch) {
      commit((s) => ({ today: { ...s.today, routines: s.today.routines.map((r) => (r.id === id ? { ...r, ...patch } : r)) } }));
    },
    deleteRoutine(id) {
      commit((s) => ({ today: { ...s.today, routines: s.today.routines.filter((r) => r.id !== id) } }));
    },
    toggleRoutine(id, date) {
      commit((s) => {
        const done = s.today.routineDone[date] ?? [];
        const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
        return { today: { ...s.today, routineDone: { ...s.today.routineDone, [date]: next } } };
      });
    },

    addColumn(label) {
      commit((s) => ({
        columns: [
          ...s.columns,
          { id: newId('c'), builtIn: false, label, visible: true, order: Math.max(-1, ...s.columns.map((c) => c.order)) + 1 },
        ],
      }));
    },

    updateColumn(id, patch) {
      commit((s) => ({
        columns: s.columns.map((c) =>
          c.id !== id ? c : { ...c, ...patch, label: c.builtIn ? c.label : patch.label ?? c.label },
        ),
      }));
    },

    deleteColumn(id) {
      const col = get().columns.find((c) => c.id === id);
      if (!col || col.builtIn) return;
      commit((s) => ({
        columns: s.columns.filter((c) => c.id !== id),
        nodes: s.nodes.map((n) => {
          if (!(id in n.custom)) return n;
          const { [id]: _removed, ...custom } = n.custom;
          return { ...n, custom };
        }),
      }));
    },

    reorderColumns(activeId, overId) {
      const sorted = [...get().columns].sort((a, b) => a.order - b.order);
      const from = sorted.findIndex((c) => c.id === activeId);
      const to = sorted.findIndex((c) => c.id === overId);
      if (from < 0 || to < 0 || from === to) return;
      commit(() => ({ columns: arrayMove(sorted, from, to).map((c, i) => ({ ...c, order: i })) }));
    },

    updateSettings(patch) {
      commit((s) => ({ settings: { ...s.settings, ...patch } }));
    },

    openTask(id) {
      set({ openTaskId: id });
    },
  };
});
