import type { ComponentValue } from '../item/types.js';

export type Evaluation = true | false | 'unresolved';

export interface OperatorReference {
  readonly key: string;
  readonly version: number;
}

export type ValueExpression =
  | { readonly kind: 'literal'; readonly value: ComponentValue }
  | { readonly kind: 'component'; readonly itemId: string; readonly key: string; readonly field?: string }
  | { readonly kind: 'now' };

export interface Condition {
  readonly operator: OperatorReference;
  readonly operands: readonly (Condition | ValueExpression)[];
}

export function isCondition(value: Condition | ValueExpression): value is Condition {
  return 'operator' in value;
}
