import { MemoryLock } from '../../../adapters/memory/lock.js';
import { SystemClock, UuidGenerator } from '../../../adapters/runtime.js';
import { CaptureEntryCommand } from '../../capture/operations/capture.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { RegisterConceptCommand } from '../../knowledge/operations/register.js';
import { MemoryProjectionRegistry } from '../../projection/adapters/memory/registry.js';
import { CurrentAxiomsProjection } from '../../projection/domain/axioms.js';
import { ReadProjectionQuery } from '../../projection/operations/read.js';
import { MemoryInterpretations } from '../adapters/memory/interpretation.js';
import { MemoryInterpretationLifecycle } from '../adapters/memory/lifecycle.js';
import { MemoryReviewStore } from '../adapters/memory/review.js';
import { defaultProcessingConfig, type ProcessingConfig } from '../config.js';
import { GetInterpretationQuery } from '../operations/get.js';
import { GetReviewQuery } from '../operations/get-review.js';
import { ListInterpretationsQuery } from '../operations/list.js';
import { ListReviewsQuery } from '../operations/list-reviews.js';
import { ProcessInterpretationCommand } from '../operations/process.js';
import { ReinterpretEntryCommand } from '../operations/reinterpret.js';
import { ResolveReviewCommand } from '../operations/resolve-review.js';
import { RetryEntryCommand } from '../operations/retry.js';
import { GetEntryStatusQuery } from '../operations/status.js';
import { ProcessNextCommand } from '../operations/worker.js';
import { type InterpretationAdapter, Interpreter } from '../services/interpreter.js';
import { RegisterInterpretationCommand } from '../services/register.js';

/**
 * Exposes module internals only to behavior tests without widening the public System surface.
 */
export function createInterpretationTestSystem(
  adapter: InterpretationAdapter,
  processing: ProcessingConfig = defaultProcessingConfig,
) {
  const lock = new MemoryLock();
  const reviews = new MemoryReviewStore(lock);
  const knowledge = new MemoryKnowledgeStore();
  const interpretations = new MemoryInterpretations(lock);
  const lifecycle = new MemoryInterpretationLifecycle(knowledge, interpretations, reviews, lock);
  const ids = new UuidGenerator();
  const clock = new SystemClock();
  const projections = new MemoryProjectionRegistry([new CurrentAxiomsProjection()]);
  const registerInterpretation = new RegisterInterpretationCommand(
    knowledge,
    reviews,
    lifecycle,
    ids,
    clock,
  );
  const processInterpretation = new ProcessInterpretationCommand(
    knowledge,
    interpretations,
    interpretations,
    knowledge,
    new Interpreter(adapter, {
      target: 'test.default',
      provider: 'test',
      model: 'test',
    }),
    registerInterpretation,
    clock,
    processing,
  );

  return {
    commands: {
      captureEntry: new CaptureEntryCommand(lifecycle, ids, clock),
      processNext: new ProcessNextCommand(
        interpretations,
        processInterpretation,
        ids,
        clock,
        processing,
      ),
      registerConcept: new RegisterConceptCommand(knowledge, ids),
      reinterpretEntry: new ReinterpretEntryCommand(knowledge, lifecycle, ids, clock),
      retryEntry: new RetryEntryCommand(interpretations, lifecycle, clock),
      resolveReview: new ResolveReviewCommand(
        reviews,
        interpretations,
        registerInterpretation,
        lifecycle,
        clock,
      ),
    },
    queries: {
      getEntryStatus: new GetEntryStatusQuery(interpretations, reviews),
      getInterpretation: new GetInterpretationQuery(interpretations),
      getReview: new GetReviewQuery(reviews),
      listInterpretations: new ListInterpretationsQuery(interpretations),
      listReviews: new ListReviewsQuery(reviews),
      readProjection: new ReadProjectionQuery(knowledge, projections),
    },
  };
}

export type InterpretationTestSystem = ReturnType<typeof createInterpretationTestSystem>;
