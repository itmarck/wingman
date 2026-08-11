import type { InterpretationDraft } from '../domain/input.js';

export type InterpretationAdapterOutput =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'knowledge'; readonly draft: InterpretationDraft };

/** Validates and normalizes one provider-independent Interpretation output. */
export function parseInterpretationOutput(
  value: unknown,
  entryId: string,
): InterpretationAdapterOutput {
  if (!isRecord(value)) return invalidOutput('Interpreter output must be an object');
  if (value.kind === 'empty') return Object.freeze({ kind: 'empty' });
  if (value.kind === 'invalid')
    return typeof value.reason === 'string' && value.reason.trim().length > 0
      ? Object.freeze({ kind: 'invalid', reason: value.reason.trim() })
      : invalidOutput('Invalid Interpreter output requires a reason');
  if (value.kind !== 'knowledge')
    return invalidOutput('Interpreter output kind must be knowledge, empty, or invalid');
  if (!isDraft(value.draft))
    return invalidOutput('Knowledge Interpreter output requires a valid Draft structure');
  if (value.draft.entryId !== entryId)
    return invalidOutput('Knowledge Interpreter output references a different Entry');

  const draft = normalizeDraft(value.draft);
  const hasKnowledge = draft.declarations.length > 0;
  return hasKnowledge
    ? Object.freeze({ kind: 'knowledge', draft })
    : invalidOutput('Knowledge Interpreter output is empty; return empty explicitly');
}

function invalidOutput(reason: string): InterpretationAdapterOutput {
  return Object.freeze({ kind: 'invalid', reason });
}

function isDraft(value: unknown): value is InterpretationDraft {
  if (!isRecord(value)) return false;
  return (
    typeof value.entryId === 'string' &&
    Array.isArray(value.declarations) &&
    value.declarations.every(isDeclaration) &&
    (value.resolutions === undefined || Array.isArray(value.resolutions)) &&
    value.decisions === undefined
  );
}

function normalizeDraft(draft: InterpretationDraft): InterpretationDraft {
  return Object.freeze({
    ...draft,
    declarations: Object.freeze(structuredClone(draft.declarations)),
    resolutions: draft.resolutions ? Object.freeze(structuredClone(draft.resolutions)) : undefined,
  });
}

function isDeclaration(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    ['item', 'state', 'automation', 'intent'].includes(String(value.kind)) &&
    value.version === 1 &&
    typeof value.reference === 'string' &&
    (value.dependsOn === undefined || Array.isArray(value.dependsOn)) &&
    (value.unresolved === undefined || Array.isArray(value.unresolved))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
