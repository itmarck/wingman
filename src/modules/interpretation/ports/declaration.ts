import type { ComponentValue } from '../../../core/item/types.js';
import type { InterpretationDeclaration } from '../domain/declaration.js';
import type { RegisterInterpretationInput } from '../domain/input.js';

export type DeclarationOutcomeStatus = 'applied' | 'needsInput' | 'unsupported' | 'failed';
export interface DeclarationOutcome {
  readonly entryId: string;
  readonly reference: string;
  readonly kind: InterpretationDeclaration['kind'];
  readonly status: DeclarationOutcomeStatus;
  readonly targetId?: string;
  readonly reason?: string;
  readonly details?: ComponentValue;
  readonly recordedAt: string;
}

export interface DeclarationOutcomeSource {
  list(entryId?: string): Promise<readonly DeclarationOutcome[]>;
}

export interface InterpretationDeclarationPublisher {
  execute(input: RegisterInterpretationInput): Promise<void>;
}
