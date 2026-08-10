import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { ProactivitySignal } from '../../modules/proactivity/domain/detector.js';
import type { FeedbackInput } from '../../modules/proactivity/operations/service.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { errorSchema, mutationHeadersSchema } from './schema.js';

interface Options {
  readonly system: System;
}
export const proactivityRoutes: FastifyPluginAsyncTypebox<Options> = async (server, { system }) => {
  server.get(
    '/suggestions',
    {
      schema: {
        tags: ['Proactivity'],
        summary: 'List explainable Suggestions',
        response: { 200: Type.Array(Type.Unknown()), 401: errorSchema },
      },
    },
    async () => [...(await system.proactivity.service.list())],
  );
  server.get(
    '/suggestions/:id',
    {
      schema: {
        tags: ['Proactivity'],
        summary: 'Read one Suggestion',
        params: Type.Object({ id: Type.String() }),
        response: { 200: Type.Unknown(), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => system.proactivity.service.read(request.params.id),
  );
  server.post(
    '/proactive-evaluations',
    {
      schema: {
        tags: ['Proactivity'],
        summary: 'Evaluate relevant deterministic detectors',
        headers: mutationHeadersSchema,
        body: Type.Unknown(),
        response: { 200: Type.Array(Type.Unknown()), 400: errorSchema, 401: errorSchema },
      },
    },
    async (request) => {
      requireMutation(request.mutationMode);
      return [...(await system.proactivity.service.evaluate(request.body as ProactivitySignal))];
    },
  );
  server.post(
    '/suggestions/:id/feedback',
    {
      schema: {
        tags: ['Proactivity'],
        summary: 'Record explicit Suggestion feedback',
        headers: mutationHeadersSchema,
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          kind: Type.Union(
            ['accepted', 'rejected', 'modified', 'postponed', 'expired', 'completed'].map((value) =>
              Type.Literal(value),
            ),
          ),
          reviewAt: Type.Optional(Type.String()),
          modification: Type.Optional(Type.Unknown()),
          note: Type.Optional(Type.String()),
        }),
        response: { 204: Type.Null(), 400: errorSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      requireMutation(request.mutationMode);
      await system.proactivity.service.feedback(request.params.id, request.body as FeedbackInput);
      return reply.code(204).send(null);
    },
  );
};
