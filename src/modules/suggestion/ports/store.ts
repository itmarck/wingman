import type { Suggestion } from '../domain/suggestion.js';

/** Persistence required by the Suggestion lifecycle. */
export interface SuggestionStore {
  save(suggestion: Suggestion): Promise<void>;
  find(id: string): Promise<Suggestion | undefined>;
  findFingerprint(fingerprint: string): Promise<Suggestion | undefined>;
  list(): Promise<readonly Suggestion[]>;
}
