import {
  CREATE,
  DELETED,
  diff,
  entityHeadIds,
  fieldKey,
  materialize,
  type DeleteConflict,
  type EntityType,
  type FieldConflict,
  type Materialized,
  type Op,
  type SharedData,
  validOp,
} from './model';

export const DATA_FORMAT = 'pp-team/1';
export const LIVE_FORMAT = 'pp-team-live/1';

/** Repeated edits of the same field (e.g. dragging a slider) that nobody has seen yet become one entry. */
const COALESCE_MS = 60_000;
/** Replaced edits older than this are dropped from the file (history keeps this long). */
export const HISTORY_DAYS = 90;

export interface Member {
  id: string;
  name: string;
}

export interface DataFile {
  format: typeof DATA_FORMAT;
  userId: string;
  name: string;
  savedAt: string;
  ops: Op[];
}

export interface EditLock {
  t: 'node';
  e: string;
  since: string;
  beat: string;
}

/** Small, frequently written file: presence and what this person is editing. */
export interface LiveFile {
  format: typeof LIVE_FORMAT;
  userId: string;
  name: string;
  beat: string;
  editing: EditLock | null;
}

let seq = 0;
const opId = (me: string) => `${me}.${Date.now().toString(36)}.${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** One team member's view: their own ops plus the latest files of everyone else. */
export class TeamClient {
  me: Member;
  myOps: Op[];
  /** Other members' data files (latest per member). */
  others = new Map<string, DataFile>();
  mat: Materialized;
  /** Our ops already written to the shared folder; others may have seen them, so they are never rewritten. */
  private published = new Set<string>();

  constructor(me: Member, myOps: Op[] = [], others: DataFile[] = []) {
    this.me = me;
    this.myOps = myOps;
    for (const o of myOps) this.published.add(o.id);
    for (const f of others) this.addOther(f);
    this.mat = materialize(this.allOps());
  }

  private addOther(raw: DataFile) {
    if (raw.userId === this.me.id) return;
    // Ignore anything malformed, and ops claiming to be someone else's.
    const f: DataFile = { ...raw, name: String(raw.name ?? '?'), ops: raw.ops.filter((o) => validOp(o, raw.userId)) };
    const prev = this.others.get(f.userId);
    if (!prev) return void this.others.set(f.userId, f);
    // Two files for one person (e.g. a cloud "conflicted copy"): keep every op, newer file wins per op.
    const [older, newer] = prev.savedAt <= f.savedAt ? [prev, f] : [f, prev];
    const ids = new Set(newer.ops.map((o) => o.id));
    this.others.set(f.userId, { ...newer, ops: [...newer.ops, ...older.ops.filter((o) => !ids.has(o.id))] });
  }

  /** Replaces what we know of the other members with freshly read files. */
  setOthers(files: DataFile[]) {
    this.others.clear();
    for (const f of files) this.addOther(f);
    this.remat();
  }

  allOps(): Op[] {
    const all = [...this.myOps];
    for (const f of this.others.values()) all.push(...f.ops);
    return all;
  }

  remat() {
    this.mat = materialize(this.allOps());
  }

  private push(t: EntityType, e: string, f: string, v: unknown, seen: string[], now: Date): Op {
    const at = now.toISOString();
    const heads = this.mat.heads.get(fieldKey(t, e, f)) ?? [];
    // Coalesce: still the only head, ours, recent and not yet shared → update it instead of adding history noise.
    if (
      f !== CREATE &&
      f !== DELETED &&
      heads.length === 1 &&
      heads[0].by === this.me.id &&
      !this.published.has(heads[0].id) &&
      now.getTime() - Date.parse(heads[0].at) < COALESCE_MS
    ) {
      const mine = this.myOps.find((o) => o.id === heads[0].id);
      if (mine) {
        mine.v = v;
        mine.at = at;
        return mine;
      }
    }
    const op: Op = { id: opId(this.me.id), by: this.me.id, at, t, e, f, v, seen };
    this.myOps.push(op);
    return op;
  }

  /** Records the difference between two local states. Returns the ops made. */
  recordChanges(prev: SharedData, next: SharedData, now = new Date()): Op[] {
    const made: Op[] = [];
    for (const c of diff(prev, next)) {
      const seen =
        c.f === DELETED ? entityHeadIds(this.mat, c.t, c.e) : (this.mat.heads.get(fieldKey(c.t, c.e, c.f)) ?? []).map((o) => o.id);
      made.push(this.push(c.t, c.e, c.f, c.v, seen, now));
    }
    if (made.length) this.remat();
    return made;
  }

  /** Records every record as created (first person in a new team folder, or merging local data in). */
  seed(data: SharedData, now = new Date(), skipExisting = false) {
    const empty: SharedData = { nodes: [], milestones: [], columns: [] };
    const known = (t: EntityType, id: string) => skipExisting && this.mat.records.has(`${t}|${id}`);
    this.recordChanges(empty, {
      nodes: data.nodes.filter((n) => !known('node', n.id)),
      milestones: data.milestones.filter((m) => !known('milestone', m.id)),
      columns: data.columns.filter((c) => !known('column', c.id)),
    }, now);
  }

  /** Keeps one of the competing values. */
  resolveField(c: FieldConflict, opId: string, now = new Date()) {
    const pick = c.options.find((o) => o.opId === opId);
    if (!pick) return;
    const heads = (this.mat.heads.get(fieldKey(c.t, c.e, c.f)) ?? []).map((o) => o.id);
    const op: Op = { id: opIdFor(this.me.id), by: this.me.id, at: now.toISOString(), t: c.t, e: c.e, f: c.f, v: pick.v, seen: heads };
    this.myOps.push(op);
    this.remat();
  }

  private setDeleted(t: EntityType, e: string, v: boolean, now: Date) {
    this.myOps.push({ id: opIdFor(this.me.id), by: this.me.id, at: now.toISOString(), t, e, f: DELETED, v, seen: entityHeadIds(this.mat, t, e) });
  }

  private children(id: string): string[] {
    const out: string[] = [];
    for (const [k, r] of this.mat.records) if (k.startsWith('node|') && r.parentId === id) out.push(r.id as string);
    return out;
  }

  private isDeleted(t: EntityType, e: string) {
    const h = this.mat.heads.get(fieldKey(t, e, DELETED));
    return !!h && [...h].sort((a, b) => (a.at < b.at ? -1 : 1))[h.length - 1].v === true;
  }

  /** Delete-vs-edit conflict: delete for good (with everything inside) or bring it back. */
  resolveDelete(c: DeleteConflict, keep: 'delete' | 'restore', now = new Date()) {
    if (keep === 'restore') return this.restore(c.t, c.e, now, false);
    const visit = (t: EntityType, e: string) => {
      this.setDeleted(t, e, true, now);
      if (t !== 'node') return;
      for (const child of this.children(e)) visit('node', child);
      for (const [k, r] of this.mat.records) if (k.startsWith('milestone|') && r.projectId === e) this.setDeleted('milestone', r.id as string, true, now);
    };
    visit(c.t, c.e);
    this.remat();
  }

  /**
   * Brings a deleted record back, with its deleted parents (so it has somewhere
   * to live) and, when `withContents`, whatever was deleted together with it.
   */
  restore(t: EntityType, e: string, now = new Date(), withContents = true) {
    const delOp = this.mat.heads.get(fieldKey(t, e, DELETED))?.find((o) => o.v === true);
    if (this.isDeleted(t, e)) this.setDeleted(t, e, false, now);
    if (t === 'node') {
      let parent = this.mat.records.get(`node|${e}`)?.parentId as string | null;
      while (parent) {
        if (this.isDeleted('node', parent)) this.setDeleted('node', parent, false, now);
        parent = this.mat.records.get(`node|${parent}`)?.parentId as string | null;
      }
      if (withContents && delOp) {
        // Same person, within a few seconds = deleted together (a project with its tasks and milestones).
        const together = (op: Op | undefined) => !!op && op.v === true && op.by === delOp.by && Math.abs(Date.parse(op.at) - Date.parse(delOp.at)) < 5000;
        const visit = (id: string) => {
          for (const child of this.children(id)) {
            if (together(this.mat.heads.get(fieldKey('node', child, DELETED))?.[0])) this.setDeleted('node', child, false, now);
            visit(child);
          }
          for (const [k, r] of this.mat.records)
            if (k.startsWith('milestone|') && r.projectId === id && together(this.mat.heads.get(fieldKey('milestone', r.id as string, DELETED))?.[0]))
              this.setDeleted('milestone', r.id as string, false, now);
        };
        visit(e);
      }
    }
    this.remat();
  }

  /** Our ops, minus replaced edits older than the history window. */
  prunedOps(now = new Date()): Op[] {
    const cutoff = now.getTime() - HISTORY_DAYS * 86_400_000;
    return this.myOps.filter((o) => {
      if (o.f === CREATE || Date.parse(o.at) >= cutoff) return true;
      return (this.mat.heads.get(fieldKey(o.t, o.e, o.f)) ?? []).some((h) => h.id === o.id);
    });
  }

  dataFile(now = new Date()): DataFile {
    this.myOps = this.prunedOps(now);
    for (const o of this.myOps) this.published.add(o.id);
    return { format: DATA_FORMAT, userId: this.me.id, name: this.me.name, savedAt: now.toISOString(), ops: this.myOps };
  }
}

const opIdFor = opId;

export function isDataFile(x: unknown): x is DataFile {
  const d = x as DataFile;
  return !!d && d.format === DATA_FORMAT && typeof d.userId === 'string' && typeof d.savedAt === 'string' && Array.isArray(d.ops);
}
export function isLiveFile(x: unknown): x is LiveFile {
  const d = x as LiveFile;
  if (!d || d.format !== LIVE_FORMAT || typeof d.userId !== 'string' || typeof d.name !== 'string' || typeof d.beat !== 'string') return false;
  const e = d.editing;
  if (e !== null && (typeof e !== 'object' || typeof e.e !== 'string' || typeof e.since !== 'string' || typeof e.beat !== 'string')) d.editing = null;
  return true;
}

/** File base name for a member: readable name + short id (stays unique if two people share a name). */
export function fileBase(me: Member): string {
  const clean = me.name.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 30) || 'member';
  return `${clean}-${me.id.slice(-6)}`;
}

/** How fresh someone's editing lock is: active, possibly abandoned, or expired (null). */
export const LOCK_ACTIVE_MS = 2 * 60_000;
export const LOCK_EXPIRE_MS = 5 * 60_000;
export function lockState(lock: EditLock | null | undefined, now: Date): 'active' | 'stale' | null {
  if (!lock) return null;
  const age = now.getTime() - Date.parse(lock.beat);
  if (age < LOCK_ACTIVE_MS) return 'active';
  if (age < LOCK_EXPIRE_MS) return 'stale';
  return null;
}
