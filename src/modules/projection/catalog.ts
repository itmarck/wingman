import type { KnowledgeSnapshot } from '../../core/item/snapshot.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../../system/error.js';
import type { Projection, ProjectionMetadata, ProjectionResult } from './domain/projection.js';

export interface ProjectionRead {
  readonly metadata: ProjectionMetadata;
  readonly data: ProjectionResult;
}

/** Owns the trusted code-defined projections and builds them from current knowledge. */
export class ProjectionCatalog {
  readonly #projections = new Map<string, Projection>();

  constructor(
    private readonly source: { loadKnowledge(): Promise<KnowledgeSnapshot> },
    projections: readonly Projection[],
    areas: readonly string[] = ['docs', 'system'],
  ) {
    const registeredAreas = new Set(areas);
    for (const projection of projections) {
      assertKey(projection.metadata.key, registeredAreas);
      if (this.#projections.has(projection.metadata.key))
        throw new ConflictError(`Projection ${projection.metadata.key} is already registered`);
      this.#projections.set(projection.metadata.key, projection);
    }
  }

  list(): readonly ProjectionMetadata[] {
    return Object.freeze([...this.#projections.values()].map(({ metadata }) => metadata));
  }

  async read(key: string): Promise<ProjectionRead> {
    const projection = this.#projections.get(key);
    if (!projection) throw new NotFoundError(`Projection ${key} does not exist`);
    return Object.freeze({
      metadata: projection.metadata,
      data: projection.build(await this.source.loadKnowledge()),
    });
  }
}

function assertKey(key: string, areas: ReadonlySet<string>): void {
  if (!/^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/.test(key))
    throw new InvalidInputError('Projection key must use area.view');
  const [area] = key.split('.');
  if (!area || !areas.has(area))
    throw new InvalidInputError(`Projection area ${area} is not registered`);
}
