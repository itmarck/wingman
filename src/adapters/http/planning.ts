import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import { planningViews } from '../../modules/planning/operations/query.js';
import type { CreatePlanningItemInput } from '../../modules/planning/operations/write.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import { errorSchema, mutationHeadersSchema } from './schema.js';

interface Options {
  readonly system: System;
}
const evidenceSchema = Type.Array(
  Type.Object({ entryId: Type.String(), sourceLocators: Type.Array(Type.Unknown()) }),
  { minItems: 1 },
);
const createSchema = Type.Object(
  {
    profile: Type.Union(['task', 'objective', 'plan', 'habit'].map((value) => Type.Literal(value))),
    title: Type.String({ minLength: 1 }),
    notes: Type.Optional(Type.String()),
    objectiveId: Type.Optional(Type.String()),
    planId: Type.Optional(Type.String()),
    dependencyIds: Type.Optional(Type.Array(Type.String())),
    responsibleItemId: Type.Optional(Type.String()),
    startAt: Type.Optional(Type.String()),
    dueAt: Type.Optional(Type.String()),
    recurrence: Type.Optional(Type.String()),
    progress: Type.Optional(
      Type.Object({
        current: Type.Number(),
        target: Type.Number(),
        unit: Type.Optional(Type.String()),
      }),
    ),
    evidence: evidenceSchema,
  },
  { additionalProperties: false },
);

export const planningRoutes: FastifyPluginAsyncTypebox<Options> = async (server, { system }) => {
  server.get(
    '/planning/:view',
    {
      schema: {
        tags: ['Planning'],
        summary: 'Read a derived planning view',
        params: Type.Object({
          view: Type.Union(planningViews.map((value) => Type.Literal(value))),
        }),
        response: { 200: Type.Array(Type.Unknown()), 401: errorSchema },
      },
    },
    async (request) => [...(await system.planning.queries.list(request.params.view))],
  );
  server.post(
    '/planning',
    {
      schema: {
        tags: ['Planning'],
        summary: 'Create a planning Item',
        headers: mutationHeadersSchema,
        body: createSchema,
        response: {
          201: Type.Object({ id: Type.String() }),
          202: Type.Object({ proposal: proposalSchema }),
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      const input = request.body as CreatePlanningItemInput;
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [{ operation: 'create', target: 'planningItem', value: input }],
          async () => {
            await system.planning.commands.create(input);
          },
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      return reply.code(201).send({ id: await system.planning.commands.create(input) });
    },
  );
  server.post(
    '/planning/:id/:operation',
    {
      schema: {
        tags: ['Planning'],
        summary: 'Change a planning Item',
        headers: mutationHeadersSchema,
        params: Type.Object({
          id: Type.String(),
          operation: Type.Union(
            ['transition', 'schedule', 'assign', 'relate', 'measure'].map((value) =>
              Type.Literal(value),
            ),
          ),
        }),
        body: Type.Object({ value: Type.Unknown(), evidence: evidenceSchema }),
        response: {
          204: Type.Null(),
          202: Type.Object({ proposal: proposalSchema }),
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      const apply = () =>
        applyOperation(
          system,
          request.params.id,
          request.params.operation,
          request.body.value,
          request.body.evidence as CreatePlanningItemInput['evidence'],
        );
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [
            {
              operation: 'update',
              target: `planningItem:${request.params.id}`,
              value: request.body,
            },
          ],
          apply,
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      await apply();
      return reply.code(204).send(null);
    },
  );
};

async function applyOperation(
  system: System,
  id: string,
  operation: string,
  value: unknown,
  evidence: CreatePlanningItemInput['evidence'],
): Promise<void> {
  const commands = system.planning.commands;
  if (operation === 'transition') return commands.transition(id, String(value), evidence);
  if (operation === 'schedule')
    return commands.schedule(id, value as Parameters<typeof commands.schedule>[1], evidence);
  if (operation === 'assign') return commands.assign(id, String(value), evidence);
  if (operation === 'relate')
    return commands.relate(id, value as Parameters<typeof commands.relate>[1], evidence);
  return commands.measure(id, value as Parameters<typeof commands.measure>[1], evidence);
}
