import type { SchemaRegistry } from '../../core/item/registry.js';
import type { Entry } from '../../core/knowledge/entry.js';
import type { Interpretation } from '../../modules/interpretation/domain/interpretation.js';
import type { Review } from '../../modules/interpretation/domain/review.js';
import type {
  InterpretationClaim,
  InterpretationLifecycle,
  InterpretationPublicationPlan,
} from '../../modules/interpretation/ports.js';
import { ConflictError } from '../../system/error.js';
import { PostgresAutomationStore } from './automation.js';
import type { Database, QueryableDatabase } from './database.js';
import { PostgresExecutionStore } from './execution.js';
import { assertActiveClaim, PostgresInterpretations } from './interpretation.js';
import { PostgresKnowledgeStore } from './knowledge.js';
import { PostgresReviewStore } from './review.js';
import { PostgresStateStore } from './state.js';

/** Atomic PostgreSQL boundary for complete Interpretation publications. */
export class PostgresInterpretationLifecycle implements InterpretationLifecycle {
  constructor(
    private readonly database: Database,
    private readonly registry: SchemaRegistry,
  ) {}

  async capture(
    entry: Entry,
    createInterpretation: (entry: Entry) => Interpretation,
  ): Promise<Entry> {
    return this.database.transaction(async (database) => {
      const stores = this.stores(database);
      const interpretation = createInterpretation(entry);
      if (await stores.interpretations.findInterpretation(interpretation.id))
        throw new ConflictError(`Interpretation id ${interpretation.id} already exists`);
      const stored = await stores.knowledge.saveEntry(entry);
      if (await stores.interpretations.findLatestInterpretation(stored.id)) return stored;
      await stores.interpretations.saveInterpretation(interpretation);
      await stores.interpretations.enqueue(interpretation.id);
      return stored;
    });
  }

  async queue(interpretation: Interpretation): Promise<void> {
    await this.database.transaction(async (database) => {
      const store = new PostgresInterpretations(database);
      await store.saveInterpretation(interpretation);
      await store.enqueue(interpretation.id);
    });
  }

  async requestReviews(
    interpretation: Interpretation,
    reviews: readonly Review[],
    claim?: InterpretationClaim,
  ): Promise<void> {
    await this.database.transaction(async (database) => {
      if (claim) await assertActiveClaim(database, claim);
      const stores = this.stores(database);
      await stores.reviews.saveReviews(reviews);
      await stores.interpretations.saveInterpretation(interpretation);
    });
  }

  async publish(
    interpretation: Interpretation,
    plan: InterpretationPublicationPlan,
    claim?: InterpretationClaim,
  ): Promise<void> {
    await this.database.transaction(async (database) => {
      if (claim) await assertActiveClaim(database, claim);
      const stores = this.stores(database);
      await this.persist(stores, plan);
      await stores.interpretations.saveInterpretation(interpretation);
    });
  }

  async publishReview(
    interpretation: Interpretation,
    plan: InterpretationPublicationPlan,
    review: Review,
  ): Promise<void> {
    await this.database.transaction(async (database) => {
      const stores = this.stores(database);
      await this.persist(stores, plan);
      await stores.reviews.saveReview(review);
      await stores.interpretations.saveInterpretation(interpretation);
    });
  }

  async retry(interpretation: Interpretation): Promise<void> {
    await this.queue(interpretation);
  }

  private async persist(
    stores: ReturnType<PostgresInterpretationLifecycle['stores']>,
    plan: InterpretationPublicationPlan,
  ): Promise<void> {
    await stores.knowledge.saveItems(plan);
    for (const state of plan.states) await stores.states.saveState(state);
    for (const automation of plan.automations) await stores.automations.save(automation);
    for (const intent of plan.intents) await stores.executions.saveIntent(intent);
    await stores.interpretations.saveDeclarationOutcomes(plan.outcomes);
  }

  private stores(database: QueryableDatabase) {
    return {
      knowledge: new PostgresKnowledgeStore(database, this.registry),
      interpretations: new PostgresInterpretations(database),
      reviews: new PostgresReviewStore(database),
      states: new PostgresStateStore(database),
      automations: new PostgresAutomationStore(database),
      executions: new PostgresExecutionStore(database),
    };
  }
}
