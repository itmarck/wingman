import { describe, expect, it } from 'vitest';
import { createKnowledgeRegistry } from '../../../core/item/system.js';
import type { InterpretationDraft } from '../domain/input.js';
import { completeMissingResolutions } from '../services/registration.js';
import { validateInterpretationDraft } from '../services/validate.js';
import { createCompiler, entry, item, recordedAt, snapshot } from './support/compiler.js';

describe('Interpretation compiler', () => {
  it('compiles descriptive and Profile Items through the same stable plan', () => {
    const draft: InterpretationDraft = {
      entryId: entry.id,
      declarations: [
        item('bank', undefined, 'name', 'Banco'),
        item('task', { key: 'task', version: 1 }, 'descriptive', { title: 'Pagar' }),
      ],
    };
    const compiler = createCompiler();
    validateInterpretationDraft(draft, snapshot, createKnowledgeRegistry());
    const first = compiler.compile('interpretation-1', draft, snapshot, recordedAt);
    const second = compiler.compile('interpretation-1', draft, snapshot, recordedAt);

    expect(first.items.map(({ profile }) => profile?.key)).toEqual([undefined, 'task']);
    expect(first.revisions.map(({ key }) => key)).toEqual(
      expect.arrayContaining(['name', 'descriptive', 'planning', 'lifecycle']),
    );
    expect(first.states).toHaveLength(0);
    expect(first.items.map(({ id }) => id)).toEqual(second.items.map(({ id }) => id));
    expect(first.revisions.map(({ id }) => id)).toEqual(second.revisions.map(({ id }) => id));
  });

  it('creates a generic resolution request for an uncertain Item', () => {
    const draft: InterpretationDraft = {
      entryId: entry.id,
      declarations: [{ ...item('bank', undefined, 'name', 'Banco'), referenceStatus: 'uncertain' }],
    };
    const completed = completeMissingResolutions(draft, snapshot);

    expect(completed.resolutions).toEqual([
      { reference: 'bank', question: '¿A qué Item corresponde Banco?', candidateItemIds: [] },
    ]);
    expect(() =>
      validateInterpretationDraft(completed, snapshot, createKnowledgeRegistry()),
    ).not.toThrow();
  });

  it('commits needsInput outcomes without materializing blocked effects', () => {
    const draft: InterpretationDraft = {
      entryId: entry.id,
      declarations: [
        {
          ...item('task', { key: 'task', version: 1 }, 'descriptive', { title: 'Pagar' }),
          unresolved: ['bank'],
        },
        {
          kind: 'intent',
          version: 1,
          reference: 'notice',
          dependsOn: ['task'],
          unresolved: [],
          capability: { key: 'notification', version: 1 },
          input: { message: 'Pagar' },
          conditions: [],
          expectedState: [],
          consent: 'none',
          trigger: undefined,
        },
      ],
    };
    const plan = createCompiler().compile('interpretation-2', draft, snapshot, recordedAt);

    expect(plan.items).toEqual([]);
    expect(plan.intents).toEqual([]);
    expect(plan.outcomes.map(({ status }) => status)).toEqual(['needsInput', 'needsInput']);
  });

  it('rejects an unknown contract before returning a publication plan', () => {
    const draft: InterpretationDraft = {
      entryId: entry.id,
      declarations: [
        {
          kind: 'intent',
          version: 1,
          reference: 'unknown',
          dependsOn: [],
          unresolved: [],
          capability: { key: 'unknownCapability', version: 1 },
          input: {},
          conditions: [],
          expectedState: [],
          consent: 'none',
          trigger: undefined,
        },
      ],
    };

    expect(() => createCompiler().compile('interpretation-3', draft, snapshot, recordedAt)).toThrow(
      'not registered',
    );
  });
});
