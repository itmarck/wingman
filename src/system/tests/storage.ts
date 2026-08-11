import { MemoryLock } from '../../adapters/memory/lock.js';
import type { SchemaRegistry } from '../../core/item/registry.js';
import { createKnowledgeRegistry } from '../../core/item/system.js';
import { MemoryAutomationStore } from '../../modules/automation/adapters/memory/store.js';
import { MemoryExecutionStore } from '../../modules/execution/adapters/memory/store.js';
import { MemoryInterpretations } from '../../modules/interpretation/adapters/memory/interpretation.js';
import { MemoryInterpretationLifecycle } from '../../modules/interpretation/adapters/memory/lifecycle.js';
import { MemoryReviewStore } from '../../modules/interpretation/adapters/memory/review.js';
import { MemoryKnowledgeStore } from '../../modules/knowledge/adapters/memory/store.js';
import { MemoryStateStore } from '../../modules/state/adapters/memory/store.js';
import { MemorySuggestionLifecycle } from '../../modules/suggestion/adapters/memory/lifecycle.js';
import { MemorySuggestionStore } from '../../modules/suggestion/adapters/memory/store.js';
import type { SystemStorage } from '../storage.js';

/** Creates isolated test doubles for fast tests that do not assert persistence semantics. */
export function createMemoryTestStorage(
  registry: SchemaRegistry = createKnowledgeRegistry(),
): SystemStorage {
  const lock = new MemoryLock();
  const knowledge = new MemoryKnowledgeStore(registry);
  const interpretations = new MemoryInterpretations(lock);
  const reviews = new MemoryReviewStore(lock);
  const states = new MemoryStateStore();
  const executions = new MemoryExecutionStore();
  const automations = new MemoryAutomationStore(executions);
  const suggestions = new MemorySuggestionStore();
  return Object.freeze({
    knowledge,
    interpretations,
    reviews,
    lifecycle: new MemoryInterpretationLifecycle(
      knowledge,
      interpretations,
      reviews,
      lock,
      states,
      automations,
      executions,
    ),
    states,
    executions,
    automations,
    suggestions,
    suggestionLifecycle: new MemorySuggestionLifecycle(suggestions, executions),
  });
}
