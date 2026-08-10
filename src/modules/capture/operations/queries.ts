import type { Entry, EntryId } from '../../../core/knowledge/entry.js';
import { NotFoundError } from '../../../system/error.js';
import { type Page, pageSize } from '../../../system/page.js';
import type { EntryStore } from '../ports/store.js';

/** Retrieves one preserved Entry by identity. */
export class GetEntryQuery {
  constructor(private readonly store: EntryStore) {}

  async execute(id: EntryId): Promise<Entry> {
    const entry = await this.store.findEntry(id);
    if (!entry) throw new NotFoundError(`Entry ${id} does not exist`);
    return entry;
  }
}

/** Retrieves preserved Entries in storage order. */
export class ListEntriesQuery {
  constructor(private readonly store: EntryStore) {}

  execute(cursor?: string): Promise<Page<Entry>> {
    return this.store.listEntries({ cursor, limit: pageSize, scope: 'entries' });
  }
}
