import type { CaptureEntryCommand } from './operations/capture.js';
import type { GetEntryQuery, ListEntriesQuery } from './operations/queries.js';

export interface CaptureModule {
  readonly captureEntry: CaptureEntryCommand;
  readonly getEntry: GetEntryQuery;
  readonly listEntries: ListEntriesQuery;
}
