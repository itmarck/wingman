import type { Intent } from '../../../core/execution/intent.js';
import type { Suggestion } from '../domain/suggestion.js';

/** Persistence required by the Suggestion lifecycle. */
export interface SuggestionStore {
  save(suggestion: Suggestion): Promise<void>;
  find(id: string): Promise<Suggestion | undefined>;
  findFingerprint(fingerprint: string): Promise<Suggestion | undefined>;
  list(): Promise<readonly Suggestion[]>;
}

/** Atomic compound transitions owned by the Suggestion workflow. */
export interface SuggestionLifecycle {
  create(suggestion: Suggestion, intent?: Intent): Promise<void>;
  accept(suggestion: Suggestion, consentedIntent?: Intent): Promise<void>;
}
