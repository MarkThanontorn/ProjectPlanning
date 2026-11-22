import type { WbsNode } from './types';

/**
 * In-charge can hold several people. They are stored in the same text field,
 * separated by commas ("Chavalit, Thanontorn"); "/" and ";" are read as separators too.
 */
export function splitPeople(text: string): string[] {
  return [...new Set(text.split(/[,;/、]+/).map((s) => s.trim()).filter(Boolean))];
}

export const joinPeople = (people: string[]) => people.join(', ');

/** Everyone named anywhere, sorted. */
export function knownPeople(nodes: WbsNode[]): string[] {
  const all = new Set<string>();
  for (const n of nodes) for (const p of splitPeople(n.inCharge)) all.add(p);
  return [...all].sort((a, b) => a.localeCompare(b));
}
