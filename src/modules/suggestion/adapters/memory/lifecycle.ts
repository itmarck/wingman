import type { Intent } from '../../../../core/execution/intent.js';
import type { MemoryExecutionStore } from '../../../execution/adapters/memory/store.js';
import type { Suggestion } from '../../domain/suggestion.js';
import type { SuggestionLifecycle } from '../../ports/store.js';
import type { MemorySuggestionStore } from './store.js';

/** Narrow atomic test double for Suggestion compound transitions. */
export class MemorySuggestionLifecycle implements SuggestionLifecycle {
  constructor(
    private readonly suggestions: MemorySuggestionStore,
    private readonly executions: MemoryExecutionStore,
  ) {}

  async create(suggestion: Suggestion, intent?: Intent): Promise<void> {
    await this.persist(suggestion, intent);
  }

  async accept(suggestion: Suggestion, consentedIntent?: Intent): Promise<void> {
    await this.persist(suggestion, consentedIntent);
  }

  private async persist(suggestion: Suggestion, intent?: Intent): Promise<void> {
    const suggestionCheckpoint = this.suggestions.checkpoint();
    const executionCheckpoint = this.executions.checkpoint();
    try {
      if (intent) await this.executions.saveIntent(intent);
      await this.suggestions.save(suggestion);
    } catch (error) {
      this.suggestions.restore(suggestionCheckpoint);
      this.executions.restore(executionCheckpoint);
      throw error;
    }
  }
}
