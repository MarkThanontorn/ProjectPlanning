import { useTranslation } from 'react-i18next';
import { blockers } from '../domain/deps';
import type { NodeKind, WbsNode } from '../domain/types';
import { KIND_ICON, KIND_ICON_COLOR, KIND_TEXT } from '../kindStyle';
import { useAppStore } from '../store/useAppStore';
import { CompleteToggle, NotRelevantToggle } from './completion';
import type { RowHandle } from './rowDnd';
import { NodeTeamBadge } from './team/TaskTeam';
import { DayButtons } from './TaskCard';
import { cx, InlineText, NotRelevantBadge } from './ui';

const iconBtn = 'grid h-6 w-6 shrink-0 place-items-center rounded text-slate-500 hover:bg-slate-200';

/**
 * The Name cell of a row — one component so WBS and Gantt work the same:
 * click the name for details, ✎ to rename, + to add inside, and actions on hover.
 * Actions appear at the right edge of the Name column while the mouse is on the name, so they never cover the schedule.
 */
export function RowName({
  node,
  isLeaf,
  hasKids,
  handle,
  editing,
  onEditing,
  onAdd,
  frozen,
  onFreeze,
}: {
  node: WbsNode;
  isLeaf: boolean;
  hasKids: boolean;
  handle: RowHandle;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onAdd: (kind: NodeKind) => void;
  /** Gantt: keep this row at the top while scrolling. */
  frozen?: boolean;
  onFreeze?: () => void;
}) {
  const { t } = useTranslation();
  const nodes = useAppStore((s) => s.nodes);
  const { updateNode, toggleCollapsed, openTask, deleteNode } = useAppStore();
  const container = node.kind !== 'task';
  const waitingFor = isLeaf && node.status !== 'done' ? blockers(node, nodes) : [];
  return (
    <div className="group/name relative flex min-w-0 flex-1 items-center gap-1">
      <button
        ref={handle.setActivatorNodeRef}
        {...handle.listeners}
        {...handle.attributes}
        title={t('wbs.dragRow')}
        aria-label={t('wbs.dragRow')}
        className="-ml-1 w-4 shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-600 active:cursor-grabbing group-hover/row:text-slate-400"
      >
        ⠿
      </button>
      {hasKids ? (
        <button className="w-5 shrink-0 text-slate-500 hover:text-slate-900" onClick={() => toggleCollapsed(node.id)} aria-label="toggle">
          {node.collapsed ? '▶' : '▼'}
        </button>
      ) : (
        <span className={cx('w-5 shrink-0 text-center', KIND_ICON_COLOR[node.kind])}>{KIND_ICON[node.kind]}</span>
      )}
      {editing ? (
        <InlineText
          autoFocus
          value={node.name}
          className="text-sm"
          onCommit={(v) => v.trim() && updateNode(node.id, { name: v.trim() })}
          onDone={() => onEditing(false)}
        />
      ) : (
        <button
          className={cx('min-w-0 truncate text-left hover:underline', KIND_TEXT[node.kind], node.status === 'done' && '!text-slate-400 line-through')}
          title={t('wbs.open')}
          onClick={() => openTask(node.id)}
        >
          {node.name}
        </button>
      )}
      {node.notRelevant && <NotRelevantBadge />}
      {frozen && (
        <span className="shrink-0 text-xs" title={t('gantt.frozen')}>
          📌
        </span>
      )}
      <NodeTeamBadge nodeId={node.id} />
      {waitingFor.length > 0 && <span title={t('deps.blockedBy', { names: waitingFor.map((b) => b.name).join(', ') })}>🔒</span>}
      {!editing && container && (
        <button
          className="ml-auto mr-1 grid h-5 w-5 shrink-0 place-items-center rounded border border-slate-300 text-xs font-semibold leading-none text-slate-500 hover:bg-slate-100"
          title={t('wbs.addTaskIn', { name: node.name })}
          aria-label={t('wbs.addTaskIn', { name: node.name })}
          onClick={() => onAdd('task')}
        >
          +
        </button>
      )}
      {!editing && (
        // Inside the Name column, at its right edge: it never covers the schedule.
        <div className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 pl-3 shadow-[-12px_0_12px_-6px_rgb(var(--c-white))] group-hover/name:block">
        <div className="flex items-center gap-0.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-1 py-0.5 shadow-md">
          {container && (
            <>
              <button
                className="shrink-0 rounded border border-emerald-300 bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                title={t('wbs.addTaskIn', { name: node.name })}
                onClick={() => onAdd('task')}
              >
                + {t('kind.task')}
              </button>
              <button
                className="shrink-0 rounded border border-sky-300 bg-sky-50 px-1.5 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
                title={t('wbs.addGroupIn', { name: node.name })}
                onClick={() => onAdd('group')}
              >
                + {t('kind.group')}
              </button>
            </>
          )}
          <button className={iconBtn} title={t('wbs.rename')} aria-label={t('wbs.rename')} onClick={() => onEditing(true)}>
            ✎
          </button>
          {onFreeze && (
            <button
              className={cx(iconBtn, frozen && 'bg-sky-100 text-sky-700')}
              title={t(frozen ? 'gantt.unfreeze' : 'gantt.freeze')}
              aria-label={t(frozen ? 'gantt.unfreeze' : 'gantt.freeze')}
              onClick={onFreeze}
            >
              📌
            </button>
          )}
          <CompleteToggle node={node} />
          {node.kind === 'task' && isLeaf && <NotRelevantToggle node={node} />}
          {node.kind === 'task' && isLeaf && <DayButtons node={node} bar />}
          <button
            className={cx(iconBtn, 'text-slate-400 hover:bg-rose-100 hover:text-rose-700')}
            title={t('wbs.delete')}
            aria-label={t('wbs.delete')}
            onClick={() => confirm(t('wbs.deleteConfirm', { name: node.name })) && deleteNode(node.id)}
          >
            ✕
          </button>
        </div>
        </div>
      )}
    </div>
  );
}
