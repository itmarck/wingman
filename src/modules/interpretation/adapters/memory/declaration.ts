import type { DeclarationOutcome, DeclarationOutcomeSource } from '../../ports/declaration.js';

export interface DeclarationOutcomeStore extends DeclarationOutcomeSource {
  find(entryId: string, reference: string): Promise<DeclarationOutcome | undefined>;
  save(outcome: DeclarationOutcome): Promise<void>;
}

/** Per-process idempotency and explanation registry for interpreted declarations. */
export class MemoryDeclarationRegistry implements DeclarationOutcomeStore {
  readonly #outcomes = new Map<string, DeclarationOutcome>();

  async find(entryId: string, reference: string): Promise<DeclarationOutcome | undefined> {
    return this.#outcomes.get(`${entryId}:${reference}`);
  }

  async save(outcome: DeclarationOutcome): Promise<void> {
    this.#outcomes.set(
      `${outcome.entryId}:${outcome.reference}`,
      Object.freeze({
        ...outcome,
        details: outcome.details === undefined ? undefined : structuredClone(outcome.details),
      }),
    );
  }

  async list(entryId?: string): Promise<readonly DeclarationOutcome[]> {
    return Object.freeze(
      [...this.#outcomes.values()].filter((outcome) => !entryId || outcome.entryId === entryId),
    );
  }
}
