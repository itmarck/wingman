import type { Entry } from '../../../core/knowledge/entry.js';
import type { InterpretationContext } from './context.js';
import { entryInterpretation, type ReasoningLevel } from './definition.js';

export { type ReasoningLevel, reasoningLevels } from './definition.js';

export interface InterpretationRequest {
  readonly operation: 'interpret-entry';
  readonly reasoning: ReasoningLevel;
  readonly policies: readonly string[];
  readonly entry: Entry;
  readonly context: InterpretationContext;
  readonly outputContract: string;
}

export function createInterpretationRequest(
  entry: Entry,
  context: InterpretationContext,
): InterpretationRequest {
  return Object.freeze({
    ...entryInterpretation,
    entry,
    context,
  });
}
