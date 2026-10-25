import type { NodeKind } from './domain/types';

/**
 * One colour per level, shared by WBS and Gantt so Project / Group / Task read apart at a glance
 * (light and dark: the theme mirrors each shade).
 * Project = emerald, Group = violet, Task = neutral rows with sky bars.
 */
export const KIND_ICON: Record<NodeKind, string> = { project: '◆', group: '▸', task: '•' };

export const KIND_ICON_COLOR: Record<NodeKind, string> = {
  project: 'text-emerald-600',
  group: 'text-violet-500',
  task: 'text-slate-400',
};

export const KIND_TEXT: Record<NodeKind, string> = {
  project: 'font-bold text-emerald-900',
  group: 'font-semibold text-violet-900',
  task: 'text-slate-800',
};

/**
 * Opaque row background (also used by sticky cells, so scrolled content doesn't show through).
 * Note: the dark theme mirrors shades, so `dark:bg-slate-200` renders as a dark slate-800 —
 * groups get a calm grey row in dark mode instead of deep purple.
 */
export const KIND_ROW_BG: Record<NodeKind, string> = {
  project: 'bg-emerald-50',
  group: 'bg-violet-50 dark:bg-slate-200',
  task: 'bg-white',
};

/** Coloured bar at the start of the name cell. */
export const KIND_ACCENT: Record<NodeKind, string> = {
  project: 'border-l-4 border-l-emerald-500',
  group: 'border-l-4 border-l-violet-400',
  task: 'border-l-4 border-l-transparent',
};
