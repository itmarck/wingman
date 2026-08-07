import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { ProposeIntentInput } from '../../modules/execution/operations/propose.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import { errorSchema, idParamsSchema, mutationHeadersSchema } from './schema.js';

interface ExecutionRoutesOptions {
  readonly system: System;
}
const intentBody = Type.Object(
  {
    capability: Type.Object({ key: Type.String(), version: Type.Integer({ minimum: 1 }) }),
    input: Type.Unknown(),
    proposer: Type.Object({
      kind: Type.Union([Type.Literal('user'), Type.Literal('system'), Type.Literal('automation')]),
      id: Type.Optional(Type.String()),
    }),
    conditions: Type.Array(Type.Unknown()),
    expectedState: Type.Array(Type.Unknown()),
    authorization: Type.Union([Type.Literal('none'), Type.Literal('explicit')]),
    trigger: Type.Optional(
      Type.Object({
        kind: Type.Union([Type.Literal('manual'), Type.Literal('time'), Type.Literal('event')]),
        value: Type.Optional(Type.String()),
      }),
    ),
    evidence: Type.Array(
      Type.Object({ entryId: Type.String(), sourceLocators: Type.Array(Type.Unknown()) }),
      { minItems: 1 },
    ),
  },
  { additionalProperties: false },
);

export const executionRoutes: FastifyPluginAsyncTypebox<ExecutionRoutesOptions> = async (
  server,
  { system },
) => {
  server.post(
    '/intents',
    {
      schema: {
        tags: ['Execution'],
        summary: 'Propose a conditional Intent',
        headers: mutationHeadersSchema,
        body: intentBody,
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
      const input = request.body as ProposeIntentInput;
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [{ operation: 'create', target: 'intent', value: input }],
          async () => {
            await system.execution.proposeIntent.execute(input);
          },
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      return reply.code(201).send({ id: await system.execution.proposeIntent.execute(input) });
    },
  );

  server.post(
    '/intents/:id/authorization',
    {
      schema: {
        tags: ['Execution'],
        summary: 'Explicitly authorize an Intent',
        headers: mutationHeadersSchema,
        params: idParamsSchema,
        response: {
          202: Type.Object({ proposal: proposalSchema }),
          204: Type.Null(),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [
            {
              operation: 'update',
              target: 'intentAuthorization',
              value: { id: request.params.id },
            },
          ],
          () => system.execution.authorizeIntent.execute(request.params.id),
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      await system.execution.authorizeIntent.execute(request.params.id);
      return reply.code(204).send(null);
    },
  );

  server.post(
    '/intents/:id/attempts',
    {
      schema: {
        tags: ['Execution'],
        summary: 'Attempt an authorized Intent',
        headers: mutationHeadersSchema,
        params: idParamsSchema,
        response: {
          200: Type.Object({ outcome: Type.String() }),
          202: Type.Object({ proposal: proposalSchema }),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [{ operation: 'create', target: 'attempt', value: { intentId: request.params.id } }],
          async () => {
            await system.execution.authorizeIntent.execute(request.params.id);
            await system.execution.executeIntent.execute(request.params.id);
          },
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      return reply.send({
        outcome: await system.execution.executeIntent.execute(request.params.id),
      });
    },
  );
};
