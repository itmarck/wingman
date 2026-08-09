import { describe, expect, it } from 'vitest';
import { ComponentRevision } from '../item/component.js';
import { Item } from '../item/item.js';
import { itemReference, SchemaRegistry, selectCurrentRevisions } from '../item/registry.js';
import type { ComponentValue } from '../item/types.js';

const evidence = [{ entryId: 'entry-1', sourceLocators: [] }] as const;
const recordedAt = '2026-08-02T12:00:00Z';

describe('composable Item model', () => {
  it('keeps Item identity while selecting newer Component revisions', () => {
    const oldRevision = revision('old', 'name', 'Wingman');
    const nextRevision = revision('new', 'name', 'Wingman personal', oldRevision.id);
    const item = Item.create({ id: 'wingman', createdAt: recordedAt });
    expect(item.id).toBe('wingman');
    expect(selectCurrentRevisions([oldRevision, nextRevision])).toEqual([nextRevision]);
  });

  it('preserves conflicting candidates instead of using arrival order', () => {
    const first = revision('first', 'startTime', '09:00');
    const second = revision('second', 'startTime', '10:00');
    expect(selectCurrentRevisions([first, second])).toEqual([first, second]);
  });

  it('rejects registry collisions, namespaces and missing explicit versions', () => {
    const registry = new SchemaRegistry();
    const schema = {
      key: 'name',
      version: 1,
      description: 'Nombre',
      validate: (_value: ComponentValue) => undefined,
    };
    registry.registerComponent(schema);
    expect(() => registry.registerComponent(schema)).toThrow('already registered');
    expect(() => registry.registerComponent({ ...schema, key: 'system.name' })).toThrow(
      'unqualified',
    );
    expect(() => registry.registerComponent({ ...schema, version: 0 })).toThrow('positive integer');
  });

  it('validates relationship participants through a Profile', () => {
    const registry = new SchemaRegistry();
    registry.registerComponent({
      key: 'participants',
      version: 1,
      description: 'Participantes',
      validate: () => undefined,
    });
    registry.registerProfile({
      key: 'relationship',
      version: 1,
      description: 'Relación',
      relationship: true,
      components: [{ key: 'participants', version: 1 }],
    });
    const relationship = Item.create({
      id: 'employment',
      createdAt: recordedAt,
      profile: { key: 'relationship', version: 1 },
    });
    const participants = revision('participants-1', 'participants', [
      { role: 'employee', item: itemReference('marcelo') },
      { role: 'employer', item: itemReference('acme') },
    ]);
    const actual = ComponentRevision.create({ ...participants, itemId: relationship.id });
    expect(() => registry.validateComposition(relationship, [actual])).not.toThrow();
  });

  it('keeps composition defaults, lifecycle and State templates inside Profile', () => {
    const registry = new SchemaRegistry();
    for (const key of ['descriptive', 'lifecycle', 'planning'])
      registry.registerComponent({
        key,
        version: 1,
        description: key,
        validate: () => undefined,
      });
    registry.registerProfile({
      key: 'task',
      version: 1,
      description: 'Task semantics',
      components: [
        { key: 'descriptive', version: 1 },
        { key: 'lifecycle', version: 1 },
        { key: 'planning', version: 1 },
      ],
      initialComponents: [{ key: 'planning', version: 1, value: { dependencies: [] } }],
      lifecycle: {
        component: { key: 'lifecycle', version: 1 },
        initial: 'pending',
        transitions: { pending: ['completed'], completed: ['pending'] },
      },
      states: [
        {
          modality: 'desired',
          operator: { key: 'equal', version: 1 },
          component: { key: 'lifecycle', field: 'status' },
          value: 'completed',
        },
      ],
    });
    expect(registry.requireProfile('task', 1)).toMatchObject({
      lifecycle: { initial: 'pending' },
      initialComponents: [{ key: 'planning' }],
      states: [{ modality: 'desired' }],
    });
  });
});

function revision(
  id: string,
  key: string,
  value: ComponentValue,
  supersedesRevisionId?: string,
): ComponentRevision {
  return ComponentRevision.create({
    id,
    itemId: 'wingman',
    key,
    schemaVersion: 1,
    value,
    evidence,
    recordedAt,
    supersedesRevisionId,
  });
}
