import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cx } from '../../components/ui';

/** Drop zone ids: "all", "today", "q:<important>:<urgent>", "st:<status>". */
export function DropZone({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cx(className, 'min-h-0 transition', isOver && 'bg-emerald-50 ring-2 ring-inset ring-emerald-400')}>
      {children}
    </div>
  );
}

export function Draggable({ zone, taskId, children }: { zone: string; taskId: string; children: ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `${zone}|${taskId}`, data: { taskId, zone } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cx('touch-none', isDragging && 'opacity-30')}>
      {children}
    </div>
  );
}
