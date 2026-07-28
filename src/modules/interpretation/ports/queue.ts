import { ConflictError } from '../../../system/error.js';
import type { Interpretation, InterpretationId } from '../domain/interpretation.js';

export interface ClaimInterpretationInput {
  readonly claimId: string;
  readonly claimedAt: string;
  readonly leaseUntil: string;
}

export interface InterpretationClaim {
  readonly interpretationId: InterpretationId;
  readonly claimId: string;
  readonly leaseUntil: string;
  readonly recovered: boolean;
}

export class InterpretationClaimError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'InterpretationClaimError';
  }
}

/**
 * Boundary for scheduling durable Interpretation work.
 */
export interface InterpretationQueue {
  enqueue(interpretationId: InterpretationId): Promise<void>;
  claim(input: ClaimInterpretationInput): Promise<InterpretationClaim | undefined>;
  start(claim: InterpretationClaim, interpretation: Interpretation): Promise<void>;
  renew(claim: InterpretationClaim, leaseUntil: string): Promise<void>;
  complete(claim: InterpretationClaim): Promise<void>;
  retry(claim: InterpretationClaim, interpretation: Interpretation): Promise<void>;
  fail(claim: InterpretationClaim, interpretation: Interpretation): Promise<void>;
}
