import { comparePriority } from './eisenhower';
import type { BoardSort, BoardSortKey, Settings, WbsNode } from './types';

export const BOARD_SORT_KEYS: BoardSortKey[] = ['priority', 'rank', 'dueDate', 'planEnd', 'progress', 'name'];

const RANK_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

/** Empty values always go last, whichever way the list is sorted. */
function nullsLast<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number, dir: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir * cmp(a, b);
}

const text = (x: string, y: string) => x.localeCompare(y, 'th');
const num = (x: number, y: number) => x - y;

/** Card order on the boards; ties fall back to the normal priority order, then the name. */
export function compareBoard(a: WbsNode, b: WbsNode, sort: BoardSort, settings: Settings, today: string): number {
  const dir = sort.dir === 'desc' ? -1 : 1;
  let r = 0;
  switch (sort.key) {
    case 'priority':
      r = dir * comparePriority(a, b, settings, today);
      break;
    case 'rank':
      r = nullsLast(a.rank && RANK_ORDER[a.rank], b.rank && RANK_ORDER[b.rank], num, dir);
      break;
    case 'dueDate':
      r = nullsLast(a.dueDate, b.dueDate, text, dir);
      break;
    case 'planEnd':
      r = nullsLast(a.planEnd, b.planEnd, text, dir);
      break;
    case 'progress':
      r = dir * (a.progress - b.progress);
      break;
    case 'name':
      r = dir * text(a.name, b.name);
      break;
  }
  return r || comparePriority(a, b, settings, today) || text(a.name, b.name);
}
