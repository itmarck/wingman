import { describe, expect, it } from 'vitest';
import { Entry } from '../../../core/knowledge/entry.js';
import type { KnowledgeSnapshot } from '../../../core/knowledge/snapshot.js';
import type { RegisterInterpretationInput } from '../domain/input.js';
import { validateInterpretationDraft } from '../services/validate.js';

describe('Interpretation source validation', () => {
  it('accepts exact quotes and paragraph locations from text Entries', () => {
    const entry = createTextEntry();

    expect(() => validateInterpretationDraft(createDraft(), createSnapshot(entry))).not.toThrow();
  });

  it('rejects altered quotes and incompatible locations', () => {
    const entry = createTextEntry();
    const draft = createDraft();

    expect(() =>
      validateInterpretationDraft(
        {
          ...draft,
          axioms: [
            {
              ...draft.axioms[0],
              object: {
                kind: 'literal',
                literal: {
                  kind: 'quote',
                  value: '?He creado Boreal?',
                },
              },
            },
          ],
        },
        createSnapshot(entry),
      ),
    ).toThrow('Quote literal must exactly match text from its Entry');
    expect(() =>
      validateInterpretationDraft(
        {
          ...draft,
          axioms: [
            {
              ...draft.axioms[0],
              sourceLocators: [{ kind: 'page', page: 1 }],
            },
          ],
        },
        createSnapshot(entry),
      ),
    ).toThrow('Text Entry supports only paragraph Source locators');
  });

  it('rejects Source locators for URL Entries', () => {
    const entry = Entry.create({
      id: 'entry-url',
      content: {
        kind: 'url',
        url: 'https://example.com/source',
      },
      origin: {
        source: 'test',
      },
      capturedAt: '2026-07-29T12:00:00Z',
    });

    expect(() =>
      validateInterpretationDraft(
        {
          ...createDraft(),
          entryId: entry.id,
        },
        createSnapshot(entry),
      ),
    ).toThrow('URL Entry cannot contain Source locators');
  });
});

function createTextEntry(): Entry {
  return Entry.create({
    id: 'entry-text',
    content: {
      kind: 'text',
      text: 'Un correo contiene la frase «He creado Boreal».',
    },
    origin: {
      source: 'test',
    },
    capturedAt: '2026-07-29T12:00:00Z',
  });
}

function createDraft(): RegisterInterpretationInput {
  return {
    entryId: 'entry-text',
    concepts: [
      {
        reference: 'email',
        name: 'Correo',
        definition: 'Mensaje que contiene una cita',
      },
    ],
    predicates: [
      {
        key: 'containsQuote',
        definition: 'Indica que el sujeto contiene una cita',
        origin: 'custom',
        scope: 'axiom',
      },
    ],
    axioms: [
      {
        reference: 'quoted-statement',
        subjectReference: 'email',
        predicateKey: 'containsQuote',
        object: {
          kind: 'literal',
          literal: {
            kind: 'quote',
            value: 'He creado Boreal',
          },
        },
        sourceLocators: [{ kind: 'paragraph', paragraph: 1 }],
      },
    ],
    links: [],
  };
}

function createSnapshot(entry: Entry): KnowledgeSnapshot {
  return {
    entries: [entry],
    concepts: [],
    predicates: [],
    axioms: [],
    links: [],
  };
}
