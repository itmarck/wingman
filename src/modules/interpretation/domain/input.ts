import type { InterpretationDeclaration } from './declaration.js';

export interface ResolutionRequest {
  readonly reference: string;
  readonly question: string;
  readonly candidateItemIds: readonly string[];
}

export interface ResolutionDecision {
  readonly reference: string;
  readonly selectedItemId?: string;
}

export interface InterpretationDraft {
  readonly entryId: string;
  readonly declarations: readonly InterpretationDeclaration[];
  readonly resolutions?: readonly ResolutionRequest[];
  readonly decisions?: readonly ResolutionDecision[];
}
