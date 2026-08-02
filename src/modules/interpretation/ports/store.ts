import type { ComponentRevision } from '../../../core/item/component.js';
import type { Item } from '../../../core/item/item.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';

export interface InterpretationRegistration {
  readonly items: readonly Item[];
  readonly revisions: readonly ComponentRevision[];
}

export interface InterpretationPublication {
  readonly itemIds: readonly string[];
  readonly revisionIds: readonly string[];
}

export interface InterpretationStore {
  loadKnowledge(): Promise<KnowledgeSnapshot>;
  saveInterpretation(registration: InterpretationRegistration): Promise<void>;
}
