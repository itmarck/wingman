import type { MemoryLock } from '../../../../adapters/memory/lock.js';
import type { Entry } from '../../../../core/knowledge/entry.js';
import { ConflictError } from '../../../../system/error.js';
import { MemoryAutomationStore } from '../../../automation/adapters/memory/store.js';
import { MemoryExecutionStore } from '../../../execution/adapters/memory/store.js';
import type { MemoryKnowledgeStore } from '../../../knowledge/adapters/memory/store.js';
import { MemoryStateStore } from '../../../state/adapters/memory/store.js';
import type { Interpretation } from '../../domain/interpretation.js';
import type { Review } from '../../domain/review.js';
import type {
  InterpretationClaim,
  InterpretationLifecycle,
  InterpretationPublicationPlan,
} from '../../ports.js';
import type { MemoryInterpretations } from './interpretation.js';
import type { MemoryReviewStore } from './review.js';

/**
 * Implements compound Interpretation writes over the shared in-memory adapters.
 */
export class MemoryInterpretationLifecycle implements InterpretationLifecycle {
  constructor(
    private readonly knowledge: MemoryKnowledgeStore,
    private readonly interpretations: MemoryInterpretations,
    private readonly reviews: MemoryReviewStore,
    private readonly lock: MemoryLock,
    private readonly states = new MemoryStateStore(),
    private readonly automations = new MemoryAutomationStore(),
    private readonly executions = new MemoryExecutionStore(),
  ) {}

  async capture(
    entry: Entry,
    createInterpretation: (entry: Entry) => Interpretation,
  ): Promise<Entry> {
    return this.lock.run(async () => {
      const interpretation = createInterpretation(entry);
      const collision = await this.interpretations.findInterpretation(interpretation.id);

      if (collision) {
        throw new ConflictError(`Interpretation id ${interpretation.id} already exists`);
      }

      const stored = await this.knowledge.saveEntry(entry);
      const existing = await this.interpretations.findLatestInterpretation(stored.id);

      if (existing) {
        return stored;
      }

      await this.queueWithoutLock(interpretation);
      return stored;
    });
  }

  async queue(interpretation: Interpretation): Promise<void> {
    await this.lock.run(() => this.queueWithoutLock(interpretation));
  }

  async requestReviews(
    interpretation: Interpretation,
    reviews: readonly Review[],
    claim?: InterpretationClaim,
  ): Promise<void> {
    await this.lock.run(async () => {
      this.assertClaim(claim);
      await this.transaction(async () => {
        await this.reviews.saveReviews(reviews);
        await this.interpretations.saveInterpretation(interpretation);
      });
    });
  }

  async publish(
    interpretation: Interpretation,
    plan: InterpretationPublicationPlan,
    claim?: InterpretationClaim,
  ): Promise<void> {
    await this.lock.run(async () => {
      this.assertClaim(claim);
      await this.transaction(async () => {
        await this.persist(plan);
        await this.interpretations.saveInterpretation(interpretation);
      });
    });
  }

  async publishReview(
    interpretation: Interpretation,
    plan: InterpretationPublicationPlan,
    review: Review,
  ): Promise<void> {
    await this.lock.run(async () => {
      await this.transaction(async () => {
        await this.persist(plan);
        await this.reviews.saveReview(review);
        await this.interpretations.saveInterpretation(interpretation);
      });
    });
  }

  async retry(interpretation: Interpretation): Promise<void> {
    await this.lock.run(() => this.queueWithoutLock(interpretation));
  }

  private async persist(plan: InterpretationPublicationPlan): Promise<void> {
    await this.knowledge.saveItems(plan);
    for (const state of plan.states) await this.states.saveState(state);
    for (const automation of plan.automations) await this.automations.save(automation);
    for (const intent of plan.intents) await this.executions.saveIntent(intent);
    await this.interpretations.saveDeclarationOutcomes(plan.outcomes);
  }

  private async transaction(action: () => Promise<void>): Promise<void> {
    const checkpoints = {
      knowledge: this.knowledge.checkpoint(),
      interpretations: this.interpretations.checkpoint(),
      reviews: this.reviews.checkpoint(),
      states: this.states.checkpoint(),
      automations: this.automations.checkpoint(),
      executions: this.executions.checkpoint(),
    };
    try {
      await action();
    } catch (error) {
      this.knowledge.restore(checkpoints.knowledge);
      this.interpretations.restore(checkpoints.interpretations);
      this.reviews.restore(checkpoints.reviews);
      this.states.restore(checkpoints.states);
      this.automations.restore(checkpoints.automations);
      this.executions.restore(checkpoints.executions);
      throw error;
    }
  }

  private async queueWithoutLock(interpretation: Interpretation): Promise<void> {
    await this.interpretations.saveInterpretation(interpretation);
    await this.interpretations.enqueue(interpretation.id);
  }

  private assertClaim(claim: InterpretationClaim | undefined): void {
    if (claim) {
      this.interpretations.assertClaim(claim);
    }
  }
}
