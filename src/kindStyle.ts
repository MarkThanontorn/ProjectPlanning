import type { NodeKind } from './domain/types';

/**
 * How Project / Group / Task are told apart in WBS and Gantt — by typography and icon,
 * not colour (colour is kept for status and progress):
 * Project = bold italic, underlined · Group = semibold italic · Task = regular — all the same size.
 */
export const KIND_ICON: Record<NodeKind, string> = { project: '◆', group: '▸', task: '•' };

export const KIND_ICON_COLOR: Record<NodeKind, string> = {
  project: 'text-slate-600',
  group: 'text-slate-500',
  task: 'text-slate-400',
};

export const KIND_TEXT: Record<NodeKind, string> = {
  project: 'font-bold italic text-slate-900 underline decoration-slate-400 decoration-2 underline-offset-4',
  group: 'font-semibold italic text-slate-800',
  task: 'text-slate-700',
};

/** Opaque background for sticky cells, so content scrolled underneath doesn't show through. */
export const KIND_ROW_BG: Record<NodeKind, string> = {
  project: 'bg-white',
  group: 'bg-white',
  task: 'bg-white',
};

/** A heavier line above each project separates one project from the next. */
export const KIND_ROW_BORDER: Record<NodeKind, string> = {
  project: 'border-t-2 border-t-slate-300',
  group: '',
  task: '',
};

/** Kept for call sites; no coloured bars any more. */
export const KIND_ACCENT: Record<NodeKind, string> = { project: '', group: '', task: '' };
