import { NotFoundError } from '../../../system/error.js';
import type { ProjectionMetadata, ProjectionResult } from '../domain/projection.js';
import type { ProjectionRegistry, ProjectionSource } from '../ports.js';

export interface ReadProjectionResult {
  readonly metadata: ProjectionMetadata;
  readonly data: ProjectionResult;
}

export class ListProjectionsQuery {
  constructor(private readonly registry: ProjectionRegistry) {}

  execute(): readonly ProjectionMetadata[] {
    return this.registry.listProjections();
  }
}

export class ReadProjectionQuery {
  constructor(
    private readonly source: ProjectionSource,
    private readonly registry: ProjectionRegistry,
  ) {}

  async execute(key: string): Promise<ReadProjectionResult> {
    const projection = this.registry.findProjection(key);
    if (!projection) throw new NotFoundError(`Projection ${key} does not exist`);
    return Object.freeze({
      metadata: projection.metadata,
      data: projection.build(await this.source.loadKnowledge()),
    });
  }
}
