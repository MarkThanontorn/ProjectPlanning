/**
 * Team sync model: every change is an operation ("op") that sets one field of
 * one record. Each team member appends ops to their own file in a shared
 * folder; everyone merges all files into the same state.
 *
 * Concurrency: an op lists the ops it replaced (`seen` = the field's current
 * heads when it was made). A field whose newest ops did not see each other has
 * several heads: if their values differ, that is a conflict the team resolves
 * by picking one value (a new op that sees them all).
 */
import type { ColumnDef, Milestone, WbsNode } from '../domain/types';

export type EntityType = 'node' | 'milestone' | 'column';
export const ENTITY_TYPES: EntityType[] = ['node', 'milestone', 'column'];

export const CREATE = '$create';
export const DELETED = '$deleted';

/** Node fields that belong to each person (their day plan, their tree view), never shared. */
export const PERSONAL_NODE_FIELDS = new Set(['todayDate', 'collapsed']);
/** Fields where the newest value simply wins without asking (sibling order after drag & drop). */
export const SILENT_FIELDS = new Set(['order']);
/** Fields merged instead of conflicting: time logs from everyone are kept. */
export const MERGED_FIELDS = new Set(['timeLogs']);

export interface Op {
  id: string;
  /** Member id. */
  by: string;
  /** ISO datetime (author's clock). */
  at: string;
  t: EntityType;
  /** Record id. */
  e: string;
  /** Field name, `custom.<columnId>`, CREATE (v = full record) or DELETED (v = boolean). */
  f: string;
  v: unknown;
  /** Op ids this op replaces (the field's heads when it was made). */
  seen: string[];
}

export interface SharedData {
  nodes: WbsNode[];
  milestones: Milestone[];
  columns: ColumnDef[];
}

type Rec = Record<string, unknown>;

export interface FieldConflict {
  kind: 'field';
  key: string;
  t: EntityType;
  e: string;
  f: string;
  /** Value before the competing edits. */
  base: unknown;
  options: { opId: string; by: string; at: string; v: unknown }[];
}

export interface DeleteConflict {
  kind: 'delete';
  key: string;
  t: EntityType;
  e: string;
  deletedBy: string;
  deletedAt: string;
  /** Edits made without knowing about the delete (including items added inside). */
  edits: { by: string; at: string; f: string; e: string }[];
}

export type Conflict = FieldConflict | DeleteConflict;

export interface Trashed {
  t: EntityType;
  e: string;
  name: string;
  by: string;
  at: string;
}

export interface Materialized {
  data: SharedData;
  /** Heads per field key `t|e|f`. */
  heads: Map<string, Op[]>;
  conflicts: Conflict[];
  /** Deleted records (hidden) — can be restored. */
  trash: Trashed[];
  /** Raw records including deleted ones, for restore and history. */
  records: Map<string, Rec>;
}

export const fieldKey = (t: EntityType, e: string, f: string) => `${t}|${e}|${f}`;
export const entityKey = (t: EntityType, e: string) => `${t}|${e}`;

/** JSON with sorted object keys, so equal values compare equal. */
export function stable(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Rec;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}
export const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Splits a record into syncable fields; each custom column value is its own field. */
export function toFields(t: EntityType, rec: object): Rec {
  const out: Rec = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'id' || v === undefined) continue;
    if (t === 'node' && PERSONAL_NODE_FIELDS.has(k)) continue;
    if (t === 'node' && k === 'custom') {
      for (const [ck, cv] of Object.entries(v as Rec)) out[`custom.${ck}`] = cv;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function fromFields(t: EntityType, id: string, fields: Rec): Rec {
  const rec: Rec = { id };
  if (t === 'node') rec.custom = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('custom.')) {
      if (v !== null && v !== undefined && v !== '') (rec.custom as Rec)[k.slice(7)] = v;
    } else if (!(v === null && t === 'column')) rec[k] = v;
  }
  if (t === 'node') {
    rec.todayDate = null;
    rec.collapsed = false;
  }
  return rec;
}

const byTime = (a: Op, b: Op) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1);
const newest = (ops: Op[]) => [...ops].sort(byTime)[ops.length - 1];

/** Time logs from every head, de-duplicated by start time (a finished log wins over a running one). */
function mergeTimeLogs(heads: Op[]) {
  const byStart = new Map<string, { start: string; end: string | null }>();
  for (const h of [...heads].sort(byTime)) {
    for (const log of (h.v as { start: string; end: string | null }[]) ?? []) {
      const prev = byStart.get(log.start);
      if (!prev || log.end !== null) byStart.set(log.start, log);
    }
  }
  return [...byStart.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Heads of a group of ops for one field: the ops no other op in the group replaced. */
export function headsOf(group: Op[]): Op[] {
  const replaced = new Set<string>();
  for (const op of group) for (const s of op.seen) replaced.add(s);
  return group.filter((op) => !replaced.has(op.id));
}

const recordName = (rec: Rec | undefined) => String(rec?.name ?? rec?.label ?? rec?.id ?? '');

/** Builds the shared state, conflicts and trash from all ops. */
export function materialize(ops: Op[]): Materialized {
  const groups = new Map<string, Op[]>();
  const entities = new Map<string, { t: EntityType; e: string; keys: Set<string> }>();
  for (const op of ops) {
    const k = fieldKey(op.t, op.e, op.f);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(op);
    const ek = entityKey(op.t, op.e);
    let ent = entities.get(ek);
    if (!ent) entities.set(ek, (ent = { t: op.t, e: op.e, keys: new Set() }));
    ent.keys.add(k);
  }
  const heads = new Map<string, Op[]>();
  for (const [k, g] of groups) heads.set(k, headsOf(g));

  const conflicts: Conflict[] = [];
  const records = new Map<string, Rec>();
  const deleted = new Map<string, Op>(); // entity key -> winning delete op (hidden unless conflicted)
  const deleteConflicts = new Map<string, DeleteConflict>();

  for (const [ek, ent] of entities) {
    const create = groups.get(fieldKey(ent.t, ent.e, CREATE));
    if (!create) continue; // its creator's file is missing: nothing to build on
    const fields = toFields(ent.t, newest(create).v as Rec);
    for (const k of ent.keys) {
      const f = k.slice(ent.t.length + ent.e.length + 2);
      if (f === CREATE || f === DELETED) continue;
      const h = heads.get(k)!;
      if (MERGED_FIELDS.has(f)) {
        fields[f] = mergeTimeLogs(h);
        continue;
      }
      fields[f] = newest(h).v;
      const distinct = new Set(h.map((o) => stable(o.v)));
      if (distinct.size > 1 && !SILENT_FIELDS.has(f)) {
        const group = groups.get(k)!;
        const prior = group.filter((o) => h.some((x) => x.seen.includes(o.id)));
        const base = prior.length ? newest(prior).v : toFields(ent.t, newest(create).v as Rec)[f] ?? null;
        conflicts.push({
          kind: 'field',
          key: `${k}|${h.map((o) => o.id).sort().join(',')}`,
          t: ent.t,
          e: ent.e,
          f,
          base,
          options: [...h].sort(byTime).map((o) => ({ opId: o.id, by: o.by, at: o.at, v: o.v })),
        });
      }
    }
    records.set(ek, fromFields(ent.t, ent.e, fields));

    const del = heads.get(fieldKey(ent.t, ent.e, DELETED));
    if (del) {
      const win = newest(del);
      if (win.v === true) {
        deleted.set(ek, win);
        const seen = new Set(win.seen);
        const edits: DeleteConflict['edits'] = [];
        for (const k of ent.keys) {
          if (k.endsWith(`|${CREATE}`)) continue;
          for (const op of heads.get(k)!) {
            if (op.id !== win.id && !seen.has(op.id) && !(op.f === DELETED && op.v === true))
              edits.push({ by: op.by, at: op.at, f: op.f, e: op.e });
          }
        }
        if (edits.length)
          deleteConflicts.set(ek, {
            kind: 'delete',
            key: `del|${ek}|${win.id}`,
            t: ent.t,
            e: ent.e,
            deletedBy: win.by,
            deletedAt: win.at,
            edits,
          });
      }
    }
  }

  // Something added inside a deleted node (or below it) keeps that node visible until the team decides.
  const visibleNode = (id: string) => records.has(entityKey('node', id)) && (!deleted.has(entityKey('node', id)) || deleteConflicts.has(entityKey('node', id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [ek, rec] of records) {
      if (!ek.startsWith('node|') || !visibleNode(rec.id as string)) continue;
      const parent = rec.parentId as string | null;
      if (!parent || visibleNode(parent) || !records.has(entityKey('node', parent))) continue;
      const pk = entityKey('node', parent);
      const win = deleted.get(pk)!;
      const createOp = newest(groups.get(fieldKey('node', rec.id as string, CREATE))!);
      const existing = deleteConflicts.get(pk);
      const edit = { by: createOp.by, at: createOp.at, f: CREATE, e: rec.id as string };
      if (existing) existing.edits.push(edit);
      else
        deleteConflicts.set(pk, { kind: 'delete', key: `del|${pk}|${win.id}`, t: 'node', e: parent, deletedBy: win.by, deletedAt: win.at, edits: [edit] });
      changed = true;
    }
  }
  conflicts.push(...deleteConflicts.values());

  const data: SharedData = { nodes: [], milestones: [], columns: [] };
  const trash: Trashed[] = [];
  const liveNodes = new Set<string>();
  for (const [ek, rec] of records) if (ek.startsWith('node|') && visibleNode(rec.id as string)) liveNodes.add(rec.id as string);
  for (const [ek, rec] of records) {
    const t = ek.slice(0, ek.indexOf('|')) as EntityType;
    const del = deleted.get(ek);
    if (del && !deleteConflicts.has(ek)) {
      trash.push({ t, e: rec.id as string, name: recordName(rec), by: del.by, at: del.at });
      continue;
    }
    if (t === 'node') {
      const n = rec as unknown as WbsNode;
      data.nodes.push({
        ...n,
        parentId: n.parentId && liveNodes.has(n.parentId) ? n.parentId : null,
        dependsOn: (n.dependsOn ?? []).filter((d) => liveNodes.has(d)),
      });
    } else if (t === 'milestone') {
      const m = rec as unknown as Milestone;
      if (liveNodes.has(m.projectId)) data.milestones.push(m);
    } else data.columns.push(rec as unknown as ColumnDef);
  }
  trash.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { data, heads, conflicts, trash, records };
}

/** All current head op ids of a record (every field), used by deletes and restores. */
export function entityHeadIds(mat: Materialized, t: EntityType, e: string): string[] {
  const prefix = `${t}|${e}|`;
  const ids: string[] = [];
  for (const [k, h] of mat.heads) if (k.startsWith(prefix)) ids.push(...h.map((o) => o.id));
  return ids;
}

export interface Change {
  t: EntityType;
  e: string;
  f: string;
  v: unknown;
}

/** Field-level differences between two states (personal fields ignored). */
export function diff(prev: SharedData, next: SharedData): Change[] {
  const out: Change[] = [];
  const lists: [EntityType, { id: string }[], { id: string }[]][] = [
    ['node', prev.nodes, next.nodes],
    ['milestone', prev.milestones, next.milestones],
    ['column', prev.columns, next.columns],
  ];
  for (const [t, a, b] of lists) {
    if (a === b) continue;
    const before = new Map(a.map((r) => [r.id, r]));
    const after = new Map(b.map((r) => [r.id, r]));
    for (const [id, rec] of after) {
      const old = before.get(id);
      if (!old) {
        out.push({ t, e: id, f: CREATE, v: { ...toFields(t, rec), id } });
        continue;
      }
      if (old === rec) continue;
      const fa = toFields(t, old);
      const fb = toFields(t, rec);
      for (const f of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
        if (!same(fa[f] ?? null, fb[f] ?? null)) out.push({ t, e: id, f, v: fb[f] ?? null });
      }
    }
    for (const id of before.keys()) if (!after.has(id)) out.push({ t, e: id, f: DELETED, v: true });
  }
  return out;
}

/** Ops of one record, newest first — the edit history. */
export function historyOf(ops: Op[], t: EntityType, e: string): Op[] {
  return ops.filter((o) => o.t === t && o.e === e).sort(byTime).reverse();
}
