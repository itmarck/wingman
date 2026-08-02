import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { Review } from '../../modules/interpretation/domain/review.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import {
  cursorQuerySchema,
  errorSchema,
  idParamsSchema,
  mutationHeadersSchema,
  pageSchema,
} from './schema.js';

interface ReviewRoutesOptions {
  readonly system: System;
}

const summarySchema = Type.Object({
  id: Type.String(),
  kind: Type.Literal('referenceResolution'),
  status: Type.String(),
  interpretationId: Type.String(),
  entryId: Type.String(),
  createdAt: Type.String(),
});

const candidateSchema = Type.Object({
  id: Type.String(),
  label: Type.String(),
});

const resolutionSchema = Type.Object({
  reference: Type.String(),
  question: Type.String(),
  proposed: Type.Object({
    reference: Type.String(),
    profile: Type.Optional(Type.Object({ key: Type.String(), version: Type.Integer() })),
    referenceStatus: Type.Optional(
      Type.Union([Type.Literal('identified'), Type.Literal('uncertain')]),
    ),
  }),
  candidates: Type.Array(candidateSchema),
});

const decisionSchema = Type.Object(
  {
    reference: Type.String({ minLength: 1 }),
    selectedItemId: Type.Optional(
      Type.String({
        minLength: 1,
        description: 'Existing candidate Item to select; omit to confirm the proposed Item.',
      }),
    ),
  },
  { additionalProperties: false },
);

const detailSchema = Type.Intersect([
  summarySchema,
  Type.Object({
    resolution: resolutionSchema,
    decision: Type.Optional(decisionSchema),
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
        tags: ['Reviews'],
        summary: 'List reviews',
        querystring: cursorQuerySchema,
        response: {
          200: pageSchema(summarySchema),
          400: errorSchema,
          401: errorSchema,
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
        tags: ['Reviews'],
        summary: 'Read a review',
        params: idParamsSchema,
        response: {
          200: detailSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request) =>
      createDetail(await system.interpretation.getReview.execute(request.params.id)),
  );

  server.post(
    '/reviews/:id/resolution',
    {
      schema: {
        tags: ['Reviews'],
        summary: 'Resolve a review',
        headers: mutationHeadersSchema,
        params: idParamsSchema,
        body: Type.Object(
          {
            decision: decisionSchema,
          },
          {
            additionalProperties: false,
          },
        ),
        response: {
          202: Type.Object({
            proposal: proposalSchema,
          }),
          204: Type.Null(),
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      const input = {
        reviewId: request.params.id,
        decision: request.body.decision,
      };

      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [
            {
              operation: 'update',
              target: 'review',
              value: {
                id: request.params.id,
                decision: request.body.decision,
              },
            },
          ],
          () => system.interpretation.resolveReview.execute(input),
        );

        return reply.code(202).send({
          proposal: createProposalResponse(proposal),
        });
      }

      await system.interpretation.resolveReview.execute(input);

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
    resolution: {
      ...review.resolution,
      proposed: {
        ...review.resolution.proposed,
      },
      candidates: review.resolution.candidates.map((candidate) => ({ ...candidate })),
    },
    decision: review.decision ? { ...review.decision } : undefined,
    resolvedAt: review.resolvedAt,
  };
}
