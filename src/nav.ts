/** Every view in the sidebar. `key` doubles as the i18n key (nav.<key>) and the saved order id. */
export const NAV = [
  { to: '/board/matrix', key: 'matrix', icon: '⊞' },
  { to: '/board/status', key: 'status', icon: '▥' },
  { to: '/master', key: 'master', icon: '◆' },
  { to: '/wbs', key: 'wbs', icon: '☰' },
  { to: '/gantt', key: 'gantt', icon: '▤' },
  { to: '/list', key: 'list', icon: '≡' },
] as const;

export type NavItem = (typeof NAV)[number];

/** Sidebar items in the user's saved order; unknown keys are dropped, new views appended. */
export function orderedNav(order: string[]): NavItem[] {
  const byKey = new Map<string, NavItem>(NAV.map((n) => [n.key, n]));
  const first = order.map((k) => byKey.get(k)).filter((n): n is NavItem => !!n);
  return [...first, ...NAV.filter((n) => !order.includes(n.key))];
}
