import Dexie, { type Table } from 'dexie';
import { defaultSettings, defaultToday } from '../domain/factory';
import type { AppData, ColumnDef, Milestone, Settings, TodayData, WbsNode } from '../domain/types';
import type { Repository } from './repository';

class PlanningDb extends Dexie {
  nodes!: Table<WbsNode, string>;
  columns!: Table<ColumnDef, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('project-planning');
    this.version(1).stores({ nodes: 'id, parentId', columns: 'id', meta: 'key' });
  }
}

export class DexieRepository implements Repository {
  private db = new PlanningDb();

  async load(): Promise<AppData | null> {
    const settings = await this.db.meta.get('settings');
    if (!settings) return null;
    const [nodes, columns, today, milestones] = await Promise.all([
      this.db.nodes.toArray(),
      this.db.columns.toArray(),
      this.db.meta.get('today'),
      this.db.meta.get('milestones'),
    ]);
    return {
      nodes,
      columns,
      // Merge with defaults so settings added in later versions get a value.
      settings: { ...defaultSettings(), ...(settings.value as Settings) },
      today: { ...defaultToday(), ...(today?.value as TodayData | undefined) },
      milestones: (milestones?.value as Milestone[] | undefined) ?? [],
    };
  }

  async save(data: AppData): Promise<void> {
    await this.db.transaction('rw', this.db.nodes, this.db.columns, this.db.meta, async () => {
      await Promise.all([this.db.nodes.clear(), this.db.columns.clear()]);
      await Promise.all([
        this.db.nodes.bulkPut(data.nodes),
        this.db.columns.bulkPut(data.columns),
        this.db.meta.put({ key: 'settings', value: data.settings }),
        this.db.meta.put({ key: 'today', value: data.today }),
        this.db.meta.put({ key: 'milestones', value: data.milestones }),
      ]);
    });
  }
}
