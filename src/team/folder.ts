/**
 * The shared team folder (a OneDrive / Box folder synced to this computer),
 * accessed through the browser's File System Access API (Edge / Chrome).
 */

export interface FolderFile {
  name: string;
  text: string;
}

export interface TeamFolder {
  name: string;
  readAll(): Promise<FolderFile[]>;
  write(name: string, text: string): Promise<void>;
}

type Permission = 'granted' | 'denied' | 'prompt';
/** The parts of the File System Access API we use (not all are in TypeScript's DOM types yet). */
export interface DirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File> }>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
  queryPermission?(opts: { mode: 'readwrite' }): Promise<Permission>;
  requestPermission?(opts: { mode: 'readwrite' }): Promise<Permission>;
}

export const folderPickerSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pickFolder(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker;
  return picker({ id: 'pp-team', mode: 'readwrite' });
}

/** A private folder inside the browser (for trying team mode without a cloud folder). */
export async function testFolder(): Promise<DirHandle> {
  const root = (await navigator.storage.getDirectory()) as unknown as { getDirectoryHandle(n: string, o: object): Promise<DirHandle> };
  return root.getDirectoryHandle('team-test', { create: true });
}

export async function permission(dir: DirHandle, ask: boolean): Promise<Permission> {
  if (!dir.queryPermission) return 'granted';
  const now = await dir.queryPermission({ mode: 'readwrite' });
  if (now === 'granted' || !ask || !dir.requestPermission) return now;
  return dir.requestPermission({ mode: 'readwrite' });
}

/** Folder backed by a directory handle; unchanged files are not re-read. */
export function handleFolder(dir: DirHandle): TeamFolder {
  const cache = new Map<string, { stamp: string; text: string }>();
  return {
    name: dir.name,
    async readAll() {
      const out: FolderFile[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
        try {
          const file = await (await dir.getFileHandle(entry.name)).getFile();
          const stamp = `${file.lastModified}:${file.size}`;
          const hit = cache.get(entry.name);
          const text = hit?.stamp === stamp ? hit.text : await file.text();
          cache.set(entry.name, { stamp, text });
          out.push({ name: entry.name, text });
        } catch {
          // A file the cloud client is still downloading or writing: pick it up next time.
        }
      }
      return out;
    },
    async write(name, text) {
      const handle = await dir.getFileHandle(name, { create: true });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      cache.delete(name);
    },
  };
}
