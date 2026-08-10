import type { ListProjectionsQuery, ReadProjectionQuery } from './operations/queries.js';

export interface ProjectionModule {
  readonly listProjections: ListProjectionsQuery;
  readonly readProjection: ReadProjectionQuery;
}
