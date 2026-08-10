import { NotFoundError } from '../../../system/error.js';
import type { Clock } from '../../../system/runtime.js';
import type { EntryStore } from '../../capture/ports/store.js';
import type { ProcessingConfig } from '../config.js';
import type { FailedInterpretationContext, Interpretation } from '../domain/interpretation.js';
import type { InterpretationDeclarationPublisher, InterpretationStateStore } from '../ports.js';
import {
  type InterpretationClaim,
  InterpretationClaimError,
  type InterpretationQueue,
} from '../ports.js';
import type { InterpretationContextSource } from '../services/context.js';
import {
  type InterpretationResult,
  type Interpreter,
  InvalidInterpretationError,
  RetryableInferenceError,
} from '../services/interpreter.js';
import type { RegisterInterpretationCommand } from '../services/register.js';

/**
 * Interprets one queued Entry and records the outcome of that work.
 */
export class ProcessInterpretationCommand {
  constructor(
    private readonly entries: EntryStore,
    private readonly interpretations: InterpretationStateStore,
    private readonly queue: InterpretationQueue,
    private readonly contexts: InterpretationContextSource,
    private readonly interpreter: Interpreter,
    private readonly registerInterpretation: RegisterInterpretationCommand,
    private readonly declarations: InterpretationDeclarationPublisher,
    private readonly clock: Clock,
    private readonly config: ProcessingConfig,
  ) {}

  async execute(claim: InterpretationClaim): Promise<void> {
    const current = await this.interpretations.findInterpretation(claim.interpretationId);

    if (!current) {
      throw new NotFoundError(`Interpretation ${claim.interpretationId} does not exist`);
    }

    const startedAt = this.clock.now().toISOString();
    const started = claim.recovered ? current.recover(startedAt) : current.start(startedAt);

    await this.queue.start(claim, started);

    let result: InterpretationResult | undefined;

    try {
      const entry = await this.entries.findEntry(current.entryId);

      if (!entry) {
        throw new NotFoundError(`Entry ${current.entryId} does not exist`);
      }

      const context = await this.contexts.findInterpretationContext(entry);

      result = await this.interpreter.execute(entry, context, {
        interpretationId: started.id,
        attempt: started.attempts,
      });
      await this.applyResult(started, result, claim);
    } catch (error) {
      await this.handleFailure(claim, started, error, createFailureContext(result));
      throw error;
    }
  }

  private async applyResult(
    started: Interpretation,
    result: InterpretationResult,
    claim: InterpretationClaim,
  ): Promise<void> {
    if (result.kind === 'knowledge') {
      const registered = await this.registerInterpretation.execute(
        started,
        result.draft,
        result.interpreter,
        claim,
      );
      if (registered.interpretation.status === 'completed')
        await this.declarations.execute(result.draft);
      return;
    }

    if (result.kind === 'empty') {
      await this.registerInterpretation.completeEmpty(started, result.interpreter, claim);
      return;
    }

    throw new InvalidInterpretationError(result.reason);
  }

  private async handleFailure(
    claim: InterpretationClaim,
    started: Interpretation,
    error: unknown,
    context?: FailedInterpretationContext,
  ): Promise<void> {
    if (error instanceof InterpretationClaimError) {
      return;
    }

    const failedAt = this.clock.now();
    const message = getErrorMessage(error);
    const configuredRetryDelay =
      error instanceof RetryableInferenceError
        ? this.config.retryDelaysMs[error.retryClass][started.attempts - 1]
        : undefined;

    if (error instanceof RetryableInferenceError && configuredRetryDelay !== undefined) {
      const retryDelay = Math.max(configuredRetryDelay, error.retryAfterMs ?? 0);
      const availableAt = new Date(failedAt.getTime() + retryDelay).toISOString();
      const queued = started.reschedule(message, failedAt.toISOString(), availableAt, context);

      await this.queue.retry(claim, queued);
      return;
    }

    const failed =
      error instanceof RetryableInferenceError
        ? started.exhaust(message, failedAt.toISOString(), context)
        : started.fail(message, failedAt.toISOString(), context);

    await this.queue.fail(claim, failed);
  }
}

function createFailureContext(
  result: InterpretationResult | undefined,
): FailedInterpretationContext | undefined {
  if (!result) {
    return undefined;
  }

  if (result.kind === 'empty') {
    return {
      interpreter: result.interpreter,
    };
  }

  return {
    interpreter: result.interpreter,
    draft: result.draft,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
