import type { ProjectionMetadata } from '../domain/projection.js';
import type { ProjectionRegistry } from '../ports/registry.js';

export class ListProjectionsQuery {
  constructor(private readonly registry: ProjectionRegistry) {}

  execute(): readonly ProjectionMetadata[] {
    return this.registry.listProjections();
  }
}
