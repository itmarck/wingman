import { describe, expect, it } from 'vitest';
import { Intent } from '../../modules/intent/domain/intent.js';
import { GlossaryProjection } from '../../modules/projection/domain/glossary.js';
import { Axiom } from '../knowledge/axiom.js';
import { Concept } from '../knowledge/concept.js';
import { findDuplicateAxiom, findDuplicateLink } from '../knowledge/duplicate.js';
import { Entry } from '../knowledge/entry.js';
import { Link } from '../knowledge/link.js';
import { Predicate, systemSupersedesKey } from '../knowledge/predicate.js';
import { resolveConcept } from '../knowledge/resolve.js';
import { assertPredicateTarget } from '../knowledge/rules.js';
import type { KnowledgeSnapshot } from '../knowledge/snapshot.js';
import { deriveCurrentAxioms } from '../knowledge/vigency.js';

describe('knowledge', () => {
  it('turns an architectural decision into reusable knowledge and a Projection', () => {
    const entry = createTextEntry(
      'entry-architecture',
      'Projection belongs to the Core.',
      '2026-07-18T15:00:00Z',
    );
    const projectionConcept = Concept.create({
      id: 'concept-projection',
      name: 'Projection',
      definition: 'Derived view of Wingman knowledge',
    });
    const coreConcept = Concept.create({
      id: 'concept-core',
      name: 'Core',
      definition: 'Stable heart of Wingman',
    });
    const belongsTo = Predicate.create({
      id: 'predicate-belongs-to',
      key: 'belongsTo',
      definition: 'Indicates architectural ownership',
      origin: 'custom',
      scope: 'axiom',
    });
    const axiom = Axiom.create({
      id: 'axiom-projection-core',
      entryId: entry.id,
      subjectConceptId: projectionConcept.id,
      predicateId: belongsTo.id,
      object: {
        kind: 'concept',
        conceptId: coreConcept.id,
      },
    });
    const snapshot: KnowledgeSnapshot = {
      entries: [entry],
      concepts: [projectionConcept, coreConcept],
      predicates: [belongsTo],
      axioms: [axiom],
      links: [],
    };
    const glossary = new GlossaryProjection();

    expect(() => assertPredicateTarget(belongsTo, 'axiom')).not.toThrow();
    expect(() => assertPredicateTarget(belongsTo, 'link')).toThrow(
      'belongsTo cannot be used by a Link',
    );
    expect(glossary.build(snapshot)).toEqual({
      concepts: [
        {
          id: coreConcept.id,
          name: coreConcept.name,
          aliases: coreConcept.aliases,
          definition: coreConcept.definition,
        },
        {
          id: projectionConcept.id,
          name: projectionConcept.name,
          aliases: projectionConcept.aliases,
          definition: projectionConcept.definition,
        },
      ],
    });
  });

  it('returns deterministic Concept candidates without guessing through ambiguity', () => {
    const language = Concept.create({
      id: 'concept-rust-language',
      name: 'Rust',
      aliases: ['Rust language', ' rust LANGUAGE ', 'Rust'],
      definition: 'Programming language',
    });
    const game = Concept.create({
      id: 'concept-rust-game',
      name: 'Rust',
      aliases: ['Rust game'],
      definition: 'Survival video game',
    });
    const concepts = [language, game];

    expect(language.aliases).toEqual(['Rust language']);
    expect(resolveConcept(concepts, 'rust')).toEqual({
      status: 'ambiguous',
      candidates: concepts,
    });
    expect(resolveConcept(concepts, ' Rust ', 'programming language')).toEqual({
      status: 'matched',
      candidates: [language],
    });
    expect(resolveConcept(concepts, 'TypeScript')).toEqual({
      status: 'missing',
      candidates: [],
    });

    const expanded = language.addAliases(['Rustlang']);

    expect(expanded.id).toBe(language.id);
    expect(expanded.name).toBe(language.name);
    expect(expanded.definition).toBe(language.definition);
    expect(expanded.aliases).toEqual(['Rust language', 'Rustlang']);
    expect(resolveConcept([expanded, game], 'Rustlang', 'programming language')).toEqual({
      status: 'matched',
      candidates: [expanded],
    });
    expect(resolveConcept([expanded, game], 'Rust', 'Oxidized metal')).toEqual({
      status: 'ambiguous',
      candidates: [expanded, game],
    });
  });

  it('derives current knowledge from system.supersedes while retaining history', () => {
    const oldEntry = createTextEntry(
      'entry-notion',
      'Notion will be the primary storage.',
      '2026-07-01T14:00:00Z',
    );
    const newEntry = createTextEntry(
      'entry-postgres',
      'PostgreSQL replaces Notion as primary storage.',
      '2026-07-18T14:00:00Z',
    );
    const wingman = Concept.create({
      id: 'concept-wingman',
      name: 'Wingman',
      definition: 'Personal digital brain',
    });
    const notion = Concept.create({
      id: 'concept-notion',
      name: 'Notion',
      definition: 'Workspace service',
    });
    const postgres = Concept.create({
      id: 'concept-postgres',
      name: 'PostgreSQL',
      aliases: ['Postgres'],
      definition: 'Relational database',
    });
    const usesStorage = Predicate.create({
      id: 'predicate-storage',
      key: 'usesStorage',
      definition: 'Identifies primary storage',
      origin: 'custom',
      scope: 'axiom',
    });
    const supersedes = Predicate.create({
      id: 'predicate-supersedes',
      key: systemSupersedesKey,
      definition: 'Makes an older Axiom no longer current',
      origin: 'system',
      scope: 'link',
      mode: 'operational',
    });
    const oldAxiom = Axiom.create({
      id: 'axiom-notion',
      entryId: oldEntry.id,
      subjectConceptId: wingman.id,
      predicateId: usesStorage.id,
      object: { kind: 'concept', conceptId: notion.id },
    });
    const newAxiom = Axiom.create({
      id: 'axiom-postgres',
      entryId: newEntry.id,
      subjectConceptId: wingman.id,
      predicateId: usesStorage.id,
      object: { kind: 'concept', conceptId: postgres.id },
      sourceLocators: [
        { kind: 'timestamp', seconds: 60 },
        { kind: 'page', page: 2 },
      ],
    });
    const duplicate = Axiom.create({
      id: 'axiom-postgres-reprocessed',
      entryId: newEntry.id,
      subjectConceptId: wingman.id,
      predicateId: usesStorage.id,
      object: { kind: 'concept', conceptId: postgres.id },
      sourceLocators: [
        { kind: 'page', page: 2 },
        { kind: 'timestamp', seconds: 60 },
        { kind: 'page', page: 2 },
      ],
    });
    const link = Link.create({
      id: 'link-storage-change',
      sourceAxiomId: newAxiom.id,
      predicateId: supersedes.id,
      targetAxiomId: oldAxiom.id,
      provenance: {
        kind: 'entry',
        entryId: newEntry.id,
        sourceLocators: [
          { kind: 'paragraph', paragraph: 2 },
          { kind: 'paragraph', paragraph: 1 },
        ],
      },
    });
    const duplicateLink = Link.create({
      id: 'link-storage-change-duplicate',
      sourceAxiomId: newAxiom.id,
      predicateId: supersedes.id,
      targetAxiomId: oldAxiom.id,
      provenance: {
        kind: 'entry',
        entryId: newEntry.id,
        sourceLocators: [
          { kind: 'paragraph', paragraph: 1 },
          { kind: 'paragraph', paragraph: 2 },
        ],
      },
    });
    const reverseLink = Link.create({
      id: 'link-storage-cycle',
      sourceAxiomId: oldAxiom.id,
      predicateId: supersedes.id,
      targetAxiomId: newAxiom.id,
      provenance: {
        kind: 'entry',
        entryId: oldEntry.id,
      },
    });
    const axioms = [oldAxiom, newAxiom];

    expect(findDuplicateAxiom(axioms, duplicate)).toBe(newAxiom);
    expect(findDuplicateLink([link], duplicateLink)).toBe(link);
    expect(deriveCurrentAxioms(axioms, [link], [usesStorage, supersedes])).toEqual([newAxiom]);
    expect(() =>
      deriveCurrentAxioms(axioms, [link, reverseLink], [usesStorage, supersedes]),
    ).toThrow('system.supersedes cannot form a cycle');
    expect(() =>
      Link.create({
        id: 'link-storage-self',
        sourceAxiomId: newAxiom.id,
        predicateId: supersedes.id,
        targetAxiomId: newAxiom.id,
        provenance: {
          kind: 'entry',
          entryId: newEntry.id,
        },
      }),
    ).toThrow('Link cannot connect an Axiom to itself');
    expect(axioms).toEqual([oldAxiom, newAxiom]);
    expect(() =>
      Predicate.create({
        id: 'predicate-custom-supersedes',
        key: 'supersedes',
        definition: 'Conflicting custom meaning',
        origin: 'custom',
        scope: 'link',
      }),
    ).toThrow('reserved by the system');
    expect(() =>
      Predicate.create({
        id: 'predicate-system-plans',
        key: 'system.plans',
        definition: 'Unknown operational behavior',
        origin: 'system',
        scope: 'link',
        mode: 'operational',
      }),
    ).toThrow('has no known operational behavior');
    expect(() =>
      Predicate.create({
        id: 'predicate-invalid-key',
        key: 'due-date',
        definition: 'Invalid key format',
        origin: 'custom',
        scope: 'axiom',
      }),
    ).toThrow('camelCase or system.camelCase');
    expect(() =>
      Predicate.create({
        id: 'predicate-invalid-supersedes',
        key: systemSupersedesKey,
        definition: 'Invalid supersedes contract',
        origin: 'system',
        scope: 'both',
        mode: 'operational',
      }),
    ).toThrow('must be an operational Link Predicate');
  });

  it('represents a scheduled reminder without implementing execution', () => {
    const entry = createTextEntry(
      'entry-reminder',
      'Tomorrow at 6 pm remind me to buy cream for Friday therapy.',
      '2026-07-18T17:00:00Z',
    );
    const purchase = Concept.create({
      id: 'concept-cream-purchase',
      name: 'Cream purchase',
      definition: 'Purchase of cream requested by the user',
    });
    const therapy = Concept.create({
      id: 'concept-friday-therapy',
      name: 'Friday therapy',
      definition: 'Therapy appointment on Friday',
    });
    const requiredFor = Predicate.create({
      id: 'predicate-required-for',
      key: 'requiredFor',
      definition: 'Indicates why something is needed',
      origin: 'custom',
      scope: 'axiom',
    });
    const scheduledAt = Predicate.create({
      id: 'predicate-scheduled-at',
      key: 'scheduledAt',
      definition: 'Indicates a requested date and time',
      origin: 'custom',
      scope: 'axiom',
    });
    const purpose = Axiom.create({
      id: 'axiom-cream-purpose',
      entryId: entry.id,
      subjectConceptId: purchase.id,
      predicateId: requiredFor.id,
      object: { kind: 'concept', conceptId: therapy.id },
    });
    const schedule = Axiom.create({
      id: 'axiom-reminder-time',
      entryId: entry.id,
      subjectConceptId: purchase.id,
      predicateId: scheduledAt.id,
      object: {
        kind: 'literal',
        literal: {
          kind: 'dateTime',
          value: '2026-07-19T23:00:00Z',
        },
      },
    });
    const intent = Intent.create({
      id: 'intent-cream-reminder',
      key: 'notification.remind',
      entryId: entry.id,
      axiomIds: [purpose.id, schedule.id],
      scheduledFor: '2026-07-19T18:00:00-05:00',
    });

    expect(intent.axiomIds).toEqual([purpose.id, schedule.id]);
    expect(intent.scheduledFor).toBe('2026-07-19T18:00:00-05:00');
  });
});

function createTextEntry(id: string, text: string, capturedAt: string): Entry {
  return Entry.create({
    id,
    content: { kind: 'text', text },
    origin: {
      source: 'minima',
    },
    capturedAt,
  });
}
