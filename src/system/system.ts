import { MemoryLock } from '../adapters/memory/lock.js';
import { SystemClock, UuidGenerator } from '../adapters/runtime.js';
import { createTriggerRegistry } from '../core/automation/registry.js';
import { CapabilityRegistry } from '../core/execution/capability.js';
import { createKnowledgeRegistry } from '../core/item/system.js';
import { createOperatorRegistry } from '../core/state/registry.js';
import { MemoryAutomationStore } from '../modules/automation/adapters/memory/store.js';
import type { AutomationModule } from '../modules/automation/module.js';
import { ControlAutomationCommand } from '../modules/automation/operations/control.js';
import { RegisterAutomationCommand } from '../modules/automation/operations/register.js';
import { AutomationWorker } from '../modules/automation/operations/worker.js';
import type { CaptureModule } from '../modules/capture/module.js';
import { CaptureEntryCommand } from '../modules/capture/operations/capture.js';
import { GetEntryQuery } from '../modules/capture/operations/get.js';
import { ListEntriesQuery } from '../modules/capture/operations/list.js';
import { MemoryExecutionStore } from '../modules/execution/adapters/memory/store.js';
import type { ExecutionModule } from '../modules/execution/module.js';
import { AuthorizeIntentCommand } from '../modules/execution/operations/authorize.js';
import { CancelIntentCommand } from '../modules/execution/operations/cancel.js';
import { ExecuteIntentCommand } from '../modules/execution/operations/execute.js';
import { ProposeIntentCommand } from '../modules/execution/operations/propose.js';
import { MemoryDeclarationRegistry } from '../modules/interpretation/adapters/memory/declaration.js';
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
import type { DeclarationOutcomeSource } from '../modules/interpretation/ports/declaration.js';
import type { InferenceTelemetry } from '../modules/interpretation/ports/telemetry.js';
import {
  type InferenceConfig,
  type InterpretationAdapter,
  Interpreter,
} from '../modules/interpretation/services/interpreter.js';
import { RegisterInterpretationCommand } from '../modules/interpretation/services/register.js';
import { MemoryKnowledgeStore } from '../modules/knowledge/adapters/memory/store.js';
import { ComposeItemCommand } from '../modules/knowledge/operations/compose.js';
import type { NotificationModule } from '../modules/notification/module.js';
import { NotificationCapability } from '../modules/notification/notification-capability.js';
import { NotificationService } from '../modules/notification/operations/service.js';
import { NotificationWorker } from '../modules/notification/operations/worker.js';
import type { PlanningModule } from '../modules/planning/module.js';
import { PlanningQueryService, planningViews } from '../modules/planning/operations/query.js';
import { PlanningCommandService } from '../modules/planning/operations/write.js';
import { MemoryProactivityStore } from '../modules/proactivity/adapters/memory/store.js';
import {
  createDetectorRegistry,
  type DetectorThresholds,
} from '../modules/proactivity/detectors/builtins.js';
import type { ProactivityModule } from '../modules/proactivity/module.js';
import {
  type ProactivityPolicy,
  ProactivityService,
} from '../modules/proactivity/operations/service.js';
import { MemoryProjectionRegistry } from '../modules/projection/adapters/memory/registry.js';
import { GlossaryProjection } from '../modules/projection/domain/glossary.js';
import { CurrentItemsProjection } from '../modules/projection/domain/items.js';
import type { ProjectionModule } from '../modules/projection/module.js';
import { ListProjectionsQuery } from '../modules/projection/operations/list.js';
import { ReadProjectionQuery } from '../modules/projection/operations/read.js';
import { MemoryStateStore } from '../modules/state/adapters/memory/store.js';
import type { StateModule } from '../modules/state/module.js';
import { CreateStateCommand } from '../modules/state/operations/create.js';
import { DerivedStateRegistry } from '../modules/state/operations/define.js';
import { ListStateViewQuery } from '../modules/state/operations/list.js';
import { StateEvaluator } from '../modules/state/services/evaluator.js';
import { ApprovalInterpretationLifecycle } from './approval.js';
import { EntryDeclarationPublisher } from './declaration.js';
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
  readonly proactivity?: ProactivityPolicy;
  readonly detectorThresholds?: DetectorThresholds;
}

/**
 * Public operations exposed by the composed system.
 */
export interface System {
  readonly capture: CaptureModule;
  readonly interpretation: InterpretationModule;
  readonly projection: ProjectionModule;
  readonly execution: ExecutionModule;
  readonly state: StateModule;
  readonly automation: AutomationModule;
  readonly planning: PlanningModule;
  readonly notification: NotificationModule;
  readonly proactivity: ProactivityModule;
  readonly declarations: DeclarationOutcomeSource;
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
  const registry = createKnowledgeRegistry();
  const operators = createOperatorRegistry();
  const stateStore = new MemoryStateStore();
  const stateEvaluator = new StateEvaluator(operators, clock);
  const derivedStates = new DerivedStateRegistry(operators);
  const capabilities = new CapabilityRegistry();
  capabilities.register(new NotificationCapability());
  const executionStore = new MemoryExecutionStore();
  const triggers = createTriggerRegistry();
  const automationStore = new MemoryAutomationStore();
  const proactivityStore = new MemoryProactivityStore();
  const detectors = createDetectorRegistry(options.detectorThresholds);
  const declarationOutcomes = new MemoryDeclarationRegistry();
  const projections = new MemoryProjectionRegistry([
    new CurrentItemsProjection(),
    new GlossaryProjection(),
  ]);
  const processing = options.processing ?? defaultProcessingConfig;
  let storage: SystemStorage;
  let closeStorage: () => Promise<void>;

  assertProcessingConfig(processing);

  switch (storageType) {
    case 'memory': {
      const lock = new MemoryLock();
      const reviews = new MemoryReviewStore(lock);
      const knowledge = new MemoryKnowledgeStore(registry);
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
    lifecycle,
    registry,
    ids,
    clock,
  );
  const createState = new CreateStateCommand(stateStore, knowledge, operators, ids, clock);
  const planningCommands = new PlanningCommandService(knowledge, createState, ids, clock, registry);
  const planningQueries = new PlanningQueryService(knowledge, () => clock.now());
  const composeItem = new ComposeItemCommand(knowledge, createState, registry, ids, clock);
  const stateViews = new ListStateViewQuery(
    stateStore,
    derivedStates,
    knowledge,
    stateEvaluator,
    clock,
  );
  const proposeIntent = new ProposeIntentCommand(
    executionStore,
    capabilities,
    operators,
    knowledge,
    ids,
    clock,
  );
  const authorizeIntent = new AuthorizeIntentCommand(executionStore);
  const registerAutomation = new RegisterAutomationCommand(
    automationStore,
    triggers,
    operators,
    capabilities,
    knowledge,
    ids,
    clock,
  );
  const controlAutomation = new ControlAutomationCommand(automationStore);
  const automationWorker = new AutomationWorker(
    automationStore,
    knowledge,
    stateEvaluator,
    proposeIntent,
    ids,
    clock,
  );
  const interpretationContexts = {
    async findInterpretationContext(
      entry: Parameters<typeof knowledge.findInterpretationContext>[0],
    ) {
      const context = await knowledge.findInterpretationContext(entry);
      const describe = (contract: {
        readonly key: string;
        readonly version: number;
        readonly description: string;
      }) =>
        Object.freeze({
          key: contract.key,
          version: contract.version,
          description: contract.description,
        });
      return Object.freeze({
        ...context,
        conditionOperators: Object.freeze(operators.list().map(describe)),
        triggerOperators: Object.freeze(triggers.list().map(describe)),
        capabilities: Object.freeze(
          capabilities.list().map((capability) =>
            Object.freeze({
              ...describe(capability),
              defaultAutonomy: capability.defaultAutonomy,
              safetyCeiling: capability.safetyCeiling,
            }),
          ),
        ),
      });
    },
  };
  const declarationPublisher = new EntryDeclarationPublisher(
    declarationOutcomes,
    composeItem,
    createState,
    registerAutomation,
    proposeIntent,
    ids,
    clock,
  );
  const processInterpretation = new ProcessInterpretationCommand(
    knowledge,
    interpretations,
    interpretations,
    interpretationContexts,
    interpreter,
    registerInterpretation,
    declarationPublisher,
    clock,
    processing,
  );
  const executeIntent = new ExecuteIntentCommand(
    executionStore,
    capabilities,
    knowledge,
    stateEvaluator,
    { global: 'propose' },
    ids,
    clock,
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
        storage.lifecycle,
        declarationPublisher,
        clock,
      ),
      retryEntry: new RetryEntryCommand(interpretations, lifecycle, clock),
      getEntryStatus: new GetEntryStatusQuery(interpretations, reviews, declarationOutcomes),
      getReview: new GetReviewQuery(reviews),
      listReviews: new ListReviewsQuery(reviews),
    }),
    projection: Object.freeze({
      listProjections: new ListProjectionsQuery(projections),
      readProjection: new ReadProjectionQuery(knowledge, projections),
    }),
    execution: Object.freeze({
      proposeIntent,
      authorizeIntent,
      cancelIntent: new CancelIntentCommand(executionStore, ids, clock),
      executeIntent,
      capabilities,
      store: executionStore,
    }),
    state: Object.freeze({
      createState,
      listView: stateViews,
      evaluate: stateEvaluator,
      derived: derivedStates,
    }),
    automation: Object.freeze({
      registerAutomation,
      controlAutomation,
      worker: automationWorker,
      store: automationStore,
    }),
    planning: Object.freeze({
      commands: planningCommands,
      queries: planningQueries,
      views: planningViews,
    }),
    notification: Object.freeze({
      service: new NotificationService(executionStore, automationStore, ids, clock),
      worker: new NotificationWorker(automationWorker, executionStore, executeIntent),
    }),
    proactivity: Object.freeze({
      service: new ProactivityService(
        proactivityStore,
        detectors,
        knowledge,
        planningQueries,
        stateViews,
        capabilities,
        proposeIntent,
        authorizeIntent,
        options.proactivity ?? { global: 'propose' },
        ids,
        clock,
      ),
      detectors,
    }),
    declarations: declarationOutcomes,
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
