import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';

export interface ProjectionMetadata {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

export interface ProjectionResult {
  readonly [key: string]: unknown;
}

/**
 * Discoverable derived view of the current knowledge state.
 */
export interface Projection {
  readonly metadata: ProjectionMetadata;
  build(snapshot: KnowledgeSnapshot): ProjectionResult;
}
