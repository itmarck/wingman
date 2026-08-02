import type { EntryStore } from '../modules/capture/ports/store.js';
import type { InterpretationLifecycle } from '../modules/interpretation/ports/lifecycle.js';
import type { InterpretationQueue } from '../modules/interpretation/ports/queue.js';
import type { ReviewStore } from '../modules/interpretation/ports/review.js';
import type { InterpretationStateStore } from '../modules/interpretation/ports/state.js';
import type { InterpretationStore } from '../modules/interpretation/ports/store.js';
import type { InterpretationContextSource } from '../modules/interpretation/services/context.js';
import type { ItemStore } from '../modules/knowledge/ports/store.js';
import type { ProjectionSource } from '../modules/projection/ports/source.js';

export interface KnowledgeStorage
  extends EntryStore,
    ItemStore,
    InterpretationStore,
    ProjectionSource,
    InterpretationContextSource {}

export interface InterpretationStorage extends InterpretationStateStore, InterpretationQueue {}

/**
 * Persistence contracts required to compose Wingman independently of storage technology.
 */
export interface SystemStorage {
  readonly knowledge: KnowledgeStorage;
  readonly interpretations: InterpretationStorage;
  readonly reviews: ReviewStore;
  readonly lifecycle: InterpretationLifecycle;
}
