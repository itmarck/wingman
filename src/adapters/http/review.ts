import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { Review } from '../../modules/interpretation/domain/review.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { cursorQuerySchema, errorSchema, idParamsSchema, pageSchema } from './schema.js';

interface ReviewRoutesOptions {
  readonly system: System;
}

const summarySchema = Type.Object({
  id: Type.String(),
  kind: Type.String(),
  status: Type.String(),
  interpretationId: Type.String(),
  entryId: Type.String(),
  createdAt: Type.String(),
});

const candidateSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  aliases: Type.Array(Type.String()),
  definition: Type.String(),
});

const ambiguitySchema = Type.Object({
  reference: Type.String(),
  proposed: Type.Object({
    reference: Type.String(),
    name: Type.String(),
    aliases: Type.Optional(Type.Array(Type.String())),
    definition: Type.String(),
  }),
  candidates: Type.Array(candidateSchema),
});

const decisionSchema = Type.Object(
  {
    reference: Type.String({ minLength: 1 }),
    selectedConceptId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const detailSchema = Type.Intersect([
  summarySchema,
  Type.Object({
    ambiguities: Type.Array(ambiguitySchema),
    decisions: Type.Array(decisionSchema),
    resolvedAt: Type.Optional(Type.String()),
  }),
]);

export const reviewRoutes: FastifyPluginAsyncTypebox<ReviewRoutesOptions> = async (
  server,
  { system },
) => {
  server.get(
    '/reviews',
    {
      schema: {
        querystring: cursorQuerySchema,
        response: {
          200: pageSchema(summarySchema),
          400: errorSchema,
        },
      },
    },
    async (request) => {
      const page = await system.interpretation.listReviews.execute(request.query.cursor);

      return {
        items: page.items.map(createSummary),
        nextCursor: page.nextCursor,
      };
    },
  );

  server.get(
    '/reviews/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: detailSchema,
          404: errorSchema,
        },
      },
    },
    async (request) =>
      createDetail(await system.interpretation.getReview.execute(request.params.id)),
  );

  server.post(
    '/reviews/:id/decisions',
    {
      schema: {
        params: idParamsSchema,
        body: Type.Object(
          {
            decisions: Type.Array(decisionSchema, { minItems: 1, maxItems: 1 }),
          },
          { additionalProperties: false },
        ),
        response: {
          204: Type.Null(),
          400: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      requireMutation(request.mutationMode);
      await system.interpretation.resolveReview.execute({
        reviewId: request.params.id,
        decision: request.body.decisions[0],
      });

      return reply.code(204).send(null);
    },
  );
};

function createSummary(review: Review) {
  return {
    id: review.id,
    kind: review.kind,
    status: review.status,
    interpretationId: review.interpretationId,
    entryId: review.entryId,
    createdAt: review.createdAt,
  };
}

function createDetail(review: Review) {
  return {
    ...createSummary(review),
    ambiguities: [review.ambiguity].map((ambiguity) => ({
      ...ambiguity,
      proposed: {
        ...ambiguity.proposed,
        aliases: ambiguity.proposed.aliases ? [...ambiguity.proposed.aliases] : undefined,
      },
      candidates: ambiguity.candidates.map((candidate) => ({
        ...candidate,
        aliases: [...candidate.aliases],
      })),
    })),
    decisions: review.decision ? [{ ...review.decision }] : [],
    resolvedAt: review.resolvedAt,
  };
}
