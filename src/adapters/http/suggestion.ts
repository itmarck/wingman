import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { SuggestionSignal } from '../../modules/suggestion/domain/detector.js';
import type { FeedbackInput } from '../../modules/suggestion/operations/service.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { errorSchema, mutationHeadersSchema } from './schema.js';

interface Options {
  readonly system: System;
}
export const suggestionRoutes: FastifyPluginAsyncTypebox<Options> = async (server, { system }) => {
  server.get(
    '/suggestions',
    {
      schema: {
        tags: ['Suggestions'],
        summary: 'List explainable Suggestions',
        response: { 200: Type.Array(Type.Unknown()), 401: errorSchema },
      },
    },
    async () => [...(await system.suggestion.service.list())],
  );
  server.get(
    '/suggestions/:id',
    {
      schema: {
        tags: ['Suggestions'],
        summary: 'Read one Suggestion',
        params: Type.Object({ id: Type.String() }),
        response: { 200: Type.Unknown(), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => system.suggestion.service.read(request.params.id),
  );
  server.post(
    '/suggestions/evaluations',
    {
      schema: {
        tags: ['Suggestions'],
        summary: 'Evaluate relevant deterministic detectors',
        headers: mutationHeadersSchema,
        body: Type.Unknown(),
        response: { 200: Type.Array(Type.Unknown()), 400: errorSchema, 401: errorSchema },
      },
    },
    async (request) => {
      requireMutation(request.mutationMode);
      return [...(await system.suggestion.service.evaluate(request.body as SuggestionSignal))];
    },
  );
  server.post(
    '/suggestions/:id/feedback',
    {
      schema: {
        tags: ['Suggestions'],
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
      await system.suggestion.service.feedback(request.params.id, request.body as FeedbackInput);
      return reply.code(204).send(null);
    },
  );
};
