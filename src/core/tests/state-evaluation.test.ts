import { describe, expect, it } from 'vitest';
import {
  collectConditionDependencies,
  StateEvaluator,
} from '../../modules/state/services/evaluator.js';
import { ComponentRevision } from '../item/component.js';
import { Item } from '../item/item.js';
import type { KnowledgeSnapshot } from '../item/snapshot.js';
import type { Condition } from '../state/condition.js';
import { createOperatorRegistry, type EvaluationContext } from '../state/registry.js';
import { State } from '../state/state.js';

const entry = {
  id: 'entry-1',
  content: { kind: 'text' as const, text: 'Quiero terminar la tarea.' },
  origin: { source: 'test' },
  capturedAt: '2026-08-02T12:00:00Z',
};
const item = Item.create({ id: 'task-1', createdAt: entry.capturedAt });
const evidence = [{ entryId: entry.id, sourceLocators: [] }] as const;
const snapshot: KnowledgeSnapshot = Object.freeze({
  entries: [entry] as never,
  items: [item],
  revisions: [
    ComponentRevision.create({
      id: 'status-1',
      itemId: item.id,
      key: 'status',
      schemaVersion: 1,
      value: 'pending',
      evidence,
      recordedAt: entry.capturedAt,
    }),
    ComponentRevision.create({
      id: 'deadline-1',
      itemId: item.id,
      key: 'deadline',
      schemaVersion: 1,
      value: '2026-08-02T13:00:00Z',
      evidence,
      recordedAt: entry.capturedAt,
    }),
  ],
});
const operators = createOperatorRegistry();
const clock = { now: () => new Date('2026-08-02T14:00:00Z') };
const evaluator = new StateEvaluator(operators, clock);
const equalPending: Condition = {
  operator: { key: 'equal', version: 1 },
  operands: [
    { kind: 'component', itemId: item.id, key: 'status' },
    { kind: 'literal', value: 'pending' },
  ],
};
const overdue: Condition = {
  operator: { key: 'all', version: 1 },
  operands: [
    equalPending,
    {
      operator: { key: 'before', version: 1 },
      operands: [{ kind: 'component', itemId: item.id, key: 'deadline' }, { kind: 'now' }],
    },
  ],
};

describe('State condition language', () => {
  it('evaluates equality, existence, time and composites deterministically', () => {
    expect(evaluator.evaluate(overdue, snapshot)).toBe(true);
    expect(
      evaluator.evaluate(
        { operator: { key: 'not', version: 1 }, operands: [equalPending] },
        snapshot,
      ),
    ).toBe(false);
    expect(
      evaluator.evaluate(
        {
          operator: { key: 'any', version: 1 },
          operands: [
            equalPending,
            {
              operator: { key: 'exists', version: 1 },
              operands: [{ kind: 'component', itemId: item.id, key: 'missing' }],
            },
          ],
        },
        snapshot,
      ),
    ).toBe(true);
  });

  it('returns unresolved for missing comparison operands and preserves composite uncertainty', () => {
    const missing: Condition = {
      operator: { key: 'equal', version: 1 },
      operands: [
        { kind: 'component', itemId: item.id, key: 'missing' },
        { kind: 'literal', value: true },
      ],
    };
    expect(evaluator.evaluate(missing, snapshot)).toBe('unresolved');
    expect(
      evaluator.evaluate(
        { operator: { key: 'all', version: 1 }, operands: [equalPending, missing] },
        snapshot,
      ),
    ).toBe('unresolved');
  });

  it('rejects unknown operators, invalid operands and registration overwrite', () => {
    expect(() =>
      evaluator.evaluate({ operator: { key: 'custom', version: 1 }, operands: [] }, snapshot),
    ).toThrow('not registered');
    expect(() =>
      evaluator.evaluate(
        { operator: { key: 'equal', version: 1 }, operands: [equalPending] },
        snapshot,
      ),
    ).toThrow('requires 2 value operands');
    const operator = {
      key: 'test',
      version: 1,
      description: 'Test',
      validate: () => undefined,
      evaluate: (_condition: Condition, _context: EvaluationContext) => true as const,
    };
    operators.register(operator);
    expect(() => operators.register(operator)).toThrow('already registered');
    expect(() => operators.register({ ...operator, key: 'system.test' })).toThrow('unqualified');
  });

  it('preserves desired and observed modalities independently with evidence', () => {
    const desired = State.create({
      id: 'desired-1',
      modality: 'desired',
      condition: equalPending,
      author: { kind: 'user', id: 'marcelo' },
      evidence,
      recordedAt: entry.capturedAt,
      confidence: 1,
    });
    const observed = State.create({
      id: 'observed-1',
      modality: 'observed',
      condition: equalPending,
      author: { kind: 'system' },
      evidence,
      recordedAt: entry.capturedAt,
    });
    expect(desired.modality).not.toBe(observed.modality);
    expect(desired.evidence[0]?.entryId).toBe(entry.id);
  });

  it('declares dependencies and measures the representative overdue path', () => {
    expect(collectConditionDependencies(overdue)).toEqual({
      itemIds: ['task-1'],
      componentKeys: ['deadline', 'status'],
      usesTime: true,
    });
    expect(evaluator.measure(overdue, snapshot)).toMatchObject({
      result: true,
      nodes: 3,
      dependencies: { usesTime: true },
    });
  });
});
