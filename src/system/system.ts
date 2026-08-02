import { MemoryLock } from '../adapters/memory/lock.js';
import { UnavailableNotificationAdapter } from '../adapters/notification/unavailable.js';
import { SystemClock, UuidGenerator } from '../adapters/runtime.js';
import { CapabilityRegistry } from '../core/execution/capability.js';
import { createKnowledgeRegistry } from '../core/item/system.js';
import { createTriggerRegistry } from '../core/rule/registry.js';
import { createOperatorRegistry } from '../core/state/registry.js';
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
import type { PlanningModule } from '../modules/planning/module.js';
import { PlanningQueryService, planningViews } from '../modules/planning/operations/query.js';
import { PlanningCommandService } from '../modules/planning/operations/write.js';
import { MemoryProjectionRegistry } from '../modules/projection/adapters/memory/registry.js';
import { GlossaryProjection } from '../modules/projection/domain/glossary.js';
import { CurrentItemsProjection } from '../modules/projection/domain/items.js';
import type { ProjectionModule } from '../modules/projection/module.js';
import { ListProjectionsQuery } from '../modules/projection/operations/list.js';
import { ReadProjectionQuery } from '../modules/projection/operations/read.js';
import { MemoryReminderStore } from '../modules/reminder/adapters/memory/store.js';
import type { ReminderModule } from '../modules/reminder/module.js';
import { NotificationCapability } from '../modules/reminder/notification-capability.js';
import { ReminderService } from '../modules/reminder/operations/manage.js';
import { ReminderWorker } from '../modules/reminder/operations/worker.js';
import type { NotificationPort } from '../modules/reminder/ports/notification.js';
import { MemoryRuleStore } from '../modules/rule/adapters/memory/store.js';
import type { RuleModule } from '../modules/rule/module.js';
import { ControlRuleCommand } from '../modules/rule/operations/control.js';
import { RegisterRuleCommand } from '../modules/rule/operations/register.js';
import { RuleWorker } from '../modules/rule/operations/worker.js';
import { MemoryStateStore } from '../modules/state/adapters/memory/store.js';
import type { StateModule } from '../modules/state/module.js';
import { CreateStateCommand } from '../modules/state/operations/create.js';
import { DerivedStateRegistry } from '../modules/state/operations/define.js';
import { ListStateViewQuery } from '../modules/state/operations/list.js';
import { StateEvaluator } from '../modules/state/services/evaluator.js';
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
  readonly notification?: NotificationPort;
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
  readonly rule: RuleModule;
  readonly planning: PlanningModule;
  readonly reminder: ReminderModule;
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
  capabilities.register(
    new NotificationCapability(options.notification ?? new UnavailableNotificationAdapter()),
  );
  const executionStore = new MemoryExecutionStore();
  const triggers = createTriggerRegistry();
  const ruleStore = new MemoryRuleStore();
  const reminderStore = new MemoryReminderStore();
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
  const createState = new CreateStateCommand(stateStore, knowledge, operators, ids, clock);
  const planningCommands = new PlanningCommandService(knowledge, createState, ids, clock);
  const proposeIntent = new ProposeIntentCommand(
    executionStore,
    capabilities,
    operators,
    knowledge,
    ids,
    clock,
  );
  const registerRule = new RegisterRuleCommand(
    ruleStore,
    triggers,
    operators,
    capabilities,
    knowledge,
    ids,
    clock,
  );
  const controlRule = new ControlRuleCommand(ruleStore);
  const ruleWorker = new RuleWorker(
    ruleStore,
    knowledge,
    stateEvaluator,
    proposeIntent,
    ids,
    clock,
  );
  const reminderService = new ReminderService(
    reminderStore,
    planningCommands,
    registerRule,
    controlRule,
    ids,
    clock,
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
    execution: Object.freeze({
      proposeIntent,
      authorizeIntent: new AuthorizeIntentCommand(executionStore),
      cancelIntent: new CancelIntentCommand(executionStore, ids, clock),
      executeIntent,
      capabilities,
      store: executionStore,
    }),
    state: Object.freeze({
      createState,
      listView: new ListStateViewQuery(stateStore, derivedStates, knowledge, stateEvaluator, clock),
      evaluate: stateEvaluator,
      derived: derivedStates,
    }),
    rule: Object.freeze({
      registerRule,
      controlRule,
      worker: ruleWorker,
      store: ruleStore,
    }),
    planning: Object.freeze({
      commands: planningCommands,
      queries: new PlanningQueryService(knowledge, () => clock.now()),
      views: planningViews,
    }),
    reminder: Object.freeze({
      manage: reminderService,
      worker: new ReminderWorker(
        reminderStore,
        ruleStore,
        ruleWorker,
        executionStore,
        executeIntent,
        createState,
        clock,
      ),
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
