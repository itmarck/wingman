import { describe, expect, it } from 'vitest';
import { ComponentRevision } from '../item/component.js';
import { knowledgeParityFixtures } from '../item/fixtures.js';
import { Item } from '../item/item.js';
import { itemReference, selectCurrentRevisions } from '../item/registry.js';

describe('legacy semantic parity through composable Items', () => {
  for (const fixture of knowledgeParityFixtures) {
    it(`translates ${fixture.key}`, () => {
      expect(translateFixture(fixture.key)).toMatchSnapshot();
    });
  }
});

function translateFixture(key: (typeof knowledgeParityFixtures)[number]['key']): unknown {
  const base = { entryId: `entry-${key}`, sourceLocators: [] } as const;
  const item = Item.create({
    id: `item-${key}`,
    createdAt: '2026-08-02T12:00:00Z',
    profile: key === 'relationship' ? { key: 'relationship', version: 1 } : undefined,
  });
  const revision = (
    id: string,
    componentKey: string,
    value: Parameters<typeof ComponentRevision.create>[0]['value'],
    supersedesRevisionId?: string,
  ) =>
    ComponentRevision.create({
      id,
      itemId: item.id,
      key: componentKey,
      schemaVersion: 1,
      value,
      evidence: [base],
      recordedAt: '2026-08-02T12:00:00Z',
      status: key === 'conflict' ? 'candidate' : 'accepted',
      supersedesRevisionId,
    });
  if (key === 'identity')
    return {
      item,
      revisions: [revision('name', 'name', 'Rust'), revision('aliases', 'aliases', ['Rustlang'])],
    };
  if (key === 'literal') return revision('literal', 'statement', { attribute: 'limit', value: 10 });
  if (key === 'relationship')
    return revision('participants', 'participants', [
      { role: 'employee', item: itemReference('marcelo') },
      { role: 'employer', item: itemReference('acme') },
    ]);
  if (key === 'citation') return revision('quote', 'quote', 'citas exactas');
  if (key === 'supersession') {
    const old = revision('old', 'statement', { attribute: 'storage', value: 'memory' });
    const current = revision(
      'new',
      'statement',
      { attribute: 'storage', value: 'postgres' },
      old.id,
    );
    return selectCurrentRevisions([old, current]);
  }
  if (key === 'conflict')
    return selectCurrentRevisions([
      revision('nine', 'statement', { attribute: 'startTime', value: '09:00' }),
      revision('ten', 'statement', { attribute: 'startTime', value: '10:00' }),
    ]);
  return {
    kind: 'referenceResolution',
    proposedItemId: item.id,
    candidates: ['rust-language', 'rust-game'],
  };
}
