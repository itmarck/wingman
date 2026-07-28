import type { ListProjectionsQuery } from './operations/list.js';
import type { ReadProjectionQuery } from './operations/read.js';

export interface ProjectionModule {
  readonly listProjections: ListProjectionsQuery;
  readonly readProjection: ReadProjectionQuery;
}
