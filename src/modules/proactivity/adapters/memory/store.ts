import type { Suggestion } from '../../domain/suggestion.js';
import type { SuggestionStore } from '../../ports/store.js';

export class MemorySuggestionStore implements SuggestionStore {
  readonly #suggestions = new Map<string, Suggestion>();
  readonly #fingerprints = new Map<string, string>();
  async save(suggestion: Suggestion): Promise<void> {
    const frozen = Object.freeze(structuredClone(suggestion));
    this.#suggestions.set(suggestion.id, frozen);
    this.#fingerprints.set(suggestion.fingerprint, suggestion.id);
  }
  async find(id: string): Promise<Suggestion | undefined> {
    return this.#suggestions.get(id);
  }
  async findFingerprint(fingerprint: string): Promise<Suggestion | undefined> {
    const id = this.#fingerprints.get(fingerprint);
    return id ? this.#suggestions.get(id) : undefined;
  }
  async list(): Promise<readonly Suggestion[]> {
    return Object.freeze([...this.#suggestions.values()]);
  }
}
