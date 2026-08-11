import { MemoryLock } from '../../../../adapters/memory/lock.js';
import { ConflictError, InvalidInputError } from '../../../../system/error.js';
import type { Interpretation, InterpretationId } from '../../domain/interpretation.js';
import type {
  ClaimInterpretationInput,
  DeclarationOutcome,
  InterpretationClaim,
  InterpretationQueue,
  InterpretationStateStore,
} from '../../ports.js';
import { InterpretationClaimError } from '../../ports.js';

/**
 * In-memory Interpretation history and queue used before PostgreSQL is introduced.
 */
export class MemoryInterpretations implements InterpretationStateStore, InterpretationQueue {
  readonly #interpretations = new Map<InterpretationId, Interpretation>();
  readonly #claims = new Map<InterpretationId, ActiveClaim>();
  readonly #outcomes = new Map<string, DeclarationOutcome>();

  constructor(private readonly lock = new MemoryLock()) {}

  async saveInterpretation(interpretation: Interpretation): Promise<void> {
    const existing = this.#interpretations.get(interpretation.id);

    if (existing && existing.entryId !== interpretation.entryId) {
      throw new ConflictError(`Interpretation ${interpretation.id} changed its Entry`);
    }

    this.#interpretations.set(interpretation.id, interpretation);
  }

  async findInterpretation(id: InterpretationId): Promise<Interpretation | undefined> {
    return this.#interpretations.get(id);
  }

  async findLatestInterpretation(entryId: string): Promise<Interpretation | undefined> {
    return [...this.#interpretations.values()]
      .reverse()
      .find((interpretation) => interpretation.entryId === entryId);
  }

  async listInterpretations(entryId: string): Promise<readonly Interpretation[]> {
    return Object.freeze(
      [...this.#interpretations.values()].filter(
        (interpretation) => interpretation.entryId === entryId,
      ),
    );
  }

  async saveDeclarationOutcomes(outcomes: readonly DeclarationOutcome[]): Promise<void> {
    for (const outcome of outcomes)
      this.#outcomes.set(
        `${outcome.entryId}:${outcome.reference}`,
        Object.freeze({
          ...outcome,
          details: outcome.details === undefined ? undefined : structuredClone(outcome.details),
        }),
      );
  }

  async listDeclarationOutcomes(entryId?: string): Promise<readonly DeclarationOutcome[]> {
    return Object.freeze(
      [...this.#outcomes.values()].filter((outcome) => !entryId || outcome.entryId === entryId),
    );
  }

  checkpoint() {
    return {
      interpretations: new Map(this.#interpretations),
      claims: new Map(this.#claims),
      outcomes: new Map(this.#outcomes),
    };
  }

  restore(checkpoint: ReturnType<MemoryInterpretations['checkpoint']>): void {
    this.#interpretations.clear();
    this.#claims.clear();
    this.#outcomes.clear();
    for (const [id, value] of checkpoint.interpretations) this.#interpretations.set(id, value);
    for (const [id, value] of checkpoint.claims) this.#claims.set(id, value);
    for (const [id, value] of checkpoint.outcomes) this.#outcomes.set(id, value);
  }

  async enqueue(interpretationId: InterpretationId): Promise<void> {
    const interpretation = this.#interpretations.get(interpretationId);

    if (!interpretation) {
      throw new ConflictError(`Interpretation ${interpretationId} was not initialized`);
    }

    if (interpretation.status !== 'queued') {
      throw new ConflictError(`Interpretation ${interpretationId} is not queued`);
    }
  }

  async claim(input: ClaimInterpretationInput): Promise<InterpretationClaim | undefined> {
    return this.lock.run(async () => {
      assertClaimWindow(input);

      const interpretation = this.findAvailable(input.claimedAt);

      if (!interpretation) {
        return undefined;
      }

      const recovered = interpretation.status === 'processing';

      this.#claims.set(interpretation.id, {
        claimId: input.claimId,
        leaseUntil: input.leaseUntil,
      });

      return Object.freeze({
        interpretationId: interpretation.id,
        claimId: input.claimId,
        leaseUntil: input.leaseUntil,
        recovered,
      });
    });
  }

  async start(claim: InterpretationClaim, interpretation: Interpretation): Promise<void> {
    await this.lock.run(async () => {
      this.assertClaim(claim);
      this.assertSameInterpretation(claim, interpretation);
      await this.saveInterpretation(interpretation);
    });
  }

  async renew(claim: InterpretationClaim, leaseUntil: string): Promise<void> {
    await this.lock.run(async () => {
      const active = this.requireClaim(claim);

      if (Date.parse(leaseUntil) <= Date.parse(active.leaseUntil)) {
        throw new InvalidInputError('Interpretation lease renewal must extend the active lease');
      }

      this.#claims.set(claim.interpretationId, {
        claimId: claim.claimId,
        leaseUntil,
      });
    });
  }

  async complete(claim: InterpretationClaim): Promise<void> {
    await this.lock.run(async () => {
      this.assertClaim(claim);
      const interpretation = this.#interpretations.get(claim.interpretationId);
      const completedStatuses: readonly Interpretation['status'][] = ['completed', 'pending'];

      if (!interpretation || !completedStatuses.includes(interpretation.status)) {
        throw new ConflictError(
          `Interpretation ${claim.interpretationId} has not completed processing`,
        );
      }

      this.#claims.delete(claim.interpretationId);
    });
  }

  async retry(claim: InterpretationClaim, interpretation: Interpretation): Promise<void> {
    await this.settle(claim, interpretation, ['queued']);
  }

  async fail(claim: InterpretationClaim, interpretation: Interpretation): Promise<void> {
    await this.settle(claim, interpretation, ['exhausted', 'failed']);
  }

  assertClaim(claim: InterpretationClaim): void {
    this.requireClaim(claim);
  }

  private requireClaim(claim: InterpretationClaim): ActiveClaim {
    const active = this.#claims.get(claim.interpretationId);

    if (active?.claimId !== claim.claimId) {
      throw new InterpretationClaimError(
        `Interpretation ${claim.interpretationId} claim is no longer active`,
      );
    }

    return active;
  }

  private findAvailable(claimedAt: string): Interpretation | undefined {
    const claimedTime = Date.parse(claimedAt);

    return [...this.#interpretations.values()].find((interpretation) => {
      const claim = this.#claims.get(interpretation.id);
      const hasActiveLease = claim !== undefined && Date.parse(claim.leaseUntil) > claimedTime;

      if (hasActiveLease) {
        return false;
      }

      if (interpretation.status === 'processing') {
        return true;
      }

      const availableAt = interpretation.availableAt ?? interpretation.updatedAt;

      return interpretation.status === 'queued' && Date.parse(availableAt) <= claimedTime;
    });
  }

  private async settle(
    claim: InterpretationClaim,
    interpretation: Interpretation,
    statuses: readonly Interpretation['status'][],
  ): Promise<void> {
    await this.lock.run(async () => {
      this.assertClaim(claim);
      this.assertSameInterpretation(claim, interpretation);

      if (!statuses.includes(interpretation.status)) {
        throw new ConflictError(
          `Interpretation ${interpretation.id} cannot settle as ${interpretation.status}`,
        );
      }

      await this.saveInterpretation(interpretation);
      this.#claims.delete(claim.interpretationId);
    });
  }

  private assertSameInterpretation(
    claim: InterpretationClaim,
    interpretation: Interpretation,
  ): void {
    if (claim.interpretationId !== interpretation.id) {
      throw new ConflictError('Interpretation claim and state have different identities');
    }
  }
}

interface ActiveClaim {
  readonly claimId: string;
  readonly leaseUntil: string;
}

function assertClaimWindow(input: ClaimInterpretationInput): void {
  if (input.claimId.trim().length === 0) {
    throw new InvalidInputError('Interpretation claimId cannot be empty');
  }

  const claimedAt = Date.parse(input.claimedAt);
  const leaseUntil = Date.parse(input.leaseUntil);
  const isValidWindow =
    Number.isFinite(claimedAt) && Number.isFinite(leaseUntil) && leaseUntil > claimedAt;

  if (!isValidWindow) {
    throw new InvalidInputError('Interpretation lease must end after the claim time');
  }
}
