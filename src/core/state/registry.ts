import { DomainError } from '../error.js';
import type { KnowledgeSnapshot } from '../item/snapshot.js';
import type { ComponentValue } from '../item/types.js';
import { assertRegistryKey, assertVersion } from '../item/item.js';
import { selectCurrentRevisions } from '../item/registry.js';
import { isCondition, type Condition, type Evaluation, type ValueExpression } from './condition.js';

export interface EvaluationContext { readonly snapshot: KnowledgeSnapshot; readonly now: Date }
export interface Operator {
  readonly key: string; readonly version: number; readonly description: string;
  validate(condition: Condition): void;
  evaluate(condition: Condition, context: EvaluationContext, evaluate: (condition: Condition) => Evaluation): Evaluation;
}

/** Immutable registry of the only Condition operators State may execute. */
export class OperatorRegistry {
  readonly #operators = new Map<string, Operator>();
  register(operator: Operator): void {
    assertRegistryKey(operator.key, 'Operator key'); assertVersion(operator.version, 'Operator version');
    const id = `${operator.key}@${operator.version}`;
    if (this.#operators.has(id)) throw new DomainError(`Operator ${id} is already registered`);
    this.#operators.set(id, Object.freeze({ ...operator }));
  }
  require(key: string, version: number): Operator {
    const operator = this.#operators.get(`${key}@${version}`);
    if (!operator) throw new DomainError(`Operator ${key}@${version} is not registered`);
    return operator;
  }
  validate(condition: Condition): void {
    const operator = this.require(condition.operator.key, condition.operator.version);
    operator.validate(condition);
    for (const operand of condition.operands) if (isCondition(operand)) this.validate(operand);
  }
  list(): readonly Operator[] {
    return Object.freeze([...this.#operators.values()]);
  }
}

export function createOperatorRegistry(): OperatorRegistry {
  const registry = new OperatorRegistry();
  registry.register(binary('equal', 'Compara dos valores', (left, right) => deepEqual(left, right)));
  registry.register(unaryValue('exists', 'Comprueba que un valor exista', (value) => value !== undefined));
  registry.register(binary('before', 'Compara si el primer instante precede al segundo', (left, right) => temporal(left, right, (a, b) => a < b)));
  registry.register(binary('after', 'Compara si el primer instante sucede al segundo', (left, right) => temporal(left, right, (a, b) => a > b)));
  registry.register(composite('all', 1, Number.POSITIVE_INFINITY, (results) => results.includes(false) ? false : results.includes('unresolved') ? 'unresolved' : true));
  registry.register(composite('any', 1, Number.POSITIVE_INFINITY, (results) => results.includes(true) ? true : results.includes('unresolved') ? 'unresolved' : false));
  registry.register(composite('not', 1, 1, ([result]) => result === 'unresolved' ? result : !result));
  return registry;
}

export function readExpression(expression: ValueExpression, context: EvaluationContext): ComponentValue | Date | undefined {
  if (expression.kind === 'literal') return expression.value;
  if (expression.kind === 'now') return context.now;
  const revisions = selectCurrentRevisions(context.snapshot.revisions).filter((revision) => revision.itemId === expression.itemId && revision.key === expression.key);
  if (revisions.length !== 1) return undefined;
  let value: unknown = revisions[0]?.value;
  for (const segment of expression.field?.split('.').filter(Boolean) ?? []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as Readonly<Record<string, unknown>>)[segment];
  }
  return value as ComponentValue | undefined;
}

function binary(key: string, description: string, compare: (left: ComponentValue | Date, right: ComponentValue | Date) => boolean): Operator {
  return { key, version: 1, description,
    validate(condition) { requireValues(condition, 2, key); },
    evaluate(condition, context) { const [leftExpression, rightExpression] = condition.operands as readonly ValueExpression[]; const left = readExpression(leftExpression!, context); const right = readExpression(rightExpression!, context); return left === undefined || right === undefined ? 'unresolved' : compare(left, right); },
  };
}

function unaryValue(key: string, description: string, compare: (value: ComponentValue | Date | undefined) => boolean): Operator {
  return { key, version: 1, description, validate(condition) { requireValues(condition, 1, key); }, evaluate(condition, context) { return compare(readExpression(condition.operands[0] as ValueExpression, context)); } };
}

function composite(key: string, minimum: number, maximum: number, combine: (results: readonly Evaluation[]) => Evaluation): Operator {
  return { key, version: 1, description: `Operador compuesto ${key}`,
    validate(condition) { if (condition.operands.length < minimum || condition.operands.length > maximum || !condition.operands.every(isCondition)) throw new DomainError(`Operator ${key} requires ${minimum === maximum ? minimum : `at least ${minimum}`} Condition operands`); },
    evaluate(condition, _context, evaluate) { return combine((condition.operands as readonly Condition[]).map(evaluate)); },
  };
}

function requireValues(condition: Condition, count: number, key: string): void {
  if (condition.operands.length !== count || condition.operands.some(isCondition)) throw new DomainError(`Operator ${key} requires ${count} value operands`);
}

function temporal(left: ComponentValue | Date, right: ComponentValue | Date, compare: (left: number, right: number) => boolean): boolean {
  const leftTime = left instanceof Date ? left.getTime() : typeof left === 'string' ? Date.parse(left) : Number.NaN;
  const rightTime = right instanceof Date ? right.getTime() : typeof right === 'string' ? Date.parse(right) : Number.NaN;
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) throw new DomainError('Temporal operators require date-time operands');
  return compare(leftTime, rightTime);
}

function deepEqual(left: ComponentValue | Date, right: ComponentValue | Date): boolean {
  return JSON.stringify(left instanceof Date ? left.toISOString() : left) === JSON.stringify(right instanceof Date ? right.toISOString() : right);
}
