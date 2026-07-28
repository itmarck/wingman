import type { Projection, ProjectionMetadata } from '../domain/projection.js';

export interface ProjectionRegistry {
  findProjection(key: string): Projection | undefined;
  listProjections(): readonly ProjectionMetadata[];
}
