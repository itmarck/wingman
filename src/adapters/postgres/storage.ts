import type { SchemaRegistry } from '../../core/item/registry.js';
import type { SystemStorage } from '../../system/storage.js';
import { PostgresAutomationStore } from './automation.js';
import type { Database } from './database.js';
import { PostgresExecutionStore } from './execution.js';
import { PostgresInterpretations } from './interpretation.js';
import { PostgresKnowledgeStore } from './knowledge.js';
import { PostgresInterpretationLifecycle } from './lifecycle.js';
import { PostgresReviewStore } from './review.js';
import { PostgresStateStore } from './state.js';
import { PostgresSuggestionLifecycle, PostgresSuggestionStore } from './suggestion.js';

/** Builds the sole complete durable storage bundle over one shared database owner. */
export function createPostgresStorage(database: Database, registry: SchemaRegistry): SystemStorage {
  return Object.freeze({
    knowledge: new PostgresKnowledgeStore(database, registry),
    interpretations: new PostgresInterpretations(database),
    reviews: new PostgresReviewStore(database),
    lifecycle: new PostgresInterpretationLifecycle(database, registry),
    states: new PostgresStateStore(database),
    executions: new PostgresExecutionStore(database),
    automations: new PostgresAutomationStore(database),
    suggestions: new PostgresSuggestionStore(database),
    suggestionLifecycle: new PostgresSuggestionLifecycle(database),
  });
}
