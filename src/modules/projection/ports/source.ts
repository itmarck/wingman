import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';

export interface ProjectionSource {
  loadKnowledge(): Promise<KnowledgeSnapshot>;
}
