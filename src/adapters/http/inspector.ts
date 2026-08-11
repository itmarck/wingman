import { readFile } from 'node:fs/promises';
import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { System } from '../../system/system.js';

export interface InspectorNode {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly status?: string;
  readonly at?: string;
  readonly data: unknown;
}

export interface InspectorEdge {
  readonly from: string;
  readonly to: string;
  readonly type: string;
}

export interface InspectorEvent {
  readonly id: string;
  readonly type: string;
  readonly at: string;
  readonly subject?: string;
  readonly data: unknown;
}

export interface InspectorSnapshot {
  readonly generatedAt: string;
  readonly nodes: readonly InspectorNode[];
  readonly edges: readonly InspectorEdge[];
  readonly events: readonly InspectorEvent[];
}

interface InspectorRoutesOptions {
  readonly system: System;
}

const pageUrl = new URL('../../../packages/inspector/index.html', import.meta.url);

/** Exposes the unauthenticated local inspector outside the production route tree. */
export const inspectorRoutes: FastifyPluginAsyncTypebox<InspectorRoutesOptions> = async (
  server,
  { system },
) => {
  server.get('/inspect', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return readFile(pageUrl, 'utf8');
  });

  server.get(
    '/inspect/data',
    {
      schema: {
        hide: true,
        response: {
          200: Type.Object({
            generatedAt: Type.String(),
            nodes: Type.Array(Type.Unknown()),
            edges: Type.Array(Type.Unknown()),
            events: Type.Array(Type.Unknown()),
          }),
        },
      },
    },
    async () => {
      const snapshot = await createInspectorSnapshot(system);
      return {
        generatedAt: snapshot.generatedAt,
        nodes: [...snapshot.nodes],
        edges: [...snapshot.edges],
        events: [...snapshot.events],
      };
    },
  );
};

/** Builds one read-only graph and timeline from the System's public runtime surfaces. */
export async function createInspectorSnapshot(system: System): Promise<InspectorSnapshot> {
  const [entries, reviews, currentItems, declarations, intents, executionEvents, automations] =
    await Promise.all([
      collectPages((cursor) => system.capture.listEntries.execute(cursor)),
      collectPages((cursor) => system.interpretation.listReviews.execute(cursor)),
      system.projection.read('system.currentItems'),
      system.declarations.list(),
      system.execution.store.listIntents(),
      system.execution.store.listEvents(),
      system.automation.store.list(),
    ]);
  const [statuses, notifications, proactive, states] = await Promise.all([
    Promise.all(entries.map((entry) => system.interpretation.getEntryStatus.execute(entry.id))),
    system.execution.notifications.list(),
    system.suggestion.service.list(),
    collectStates(system),
  ]);
  const attempts = (
    await Promise.all(intents.map((intent) => system.execution.store.listAttempts(intent.id)))
  ).flat();
  const automationResults = (
    await Promise.all(
      automations.map((runtime) => system.automation.store.listResults(runtime.automation.id)),
    )
  ).flat();
  const nodes = new Map<string, InspectorNode>();
  const edges: InspectorEdge[] = [];
  const events: InspectorEvent[] = [];
  const addNode = (
    type: string,
    id: string,
    label: string,
    data: unknown,
    status?: string,
    at?: string,
  ) => {
    const key = nodeId(type, id);
    nodes.set(key, Object.freeze({ id: key, type, label, status, at, data }));
    return key;
  };
  const addEdge = (from: string, to: string, type: string) =>
    edges.push(Object.freeze({ from, to, type }));

  for (const entry of entries)
    addNode(
      'entry',
      entry.id,
      entry.content.kind === 'text' ? compact(entry.content.text) : entry.content.url,
      entry,
      undefined,
      entry.capturedAt,
    );
  for (const status of statuses) {
    const interpretation = addNode(
      'interpretation',
      status.interpretationId,
      `Interpretation ${status.status}`,
      status,
      status.status,
      status.updatedAt,
    );
    addEdge(nodeId('entry', status.entryId), interpretation, 'interpretedAs');
  }
  for (const declaration of declarations) {
    const id = addNode(
      'declaration',
      `${declaration.entryId}:${declaration.reference}`,
      `${declaration.kind} ${declaration.reference}`,
      declaration,
      declaration.status,
      declaration.recordedAt,
    );
    addEdge(nodeId('entry', declaration.entryId), id, 'declares');
    if (declaration.targetId)
      addEdge(id, nodeId(declaration.kind, declaration.targetId), 'publishedAs');
  }

  const itemData = record(currentItems.data)?.items;
  for (const item of Array.isArray(itemData) ? itemData : []) {
    const value = record(item);
    if (!value || typeof value.id !== 'string') continue;
    const profile = record(value.profile);
    const itemNode = addNode(
      'item',
      value.id,
      typeof profile?.key === 'string' ? `${profile.key} ${short(value.id)}` : short(value.id),
      item,
      typeof profile?.key === 'string' ? profile.key : undefined,
    );
    for (const component of Array.isArray(value.components) ? value.components : []) {
      const revision = record(component);
      if (!revision || typeof revision.id !== 'string') continue;
      const componentNode = addNode(
        'component',
        revision.id,
        typeof revision.key === 'string' ? revision.key : 'component',
        component,
        typeof revision.status === 'string' ? revision.status : undefined,
        typeof revision.recordedAt === 'string' ? revision.recordedAt : undefined,
      );
      addEdge(itemNode, componentNode, 'hasComponent');
      for (const evidence of Array.isArray(revision.evidence) ? revision.evidence : []) {
        const source = record(evidence);
        if (typeof source?.entryId === 'string')
          addEdge(nodeId('entry', source.entryId), componentNode, 'evidenceFor');
      }
    }
  }

  for (const review of reviews) {
    const reviewNode = addNode(
      'review',
      review.id,
      review.resolution.question,
      review,
      review.status,
      review.createdAt,
    );
    addEdge(nodeId('interpretation', review.interpretationId), reviewNode, 'needsReview');
  }
  for (const proposal of system.proposals.list())
    addNode(
      'proposal',
      proposal.id,
      `${proposal.changes.length} pending change${proposal.changes.length === 1 ? '' : 's'}`,
      proposal,
      'pending',
      proposal.createdAt,
    );
  for (const state of states) {
    const stateNode = addNode(
      'state',
      state.id,
      `${state.modality} ${state.evaluation}`,
      state,
      String(state.evaluation),
      state.state?.recordedAt,
    );
    for (const evidence of state.state?.evidence ?? [])
      addEdge(nodeId('entry', evidence.entryId), stateNode, 'evidenceFor');
  }
  for (const runtime of automations) {
    const automation = runtime.automation;
    const automationNode = addNode(
      'automation',
      automation.id,
      `Automation ${short(automation.id)}`,
      {
        status: automation.status,
        when: automation.when,
        controls: automation.controls,
        nextEvaluationAt: runtime.nextEvaluationAt,
        occurrences: runtime.occurrences,
      },
      automation.status,
      automation.createdAt,
    );
    for (const subject of automation.subjects)
      addEdge(automationNode, nodeId('item', subject.itemId), 'targets');
  }
  for (const intent of intents) {
    const intentNode = addNode(
      'intent',
      intent.id,
      `${intent.capability.key} Intent`,
      intent,
      intent.status,
      intent.createdAt,
    );
    if (intent.proposer.kind === 'automation' && intent.proposer.id)
      addEdge(nodeId('automation', intent.proposer.id), intentNode, 'produced');
  }
  for (const attempt of attempts) {
    const attemptNode = addNode(
      'attempt',
      attempt.id,
      `Attempt ${attempt.sequence}`,
      attempt,
      attempt.outcome,
      attempt.startedAt,
    );
    addEdge(nodeId('intent', attempt.intentId), attemptNode, 'attemptedBy');
  }
  for (const notification of notifications) {
    const notificationNode = addNode(
      'notification',
      notification.id,
      compact(notification.message),
      notification,
      'pending',
      notification.deliveredAt,
    );
    addEdge(nodeId('intent', notification.id), notificationNode, 'deliveredAs');
    addEdge(notificationNode, nodeId('item', notification.subjectItemId), 'about');
  }
  for (const suggestion of proactive) {
    const suggestionNode = addNode(
      'suggestion',
      suggestion.id,
      suggestion.rationale,
      suggestion,
      suggestion.status,
      suggestion.createdAt,
    );
    if (suggestion.subjectItemId)
      addEdge(suggestionNode, nodeId('item', suggestion.subjectItemId), 'about');
    if (suggestion.intentId)
      addEdge(suggestionNode, nodeId('intent', suggestion.intentId), 'suggests');
  }
  for (const event of executionEvents)
    events.push(
      Object.freeze({
        id: event.id,
        type: event.key,
        at: event.occurredAt,
        subject: event.causation.attemptId
          ? nodeId('attempt', event.causation.attemptId)
          : event.causation.intentId
            ? nodeId('intent', event.causation.intentId)
            : event.causation.entryId
              ? nodeId('entry', event.causation.entryId)
              : undefined,
        data: event.data,
      }),
    );
  for (const result of automationResults)
    events.push(
      Object.freeze({
        id: result.id,
        type: `automation.${result.outcome}`,
        at: result.evaluatedAt,
        subject: nodeId('automation', result.automationId),
        data: result,
      }),
    );

  return Object.freeze({
    generatedAt: new Date().toISOString(),
    nodes: Object.freeze([...nodes.values()]),
    edges: Object.freeze(edges),
    events: Object.freeze(events.sort((left, right) => right.at.localeCompare(left.at))),
  });
}

async function collectPages<Value>(
  load: (
    cursor?: string,
  ) => Promise<{ readonly items: readonly Value[]; readonly nextCursor: string | null }>,
): Promise<readonly Value[]> {
  const items: Value[] = [];
  let cursor: string | undefined;
  do {
    const page = await load(cursor);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

async function collectStates(system: System) {
  const views = await Promise.all(
    ['current', 'desired', 'required', 'forbidden', 'predicted', 'unresolved'].map((view) =>
      system.state.listView.execute(
        view as 'current' | 'desired' | 'required' | 'forbidden' | 'predicted' | 'unresolved',
      ),
    ),
  );
  return [...new Map(views.flat().map((state) => [state.id, state])).values()];
}

function nodeId(type: string, id: string): string {
  return `${type}:${id}`;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function compact(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
}

function short(value: string): string {
  return value.length > 12 ? value.slice(0, 8) : value;
}
