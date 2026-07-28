import type { CaptureEntryCommand } from './operations/capture.js';
import type { GetEntryQuery } from './operations/get.js';
import type { ListEntriesQuery } from './operations/list.js';

export interface CaptureModule {
  readonly captureEntry: CaptureEntryCommand;
  readonly getEntry: GetEntryQuery;
  readonly listEntries: ListEntriesQuery;
}
