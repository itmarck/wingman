import { ConflictError, InvalidInputError } from '../../../../system/error.js';
import type { Projection, ProjectionMetadata } from '../../domain/projection.js';
import type { ProjectionRegistry } from '../../ports.js';

const projectionKeyPattern = /^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/;
const defaultProjectionAreas = ['docs', 'system'] as const;

export class MemoryProjectionRegistry implements ProjectionRegistry {
  readonly #projections = new Map<string, Projection>();

  constructor(
    projections: readonly Projection[],
    areas: readonly string[] = defaultProjectionAreas,
  ) {
    const registeredAreas = new Set(areas);

    for (const projection of projections) {
      assertProjectionKey(projection.metadata.key, registeredAreas);

      if (this.#projections.has(projection.metadata.key)) {
        throw new ConflictError(`Projection ${projection.metadata.key} is already registered`);
      }

      this.#projections.set(projection.metadata.key, projection);
    }
  }

  findProjection(key: string): Projection | undefined {
    return this.#projections.get(key);
  }

  listProjections(): readonly ProjectionMetadata[] {
    return Object.freeze([...this.#projections.values()].map((projection) => projection.metadata));
  }
}

function assertProjectionKey(key: string, registeredAreas: ReadonlySet<string>): void {
  if (!projectionKeyPattern.test(key)) {
    throw new InvalidInputError('Projection key must use area.view');
  }

  const [area] = key.split('.');

  if (!registeredAreas.has(area)) {
    throw new InvalidInputError(`Projection area ${area} is not registered`);
  }
}
