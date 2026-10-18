import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  getQuarter,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { childrenMap, flattenTree, shiftIsoDate, todayIso, toIsoDate } from '../../domain/calc';
import { blockers, depsOf, wouldCycle } from '../../domain/deps';
import type { Computed, GanttScale, WbsNode } from '../../domain/types';
import { useComputed, useNow } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import { cx, InlineText, ViewTitle } from '../../components/ui';
import { ProjectMilestoneModal } from '../../components/MilestoneEditor';
import { CompleteToggle, HideCompletedToggle } from '../../components/completion';
import { completedIds } from '../../domain/completion';

const NAME_W = 256;
const ROW_H = 40;

type Unit = 'day' | 'week' | 'month' | 'quarter' | 'year';
const UNIT: Record<Unit, { start: (d: Date) => Date; end: (d: Date) => Date; add: (d: Date, n: number) => Date }> = {
  day: { start: startOfDay, end: endOfDay, add: addDays },
  week: { start: (d) => startOfWeek(d, { weekStartsOn: 1 }), end: (d) => endOfWeek(d, { weekStartsOn: 1 }), add: addWeeks },
  month: { start: startOfMonth, end: endOfMonth, add: addMonths },
  quarter: { start: startOfQuarter, end: endOfQuarter, add: addQuarters },
  year: { start: startOfYear, end: endOfYear, add: addYears },
};

/** Pixels per day, header rows and padding (days before/after the data) per scale. */
const SCALES: Record<GanttScale, { dayW: number; top: Unit | null; bottom: Unit; pad: [number, number] }> = {
  day: { dayW: 34, top: 'month', bottom: 'day', pad: [3, 14] },
  week: { dayW: 18, top: 'month', bottom: 'week', pad: [7, 21] },
  month: { dayW: 5, top: 'year', bottom: 'month', pad: [31, 62] },
  quarter: { dayW: 2.2, top: 'year', bottom: 'quarter', pad: [92, 184] },
  year: { dayW: 0.9, top: null, bottom: 'year', pad: [180, 365] },
};
const SCALE_ORDER: GanttScale[] = ['day', 'week', 'month', 'quarter', 'year'];
/** Clicking a time slot zooms one level in: Year → Quarter → Week → Day (Month → Week). */
const ZOOM_IN: Partial<Record<GanttScale, GanttScale>> = { year: 'quarter', quarter: 'week', month: 'week', week: 'day' };
/** Days added when scrolling near an edge, per scale (≈ several screens). */
const EXTEND_DAYS: Record<GanttScale, number> = { day: 60, week: 182, month: 365, quarter: 730, year: 1826 };
/** Distance from an edge (px) that triggers extending the timeline. */
const EDGE_PX = 240;

interface Cell {
  key: string;
  left: number;
  width: number;
  text: string;
  weekend: boolean;
}

/** Header strip. Memoized so bar drags don't re-render it. */
const TimeHeader = memo(function TimeHeader({
  top,
  bottom,
  width,
  height,
  dayScale,
  onPick,
  pickTitle,
}: {
  top: Cell[];
  bottom: Cell[];
  width: number;
  height: number;
  dayScale: boolean;
  /** Zoom into the clicked period (left/width in px); absent in day mode. */
  onPick?: (left: number, width: number) => void;
  pickTitle?: string;
}) {
  const pickable = onPick ? 'cursor-zoom-in hover:bg-sky-100/70' : '';
  return (
    <div className="relative" style={{ width, height }}>
      {top.map((m) => (
        <div
          key={m.key}
          className={cx('absolute top-0 truncate border-l border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700', pickable)}
          style={{ left: m.left, width: m.width }}
          title={pickTitle}
          onClick={() => onPick?.(m.left, m.width)}
        >
          {m.text}
        </div>
      ))}
      {bottom.map((w) => (
        <div
          key={w.key}
          className={cx('absolute bottom-0 truncate border-l border-slate-300 pb-1 text-[11px] tabular-nums text-slate-500', dayScale ? 'text-center' : 'px-1', w.weekend && 'text-slate-400', pickable)}
          style={{ left: w.left, width: w.width }}
          title={pickTitle}
          onClick={() => onPick?.(w.left, w.width)}
        >
          {w.text}
        </div>
      ))}
    </div>
  );
});

/** Vertical grid lines + weekend shading behind the rows. Memoized like the header. */
const TimeGrid = memo(function TimeGrid({ cells, left, top, width }: { cells: Cell[]; left: number; top: number; width: number }) {
  return (
    <div className="pointer-events-none absolute bottom-0" style={{ left, top, width }}>
      {cells.map((w) => (
        <div key={w.key} className={cx('absolute bottom-0 top-0 border-l border-slate-200', w.weekend && 'bg-slate-50')} style={{ left: w.left, width: w.width }} />
      ))}
    </div>
  );
});

const label = (unit: Unit, d: Date, top: boolean) => {
  switch (unit) {
    case 'day':
      return format(d, 'd');
    case 'week':
      return format(d, 'd MMM');
    case 'month':
      return format(d, top ? 'MMMM yyyy' : 'MMM');
    case 'quarter':
      return `Q${getQuarter(d)}`;
    case 'year':
      return format(d, 'yyyy');
  }
};

type DragMode = 'move' | 'start' | 'end';
/** In-progress "drag a link" gesture, in timeline coordinates. */
interface LinkState {
  fromId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  overId: string | null;
}

interface DragState {
  id: string;
  mode: DragMode;
  originX: number;
  planStart: string;
  planEnd: string;
  delta: number;
}

/** Keeps receiving pointer events while dragging outside the element. */
function capture(e: React.PointerEvent) {
  try {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  } catch {
    // Synthetic events have no active pointer to capture; dragging still works without it.
  }
}

/** Applies a day delta to a plan range according to the drag mode. */
function shifted(d: DragState) {
  let s = d.planStart;
  let e = d.planEnd;
  if (d.mode !== 'end') s = shiftIsoDate(s, d.delta);
  if (d.mode !== 'start') e = shiftIsoDate(e, d.delta);
  if (s > e) (d.mode === 'start' ? (s = e) : (e = s));
  return { planStart: s, planEnd: e };
}

export function GanttView() {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const scale = useAppStore((s) => s.settings.ganttScale);
  const { updateNode, toggleCollapsed, openTask, updateSettings, addDependency, removeDependency, addNode, deleteNode } = useAppStore();
  const milestones = useAppStore((s) => s.milestones);
  const updateMilestone = useAppStore((s) => s.updateMilestone);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [projectModal, setProjectModal] = useState<string | null>(null);
  const [msDrag, setMsDrag] = useState<{ id: string; originX: number; date: string; delta: number } | null>(null);

  const beginMsDrag = (e: React.PointerEvent, id: string, date: string) => {
    e.preventDefault();
    e.stopPropagation();
    capture(e);
    setMsDrag({ id, originX: e.clientX, date, delta: 0 });
  };
  const moveMsDrag = (e: React.PointerEvent) => {
    if (!msDrag) return;
    const delta = Math.round((e.clientX - msDrag.originX) / SCALES[scale].dayW);
    if (delta !== msDrag.delta) setMsDrag({ ...msDrag, delta });
  };
  /** Drop moves the milestone; a plain click opens the project's milestone popup. */
  const endMsDrag = (projectId: string) => {
    if (!msDrag) return;
    if (msDrag.delta !== 0) updateMilestone(msDrag.id, { date: shiftIsoDate(msDrag.date, msDrag.delta) });
    else setProjectModal(projectId);
    setMsDrag(null);
  };

  const add = (parentId: string | null, kind: 'project' | 'group' | 'task') => {
    const name = kind === 'project' ? t('wbs.defaultProject') : kind === 'group' ? t('wbs.defaultGroup') : t('wbs.defaultTask');
    setEditingId(addNode(parentId, kind, name));
  };
  const [link, setLink] = useState<LinkState | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const now = useNow(60_000);
  const computed = useComputed(now);
  const [drag, setDrag] = useState<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Days added beyond the data on each side by scrolling toward the edges. */
  const [extra, setExtra] = useState({ before: 0, after: 0 });
  /** Date to center on after the next scale change (set by click-to-zoom). */
  const [focusDate, setFocusDate] = useState<string | null>(null);
  /** Scroll position + width of the visible area, for drawing only what is on screen. */
  const [view, setView] = useState({ left: 0, width: 1200 });
  const pendingShift = useRef(0);
  const cfg = SCALES[scale];
  const dayW = cfg.dayW;
  const today = todayIso(now);
  const headerH = cfg.top ? 52 : 30;

  const hideCompleted = useAppStore((s) => s.settings.hideCompleted);
  const hiddenIds = useMemo(() => (hideCompleted ? completedIds(nodes) : new Set<string>()), [hideCompleted, nodes]);
  const rows = flattenTree(nodes).filter((n) => !hiddenIds.has(n.id));
  const kids = childrenMap(nodes);

  const range = useMemo(() => {
    let min = today;
    let max = today;
    for (const c of computed.values()) {
      for (const d of [c.planStart, c.planEnd, c.actualStart, c.actualEnd]) {
        if (d && d < min) min = d;
        if (d && d > max) max = d;
      }
    }
    for (const m of milestones) {
      if (m.date < min) min = m.date;
      if (m.date > max) max = m.date;
    }
    if (focusDate && focusDate < min) min = focusDate;
    if (focusDate && focusDate > max) max = focusDate;
    const u = UNIT[cfg.bottom];
    const start = u.start(addDays(parseISO(min), -cfg.pad[0] - extra.before));
    const end = u.end(addDays(parseISO(max), cfg.pad[1] + extra.after));
    return { start, days: differenceInCalendarDays(end, start) + 1 };
  }, [computed, today, cfg, extra, milestones, focusDate]);

  const x = (iso: string | Date) => differenceInCalendarDays(typeof iso === 'string' ? parseISO(iso) : iso, range.start) * dayW;
  const todayX = x(today);
  const timelineW = range.days * dayW;

  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, NAME_W + todayX - el.clientWidth / 3);
  }, [todayX]);

  // New scale: drop any extension, then re-center on today once the new range is laid out.
  const centerPending = useRef(true);
  useEffect(() => {
    centerPending.current = true;
    pendingShift.current = 0;
    setExtra({ before: 0, after: 0 });
  }, [scale]);
  useLayoutEffect(() => {
    if (!centerPending.current) return;
    centerPending.current = false;
    const el = scrollRef.current;
    if (focusDate && el) el.scrollLeft = Math.max(0, NAME_W + x(focusDate) - el.clientWidth / 2);
    else scrollToToday();
    if (el) setView({ left: el.scrollLeft, width: el.clientWidth });
    // x() is derived from range, which is already a dependency.
  }, [range, scrollToToday]);

  /** Date under a timeline x position (px from the timeline start). */
  const dateAtX = (px: number) => toIsoDate(addDays(range.start, Math.floor(px / dayW)));

  /** Zoom one level in, centered on the given date. */
  const zoomInAt = (iso: string) => {
    const next = ZOOM_IN[scale];
    if (!next) return;
    setFocusDate(iso);
    updateSettings({ ganttScale: next });
  };
  const zoomRef = useRef(zoomInAt);
  zoomRef.current = zoomInAt;
  const dateAtRef = useRef(dateAtX);
  dateAtRef.current = dateAtX;
  /** Stable callback for the memoized header: zoom into the middle of the clicked period. */
  const pickPeriod = useCallback((left: number, width: number) => zoomRef.current(dateAtRef.current(left + width / 2)), []);

  /** Day mode: a click on an empty slot creates a task on that date (inside the row's project/group). */
  const createTaskAt = (node: WbsNode, iso: string) => {
    const parentId = node.kind === 'task' ? node.parentId : node.id;
    if (!parentId) return;
    const id = addNode(parentId, 'task', t('wbs.defaultTask'));
    updateNode(id, { planStart: iso, planEnd: iso });
    setEditingId(id);
    setNotice({ text: t('gantt.created', { date: format(parseISO(iso), 'd MMM yyyy') }), tone: 'ok' });
  };

  /** Click on the empty part of a row: zoom in, or (day mode) create a task. */
  const onTimelineClick = (e: React.MouseEvent<HTMLDivElement>, node: WbsNode) => {
    if ((e.target as Element).closest('[data-task-id], [data-gantt-control]')) return;
    const iso = dateAtX(e.clientX - e.currentTarget.getBoundingClientRect().left);
    if (scale === 'day') createTaskAt(node, iso);
    else zoomInAt(iso);
  };

  /** Day mode: ghost "+" cell under the pointer. */
  const [hoverCell, setHoverCell] = useState<{ id: string; idx: number } | null>(null);
  const onTimelineMove = (e: React.MouseEvent<HTMLDivElement>, node: WbsNode) => {
    if (scale !== 'day') return;
    const overControl = (e.target as Element).closest('[data-task-id], [data-gantt-control]');
    const idx = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / dayW);
    setHoverCell((h) => (overControl ? null : h?.id === node.id && h.idx === idx ? h : { id: node.id, idx }));
  };

  // After prepending time on the left, keep the same dates under the viewport.
  useLayoutEffect(() => {
    if (pendingShift.current && scrollRef.current) {
      scrollRef.current.scrollLeft += pendingShift.current;
      pendingShift.current = 0;
    }
  }, [range.start]);

  // Track the viewport size from the start (and on window resize).
  useLayoutEffect(() => {
    const measure = () => {
      const el = scrollRef.current;
      if (el) setView({ left: el.scrollLeft, width: el.clientWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /**
   * Scroll handler: re-renders only when the view crosses into another
   * screen-sized bucket, or extends the timeline when near an edge.
   */
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const w = Math.max(400, el.clientWidth);
    setView((v) =>
      Math.floor(v.left / Math.max(400, v.width)) === Math.floor(el.scrollLeft / w) && v.width === el.clientWidth
        ? v
        : { left: el.scrollLeft, width: el.clientWidth },
    );
    const chunk = EXTEND_DAYS[scale];
    if (el.scrollLeft < EDGE_PX && pendingShift.current === 0) {
      // Width added on the left = days actually added after snapping to the unit start.
      const nextStart = UNIT[cfg.bottom].start(addDays(range.start, -chunk));
      pendingShift.current = differenceInCalendarDays(range.start, nextStart) * dayW;
      setExtra((e) => ({ ...e, before: e.before + chunk }));
    } else if (el.scrollLeft + el.clientWidth > el.scrollWidth - EDGE_PX && !extendingRight.current) {
      extendingRight.current = true;
      setExtra((e) => ({ ...e, after: e.after + chunk }));
    }
  };
  const extendingRight = useRef(false);
  useEffect(() => {
    extendingRight.current = false;
  }, [range.days]);

  /**
   * Header cells / grid lines, generated only for about three screens around
   * the viewport so the DOM stays small however far the timeline extends.
   * Recomputed only when the view moves by a whole screen.
   */
  const screen = Math.max(400, view.width);
  const bucket = Math.floor(view.left / screen);
  const cells = useMemo(() => {
    const winFrom = Math.max(0, (bucket - 1) * screen - NAME_W);
    const winTo = (bucket + 2) * screen;
    const periods = (unit: Unit): Cell[] => {
      const out: Cell[] = [];
      const end = addDays(range.start, range.days);
      const first = UNIT[unit].start(addDays(range.start, Math.floor(winFrom / dayW)));
      for (let s = UNIT[unit].start(first < range.start ? range.start : first); s < end; s = UNIT[unit].add(s, 1)) {
        const xs = differenceInCalendarDays(s, range.start) * dayW;
        if (xs > winTo) break;
        const xe = differenceInCalendarDays(UNIT[unit].add(s, 1), range.start) * dayW;
        const left = Math.max(0, xs);
        out.push({
          key: s.toISOString(),
          left,
          width: Math.min(timelineW, xe) - left,
          text: label(unit, s, unit !== cfg.bottom),
          weekend: unit === 'day' && (s.getDay() === 0 || s.getDay() === 6),
        });
      }
      return out;
    };
    return { top: cfg.top ? periods(cfg.top) : [], bottom: periods(cfg.bottom) };
  }, [range, dayW, cfg, bucket, screen, timelineW]);
  const topCells = cells.top;
  const bottomCells = cells.bottom;

  const beginDrag = (e: React.PointerEvent, node: WbsNode, mode: DragMode) => {
    if (!node.planStart || !node.planEnd) return;
    e.preventDefault();
    e.stopPropagation();
    capture(e);
    setDrag({ id: node.id, mode, originX: e.clientX, planStart: node.planStart, planEnd: node.planEnd, delta: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.originX) / dayW);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };
  const endDrag = () => {
    if (!drag) return;
    if (drag.delta !== 0) updateNode(drag.id, shifted(drag));
    else openTask(drag.id);
    setDrag(null);
  };

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(id);
  }, [notice]);

  /** Pointer position in timeline coordinates + the task bar under it. */
  const linkPoint = (e: React.PointerEvent) => {
    const rect = rowsRef.current!.getBoundingClientRect();
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-task-id]');
    return { x2: e.clientX - rect.left - NAME_W, y2: e.clientY - rect.top, overId: el?.dataset.taskId ?? null };
  };
  const beginLink = (e: React.PointerEvent, node: WbsNode, x1: number, row: number) => {
    e.preventDefault();
    e.stopPropagation();
    capture(e);
    const y1 = row * ROW_H + ROW_H / 2;
    setLink({ fromId: node.id, x1, y1, x2: x1, y2: y1, overId: null });
  };
  const moveLink = (e: React.PointerEvent) => {
    if (link) setLink({ ...link, ...linkPoint(e) });
  };
  /** Dropping on another bar makes that task wait for the dragged-from task. */
  const endLink = (e: React.PointerEvent) => {
    if (!link) return;
    const { overId } = linkPoint(e);
    setLink(null);
    if (!overId || overId === link.fromId) return;
    const from = nodes.find((n) => n.id === link.fromId)!;
    const to = nodes.find((n) => n.id === overId)!;
    if (depsOf(to).includes(from.id)) return;
    if (wouldCycle(nodes, to.id, from.id)) return setNotice({ text: t('deps.cycle'), tone: 'bad' });
    addDependency(to.id, from.id);
    setNotice({ text: t('deps.linked', { from: from.name, to: to.name }), tone: 'ok' });
  };

  /** Plan range as currently displayed (follows an in-progress drag). */
  const planOf = (n: WbsNode) => {
    if (drag?.id === n.id) return shifted(drag);
    const c = computed.get(n.id);
    return { planStart: c?.planStart ?? null, planEnd: c?.planEnd ?? null };
  };

  const renderBar = (node: WbsNode, c: Computed, row: number) => {
    const leaf = c.isLeaf;
    const dragging = drag?.id === node.id;
    const plan = planOf(node);
    if (!plan.planStart || !plan.planEnd) {
      if (!leaf || node.kind !== 'task') return null;
      return (
        <button
          data-gantt-control
          className="absolute top-1/2 z-[6] h-6 -translate-y-1/2 rounded border border-dashed border-slate-400 bg-white/80 px-2 text-xs text-slate-500 hover:bg-white"
          style={{ left: todayX + 4 }}
          onClick={() => updateNode(node.id, { planStart: today, planEnd: shiftIsoDate(today, 2) })}
        >
          + {t('col.plan')}
        </button>
      );
    }
    const left = x(plan.planStart);
    const width = Math.max(x(plan.planEnd) - left + dayW, 3);
    const text = `${format(parseISO(plan.planStart), 'd MMM')} – ${format(parseISO(plan.planEnd), 'd MMM')}`;

    if (!leaf)
      return (
        <div
          className="absolute top-1/2 z-[6] h-3 -translate-y-1/2 overflow-hidden rounded-sm bg-slate-300"
          style={{ left, width }}
          title={`${node.name}: ${text} · ${c.progress}%`}
        >
          <div className="h-full bg-slate-700" style={{ width: `${c.progress}%` }} />
        </div>
      );

    const linkTarget = link && link.overId === node.id && link.fromId !== node.id;
    return (
      <>
      <div
        data-task-id={node.id}
        className={cx(
          'absolute top-1/2 z-[6] h-6 -translate-y-1/2 cursor-grab touch-none overflow-hidden rounded border bg-slate-100 shadow-sm active:cursor-grabbing',
          dragging ? 'border-emerald-600 ring-2 ring-emerald-400' : linkTarget ? 'border-sky-600 ring-2 ring-sky-400' : 'border-slate-400',
          node.status === 'done' && 'opacity-70',
        )}
        style={{ left, width }}
        title={`${node.name}: ${text} · ${node.progress}%`}
        onPointerDown={(e) => beginDrag(e, node, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="h-full bg-emerald-700" style={{ width: `${node.progress}%` }} />
        <span className="pointer-events-none absolute inset-0 flex items-center px-2 text-[11px] font-medium text-slate-900 mix-blend-multiply">
          {width > 90 ? text : ''}
        </span>
        {width > 12 &&
          (['start', 'end'] as const).map((mode) => (
            <div
              key={mode}
              className={cx('absolute top-0 h-full w-2 cursor-ew-resize hover:bg-emerald-500/40', mode === 'start' ? 'left-0' : 'right-0')}
              onPointerDown={(e) => beginDrag(e, node, mode)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => {
                e.stopPropagation();
                endDrag();
              }}
            />
          ))}
      </div>
      {/* Link handle: drag onto another bar, and that task waits for this one */}
      <div
        data-gantt-control
        className={cx(
          'absolute top-1/2 z-[8] h-3.5 w-3.5 -translate-y-1/2 cursor-crosshair touch-none rounded-full border-2 border-white bg-sky-500 shadow ring-1 ring-sky-600 transition-opacity',
          link?.fromId === node.id ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
        )}
        style={{ left: left + width + 3 }}
        title={t('deps.dragLink')}
        onPointerDown={(e) => beginLink(e, node, left + width + 10, row)}
        onPointerMove={moveLink}
        onPointerUp={endLink}
        onPointerCancel={() => setLink(null)}
      />
      </>
    );
  };

  // Dependency arrows: predecessor bar end → successor bar start (red when the plan overlaps).
  const rowIndex = new Map(rows.map((n, i) => [n.id, i]));
  const arrows = rows.flatMap((succ) => {
    const sp = planOf(succ);
    if (!sp.planStart || rowIndex.get(succ.id) === undefined) return [];
    return depsOf(succ).flatMap((pid) => {
      const pred = nodes.find((n) => n.id === pid);
      const pi = rowIndex.get(pid);
      if (!pred || pi === undefined) return [];
      const pp = planOf(pred);
      if (!pp.planEnd) return [];
      const x1 = x(pp.planEnd) + dayW;
      const y1 = pi * ROW_H + ROW_H / 2;
      const x2 = x(sp.planStart!);
      const y2 = rowIndex.get(succ.id)! * ROW_H + ROW_H / 2;
      const conflict = pp.planEnd >= sp.planStart!;
      const elbow = x1 + 8;
      const d =
        x2 - 8 >= elbow
          ? `M${x1},${y1} H${elbow} V${y2} H${x2}`
          : `M${x1},${y1} H${elbow} V${y2 - (y2 > y1 ? ROW_H / 2 : -ROW_H / 2)} H${x2 - 8} V${y2} H${x2}`;
      return [{ key: `${pid}-${succ.id}`, d, conflict, from: pred, to: succ }];
    });
  });

  return (
    <div>
      <ViewTitle
        navKey="gantt"
        aside={
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span className="hidden 2xl:inline">{t('gantt.dragHint')}</span>
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700"
              onClick={() => add(null, 'project')}
            >
              ⊕ {t('wbs.newProject')}
            </button>
            <HideCompletedToggle />
            <button className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1 hover:bg-slate-100" onClick={scrollToToday}>
              {t('gantt.goToday')}
            </button>
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white">
              {SCALE_ORDER.map((s) => (
                <button
                  key={s}
                  className={cx('border-l border-slate-300 px-3 py-1 first:border-l-0', s === scale ? 'bg-slate-800 text-white' : 'hover:bg-slate-100')}
                  onClick={() => updateSettings({ ganttScale: s })}
                >
                  {t(`gantt.scale.${s}`)}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div ref={scrollRef} onScroll={onScroll} className="relative max-h-[calc(100vh-9.5rem)] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="relative" style={{ width: NAME_W + timelineW }}>
          {/* Header */}
          <div className="sticky top-0 z-30 flex border-b border-slate-300 bg-slate-100">
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end border-r border-slate-300 bg-slate-100 px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
              style={{ width: NAME_W }}
            >
              {t('col.name')}
            </div>
            <TimeHeader
              top={topCells}
              bottom={bottomCells}
              width={timelineW}
              height={headerH}
              dayScale={scale === 'day'}
              onPick={scale === 'day' ? undefined : pickPeriod}
              pickTitle={scale === 'day' ? undefined : t('gantt.zoomHint')}
            />
          </div>

          {/* Grid lines + weekend shading, behind the rows */}
          <TimeGrid cells={bottomCells} left={NAME_W} top={headerH} width={timelineW} />

          {/* Rows */}
          <div ref={rowsRef} className="relative">
            {rows.map((node, rowIdx) => {
              const c = computed.get(node.id);
              if (!c) return null;
              const hasKids = (kids.get(node.id) ?? []).length > 0;
              const blocked = c.isLeaf && node.status !== 'done' && blockers(node, nodes).length > 0;
              return (
                <div key={node.id} className="group/row flex border-b border-slate-100 hover:bg-emerald-50/30" style={{ height: ROW_H }}>
                  <div
                    className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-slate-200 bg-white text-sm"
                    style={{ width: NAME_W, paddingLeft: `${c.depth * 1.25 + 0.5}rem` }}
                  >
                    {hasKids ? (
                      <button className="w-5 text-slate-500 hover:text-slate-900" onClick={() => toggleCollapsed(node.id)} aria-label="toggle">
                        {node.collapsed ? '▶' : '▼'}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}
                    {editingId === node.id ? (
                      <InlineText
                        autoFocus
                        value={node.name}
                        className="text-sm"
                        onCommit={(v) => v.trim() && updateNode(node.id, { name: v.trim() })}
                        onDone={() => setEditingId(null)}
                      />
                    ) : (
                      <button
                        className={cx(
                          'cursor-pencil min-w-0 truncate text-left hover:underline',
                          node.kind === 'project' ? 'font-bold' : node.kind === 'group' ? 'font-semibold' : '',
                          node.status === 'done' && 'text-slate-400 line-through',
                        )}
                        title={t('gantt.renameHint')}
                        onClick={() => setEditingId(node.id)}
                      >
                        {node.name}
                      </button>
                    )}
                    {blocked && <span title={t('deps.blockedBy', { names: blockers(node, nodes).map((b) => b.name).join(', ') })}>🔒</span>}
                    {editingId !== node.id && (
                      <div className="ml-auto mr-1 hidden shrink-0 items-center gap-0.5 group-hover/row:flex">
                        {node.kind === 'task' && c.isLeaf && (
                          <button className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-200" title={t('wbs.open')} onClick={() => openTask(node.id)}>
                            ⤢
                          </button>
                        )}
                        {node.parentId === null && (
                          <button className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-200" title={t('gantt.projectHint')} onClick={() => setProjectModal(node.id)}>
                            ◆
                          </button>
                        )}
                        <CompleteToggle node={node} />
                        <button
                          className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-rose-100 hover:text-rose-700"
                          title={t('wbs.delete')}
                          onClick={() => confirm(t('wbs.deleteConfirm', { name: node.name })) && deleteNode(node.id)}
                        >
                          ✕
                        </button>
                        {node.kind !== 'task' && (
                        <button
                          className="rounded border border-sky-300 bg-sky-50 px-1.5 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
                          title={t('wbs.addGroupIn', { name: node.name })}
                          onClick={() => add(node.id, 'group')}
                        >
                          + {t('kind.group')}
                        </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className={cx('relative', scale === 'day' ? 'cursor-cell' : 'cursor-zoom-in')}
                    style={{ width: timelineW }}
                    title={scale === 'day' ? t('gantt.createHint') : t('gantt.zoomHint')}
                    onClick={(e) => onTimelineClick(e, node)}
                    onMouseMove={(e) => onTimelineMove(e, node)}
                    onMouseLeave={() => setHoverCell(null)}
                  >
                    {scale === 'day' && hoverCell?.id === node.id && !drag && !link && (
                      <div
                        className="pointer-events-none absolute inset-y-1 z-[5] grid place-items-center rounded border border-dashed border-emerald-500 bg-emerald-50 text-sm font-bold text-emerald-600"
                        style={{ left: hoverCell.idx * dayW, width: dayW }}
                      >
                        +
                      </div>
                    )}
                    {renderBar(node, c, rowIdx)}
                    {node.parentId === null &&
                      milestones
                        .filter((m) => m.projectId === node.id)
                        .map((m) => {
                          const dragging = msDrag?.id === m.id;
                          const date = dragging ? shiftIsoDate(msDrag.date, msDrag.delta) : m.date;
                          return (
                            <div
                              key={m.id}
                              data-gantt-control
                              className="absolute top-1/2 z-[9] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none p-1"
                              style={{ left: x(date) + dayW / 2 }}
                              title={t('gantt.milestoneHint', { name: m.name, date: format(parseISO(m.date), 'd MMM yyyy') })}
                              onPointerDown={(e) => beginMsDrag(e, m.id, m.date)}
                              onPointerMove={moveMsDrag}
                              onPointerUp={() => endMsDrag(node.id)}
                              onPointerCancel={() => setMsDrag(null)}
                            >
                              <div
                                className={cx(
                                  'h-3.5 w-3.5 rotate-45 border-2 shadow transition-transform',
                                  dragging && 'scale-125 ring-2 ring-sky-400',
                                  m.done ? 'border-emerald-700 bg-emerald-500' : m.date < today ? 'border-rose-700 bg-rose-500' : 'border-slate-800 bg-white',
                                )}
                              />
                              {dragging ? (
                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  {m.name} · {format(parseISO(date), 'd MMM')}
                                </span>
                              ) : (
                                <span
                                  className={cx(
                                    'pointer-events-none absolute left-full top-1/2 ml-0.5 max-w-[9rem] -translate-y-1/2 truncate whitespace-nowrap rounded bg-white/90 px-1 text-[10px] font-semibold leading-4 shadow-sm ring-1',
                                    m.done ? 'text-emerald-700 line-through ring-emerald-200' : m.date < today ? 'text-rose-700 ring-rose-200' : 'text-slate-800 ring-slate-300',
                                  )}
                                >
                                  {m.name}
                                </span>
                              )}
                            </div>
                          );
                        })}
                  </div>
                </div>
              );
            })}

            <div className="flex border-b border-slate-100" style={{ height: ROW_H }}>
              <div className="sticky left-0 z-20 flex shrink-0 items-center bg-white px-3" style={{ width: NAME_W }}>
                <button
                  className="rounded-md border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-500 hover:border-slate-500 hover:text-slate-800"
                  onClick={() => add(null, 'project')}
                >
                  ⊕ {t('wbs.newProject')}
                </button>
              </div>
            </div>

            {/* Dependency arrows */}
            <svg className="pointer-events-none absolute top-0 z-[7] overflow-visible" style={{ left: NAME_W }} width={timelineW} height={rows.length * ROW_H}>
              <defs>
                {(['ok', 'bad', 'link'] as const).map((k) => (
                  <marker key={k} id={`arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill={k === 'ok' ? '#64748b' : k === 'bad' ? '#e11d48' : '#0284c7'} />
                  </marker>
                ))}
              </defs>
              {arrows.map((a) => (
                <g key={a.key}>
                  <path
                    d={a.d}
                    fill="none"
                    stroke={a.conflict ? '#e11d48' : '#64748b'}
                    strokeWidth={1.5}
                    strokeDasharray={a.conflict ? '4 3' : undefined}
                    markerEnd={`url(#arrow-${a.conflict ? 'bad' : 'ok'})`}
                  />
                  {/* Wide invisible hit area: click to remove the link */}
                  <path
                    d={a.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={10}
                    className="cursor-pointer hover:stroke-rose-300/60"
                    style={{ pointerEvents: 'stroke' }}
                    onClick={() => confirm(t('deps.removeConfirm', { from: a.from.name, to: a.to.name })) && removeDependency(a.to.id, a.from.id)}
                  >
                    <title>{t('deps.arrowTitle', { from: a.from.name, to: a.to.name })}</title>
                  </path>
                </g>
              ))}
              {link && (
                <path
                  d={`M${link.x1 - 7},${link.y1} L${link.x2},${link.y2}`}
                  stroke="#0284c7"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  markerEnd="url(#arrow-link)"
                />
              )}
            </svg>
          </div>

          {/* Today marker */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-[15] w-0.5 bg-rose-500" style={{ left: NAME_W + todayX + dayW / 2 }}>
            <span className="absolute left-1 top-1 whitespace-nowrap rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {t('gantt.today')} · {format(now, 'd MMM')}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-500">🔍 {scale === 'day' ? t('gantt.createHint') : t('gantt.zoomHint')}</span>
        <span className="text-slate-500">🔗 {t('deps.ganttHint')}</span>
        {arrows.some((a) => a.conflict) && <span className="text-rose-600">⚠ {t('deps.ganttConflict')}</span>}
      </div>
      {projectModal && <ProjectMilestoneModal projectId={projectModal} onClose={() => setProjectModal(null)} />}
      {notice && (
        <div
          className={cx(
            'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg',
            notice.tone === 'ok' ? 'bg-slate-800' : 'bg-rose-600',
          )}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}
