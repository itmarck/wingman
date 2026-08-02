import type { ComponentRevision } from '../../../core/item/component.js';
import type { Item } from '../../../core/item/item.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';

export interface ItemRegistration {
  readonly items: readonly Item[];
  readonly revisions: readonly ComponentRevision[];
}

/** Atomic persistence and identity lookup required by composable knowledge operations. */
export interface ItemStore {
  loadKnowledge(): Promise<KnowledgeSnapshot>;
  saveItems(registration: ItemRegistration): Promise<void>;
  findItems(name: string): Promise<readonly Item[]>;
}
