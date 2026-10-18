import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { canPlace, childrenMap } from '../../domain/calc';
import { scheduleConflicts } from '../../domain/deps';
import { RANKS, STATUSES, type ColumnDef, type Computed, type NodeKind, type Rank, type Status, type WbsNode } from '../../domain/types';
import { useComputed, useNow } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import {
  ActualLeadtimeCell,
  PlanLeadtimeCell,
  ProgressSlider,
  cx,
  DateInput,
  IconButton,
  InlineText,
  LeadtimeText,
  ProgressBar,
  ViewTitle,
} from '../../components/ui';
import { ColumnManager } from './ColumnManager';
import { ResizeHandle } from '../../components/ResizeHandle';
import { CompleteToggle, HideCompletedToggle } from '../../components/completion';
import { completedIds } from '../../domain/completion';

const KIND_ICON: Record<NodeKind, string> = { project: '◆', group: '▸', task: '•' };
const KIND_STYLE: Record<NodeKind, string> = {
  project: 'font-bold text-slate-900',
  group: 'font-semibold text-slate-800',
  task: 'text-slate-800',
};

const PLANNING_COLUMNS = new Set(['planStart', 'planEnd', 'leadtime']);

/** Fixed width for a resized column (header and cells); nothing when automatic. */
const widthStyle = (w?: number) => (w ? { width: w, minWidth: w, maxWidth: w } : {});

function SortableHeader({
  col,
  label,
  stickyLeft,
  lastPinned,
  measureRef,
  onTogglePin,
  width,
  onResizeLive,
  onResizeCommit,
}: {
  col: ColumnDef;
  label: string;
  /** Sticky offset when pinned. */
  stickyLeft?: number;
  lastPinned?: boolean;
  measureRef: (el: HTMLElement | null) => void;
  onTogglePin: () => void;
  /** Column width in px, or undefined for automatic. */
  width?: number;
  onResizeLive: (w: number) => void;
  onResizeCommit: (w: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  // Planning columns carry a quiet "plan ~50% extra" reminder on hover.
  const tip = PLANNING_COLUMNS.has(col.id) ? t('tip.buffer50') : undefined;
  return (
    <th
      ref={(el) => {
        setNodeRef(el);
        measureRef(el);
      }}
      title={tip}
      style={{ transform: CSS.Translate.toString(transform), transition, left: col.pinned ? stickyLeft : undefined, ...widthStyle(width) }}
      className={cx(
        'group/th relative cursor-grab select-none overflow-hidden truncate whitespace-nowrap border-b border-slate-300 bg-slate-100 px-2 py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 active:cursor-grabbing',
        col.pinned && 'sticky z-[3] bg-sky-50',
        lastPinned && 'border-r-2 border-r-sky-300',
        isDragging && 'relative z-10 bg-emerald-100 shadow',
      )}
      {...attributes}
      {...listeners}
    >
      {label}
      {tip && <span className="ml-1 font-normal normal-case text-amber-500">💡</span>}
      <button
        type="button"
        title={col.pinned ? t('wbs.unpin') : t('wbs.pin')}
        aria-label={col.pinned ? t('wbs.unpin') : t('wbs.pin')}
        className={cx(
          'ml-1 rounded px-0.5 text-[11px] font-normal normal-case',
          col.pinned ? 'text-sky-600' : 'invisible text-slate-400 hover:text-sky-600 group-hover/th:visible',
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onTogglePin}
      >
        📌
      </button>
      <ResizeHandle onLive={onResizeLive} onCommit={onResizeCommit} onReset={() => onResizeCommit(undefined)} />
    </th>
  );
}

type DropPos = 'before' | 'after' | 'inside';
/** Resolved drop: indicator on `targetId`, destination `parentId` + `index`. */
interface RowDrop {
  targetId: string;
  pos: DropPos;
  parentId: string | null;
  index: number;
}

interface RowHandle {
  listeners: DraggableSyntheticListeners;
  attributes: DraggableAttributes;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
}

const ROW_PREFIX = 'row:';
const DROP_PREFIX = 'drop:';

/** Table row that is both a drag source (via its handle) and a drop target. */
function DndRow({
  node,
  drop,
  className,
  children,
}: {
  node: WbsNode;
  drop: DropPos | null;
  className?: string;
  children: (handle: RowHandle) => ReactNode;
}) {
  const drag = useDraggable({ id: ROW_PREFIX + node.id });
  const target = useDroppable({ id: DROP_PREFIX + node.id });
  return (
    <tr
      ref={(el) => {
        drag.setNodeRef(el);
        target.setNodeRef(el);
      }}
      className={cx(
        className,
        drag.isDragging && 'opacity-40',
        drop === 'before' && '[&>td]:shadow-[inset_0_3px_0_0_#10b981]',
        drop === 'after' && '[&>td]:shadow-[inset_0_-3px_0_0_#10b981]',
        drop === 'inside' && '[&>td]:!bg-emerald-100',
      )}
    >
      {children({ listeners: drag.listeners, attributes: drag.attributes, setActivatorNodeRef: drag.setActivatorNodeRef })}
    </tr>
  );
}

/** Rows only collide with rows (by pointer); column headers only with headers. */
const collision: CollisionDetection = (args) => {
  const isRow = String(args.active.id).startsWith(ROW_PREFIX);
  const droppableContainers = args.droppableContainers.filter((c) => String(c.id).startsWith(DROP_PREFIX) === isRow);
  return isRow ? pointerWithin({ ...args, droppableContainers }) : closestCenter({ ...args, droppableContainers });
};

/** Predecessor names (🔒 open / ✅ done, ⚠ plan overlap); click opens the task to edit links. */
function DependsOnCell({ node }: { node: WbsNode }) {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const openTask = useAppStore((s) => s.openTask);
  if (node.kind !== 'task') return null;
  const deps = node.dependsOn.map((id) => nodes.find((n) => n.id === id)).filter((n): n is WbsNode => !!n);
  const conflicts = new Set(scheduleConflicts(node, nodes).map((n) => n.id));
  return (
    <button className="flex max-w-[14rem] flex-wrap gap-1 rounded px-1 py-0.5 text-left hover:bg-slate-100" onClick={() => openTask(node.id)} title={t('deps.hint')}>
      {deps.length === 0 && <span className="text-slate-300">—</span>}
      {deps.map((d) => (
        <span
          key={d.id}
          className={cx(
            'rounded px-1.5 py-0.5 text-xs',
            conflicts.has(d.id) ? 'bg-rose-100 text-rose-700' : d.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
          )}
          title={conflicts.has(d.id) ? t('deps.conflict', { name: d.name }) : undefined}
        >
          {d.status === 'done' ? '✅' : '🔒'} {d.name}
          {conflicts.has(d.id) && ' ⚠'}
        </span>
      ))}
    </button>
  );
}

function Cell({ col, node, c }: { col: ColumnDef; node: WbsNode; c: Computed }) {
  const { t } = useTranslation();
  const { updateNode, setStatus } = useAppStore();
  const set = (patch: Partial<WbsNode>) => updateNode(node.id, patch);
  const derived = (own: string | null, value: string | null) => (own ? null : value);

  switch (col.id) {
    case 'detail':
      return <InlineText value={node.detail} onCommit={(v) => set({ detail: v })} className="min-w-[10rem]" />;
    case 'planStart':
    case 'planEnd':
    case 'actualStart':
    case 'actualEnd': {
      const key = col.id;
      return (
        <div title={!node[key] && c[key] ? t('wbs.autoHint') : undefined}>
          <DateInput value={node[key]} placeholder={derived(node[key], c[key])} onChange={(v) => set({ [key]: v })} />
        </div>
      );
    }
    case 'leadtime':
      return <PlanLeadtimeCell id={node.id} hours={c.planHours} overridden={node.leadtimeOverrideHrs != null} />;
    case 'actualLeadtime':
      return c.isLeaf ? (
        <ActualLeadtimeCell id={node.id} hours={c.actualHours} overridden={node.actualLeadtimeOverrideHrs !== null} />
      ) : (
        <span title={t('wbs.autoHint')} className="text-slate-700">
          {c.actualHours > 0 ? <LeadtimeText hours={c.actualHours} /> : <span className="text-slate-400">TBD</span>}
        </span>
      );
    case 'progress':
      return node.kind === 'task' && c.isLeaf ? (
        <ProgressSlider value={node.progress} onChange={(v) => set({ progress: v })} />
      ) : (
        <div title={t('wbs.autoHint')}>
          <ProgressBar value={c.progress} className="w-40" />
        </div>
      );
    case 'dueDate':
      return <DateInput value={node.dueDate} onChange={(v) => set({ dueDate: v })} />;
    case 'rank':
      return (
        <select
          className="rounded bg-transparent px-1 py-1 text-sm hover:bg-slate-100"
          value={node.rank ?? ''}
          onChange={(e) => set({ rank: (e.target.value || null) as Rank | null })}
        >
          <option value="">—</option>
          {RANKS.map((r) => <option key={r}>{r}</option>)}
        </select>
      );
    case 'inCharge':
      return <InlineText value={node.inCharge} onCommit={(v) => set({ inCharge: v })} className="min-w-[7rem]" />;
    case 'remark':
      return <InlineText value={node.remark} onCommit={(v) => set({ remark: v })} className="min-w-[8rem]" />;
    case 'dependsOn':
      return <DependsOnCell node={node} />;
    case 'status':
      return c.isLeaf ? (
        <select
          className="rounded bg-transparent px-1 py-1 text-sm hover:bg-slate-100"
          value={node.status}
          onChange={(e) => setStatus(node.id, e.target.value as Status)}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
      ) : null;
    default:
      return (
        <InlineText
          value={node.custom[col.id] ?? ''}
          onCommit={(v) => set({ custom: { ...node.custom, [col.id]: v } })}
          className="min-w-[7rem]"
        />
      );
  }
}

export function WbsView() {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const columns = useAppStore((s) => s.columns);
  const { addNode, updateNode, deleteNode, moveNodeTo, toggleCollapsed, reorderColumns, openTask, updateColumn } = useAppStore();
  const now = useNow(30_000);
  const computed = useComputed(now);
  const [showColumns, setShowColumns] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [rowDrop, setRowDrop] = useState<RowDrop | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Pinned columns come right after Name; each keeps its own order within its group.
  const visibleCols = [...columns]
    .filter((c) => c.visible)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.order - b.order);
  const pinnedCols = visibleCols.filter((c) => c.pinned);

  // Sticky offsets for pinned columns = Name width + widths of the pinned columns before them.
  const headerEls = useRef(new Map<string, HTMLElement>());
  const nameHeaderRef = useRef<HTMLTableCellElement>(null);
  const [pinLeft, setPinLeft] = useState<Record<string, number>>({});
  const pinKey = pinnedCols.map((c) => c.id).join('|');
  useLayoutEffect(() => {
    const measure = () => {
      let left = nameHeaderRef.current?.offsetWidth ?? 0;
      const next: Record<string, number> = {};
      for (const c of pinnedCols) {
        next[c.id] = left;
        left += headerEls.current.get(c.id)?.offsetWidth ?? 0;
      }
      setPinLeft((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (nameHeaderRef.current) ro.observe(nameHeaderRef.current);
    for (const c of pinnedCols) {
      const el = headerEls.current.get(c.id);
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
    // pinnedCols is derived from pinKey.
  }, [pinKey]);
  const lastPinnedId = pinnedCols[pinnedCols.length - 1]?.id;

  // Column widths: live value while dragging a handle, else the saved width (or automatic).
  const [live, setLive] = useState<Record<string, number>>({});
  const savedNameWidth = useAppStore((s) => s.settings.wbsNameWidth);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const nameWidth = live.__name ?? savedNameWidth;
  const colWidth = (c: ColumnDef) => live[c.id] ?? c.width;
  const colLabel = (c: ColumnDef) => (c.builtIn ? t(`col.${c.id}`) : c.label);
  const kids = childrenMap(nodes);

  const add = (parentId: string | null, kind: NodeKind) => {
    const name = kind === 'project' ? t('wbs.defaultProject') : kind === 'group' ? t('wbs.defaultGroup') : t('wbs.defaultTask');
    setFocusId(addNode(parentId, kind, name));
  };

  /**
   * Turns the pointer position over a row into a drop: top quarter = before,
   * bottom quarter = after, middle of a project/group = inside (appended).
   * Below an expanded parent means "first child". Invalid moves return null.
   */
  const resolveDrop = (activeId: string, targetId: string, rel: number): RowDrop | null => {
    const target = nodes.find((n) => n.id === targetId);
    if (!target || targetId === activeId) return null;
    const children = (kids.get(target.id) ?? []).filter((n) => n.id !== activeId);
    const container = target.kind !== 'task';
    const openKids = container && !target.collapsed && children.length > 0;
    const sibling = (after: boolean): RowDrop => {
      const sibs = (kids.get(target.parentId) ?? []).filter((n) => n.id !== activeId);
      return { targetId, pos: after ? 'after' : 'before', parentId: target.parentId, index: sibs.indexOf(target) + (after ? 1 : 0) };
    };
    let drop: RowDrop;
    if (!container) drop = sibling(rel >= 0.5);
    else if (rel < 0.25) drop = sibling(false);
    else if (rel > 0.75) drop = openKids ? { targetId, pos: 'after', parentId: target.id, index: 0 } : sibling(true);
    else drop = { targetId, pos: 'inside', parentId: target.id, index: children.length };
    return canPlace(nodes, activeId, drop.parentId) ? drop : null;
  };

  /** Drop for the current pointer position, or null when not over a valid row. */
  const dropFor = (e: DragMoveEvent | DragEndEvent): RowDrop | null => {
    const overId = e.over ? String(e.over.id) : '';
    const start = e.activatorEvent as PointerEvent;
    if (!e.over || !overId.startsWith(DROP_PREFIX) || !('clientY' in start)) return null;
    const rel = (start.clientY + e.delta.y - e.over.rect.top) / e.over.rect.height;
    return resolveDrop(String(e.active.id).slice(ROW_PREFIX.length), overId.slice(DROP_PREFIX.length), rel);
  };

  const onDragMove = (e: DragMoveEvent) => {
    if (!String(e.active.id).startsWith(ROW_PREFIX)) return;
    const next = dropFor(e);
    setRowDrop((prev) =>
      prev?.targetId === next?.targetId && prev?.pos === next?.pos && prev?.index === next?.index ? prev : next,
    );
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    if (activeId.startsWith(ROW_PREFIX)) {
      const drop = dropFor(e);
      if (drop) moveNodeTo(activeId.slice(ROW_PREFIX.length), drop.parentId, drop.index);
    } else if (e.over && e.active.id !== e.over.id) {
      const over = columns.find((c) => c.id === String(e.over!.id));
      const active = columns.find((c) => c.id === activeId);
      if (over && active && !!over.pinned !== !!active.pinned) updateColumn(activeId, { pinned: !!over.pinned });
      reorderColumns(activeId, String(e.over.id));
    }
    setDragId(null);
    setRowDrop(null);
  };

  const draggedNode = dragId ? nodes.find((n) => n.id === dragId) : undefined;

  const indent = (depth: number) => ({ paddingLeft: `${depth * 1.5 + 0.5}rem` });

  // "Hide completed": done tasks and completed projects/groups disappear with everything inside.
  const hideCompleted = useAppStore((s) => s.settings.hideCompleted);
  const hidden = useMemo(() => (hideCompleted ? completedIds(nodes) : new Set<string>()), [hideCompleted, nodes]);

  const renderNode = (node: WbsNode): ReactNode => {
    const c = computed.get(node.id);
    if (!c) return null;
    const children = kids.get(node.id) ?? [];
    const canHaveChildren = node.kind !== 'task';
    return (
      <Fragment key={node.id}>
        <DndRow
          node={node}
          drop={rowDrop?.targetId === node.id ? rowDrop.pos : null}
          className={cx('group border-b border-slate-100 hover:bg-emerald-50/40', node.kind === 'project' && 'bg-slate-50')}
        >
          {(handle) => (
          <>
          <td
            className="sticky left-0 z-[1] border-r border-slate-200 bg-inherit bg-white py-1 pr-1 group-hover:bg-emerald-50"
            style={{ ...indent(c.depth), ...widthStyle(nameWidth) }}
          >
            <div className="relative flex items-center gap-1">
              <button
                ref={handle.setActivatorNodeRef}
                {...handle.listeners}
                {...handle.attributes}
                title={t('wbs.dragRow')}
                aria-label={t('wbs.dragRow')}
                className="-ml-1 w-4 shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-600 active:cursor-grabbing group-hover:text-slate-400"
              >
                ⠿
              </button>
              {children.length > 0 ? (
                <button className="w-5 text-slate-500 hover:text-slate-900" onClick={() => toggleCollapsed(node.id)} aria-label="toggle">
                  {node.collapsed ? '▶' : '▼'}
                </button>
              ) : (
                <span className="w-5 text-center text-slate-400">{KIND_ICON[node.kind]}</span>
              )}
              <InlineText
                value={node.name}
                autoFocus={focusId === node.id}
                onCommit={(v) => v.trim() && updateNode(node.id, { name: v.trim() })}
                className={cx('cursor-pencil', KIND_STYLE[node.kind], node.status === 'done' && 'text-slate-400 line-through')}
              />
              {/* Row actions float over the end of the name on hover, so names use the full width otherwise. */}
              <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg bg-emerald-50/95 py-0.5 pl-3 shadow-[-12px_0_12px_-4px_rgb(var(--c-emerald-50)/0.95)] group-focus-within:flex group-hover:flex">
                {canHaveChildren && (
                  <>
                    <AddChip kind="task" onClick={() => add(node.id, 'task')} title={t('wbs.addTaskIn', { name: node.name })} />
                    <AddChip kind="group" onClick={() => add(node.id, 'group')} title={t('wbs.addGroupIn', { name: node.name })} />
                  </>
                )}
                <CompleteToggle node={node} />
                {node.kind === 'task' && c.isLeaf && (
                  <IconButton title={t('wbs.open')} onClick={() => openTask(node.id)}>⤢</IconButton>
                )}
                <IconButton
                  title={t('wbs.delete')}
                  className="hover:bg-rose-100 hover:text-rose-700"
                  onClick={() => confirm(t('wbs.deleteConfirm', { name: node.name })) && deleteNode(node.id)}
                >
                  ✕
                </IconButton>
              </div>
            </div>
          </td>
          {visibleCols.map((col) => (
            <td
              key={col.id}
              className={cx(
                'overflow-hidden whitespace-nowrap px-2 py-1 align-middle text-sm',
                col.pinned && 'sticky z-[1] bg-white group-hover:bg-emerald-50',
                col.id === lastPinnedId && 'border-r-2 border-r-sky-200',
              )}
              style={{ ...(col.pinned ? { left: pinLeft[col.id] ?? 0 } : {}), ...widthStyle(colWidth(col)) }}
            >
              <Cell col={col} node={node} c={c} />
            </td>
          ))}
          </>
          )}
        </DndRow>
        {!node.collapsed && children.filter((ch) => !hidden.has(ch.id)).map(renderNode)}
        {canHaveChildren && children.length === 0 && (
          <tr className="border-b border-slate-100">
            <td className="sticky left-0 bg-white py-1.5" style={{ ...indent(c.depth + 1), ...widthStyle(nameWidth) }}>
              <div className="flex items-center gap-2 pl-5">
                <span className="text-xs italic text-slate-400">{t('wbs.empty')}</span>
                <AddChip kind="task" onClick={() => add(node.id, 'task')} title={t('wbs.addTaskIn', { name: node.name })} />
                <AddChip kind="group" onClick={() => add(node.id, 'group')} title={t('wbs.addGroupIn', { name: node.name })} />
              </div>
            </td>
            <td colSpan={visibleCols.length} />
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div>
      <ViewTitle
        navKey="wbs"
        aside={
          <div className="relative flex gap-2">
            <HideCompletedToggle />
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
              onClick={() => setShowColumns((v) => !v)}
            >
              ⚙ {t('wbs.columns')}
            </button>
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              onClick={() => add(null, 'project')}
            >
              ⊕ {t('wbs.newProject')}
            </button>
            {showColumns && <ColumnManager onClose={() => setShowColumns(false)} />}
          </div>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={(e) => {
            const id = String(e.active.id);
            if (id.startsWith(ROW_PREFIX)) setDragId(id.slice(ROW_PREFIX.length));
          }}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setDragId(null);
            setRowDrop(null);
          }}
        >
        {/* w-max: columns keep the widths they are given instead of stretching to fill. */}
        <table className="w-max min-w-0 border-collapse">
          <thead>
              <SortableContext items={visibleCols.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                <tr>
                  <th
                    ref={nameHeaderRef}
                    className="sticky left-0 z-[4] border-b border-r border-slate-300 bg-slate-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                    style={widthStyle(nameWidth)}
                  >
                    {t('col.name')}
                    <ResizeHandle
                      min={160}
                      onLive={(w) => setLive((l) => ({ ...l, __name: w }))}
                      onCommit={(w) => {
                        updateSettings({ wbsNameWidth: w });
                        setLive(({ __name: _n, ...rest }) => rest);
                      }}
                      onReset={() => updateSettings({ wbsNameWidth: 352 })}
                    />
                  </th>
                  {visibleCols.map((col) => (
                    <SortableHeader
                      key={col.id}
                      col={col}
                      label={colLabel(col)}
                      stickyLeft={pinLeft[col.id]}
                      lastPinned={col.id === lastPinnedId}
                      measureRef={(el) => (el ? headerEls.current.set(col.id, el) : headerEls.current.delete(col.id))}
                      onTogglePin={() => updateColumn(col.id, { pinned: !col.pinned })}
                      width={colWidth(col)}
                      onResizeLive={(w) => setLive((l) => ({ ...l, [col.id]: w }))}
                      onResizeCommit={(w) => {
                        updateColumn(col.id, { width: w });
                        setLive(({ [col.id]: _w, ...rest }) => rest);
                      }}
                    />
                  ))}
                </tr>
              </SortableContext>
          </thead>
          <tbody>
            {(kids.get(null) ?? []).filter((n) => !hidden.has(n.id)).map(renderNode)}
            <tr>
              <td className="sticky left-0 bg-white px-3 py-2">
                <AddProjectButton onClick={() => add(null, 'project')}>{t('wbs.newProject')}</AddProjectButton>
              </td>
              <td colSpan={visibleCols.length} />
            </tr>
          </tbody>
        </table>
        <DragOverlay dropAnimation={null}>
          {draggedNode && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-sm shadow-lg">
              <span className="text-slate-400">{KIND_ICON[draggedNode.kind]}</span>
              <span className={KIND_STYLE[draggedNode.kind]}>{draggedNode.name}</span>
            </div>
          )}
        </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

/** "+ Task" (green, •) and "+ Group" (blue, ▸) are styled apart so they're easy to tell apart. */
function AddChip({ kind, onClick, title }: { kind: 'task' | 'group'; onClick: () => void; title: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
        kind === 'task'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100',
      )}
    >
      <span aria-hidden>{kind === 'task' ? '•' : '▸'}</span>+ {t(`kind.${kind}`)}
    </button>
  );
}

function AddProjectButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-3 py-1 text-sm text-slate-500 hover:border-slate-500 hover:bg-slate-50 hover:text-slate-800"
      onClick={onClick}
    >
      ⊕ {children}
    </button>
  );
}
