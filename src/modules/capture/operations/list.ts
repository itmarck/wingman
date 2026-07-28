import type { Entry } from '../../../core/knowledge/entry.js';
import { type Page, pageSize } from '../../../system/page.js';
import type { EntryStore } from '../ports/store.js';

/**
 * Retrieves preserved Entries in storage order.
 */
export class ListEntriesQuery {
  constructor(private readonly store: EntryStore) {}

  execute(cursor?: string): Promise<Page<Entry>> {
    return this.store.listEntries({
      cursor,
      limit: pageSize,
      scope: 'entries',
    });
  }
}
