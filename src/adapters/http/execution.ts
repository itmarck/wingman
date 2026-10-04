import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { ProposeIntentInput } from '../../modules/execution/operations/propose.js';
import type { System } from '../../system/system.js';
import { errorSchema, idParamsSchema } from './schema.js';

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
    consent: Type.Union([Type.Literal('none'), Type.Literal('explicit')]),
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
        body: intentBody,
        response: {
          201: Type.Object({ id: Type.String() }),
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const input = request.body as ProposeIntentInput;
      return reply.code(201).send({ id: await system.execution.proposeIntent.execute(input) });
    },
  );

  server.post(
    '/intents/:id/consent',
    {
      schema: {
        tags: ['Execution'],
        summary: 'Grant explicit consent to an Intent',
        params: idParamsSchema,
        response: {
          204: Type.Null(),
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      await system.execution.grantIntentConsent.execute(request.params.id);
      return reply.code(204).send(null);
    },
  );

  server.post(
    '/intents/:id/attempts',
    {
      schema: {
        tags: ['Execution'],
        summary: 'Attempt an executable Intent',
        params: idParamsSchema,
        response: {
          200: Type.Object({ outcome: Type.String() }),
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      return reply.send({
        outcome: await system.execution.executeIntent.execute(request.params.id),
      });
    },
  );
};
