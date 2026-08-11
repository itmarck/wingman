import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../../../tests/postgres/database.js';
import { Automation } from '../../../core/automation/automation.js';
import { Attempt } from '../../../core/execution/attempt.js';
import { Event } from '../../../core/execution/event.js';
import { Intent } from '../../../core/execution/intent.js';
import { ComponentRevision } from '../../../core/item/component.js';
import { Item } from '../../../core/item/item.js';
import { createKnowledgeRegistry } from '../../../core/item/system.js';
import { Entry } from '../../../core/knowledge/entry.js';
import { State } from '../../../core/state/state.js';
import { Interpretation } from '../../../modules/interpretation/domain/interpretation.js';
import { Review } from '../../../modules/interpretation/domain/review.js';
import type { Suggestion } from '../../../modules/suggestion/domain/suggestion.js';
import { PostgresDatabase } from '../database.js';
import { createPostgresStorage } from '../storage.js';

const now = '2026-08-10T12:00:00.000Z';
const later = '2026-08-10T12:01:00.000Z';
let database: PostgresDatabase;

beforeAll(() => {
  database = new PostgresDatabase({ connectionString: testDatabaseUrl(), maxConnections: 5 });
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.query(`TRUNCATE TABLE
    suggestions, interpretation_declaration_outcomes, automation_evaluations,
    automation_deduplications, automation_definitions, execution_events, execution_attempts,
    execution_intents, interpretation_review_locks, interpretation_reviews,
    interpretation_claims, interpretation_runs, core_states, core_component_revisions,
    core_items, core_entries RESTART IDENTITY CASCADE`);
});

describe('complete PostgreSQL storage', () => {
  it('captures Entry plus Interpretation atomically and survives recreation', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    const entry = createEntry();
    await storage.lifecycle.capture(entry, (captured) =>
      Interpretation.create({ id: 'interpretation-1', entryId: captured.id, createdAt: now }),
    );

    const recreated = createPostgresStorage(database, createKnowledgeRegistry());
    expect(await recreated.knowledge.findEntry(entry.id)).toEqual(entry);
    expect(await recreated.interpretations.findLatestInterpretation(entry.id)).toMatchObject({
      id: 'interpretation-1',
      status: 'queued',
    });
  });

  it('claims queued work once and recovers an expired processing lease', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    await storage.lifecycle.capture(createEntry(), (entry) =>
      Interpretation.create({ id: 'interpretation-1', entryId: entry.id, createdAt: now }),
    );
    const [first, competing] = await Promise.all([
      storage.interpretations.claim({ claimId: 'claim-1', claimedAt: now, leaseUntil: later }),
      storage.interpretations.claim({ claimId: 'claim-2', claimedAt: now, leaseUntil: later }),
    ]);
    expect([first, competing].filter(Boolean)).toHaveLength(1);
    const claim = first ?? competing;
    expect(claim).toBeDefined();
    const queued = await storage.interpretations.findInterpretation('interpretation-1');
    const activeClaim = required(claim, 'active claim');
    await storage.interpretations.start(
      activeClaim,
      required(queued, 'queued Interpretation').start(now),
    );
    const recovered = await storage.interpretations.claim({
      claimId: 'claim-3',
      claimedAt: '2026-08-10T12:02:00.000Z',
      leaseUntil: '2026-08-10T12:03:00.000Z',
    });
    expect(recovered).toMatchObject({ interpretationId: 'interpretation-1', recovered: true });
    const recoveryClaim = required(recovered, 'recovery claim');
    await storage.interpretations.renew(recoveryClaim, '2026-08-10T12:04:00.000Z');
    const processing = await storage.interpretations.findInterpretation('interpretation-1');
    const restarted = required(processing, 'processing Interpretation').recover(
      '2026-08-10T12:02:00.000Z',
    );
    await storage.interpretations.start(recoveryClaim, restarted);
    await storage.lifecycle.publish(
      restarted.completeEmpty({ key: 'fixture' }, '2026-08-10T12:03:00.000Z'),
      emptyPlan(),
      recoveryClaim,
    );
    await storage.interpretations.complete(recoveryClaim);
  });

  it('hydrates validated Components and reconstructs modal State after recreation', async () => {
    const registry = createKnowledgeRegistry();
    const storage = createPostgresStorage(database, registry);
    await storage.knowledge.saveEntry(createEntry());
    const item = Item.create({ id: 'item-1', createdAt: now });
    const revision = ComponentRevision.create({
      id: 'revision-1',
      itemId: item.id,
      key: 'name',
      schemaVersion: 1,
      value: 'Fixture',
      evidence: evidence(),
      recordedAt: now,
    });
    await storage.knowledge.saveItems({ items: [item], revisions: [revision] });
    await storage.states.saveState(createState('state-1', 'desired'));

    const recreated = createPostgresStorage(database, createKnowledgeRegistry());
    expect(await recreated.knowledge.findItems('fixture')).toEqual([item]);
    expect((await recreated.knowledge.loadKnowledge()).revisions).toEqual([revision]);
    expect(await recreated.states.listStates('desired')).toEqual([
      createState('state-1', 'desired'),
    ]);
  });

  it('locks the last Review completion and publishes its resolution once', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    await storage.lifecycle.capture(createEntry(), (entry) =>
      Interpretation.create({ id: 'interpretation-1', entryId: entry.id, createdAt: now }),
    );
    const claim = await storage.interpretations.claim({
      claimId: 'claim-1',
      claimedAt: now,
      leaseUntil: later,
    });
    const queued = await storage.interpretations.findInterpretation('interpretation-1');
    const started = required(queued, 'queued Interpretation').start(now);
    const activeClaim = required(claim, 'active claim');
    await storage.interpretations.start(activeClaim, started);
    const draft = {
      entryId: 'entry-1',
      declarations: [
        { kind: 'item' as const, reference: 'person', version: 1 as const, components: [] },
      ],
    };
    const pending = started.requestReview(draft, { key: 'fixture' }, later);
    const review = Review.createInterpretation({
      id: 'review-1',
      interpretationId: pending.id,
      entryId: pending.entryId,
      createdAt: later,
      resolution: {
        reference: 'person',
        question: 'Which person?',
        proposed: draft.declarations[0],
        candidates: [],
      },
    });
    await storage.lifecycle.requestReviews(pending, [review], activeClaim);
    const resolved = review.resolve({ reference: 'person' }, '2026-08-10T12:02:00.000Z');
    const attempts = await Promise.allSettled([
      storage.reviews.stageResolution(resolved),
      storage.reviews.stageResolution(resolved),
    ]);
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const completion = attempts.find((value) => value.status === 'fulfilled');
    expect(completion?.status === 'fulfilled' && completion.value.requiresCompletion).toBe(true);
    const completed = pending.completeReview(
      [{ reference: 'person' }],
      { itemIds: [], revisionIds: [] },
      '2026-08-10T12:03:00.000Z',
    );
    await storage.lifecycle.publishReview(completed, emptyPlan(), resolved);
    await storage.reviews.finishCompletion(pending.id);
    expect(await storage.reviews.findReview(review.id)).toEqual(resolved);
    expect(await storage.interpretations.findInterpretation(pending.id)).toEqual(completed);
  });

  it('rolls a complete Interpretation publication back on a later conflict', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    await storage.lifecycle.capture(createEntry(), (entry) =>
      Interpretation.create({ id: 'interpretation-1', entryId: entry.id, createdAt: now }),
    );
    const existing = createState('state-conflict', 'observed');
    await storage.states.saveState(existing);
    const queued = await storage.interpretations.findInterpretation('interpretation-1');
    const completed = required(queued, 'queued Interpretation')
      .start(now)
      .completeEmpty({ key: 'fixture' }, later);
    const item = Item.create({ id: 'item-rollback', createdAt: later });

    await expect(
      storage.lifecycle.publish(completed, {
        items: [item],
        revisions: [],
        states: [createState('state-conflict', 'desired')],
        automations: [],
        intents: [],
        outcomes: [],
        publication: { itemIds: [item.id], revisionIds: [] },
      }),
    ).rejects.toThrow('already exists');

    expect((await storage.knowledge.loadKnowledge()).items).toEqual([]);
    expect(await storage.interpretations.findInterpretation('interpretation-1')).toMatchObject({
      status: 'queued',
    });
  });

  it('reserves and finishes one mutable Attempt with its Event and Intent atomically', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    await storage.knowledge.saveEntry(createEntry());
    const intent = createIntent('intent-1', 'none');
    await storage.executions.saveIntent(intent);
    const started = Attempt.create({
      id: 'attempt-1',
      intentId: intent.id,
      sequence: 1,
      idempotencyKey: 'fixture:intent-1',
      startedAt: now,
    });
    await storage.executions.reserveAttempt(started);
    await expect(
      storage.executions.reserveAttempt(
        Attempt.create({
          id: 'attempt-2',
          intentId: intent.id,
          sequence: 2,
          idempotencyKey: 'fixture:intent-2',
          startedAt: now,
        }),
      ),
    ).rejects.toThrow();
    const uncertain = started.finish('uncertain', later, undefined, 'result unknown');
    await storage.executions.finishAttempt(uncertain, []);
    const retry = Attempt.create({
      id: 'attempt-retry',
      intentId: intent.id,
      sequence: 2,
      idempotencyKey: started.idempotencyKey,
      startedAt: '2026-08-10T12:02:00.000Z',
    });
    await storage.executions.reserveAttempt(retry);
    const finished = retry.finish('succeeded', '2026-08-10T12:03:00.000Z', {
      delivered: true,
    });
    const event = Event.create({
      id: 'event-1',
      key: 'attemptSucceeded',
      occurredAt: '2026-08-10T12:03:00.000Z',
      causation: { intentId: intent.id, attemptId: started.id },
      data: { delivered: true },
    });
    await storage.executions.finishAttempt(finished, [event], intent.complete());
    expect(await storage.executions.listAttempts(intent.id)).toEqual([uncertain, finished]);
    expect(await storage.executions.listEvents(intent.id)).toEqual([event]);
    expect(await storage.executions.findIntent(intent.id)).toMatchObject({ status: 'completed' });
  });

  it('commits an Automation occurrence, produced Intent and result once', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    await storage.knowledge.saveEntry(createEntry());
    const automation = Automation.create({
      id: 'automation-1',
      given: [],
      when: { operator: { key: 'time', version: 1 }, at: later },
      thenIntents: [
        {
          capability: { key: 'notify', version: 1 },
          input: {},
          conditions: [],
          expectedState: [],
          consent: 'explicit',
        },
      ],
      evidence: evidence(),
      createdAt: now,
    });
    const initial = {
      automation,
      nextEvaluationAt: later,
      occurrences: 0,
      deduplicationIds: new Set<string>(),
    };
    await storage.automations.save(initial);
    const intent = createIntent('intent-automation');
    const occurrence = {
      runtime: {
        ...initial,
        occurrences: 1,
        deduplicationIds: new Set(['automation-1:time:first']),
      },
      result: {
        id: 'evaluation-1',
        automationId: automation.id,
        triggerId: 'first',
        evaluatedAt: later,
        outcome: 'produced' as const,
        intentIds: [intent.id],
        reason: 'produced',
      },
      deduplicationId: 'automation-1:time:first',
      intents: [intent],
    };
    const committed = await Promise.all([
      storage.automations.commitOccurrence(occurrence),
      storage.automations.commitOccurrence(occurrence),
    ]);
    expect(committed.sort()).toEqual([false, true]);
    expect(await storage.executions.findIntent(intent.id)).toEqual(intent);
    expect(await storage.automations.listResults(automation.id)).toHaveLength(1);
  });

  it('uses indexed Automation selectors for due, Event and State dependencies', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    await storage.knowledge.saveEntry(createEntry());
    const template = [
      {
        capability: { key: 'notify', version: 1 },
        input: {},
        conditions: [],
        expectedState: [],
        consent: 'explicit' as const,
      },
    ];
    const values = [
      Automation.create({
        id: 'time-automation',
        given: [],
        when: { operator: { key: 'time', version: 1 }, at: now },
        thenIntents: template,
        evidence: evidence(),
        createdAt: now,
      }),
      Automation.create({
        id: 'event-automation',
        given: [],
        when: { operator: { key: 'event', version: 1 }, eventKey: 'changed' },
        thenIntents: template,
        evidence: evidence(),
        createdAt: now,
      }),
      Automation.create({
        id: 'state-automation',
        given: [],
        when: { operator: { key: 'stateChange', version: 1 }, itemIds: ['item-1'] },
        thenIntents: template,
        evidence: evidence(),
        createdAt: now,
      }),
    ];
    for (const automation of values)
      await storage.automations.save({
        automation,
        nextEvaluationAt: automation.id === 'time-automation' ? now : undefined,
        occurrences: 0,
        deduplicationIds: new Set(),
      });
    expect((await storage.automations.due(later)).map(({ automation }) => automation.id)).toEqual([
      'time-automation',
    ]);
    const event = Event.create({
      id: 'event-trigger',
      key: 'changed',
      occurredAt: now,
      causation: { entryId: 'entry-1' },
      data: {},
    });
    expect(
      (await storage.automations.forEvent(event)).map(({ automation }) => automation.id),
    ).toEqual(['event-automation']);
    expect(
      (
        await storage.automations.forStateChange({
          id: 'state-trigger',
          occurredAt: now,
          itemIds: ['item-1'],
          componentKeys: [],
        })
      ).map(({ automation }) => automation.id),
    ).toEqual(['state-automation']);
  });

  it('commits Suggestion and consent feedback with its Intent', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    await storage.knowledge.saveEntry(createEntry());
    const intent = createIntent('intent-suggestion');
    const suggestion = createSuggestion(intent.id);
    await storage.suggestionLifecycle.create(suggestion, intent);
    const accepted = Object.freeze({
      ...suggestion,
      status: 'accepted' as const,
      feedback: Object.freeze([{ kind: 'accepted' as const, at: later }]),
    });
    await storage.suggestionLifecycle.accept(accepted, intent.grantConsent());
    expect(await storage.suggestions.find(suggestion.id)).toEqual(accepted);
    expect(await storage.executions.findIntent(intent.id)).toMatchObject({ status: 'consented' });
  });

  it('rolls Suggestion creation back when its associated Intent conflicts', async () => {
    const storage = createPostgresStorage(database, createKnowledgeRegistry());
    await storage.knowledge.saveEntry(createEntry());
    await storage.executions.saveIntent(createIntent('intent-conflict'));
    const conflicting = Intent.create({
      ...createIntent('intent-conflict'),
      input: { different: true },
    });
    const suggestion = createSuggestion(conflicting.id);
    await expect(storage.suggestionLifecycle.create(suggestion, conflicting)).rejects.toThrow();
    expect(await storage.suggestions.find(suggestion.id)).toBeUndefined();
  });
});

function createEntry(): Entry {
  return Entry.create({
    id: 'entry-1',
    content: { kind: 'text', text: 'fixture' },
    origin: { source: 'test' },
    capturedAt: now,
  });
}
function evidence() {
  return [{ entryId: 'entry-1', sourceLocators: [] }];
}
function createIntent(id: string, consent: 'none' | 'explicit' = 'explicit'): Intent {
  return Intent.create({
    id,
    capability: { key: 'notify', version: 1 },
    input: { message: 'hi' },
    proposer: { kind: 'system' },
    conditions: [],
    expectedState: [],
    consent,
    evidence: evidence(),
    createdAt: now,
  });
}
function createState(id: string, modality: 'observed' | 'desired'): State {
  return State.create({
    id,
    modality,
    condition: {
      operator: { key: 'equal', version: 1 },
      operands: [
        { kind: 'literal', value: true },
        { kind: 'literal', value: true },
      ],
    },
    author: { kind: 'system' },
    evidence: evidence(),
    recordedAt: now,
  });
}
function createSuggestion(intentId: string): Suggestion {
  return Object.freeze({
    id: 'suggestion-1',
    fingerprint: 'fixture-1',
    detector: { key: 'fixture', version: 1 },
    relevantState: [],
    evidence: evidence(),
    rationale: 'Useful',
    expectedEffect: 'Helps',
    urgency: 'medium',
    expiresAt: '2026-08-11T12:00:00.000Z',
    capability: { key: 'notify', version: 1 },
    autonomy: { resolved: 'propose' as const, explicitConsent: true },
    intentId,
    status: 'active',
    createdAt: now,
    feedback: [],
  });
}
function emptyPlan() {
  return {
    items: [],
    revisions: [],
    states: [],
    automations: [],
    intents: [],
    outcomes: [],
    publication: { itemIds: [], revisionIds: [] },
  };
}

function required<Value>(value: Value | null | undefined, name: string): Value {
  if (value === null || value === undefined) throw new Error(`${name} is required`);
  return value;
}
