import type { Entry, EntryId } from '../../../core/knowledge/entry.js';
import type { Page, PageRequest } from '../../../system/page.js';

/**
 * Persistence required by Entry use cases.
 */
export interface EntryStore {
  saveEntry(entry: Entry): Promise<Entry>;
  findEntry(id: EntryId): Promise<Entry | undefined>;
  listEntries(request: PageRequest): Promise<Page<Entry>>;
}
