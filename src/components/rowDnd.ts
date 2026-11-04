/**
 * Shared rules for dragging Project / Group / Task rows to a new place (WBS and Gantt).
 */
import type { DragEndEvent, DragMoveEvent, DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { canPlace } from '../domain/calc';
import type { WbsNode } from '../domain/types';

export type DropPos = 'before' | 'after' | 'inside';

/** What a row gives its drag handle. */
export interface RowHandle {
  listeners: DraggableSyntheticListeners;
  attributes: DraggableAttributes;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
}

export interface RowDrop {
  targetId: string;
  pos: DropPos;
  parentId: string | null;
  index: number;
}

export const ROW_PREFIX = 'row:';
export const DROP_PREFIX = 'drop:';

/**
 * Turns the pointer position over a row into a drop: top quarter = before,
 * bottom quarter = after, middle of a project/group = inside (appended).
 * Below an expanded parent means "first child". Invalid moves return null.
 */
export function resolveRowDrop(
  nodes: WbsNode[],
  kids: Map<string | null, WbsNode[]>,
  activeId: string,
  targetId: string,
  rel: number,
): RowDrop | null {
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
}

/** Drop for the current pointer position during a row drag, or null when not over a valid row. */
export function rowDropFor(e: DragMoveEvent | DragEndEvent, nodes: WbsNode[], kids: Map<string | null, WbsNode[]>): RowDrop | null {
  const overId = e.over ? String(e.over.id) : '';
  const start = e.activatorEvent as PointerEvent;
  if (!e.over || !overId.startsWith(DROP_PREFIX) || !('clientY' in start)) return null;
  const rel = (start.clientY + e.delta.y - e.over.rect.top) / e.over.rect.height;
  return resolveRowDrop(nodes, kids, String(e.active.id).slice(ROW_PREFIX.length), overId.slice(DROP_PREFIX.length), rel);
}

export const sameDrop = (a: RowDrop | null, b: RowDrop | null) =>
  a?.targetId === b?.targetId && a?.pos === b?.pos && a?.index === b?.index;
