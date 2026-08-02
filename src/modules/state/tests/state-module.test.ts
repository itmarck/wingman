import { describe, expect, it } from 'vitest';
import { ComponentRevision } from '../../../core/item/component.js';
import { Item } from '../../../core/item/item.js';
import { createKnowledgeRegistry } from '../../../core/item/system.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { Entry } from '../../../core/knowledge/entry.js';
import type { Condition } from '../../../core/state/condition.js';
import { createOperatorRegistry } from '../../../core/state/registry.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { MemoryStateStore } from '../adapters/memory/store.js';
import { CreateStateCommand } from '../operations/create.js';
import { DerivedStateRegistry } from '../operations/define.js';
import { ListStateViewQuery } from '../operations/list.js';
import { StateEvaluator } from '../services/evaluator.js';

describe('State module', () => {
  it('combines persisted modal meaning and reconstructible State without persisting derivations', async () => {
    const registry = createKnowledgeRegistry();
    const text = (key: string) => registry.registerComponent({ key, version: 1, description: key, validate(value: ComponentValue) { if (typeof value !== 'string') throw new Error('text required'); } });
    text('status'); text('deadline');
    const knowledge = new MemoryKnowledgeStore(registry);
    const entry = Entry.create({ id: 'entry-state', content: { kind: 'text', text: 'Quiero completar la tarea.' }, origin: { source: 'test' }, capturedAt: '2026-08-02T12:00:00Z' });
    await knowledge.saveEntry(entry);
    const task = Item.create({ id: 'task-state', createdAt: entry.capturedAt });
    const evidence = [{ entryId: entry.id, sourceLocators: [] }] as const;
    await knowledge.saveItems({ items: [task], revisions: [
      ComponentRevision.create({ id: 'status-state', itemId: task.id, key: 'status', schemaVersion: 1, value: 'pending', evidence, recordedAt: entry.capturedAt }),
      ComponentRevision.create({ id: 'deadline-state', itemId: task.id, key: 'deadline', schemaVersion: 1, value: '2026-08-02T13:00:00Z', evidence, recordedAt: entry.capturedAt }),
    ] });
    const operators = createOperatorRegistry();
    const clock = { now: () => new Date('2026-08-02T14:00:00Z') };
    const ids = { generate: () => 'state-desire' };
    const states = new MemoryStateStore();
    const evaluator = new StateEvaluator(operators, clock);
    const definitions = new DerivedStateRegistry(operators);
    const desired: Condition = { operator: { key: 'equal', version: 1 }, operands: [{ kind: 'component', itemId: task.id, key: 'status' }, { kind: 'literal', value: 'completed' }] };
    const overdue: Condition = { operator: { key: 'all', version: 1 }, operands: [
      { operator: { key: 'equal', version: 1 }, operands: [{ kind: 'component', itemId: task.id, key: 'status' }, { kind: 'literal', value: 'pending' }] },
      { operator: { key: 'before', version: 1 }, operands: [{ kind: 'component', itemId: task.id, key: 'deadline' }, { kind: 'now' }] },
    ] };
    await new CreateStateCommand(states, knowledge, operators, ids, clock).execute({ modality: 'desired', condition: desired, author: { kind: 'user', id: 'marcelo' }, evidence, confidence: 1 });
    definitions.register({ id: 'derived-overdue', modality: 'observed', condition: overdue, description: 'La tarea está vencida' });
    definitions.register({ id: 'derived-unknown', modality: 'predicted', condition: { operator: { key: 'equal', version: 1 }, operands: [{ kind: 'component', itemId: task.id, key: 'missing' }, { kind: 'literal', value: true }] }, description: 'Dato ausente' });
    const query = new ListStateViewQuery(states, definitions, knowledge, evaluator, clock);
    const desiredView = await query.execute('desired');
    expect(desiredView[0]).toMatchObject({ id: 'state-desire', modality: 'desired', source: 'persisted', evaluation: false });
    expect(desiredView[0]?.state?.evidence).toEqual(evidence);
    expect(await query.execute('current')).toMatchObject([{ id: 'derived-overdue', source: 'derived', evaluation: true }]);
    expect(await query.execute('unresolved')).toMatchObject([{ id: 'derived-unknown', evaluation: 'unresolved' }]);
    expect(await states.listStates()).toHaveLength(1);
  });
});
