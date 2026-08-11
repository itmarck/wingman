import type { AutomationStore } from '../modules/automation/ports/store.js';
import type { EntryStore } from '../modules/capture/ports/store.js';
import type { ExecutionStore } from '../modules/execution/ports/store.js';
import type {
  InterpretationLifecycle,
  InterpretationQueue,
  InterpretationStateStore,
  InterpretationStore,
  ReviewStore,
} from '../modules/interpretation/ports.js';
import type { InterpretationContextSource } from '../modules/interpretation/services/context.js';
import type { ItemStore } from '../modules/knowledge/ports/store.js';
import type { StateStore } from '../modules/state/ports/store.js';
import type { SuggestionLifecycle, SuggestionStore } from '../modules/suggestion/ports/store.js';

export interface KnowledgeStorage
  extends EntryStore,
    ItemStore,
    InterpretationStore,
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
  readonly states: StateStore;
  readonly executions: ExecutionStore;
  readonly automations: AutomationStore;
  readonly suggestions: SuggestionStore;
  readonly suggestionLifecycle: SuggestionLifecycle;
}
