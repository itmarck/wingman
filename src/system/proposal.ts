import type { IdGenerator } from './runtime.js';

export const mutationModes = ['readonly', 'approval', 'write'] as const;

export type MutationMode = (typeof mutationModes)[number];
export type ProposalOperation = 'create' | 'update' | 'upsert';

export interface ProposalChange {
  readonly operation: ProposalOperation;
  readonly target: string;
  readonly value: unknown;
}

export interface Proposal {
  readonly id: string;
  readonly createdAt: string;
  readonly changes: readonly ProposalChange[];
}

interface PendingProposal {
  readonly proposal: Proposal;
  readonly apply: () => Promise<void>;
  readonly completion: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  applying: boolean;
}

/**
 * Keeps development-only mutations pending until they are explicitly approved.
 */
export class ProposalRegistry {
  readonly #proposals = new Map<string, PendingProposal>();

  constructor(
    private readonly ids: IdGenerator,
    private readonly now: () => Date,
  ) {}

  create(changes: readonly ProposalChange[], apply: () => Promise<void>): Proposal {
    const id = this.ids.generate();
    const proposal = Object.freeze({
      id,
      createdAt: this.now().toISOString(),
      changes: Object.freeze(changes.map(freezeChange)),
    });
    let resolve: () => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const completion = new Promise<void>((complete, fail) => {
      resolve = complete;
      reject = fail;
    });

    void completion.catch(() => undefined);
    this.#proposals.set(id, {
      proposal,
      apply,
      completion,
      resolve,
      reject,
      applying: false,
    });

    return proposal;
  }

  async wait(changes: readonly ProposalChange[], apply: () => Promise<void>): Promise<void> {
    const proposal = this.create(changes, apply);
    const pending = this.#proposals.get(proposal.id);

    if (!pending) {
      throw new Error(`Proposal ${proposal.id} was not registered`);
    }

    await pending.completion;
  }

  list(): readonly Proposal[] {
    return Object.freeze([...this.#proposals.values()].map((pending) => pending.proposal));
  }

  find(id: string): Proposal | undefined {
    return this.#proposals.get(id)?.proposal;
  }

  async approve(id: string): Promise<void> {
    const pending = this.require(id);

    if (pending.applying) {
      throw new ProposalConflictError(`Proposal ${id} is already being applied`);
    }

    pending.applying = true;

    try {
      await pending.apply();
      this.#proposals.delete(id);
      pending.resolve();
    } catch (error) {
      pending.applying = false;
      throw error;
    }
  }

  reject(id: string): void {
    const pending = this.require(id);

    this.#proposals.delete(id);
    pending.reject(new ProposalRejectedError(`Proposal ${id} was rejected`));
  }

  close(): void {
    for (const pending of this.#proposals.values()) {
      pending.reject(new ProposalRejectedError('Proposal registry was closed'));
    }

    this.#proposals.clear();
  }

  private require(id: string): PendingProposal {
    const pending = this.#proposals.get(id);

    if (!pending) {
      throw new ProposalNotFoundError(`Proposal ${id} does not exist`);
    }

    return pending;
  }
}

export class ProposalNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalNotFoundError';
  }
}

export class ProposalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalConflictError';
  }
}

export class ProposalRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalRejectedError';
  }
}

function freezeChange(change: ProposalChange): ProposalChange {
  return Object.freeze({
    ...change,
    value: structuredClone(change.value),
  });
}
