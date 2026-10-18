import type { AppData } from '../domain/types';

/**
 * Storage boundary. The app only talks to this interface, so the local
 * IndexedDB implementation can later be swapped for a backend (e.g. Supabase).
 */
export interface Repository {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}
