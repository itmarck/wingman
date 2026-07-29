import { MemoryLock } from '../adapters/memory/lock.js';
import { SystemClock, UuidGenerator } from '../adapters/runtime.js';
import type { CaptureModule } from '../modules/capture/module.js';
import { CaptureEntryCommand } from '../modules/capture/operations/capture.js';
import { GetEntryQuery } from '../modules/capture/operations/get.js';
import { ListEntriesQuery } from '../modules/capture/operations/list.js';
import type { IntentModule } from '../modules/intent/module.js';
import { ProposeIntentCommand } from '../modules/intent/operations/propose.js';
import { MemoryInterpretations } from '../modules/interpretation/adapters/memory/interpretation.js';
import { MemoryInterpretationLifecycle } from '../modules/interpretation/adapters/memory/lifecycle.js';
import { MemoryReviewStore } from '../modules/interpretation/adapters/memory/review.js';
import {
  assertProcessingConfig,
  defaultProcessingConfig,
  type ProcessingConfig,
} from '../modules/interpretation/config.js';
import type { InterpretationModule } from '../modules/interpretation/module.js';
import { GetReviewQuery } from '../modules/interpretation/operations/get-review.js';
import { ListReviewsQuery } from '../modules/interpretation/operations/list-reviews.js';
import { ProcessInterpretationCommand } from '../modules/interpretation/operations/process.js';
import { ResolveReviewCommand } from '../modules/interpretation/operations/resolve-review.js';
import { RetryEntryCommand } from '../modules/interpretation/operations/retry.js';
import { GetEntryStatusQuery } from '../modules/interpretation/operations/status.js';
import { ProcessNextCommand } from '../modules/interpretation/operations/worker.js';
import type { InferenceTelemetry } from '../modules/interpretation/ports/telemetry.js';
import {
  type InferenceConfig,
  type InterpretationAdapter,
  Interpreter,
} from '../modules/interpretation/services/interpreter.js';
import { RegisterInterpretationCommand } from '../modules/interpretation/services/register.js';
import { MemoryKnowledgeStore } from '../modules/knowledge/adapters/memory/store.js';
import { MemoryProjectionRegistry } from '../modules/projection/adapters/memory/registry.js';
import { CurrentAxiomsProjection } from '../modules/projection/domain/axioms.js';
import type { ProjectionModule } from '../modules/projection/module.js';
import { ListProjectionsQuery } from '../modules/projection/operations/list.js';
import { ReadProjectionQuery } from '../modules/projection/operations/read.js';
import { ApprovalInterpretationLifecycle } from './approval.js';
import { type MutationMode, ProposalRegistry } from './proposal.js';
import type { SystemStorage } from './storage.js';

export const storageTypes = ['memory', 'postgres'] as const;

export type StorageType = (typeof storageTypes)[number];

export interface SystemOptions {
  readonly inference: InferenceConfig;
  readonly adapter: InterpretationAdapter;
  readonly telemetry?: InferenceTelemetry;
  readonly mode?: MutationMode;
  readonly processing?: ProcessingConfig;
}

/**
 * Public operations exposed by the composed system.
 */
export interface System {
  readonly capture: CaptureModule;
  readonly interpretation: InterpretationModule;
  readonly projection: ProjectionModule;
  readonly intent: IntentModule;
  readonly proposals: ProposalRegistry;
  close(): Promise<void>;
}

/**
 * Composes Wingman and all dependencies for the selected storage technology.
 */
export function createSystem(storageType: StorageType, options: SystemOptions): System {
  assertStorageType(storageType);

  const ids = new UuidGenerator();
  const clock = new SystemClock();
  const proposals = new ProposalRegistry(ids, () => clock.now());
  const projections = new MemoryProjectionRegistry([new CurrentAxiomsProjection()]);
  const processing = options.processing ?? defaultProcessingConfig;
  let storage: SystemStorage;
  let closeStorage: () => Promise<void>;

  assertProcessingConfig(processing);

  switch (storageType) {
    case 'memory': {
      const lock = new MemoryLock();
      const reviews = new MemoryReviewStore(lock);
      const knowledge = new MemoryKnowledgeStore();
      const interpretations = new MemoryInterpretations(lock);

      storage = Object.freeze({
        knowledge,
        interpretations,
        reviews,
        lifecycle: new MemoryInterpretationLifecycle(knowledge, interpretations, reviews, lock),
      });
      closeStorage = async () => undefined;
      break;
    }

    case 'postgres':
      throw new Error('PostgreSQL storage is not implemented');
  }

  const { knowledge, interpretations, reviews } = storage;
  const lifecycle = new ApprovalInterpretationLifecycle(
    storage.lifecycle,
    proposals,
    options.mode ?? 'approval',
  );
  const interpreter = new Interpreter(options.adapter, options.inference, options.telemetry);
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
    interpreter,
    registerInterpretation,
    clock,
    processing,
  );

  return Object.freeze({
    capture: Object.freeze({
      captureEntry: new CaptureEntryCommand(lifecycle, ids, clock),
      getEntry: new GetEntryQuery(knowledge),
      listEntries: new ListEntriesQuery(knowledge),
    }),
    interpretation: Object.freeze({
      processNext: new ProcessNextCommand(
        interpretations,
        processInterpretation,
        ids,
        clock,
        processing,
      ),
      resolveReview: new ResolveReviewCommand(
        reviews,
        interpretations,
        registerInterpretation,
        lifecycle,
        clock,
      ),
      retryEntry: new RetryEntryCommand(interpretations, lifecycle, clock),
      getEntryStatus: new GetEntryStatusQuery(interpretations, reviews),
      getReview: new GetReviewQuery(reviews),
      listReviews: new ListReviewsQuery(reviews),
    }),
    projection: Object.freeze({
      listProjections: new ListProjectionsQuery(projections),
      readProjection: new ReadProjectionQuery(knowledge, projections),
    }),
    intent: Object.freeze({
      proposeIntent: new ProposeIntentCommand(knowledge, ids),
    }),
    proposals,
    async close(): Promise<void> {
      proposals.close();
      await closeStorage();
    },
  });
}

function assertStorageType(value: string): asserts value is StorageType {
  const isSupported = storageTypes.some((storageType) => storageType === value);

  if (!isSupported) {
    throw new Error(`Unsupported storage type: ${value}`);
  }
}
