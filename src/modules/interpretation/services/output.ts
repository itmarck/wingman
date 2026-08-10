import type { RegisterInterpretationInput } from '../domain/input.js';

export type InterpretationAdapterOutput =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'knowledge'; readonly draft: RegisterInterpretationInput };

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
  const hasKnowledge =
    draft.items.length > 0 || draft.components.length > 0 || declarationCount(draft) > 0;
  return hasKnowledge
    ? Object.freeze({ kind: 'knowledge', draft })
    : invalidOutput('Knowledge Interpreter output is empty; return empty explicitly');
}

function invalidOutput(reason: string): InterpretationAdapterOutput {
  return Object.freeze({ kind: 'invalid', reason });
}

function isDraft(value: unknown): value is RegisterInterpretationInput {
  if (!isRecord(value)) return false;
  return (
    typeof value.entryId === 'string' &&
    Array.isArray(value.items) &&
    Array.isArray(value.components) &&
    (value.declarations === undefined || isDeclarations(value.declarations))
  );
}

function normalizeDraft(draft: RegisterInterpretationInput): RegisterInterpretationInput {
  return Object.freeze({
    ...draft,
    declarations: draft.declarations
      ? Object.freeze(structuredClone(draft.declarations))
      : undefined,
  });
}

function isDeclarations(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (['items', 'states', 'automations', 'intents'] as const).every(
    (key) =>
      Array.isArray(value[key]) &&
      (value[key] as unknown[]).every(
        (declaration) => isDeclaration(declaration) && declaration.kind === singular(key),
      ),
  );
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

function declarationCount(draft: RegisterInterpretationInput): number {
  const declarations = draft.declarations;
  return declarations
    ? declarations.items.length +
        declarations.states.length +
        declarations.automations.length +
        declarations.intents.length
    : 0;
}

function singular(key: 'items' | 'states' | 'automations' | 'intents'): string {
  return key.slice(0, -1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
