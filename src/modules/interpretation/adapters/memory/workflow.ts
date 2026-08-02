import type { WorkflowOutcome, WorkflowOutcomeSource } from '../../ports/workflow.js';

export interface WorkflowOutcomeStore extends WorkflowOutcomeSource {
  find(entryId: string, reference: string): Promise<WorkflowOutcome | undefined>;
  save(outcome: WorkflowOutcome): Promise<void>;
}

/** Per-process idempotency and explanation registry for interpreted workflows. */
export class MemoryWorkflowRegistry implements WorkflowOutcomeStore {
  readonly #outcomes = new Map<string, WorkflowOutcome>();

  async find(entryId: string, reference: string): Promise<WorkflowOutcome | undefined> {
    return this.#outcomes.get(`${entryId}:${reference}`);
  }

  async save(outcome: WorkflowOutcome): Promise<void> {
    this.#outcomes.set(
      `${outcome.entryId}:${outcome.reference}`,
      Object.freeze({
        ...outcome,
        details: outcome.details === undefined ? undefined : structuredClone(outcome.details),
      }),
    );
  }

  async list(entryId?: string): Promise<readonly WorkflowOutcome[]> {
    return Object.freeze(
      [...this.#outcomes.values()].filter((outcome) => !entryId || outcome.entryId === entryId),
    );
  }
}
