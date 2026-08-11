import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAccessToken } from '../../src/adapters/http/auth.js';
import { createHttpServer } from '../../src/adapters/http/server.js';
import { PostgresDatabase } from '../../src/adapters/postgres/database.js';
import { createPostgresStorage } from '../../src/adapters/postgres/storage.js';
import { Automation } from '../../src/core/automation/automation.js';
import { Item } from '../../src/core/item/item.js';
import { createKnowledgeRegistry } from '../../src/core/item/system.js';
import { Entry } from '../../src/core/knowledge/entry.js';
import type { InterpretationAdapter } from '../../src/modules/interpretation/services/interpreter.js';
import type { InterpretationRequest } from '../../src/modules/interpretation/services/request.js';
import type { Suggestion } from '../../src/modules/suggestion/domain/suggestion.js';
import type { SystemStorage } from '../../src/system/storage.js';
import { createSystem, type System } from '../../src/system/system.js';
import { testDatabaseUrl } from '../postgres/database.js';

const signingSecret = 'durable-http-test-secret-with-32-characters';
const token = await createAccessToken('httpTest', signingSecret);
const headers = { authorization: `Bearer ${token}`, 'x-mutation-mode': 'write' };
let admin: PostgresDatabase;

beforeAll(() => {
  admin = new PostgresDatabase({ connectionString: testDatabaseUrl(), maxConnections: 2 });
});

afterAll(async () => {
  await admin.close();
});

beforeEach(async () => {
  await admin.query(`TRUNCATE TABLE
    suggestions, interpretation_declaration_outcomes, automation_evaluations,
    automation_deduplications, automation_definitions, execution_events, execution_attempts,
    execution_intents, interpretation_review_locks, interpretation_reviews,
    interpretation_claims, interpretation_runs, core_states, core_component_revisions,
    core_items, core_entries RESTART IDENTITY CASCADE`);
});

describe('durable HTTP workflows', () => {
  it('captures, interprets and exposes published knowledge after restart', async () => {
    let fixture = await createFixture();
    const captured = await fixture.server.inject({
      method: 'POST',
      url: '/api/entries',
      headers,
      payload: {
        externalId: 'durable-entry',
        content: { kind: 'text', text: 'identified knowledge' },
      },
    });
    const entryId = captured.json<{ id: string }>().id;
    expect(captured.statusCode).toBe(202);
    expect(await fixture.system.interpretation.processNext.execute()).toBe(true);

    fixture = await restart(fixture);
    const entry = await fixture.server.inject({
      method: 'GET',
      url: `/api/entries/${entryId}`,
      headers,
    });
    const status = await fixture.server.inject({
      method: 'GET',
      url: `/api/entries/${entryId}/status`,
      headers,
    });
    const projection = await fixture.server.inject({
      method: 'GET',
      url: '/api/projections/system.currentItems',
      headers,
    });
    expect(entry.statusCode).toBe(200);
    expect(status.json<{ status: string }>().status).toBe('completed');
    expect(JSON.stringify(projection.json())).toContain('Conocimiento durable');
    await closeFixture(fixture);
  });

  it('resolves a Review atomically and observes the completed publication after restart', async () => {
    let fixture = await createFixture();
    const captured = await fixture.server.inject({
      method: 'POST',
      url: '/api/entries',
      headers,
      payload: { externalId: 'review-entry', content: { kind: 'text', text: 'needs review' } },
    });
    const entryId = captured.json<{ id: string }>().id;
    await fixture.system.interpretation.processNext.execute();
    const reviews = await fixture.server.inject({ method: 'GET', url: '/api/reviews', headers });
    const reviewId = required(reviews.json<{ items: { id: string }[] }>().items[0], 'Review').id;
    const review = await fixture.server.inject({
      method: 'GET',
      url: `/api/reviews/${reviewId}`,
      headers,
    });
    const reference = review.json<{ resolution: { reference: string } }>().resolution.reference;
    const resolution = await fixture.server.inject({
      method: 'POST',
      url: `/api/reviews/${reviewId}/resolution`,
      headers,
      payload: { decision: { reference } },
    });
    expect(resolution.statusCode).toBe(204);

    fixture = await restart(fixture);
    expect(
      (
        await fixture.server.inject({ method: 'GET', url: `/api/reviews/${reviewId}`, headers })
      ).json(),
    ).toMatchObject({ status: 'resolved' });
    expect(
      (
        await fixture.server.inject({
          method: 'GET',
          url: `/api/entries/${entryId}/status`,
          headers,
        })
      ).json(),
    ).toMatchObject({ status: 'completed' });
    await closeFixture(fixture);
  });

  it('executes and acknowledges a durable launcher notification without duplication', async () => {
    let fixture = await createFixture();
    await fixture.storage.knowledge.saveEntry(entryFact());
    const subject = Item.create({ id: 'subject-1', createdAt: '2026-08-10T12:00:00.000Z' });
    await fixture.storage.knowledge.saveItems({ items: [subject], revisions: [] });
    const automation = Automation.create({
      id: 'automation-1',
      subjects: [{ kind: 'itemReference', itemId: subject.id }],
      given: [],
      when: { operator: { key: 'event', version: 1 }, eventKey: 'changed' },
      thenIntents: [
        {
          capability: { key: 'notification', version: 1 },
          input: { message: 'Revisar' },
          conditions: [],
          expectedState: [],
          consent: 'none',
        },
      ],
      evidence: evidence(),
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    await fixture.storage.automations.save({
      automation,
      occurrences: 0,
      deduplicationIds: new Set(),
    });
    const proposed = await fixture.server.inject({
      method: 'POST',
      url: '/api/intents',
      headers,
      payload: {
        capability: { key: 'notification', version: 1 },
        input: { message: 'Revisar' },
        proposer: { kind: 'automation', id: automation.id },
        conditions: [],
        expectedState: [],
        consent: 'none',
        trigger: { kind: 'event', value: 'occurrence-1' },
        evidence: evidence(),
      },
    });
    const intentId = proposed.json<{ id: string }>().id;
    expect(
      (
        await fixture.server.inject({
          method: 'POST',
          url: `/api/intents/${intentId}/attempts`,
          headers,
        })
      ).json(),
    ).toEqual({ outcome: 'succeeded' });

    fixture = await restart(fixture);
    const notifications = await fixture.server.inject({
      method: 'GET',
      url: '/api/notifications',
      headers,
    });
    expect(notifications.json<{ id: string }[]>()).toMatchObject([{ id: intentId }]);
    await fixture.server.inject({
      method: 'POST',
      url: `/api/notifications/${intentId}/acknowledgement`,
      headers,
    });
    fixture = await restart(fixture);
    expect(
      (await fixture.server.inject({ method: 'GET', url: '/api/notifications', headers })).json(),
    ).toEqual([]);
    expect(await fixture.storage.executions.listAttempts(intentId)).toHaveLength(1);
    await closeFixture(fixture);
  });

  it('accepts a Suggestion and its Intent consent as one durable transition', async () => {
    let fixture = await createFixture();
    await fixture.storage.knowledge.saveEntry(entryFact());
    const intent = await fixture.system.execution.proposeIntent.prepare({
      capability: { key: 'notification', version: 1 },
      input: { message: 'Sugerencia' },
      proposer: { kind: 'system' },
      conditions: [],
      expectedState: [],
      consent: 'explicit',
      evidence: evidence(),
    });
    const suggestion: Suggestion = Object.freeze({
      id: 'suggestion-http',
      fingerprint: 'suggestion-http',
      detector: { key: 'fixture', version: 1 },
      relevantState: [],
      evidence: evidence(),
      rationale: 'Conviene',
      expectedEffect: 'Ayuda',
      urgency: 'medium',
      expiresAt: '2026-08-11T12:00:00.000Z',
      capability: { key: 'notification', version: 1 },
      autonomy: { resolved: 'propose' as const, explicitConsent: true },
      intentId: intent.id,
      status: 'active',
      createdAt: '2026-08-10T12:00:00.000Z',
      feedback: [],
    });
    await fixture.storage.suggestionLifecycle.create(suggestion, intent);
    expect(
      (
        await fixture.server.inject({
          method: 'POST',
          url: `/api/suggestions/${suggestion.id}/feedback`,
          headers,
          payload: { kind: 'accepted' },
        })
      ).statusCode,
    ).toBe(204);

    fixture = await restart(fixture);
    expect(
      (
        await fixture.server.inject({
          method: 'GET',
          url: `/api/suggestions/${suggestion.id}`,
          headers,
        })
      ).json(),
    ).toMatchObject({ status: 'accepted' });
    expect(await fixture.storage.executions.findIntent(intent.id)).toMatchObject({
      status: 'consented',
    });
    await closeFixture(fixture);
  });
});

interface Fixture {
  database: PostgresDatabase;
  storage: SystemStorage;
  system: System;
  server: ReturnType<typeof createHttpServer>;
}
async function createFixture(): Promise<Fixture> {
  const database = new PostgresDatabase({ connectionString: testDatabaseUrl(), maxConnections: 5 });
  const registry = createKnowledgeRegistry();
  const storage = createPostgresStorage(database, registry);
  const system = createSystem(storage, {
    adapter: new DeterministicInterpreter(),
    inference: { target: 'test', provider: 'test', model: 'test' },
    mode: 'write',
    registry,
  });
  const server = createHttpServer(system, { signingSecret, readiness: () => database.isReady() });
  await server.ready();
  return { database, storage, system, server };
}
async function restart(fixture: Fixture): Promise<Fixture> {
  await closeFixture(fixture);
  return createFixture();
}
async function closeFixture(fixture: Fixture): Promise<void> {
  await fixture.server.close();
  await fixture.system.close();
  await fixture.database.close();
}

class DeterministicInterpreter implements InterpretationAdapter {
  readonly identity = { key: 'deterministic' };
  async interpret(request: InterpretationRequest) {
    const review =
      request.entry.content.kind === 'text' && request.entry.content.text.includes('review');
    return {
      kind: 'knowledge',
      draft: {
        entryId: request.entry.id,
        declarations: [
          {
            kind: 'item',
            version: 1,
            reference: 'knowledge',
            referenceStatus: review ? 'uncertain' : 'identified',
            components: [
              {
                reference: 'knowledge.name',
                key: 'name',
                schemaVersion: 1,
                value: review ? 'Conocimiento revisado' : 'Conocimiento durable',
              },
            ],
          },
        ],
      },
    };
  }
}
function entryFact() {
  return Entry.create({
    id: 'entry-fact',
    content: { kind: 'text', text: 'fact' },
    origin: { source: 'test' },
    capturedAt: '2026-08-10T12:00:00.000Z',
  });
}
function evidence() {
  return [{ entryId: 'entry-fact', sourceLocators: [] }];
}

function required<Value>(value: Value | undefined, name: string): Value {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
