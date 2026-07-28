import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';

export interface ProjectionSource {
  loadKnowledge(): Promise<KnowledgeSnapshot>;
}
