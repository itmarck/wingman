import type { Entry } from '../knowledge/entry.js';
import type { ComponentRevision } from './component.js';
import type { Item } from './item.js';

/** Immutable view consumed by interpretation, derivations and Projections. */
export interface KnowledgeSnapshot {
  readonly entries: readonly Entry[];
  readonly items: readonly Item[];
  readonly revisions: readonly ComponentRevision[];
}
