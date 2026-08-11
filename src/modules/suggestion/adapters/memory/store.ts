import type { Suggestion } from '../../domain/suggestion.js';
import type { SuggestionStore } from '../../ports/store.js';

/** In-memory Suggestion facts and fingerprint index. */
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
  checkpoint() {
    return {
      suggestions: new Map(this.#suggestions),
      fingerprints: new Map(this.#fingerprints),
    };
  }
  restore(checkpoint: ReturnType<MemorySuggestionStore['checkpoint']>): void {
    this.#suggestions.clear();
    this.#fingerprints.clear();
    for (const [id, suggestion] of checkpoint.suggestions) this.#suggestions.set(id, suggestion);
    for (const [fingerprint, id] of checkpoint.fingerprints)
      this.#fingerprints.set(fingerprint, id);
  }
}
