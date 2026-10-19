/**
 * Team mode: connects the app store to a shared folder. Local edits become ops
 * in our own file; other members' files are merged in on every sync.
 */
import Dexie, { type Table } from 'dexie';
import { create } from 'zustand';
import type { AppData } from '../domain/types';
import { setCommitListener, useAppStore } from '../store/useAppStore';
import {
  TeamClient,
  fileBase,
  isDataFile,
  isLiveFile,
  lockState,
  LIVE_FORMAT,
  type DataFile,
  type EditLock,
  type LiveFile,
  type Member,
} from './client';
import { handleFolder, permission, type DirHandle, type TeamFolder } from './folder';
import { historyOf, same, type Conflict, type DeleteConflict, type EntityType, type FieldConflict, type Op, type SharedData, type Trashed } from './model';

class TeamDb extends Dexie {
  kv!: Table<{ key: string; value: unknown }, string>;
  constructor() {
    super('project-planning-team');
    this.version(1).stores({ kv: 'key' });
  }
}
const db = new TeamDb();

interface TeamConfig {
  handle: DirHandle;
  me: Member;
  folderName: string;
}

export interface MemberView {
  id: string;
  name: string;
  me: boolean;
  /** Last time their data file was written. */
  savedAt: string | null;
  /** Last sign of life (app open). */
  beat: string | null;
  editing: EditLock | null;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'ok' | 'warn';
  action?: 'conflicts';
}

interface TeamState {
  status: 'off' | 'needs-permission' | 'ready' | 'error';
  folderName: string;
  me: Member | null;
  members: MemberView[];
  conflicts: Conflict[];
  trash: Trashed[];
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  toasts: Toast[];
  /** "Tell me when they're done": member + task pairs. */
  watching: { userId: string; nodeId: string }[];
  dialog: null | 'connect' | 'conflicts' | 'trash';
  myLock: EditLock | null;
}

export const useTeamStore = create<TeamState>(() => ({
  status: 'off',
  folderName: '',
  me: null,
  members: [],
  conflicts: [],
  trash: [],
  syncing: false,
  lastSyncAt: null,
  error: null,
  toasts: [],
  watching: [],
  dialog: null,
  myLock: null,
}));
const setTeam = useTeamStore.setState;

const SYNC_MS = 60_000;
const PRESENCE_MS = 2 * 60_000;
const LOCK_BEAT_MS = 60_000;
/** An open task with no typing for this long stops counting as "being edited". */
const IDLE_RELEASE_MS = 10 * 60_000;
export const ONLINE_MS = 5 * 60_000;

let client: TeamClient | null = null;
let config: TeamConfig | null = null;
let folder: TeamFolder | null = null;
let liveFiles = new Map<string, LiveFile>();
let dataDirty = false;
let lastWriteAt: string | null = null;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
let timers: ReturnType<typeof setInterval>[] = [];
const knownConflicts = new Set<string>();
let session: { nodeId: string; lastInput: number } | null = null;

const shared = (d: AppData): SharedData => ({ nodes: d.nodes, milestones: d.milestones, columns: d.columns });

let toastSeq = 0;
export function toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) {
  const id = ++toastSeq;
  setTeam((s) => ({ toasts: [...s.toasts, { id, text, tone, action }] }));
  setTimeout(() => dismissToast(id), tone === 'warn' ? 20_000 : 8_000);
}
export function dismissToast(id: number) {
  setTeam((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
}

/** Translator injected by the UI so messages follow the chosen language. */
let tr: (key: string, vars?: Record<string, unknown>) => string = (k) => k;
export const setTeamTranslator = (fn: typeof tr) => {
  tr = fn;
};

export const memberName = (id: string): string => {
  if (client && id === client.me.id) return client.me.name;
  return client?.others.get(id)?.name ?? liveFiles.get(id)?.name ?? '?';
};

/** Reuses unchanged local objects so views don't re-render needlessly. */
function reconcile<T extends { id: string }>(local: T[], incoming: T[], patch?: (inc: T, loc: T | undefined) => T): { list: T[]; changed: boolean } {
  const byId = new Map(local.map((x) => [x.id, x]));
  const inc = new Map(incoming.map((x) => [x.id, x]));
  let changed = local.length !== incoming.length;
  const list: T[] = [];
  const push = (x: T) => {
    const loc = byId.get(x.id);
    const next = patch ? patch(x, loc) : x;
    if (loc && same(loc, next)) list.push(loc);
    else {
      list.push(next);
      changed = true;
    }
  };
  for (const l of local) {
    const x = inc.get(l.id);
    if (x) push(x);
    else changed = true;
  }
  for (const x of incoming) if (!byId.has(x.id)) push(x);
  return { list, changed };
}

/** Puts the merged team state into the app (keeping each person's own Today / collapsed state). */
function applyToApp() {
  if (!client) return;
  const local = useAppStore.getState();
  const m = client.mat.data;
  const nodes = reconcile(local.nodes, m.nodes, (n, l) => (l ? { ...n, todayDate: l.todayDate, collapsed: l.collapsed } : n));
  const milestones = reconcile(local.milestones, m.milestones);
  const columns = reconcile(local.columns, m.columns);
  if (nodes.changed || milestones.changed || columns.changed)
    useAppStore.getState().applyRemote({ nodes: nodes.list, milestones: milestones.list, columns: columns.list });
  refreshUi();
}

function refreshUi() {
  if (!client) return;
  setTeam({ conflicts: client.mat.conflicts, trash: client.mat.trash, members: buildMembers() });
}

function buildMembers(): MemberView[] {
  if (!client) return [];
  const me = client.me;
  const out: MemberView[] = [
    { id: me.id, name: me.name, me: true, savedAt: lastWriteAt, beat: new Date().toISOString(), editing: useTeamStore.getState().myLock },
  ];
  const ids = new Set([...client.others.keys(), ...liveFiles.keys()]);
  ids.delete(me.id);
  for (const id of ids) {
    const d = client.others.get(id);
    const l = liveFiles.get(id);
    out.push({ id, name: l?.name ?? d?.name ?? '?', me: false, savedAt: d?.savedAt ?? null, beat: l?.beat ?? null, editing: l?.editing ?? null });
  }
  return out;
}

const saveMyOps = () => client && db.kv.put({ key: 'myOps', value: client.myOps });

function onCommit(prev: AppData, next: AppData) {
  if (!client) return;
  const ops = client.recordChanges(shared(prev), shared(next));
  if (!ops.length) return;
  void saveMyOps();
  dataDirty = true;
  scheduleWrite();
  if (session && ops.some((o) => o.t === 'node' && o.e === session!.nodeId)) {
    session.lastInput = Date.now();
    if (!useTeamStore.getState().myLock) {
      const now = new Date().toISOString();
      setTeam({ myLock: { t: 'node', e: session.nodeId, since: now, beat: now } });
      void writeLive();
    }
  }
  refreshUi();
}

function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => void writeData(), 1000);
}

async function writeData() {
  if (!client || !folder || !config) return;
  try {
    const file = client.dataFile();
    await folder.write(`${fileBase(config.me)}.data.json`, JSON.stringify(file));
    dataDirty = false;
    lastWriteAt = file.savedAt;
    void saveMyOps();
    setTeam({ error: null, status: 'ready' });
    refreshUi();
  } catch (e) {
    setTeam({ error: String((e as Error)?.message ?? e), status: 'error' });
  }
}

async function writeLive() {
  if (!folder || !config) return;
  const live: LiveFile = { format: LIVE_FORMAT, userId: config.me.id, name: config.me.name, beat: new Date().toISOString(), editing: useTeamStore.getState().myLock };
  try {
    await folder.write(`${fileBase(config.me)}.live.json`, JSON.stringify(live));
  } catch {
    // Presence is best-effort; the next beat retries.
  }
}

/** Reads every member's files, merges, and writes our own changes. */
export async function syncNow() {
  if (!client || !folder || useTeamStore.getState().syncing) return;
  setTeam({ syncing: true });
  try {
    const files = await folder.readAll();
    const datas: DataFile[] = [];
    const lives = new Map<string, LiveFile>();
    for (const f of files) {
      let json: unknown;
      try {
        json = JSON.parse(f.text);
      } catch {
        continue; // half-written by the cloud client: next time
      }
      if (isDataFile(json) && json.userId !== client.me.id) datas.push(json);
      else if (isLiveFile(json) && json.userId !== client.me.id) {
        const prev = lives.get(json.userId);
        if (!prev || prev.beat < json.beat) lives.set(json.userId, json);
      }
    }
    liveFiles = lives;
    client.setOthers(datas);
    void db.kv.put({ key: 'others', value: datas });
    applyToApp();
    if (dataDirty) await writeData();
    setTeam({ lastSyncAt: new Date().toISOString(), error: null, status: 'ready' });
    afterSync();
  } catch (e) {
    setTeam({ error: String((e as Error)?.message ?? e), status: 'error' });
  } finally {
    setTeam({ syncing: false });
  }
}

/** New conflicts and finished edits someone asked to be told about. */
function afterSync() {
  const { conflicts, watching, members } = useTeamStore.getState();
  const fresh = conflicts.filter((c) => !knownConflicts.has(c.key));
  for (const c of conflicts) knownConflicts.add(c.key);
  if (fresh.length) toast(tr('team.newConflicts', { n: fresh.length }), 'warn', 'conflicts');
  const now = new Date();
  const still: TeamState['watching'] = [];
  for (const w of watching) {
    const m = members.find((x) => x.id === w.userId);
    const editingIt = m?.editing?.e === w.nodeId && lockState(m.editing, now) !== null;
    if (editingIt) still.push(w);
    else {
      const task = useAppStore.getState().nodes.find((n) => n.id === w.nodeId)?.name ?? '';
      toast(tr('team.doneEditing', { name: memberName(w.userId), task }), 'ok');
    }
  }
  if (still.length !== watching.length) setTeam({ watching: still });
}

function startLoops() {
  stopLoops();
  timers = [
    setInterval(() => void syncNow(), SYNC_MS),
    setInterval(() => document.visibilityState === 'visible' && void writeLive(), PRESENCE_MS),
    setInterval(heartbeat, LOCK_BEAT_MS),
  ];
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  window.addEventListener('pagehide', onLeave);
}
function stopLoops() {
  timers.forEach(clearInterval);
  timers = [];
  window.removeEventListener('focus', onFocus);
  document.removeEventListener('visibilitychange', onFocus);
  window.removeEventListener('pagehide', onLeave);
}
const onFocus = () => document.visibilityState === 'visible' && void syncNow();
const onLeave = () => {
  if (useTeamStore.getState().myLock) releaseLock();
  if (dataDirty) void writeData();
};

/** Keeps our lock alive while we're typing; lets it go after a quiet spell. */
function heartbeat() {
  const lock = useTeamStore.getState().myLock;
  if (!lock) return;
  if (session && session.nodeId === lock.e && Date.now() - session.lastInput < IDLE_RELEASE_MS) {
    setTeam({ myLock: { ...lock, beat: new Date().toISOString() } });
    void writeLive();
  } else releaseLock();
}

function releaseLock() {
  setTeam({ myLock: null });
  void writeLive();
  refreshUi();
}

/** The task detail popup is open on this task (editing starts with the first change). */
export function beginEditSession(nodeId: string) {
  session = { nodeId, lastInput: 0 };
}
export function endEditSession() {
  session = null;
  if (useTeamStore.getState().myLock) releaseLock();
}

export function watchLock(userId: string, nodeId: string) {
  setTeam((s) => ({ watching: [...s.watching.filter((w) => !(w.userId === userId && w.nodeId === nodeId)), { userId, nodeId }] }));
}

async function startFolder(handle: DirHandle) {
  folder = handleFolder(handle);
  setTeam({ status: 'ready', folderName: handle.name });
  await writeLive();
  await syncNow();
  startLoops();
}

let initDone: Promise<void> | undefined;
/** On app start: resume team mode if this browser joined a team before. */
export function initTeam() {
  initDone ??= resume();
  return initDone;
}
async function resume() {
  const cfg = (await db.kv.get('config'))?.value as TeamConfig | undefined;
  if (!cfg) return;
  config = cfg;
  const myOps = ((await db.kv.get('myOps'))?.value as Op[] | undefined) ?? [];
  const others = ((await db.kv.get('others'))?.value as DataFile[] | undefined) ?? [];
  client = new TeamClient(cfg.me, myOps, others);
  // Anything not yet confirmed written is written on the first sync.
  dataDirty = true;
  setCommitListener(onCommit);
  setTeam({ me: cfg.me, folderName: cfg.folderName });
  for (const c of client.mat.conflicts) knownConflicts.add(c.key);
  applyToApp();
  try {
    if ((await permission(cfg.handle, false)) === 'granted') return void (await startFolder(cfg.handle));
  } catch {
    // fall through: ask
  }
  setTeam({ status: 'needs-permission' });
}

/** Needs a click (browser rule): asks again for access to the remembered folder. */
export async function reconnect() {
  if (!config) return;
  if ((await permission(config.handle, true)) === 'granted') await startFolder(config.handle);
}

export interface FolderInfo {
  members: string[];
  hasData: boolean;
}

export async function inspectFolder(handle: DirHandle): Promise<FolderInfo> {
  const files = await handleFolder(handle).readAll();
  const names = new Set<string>();
  let hasData = false;
  for (const f of files) {
    try {
      const j = JSON.parse(f.text);
      if (isDataFile(j)) {
        names.add(j.name);
        if (j.ops.length) hasData = true;
      } else if (isLiveFile(j)) names.add(j.name);
    } catch {
      // ignore
    }
  }
  return { members: [...names], hasData };
}

/**
 * Joins (or starts) a team in this folder.
 * - empty folder: our data becomes the team's starting data
 * - existing team: 'team' = use theirs only; 'merge' = also add ours
 */
export async function connectTeam(handle: DirHandle, name: string, mode: 'team' | 'merge') {
  const files = await handleFolder(handle).readAll();
  const datas: DataFile[] = [];
  for (const f of files) {
    try {
      const j = JSON.parse(f.text);
      if (isDataFile(j)) datas.push(j);
    } catch {
      // ignore
    }
  }
  const me: Member = { id: `u${Math.random().toString(36).slice(2, 12)}`, name: name.trim() };
  client = new TeamClient(me, [], datas);
  const local = shared(useAppStore.getState());
  const hasTeamData = datas.some((d) => d.ops.length);
  if (!hasTeamData) client.seed(local);
  else if (mode === 'merge') client.seed(local, new Date(), true);
  config = { handle, me, folderName: handle.name };
  await db.kv.bulkPut([
    { key: 'config', value: config },
    { key: 'myOps', value: client.myOps },
    { key: 'others', value: datas },
  ]);
  dataDirty = true;
  knownConflicts.clear();
  setCommitListener(onCommit);
  setTeam({ me, folderName: handle.name, dialog: null });
  applyToApp();
  await startFolder(handle);
}

/** Back to single-user: the data stays on this computer, the team folder is left alone. */
export async function leaveTeam() {
  if (useTeamStore.getState().myLock) releaseLock();
  if (dataDirty) await writeData();
  stopLoops();
  setCommitListener(null);
  client = null;
  folder = null;
  config = null;
  liveFiles = new Map();
  await db.kv.clear();
  setTeam({ status: 'off', folderName: '', me: null, members: [], conflicts: [], trash: [], lastSyncAt: null, error: null, watching: [], dialog: null, myLock: null });
}

function afterLocalDecision() {
  void saveMyOps();
  dataDirty = true;
  applyToApp();
  scheduleWrite();
}

export function resolveField(c: FieldConflict, opId: string) {
  client?.resolveField(c, opId);
  afterLocalDecision();
}
export function resolveDelete(c: DeleteConflict, keep: 'delete' | 'restore') {
  client?.resolveDelete(c, keep);
  afterLocalDecision();
}
export function restoreFromTrash(t: EntityType, e: string) {
  client?.restore(t, e);
  afterLocalDecision();
}

/** Edit history of one record (team mode only). */
export function historyFor(t: EntityType, e: string): Op[] {
  return client ? historyOf(client.allOps(), t, e) : [];
}

/** Another member's most recent edit to this record within `withinMs`, if any. */
export function recentEditByOther(t: EntityType, e: string, withinMs = 10 * 60_000): Op | null {
  if (!client) return null;
  const cutoff = Date.now() - withinMs;
  for (const f of client.others.values())
    for (const o of f.ops) if (o.t === t && o.e === e && Date.parse(o.at) >= cutoff) return historyFor(t, e).find((x) => x.by !== client!.me.id) ?? o;
  return null;
}

export const isTeamActive = () => client !== null;
