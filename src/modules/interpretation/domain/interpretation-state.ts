import { assertUtcDateTime } from '../../../core/knowledge/guard.js';
import { InvalidInputError } from '../../../system/error.js';
import type { InterpretationPublication } from '../ports.js';
import type { InterpretationDraft } from './input.js';

export type InterpretationId = string;
export type InterpretationStatus =
  | 'completed'
  | 'exhausted'
  | 'failed'
  | 'pending'
  | 'processing'
  | 'queued';

export interface InterpreterIdentity {
  readonly key: string;
}

export interface InterpretationState {
  readonly status: InterpretationStatus;
  readonly attempts: number;
  readonly updatedAt: string;
  readonly availableAt?: string;
  readonly interpreter?: InterpreterIdentity;
  readonly draft?: InterpretationDraft;
  readonly publication?: InterpretationPublication;
  readonly error?: string;
}

export interface CreateInterpretationInput {
  readonly id: InterpretationId;
  readonly entryId: string;
  readonly createdAt: string;
}

export interface RehydrateInterpretationInput
  extends CreateInterpretationInput,
    InterpretationState {}

export interface FailedInterpretationContext {
  readonly interpreter: InterpreterIdentity;
  readonly draft?: InterpretationDraft;
}

export function assertInterpretationIdentity(input: CreateInterpretationInput): void {
  assertInterpretationValue(input.id, 'Interpretation id');
  assertInterpretationValue(input.entryId, 'Interpretation entryId');
  assertUtcDateTime(input.createdAt, 'Interpretation createdAt');
}

export function assertInterpretationState(state: RehydrateInterpretationInput): void {
  const statuses: readonly InterpretationStatus[] = [
    'queued',
    'processing',
    'pending',
    'completed',
    'failed',
    'exhausted',
  ];
  if (!statuses.includes(state.status))
    throw new InvalidInputError(`Interpretation status ${state.status} is invalid`);
  if (!Number.isInteger(state.attempts) || state.attempts < 0)
    throw new InvalidInputError('Interpretation attempts must be a non-negative integer');

  assertUtcDateTime(state.updatedAt, 'Interpretation updatedAt');
  if (Date.parse(state.updatedAt) < Date.parse(state.createdAt))
    throw new InvalidInputError('Interpretation updatedAt cannot precede createdAt');
  if (state.availableAt) assertUtcDateTime(state.availableAt, 'Interpretation availableAt');
  if (state.interpreter) assertInterpreterIdentity(state.interpreter);

  const requiresAttempt = state.status !== 'queued' || state.attempts > 0;
  const terminalFailure = ['failed', 'exhausted'].includes(state.status);
  if (requiresAttempt && state.attempts === 0)
    throw new InvalidInputError(`Interpretation ${state.status} requires at least one attempt`);
  if (state.status === 'pending' && (!state.draft || !state.interpreter))
    throw new InvalidInputError('Pending Interpretation requires a Draft and Interpreter');
  if (state.status === 'completed' && (!state.publication || !state.interpreter))
    throw new InvalidInputError('Completed Interpretation requires a publication and Interpreter');
  if (terminalFailure && !state.error)
    throw new InvalidInputError(`${state.status} Interpretation requires an error`);
  if (state.status === 'queued' && !state.availableAt)
    throw new InvalidInputError('Queued Interpretation requires availableAt');
  if (state.status !== 'queued' && state.availableAt)
    throw new InvalidInputError(`Interpretation ${state.status} cannot contain availableAt`);

  const allowsPublication = state.status === 'completed';
  const allowsError = state.status === 'queued' || terminalFailure;
  const allowsDraft = ['completed', 'exhausted', 'failed', 'pending', 'queued'].includes(
    state.status,
  );
  if (!allowsPublication && state.publication)
    throw new InvalidInputError(`Interpretation ${state.status} cannot contain a publication`);
  if (!allowsError && state.error)
    throw new InvalidInputError(`Interpretation ${state.status} cannot contain an error`);
  if (!allowsDraft && state.draft)
    throw new InvalidInputError(`Interpretation ${state.status} cannot contain a Draft`);
}

export function assertInterpreterIdentity(identity: InterpreterIdentity): void {
  assertInterpretationValue(identity.key, 'Interpreter key');
}

export function assertInterpretationValue(value: string, name: string): void {
  if (value.trim().length === 0) throw new InvalidInputError(`${name} cannot be empty`);
}
