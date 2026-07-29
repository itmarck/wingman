import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { EntryStatusResult } from '../../modules/interpretation/operations/status.js';
import { ConflictError } from '../../system/error.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import { cursorQuerySchema, errorSchema, idParamsSchema, pageSchema } from './schema.js';

interface EntryRoutesOptions {
  readonly system: System;
}

const contentSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('text'),
    text: Type.String({ minLength: 1 }),
  }),
  Type.Object({
    kind: Type.Literal('url'),
    url: Type.String({ minLength: 1 }),
  }),
]);

const entrySchema = Type.Object({
  id: Type.String(),
  content: contentSchema,
  origin: Type.Object({
    source: Type.String(),
    externalId: Type.Optional(Type.String()),
  }),
  capturedAt: Type.String(),
});

const statusSchema = Type.Object({
  entryId: Type.String(),
  interpretationId: Type.String(),
  status: Type.String(),
  attempts: Type.Number(),
  updatedAt: Type.String(),
  availableAt: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
  reviewIds: Type.Array(Type.String()),
});

export const entryRoutes: FastifyPluginAsyncTypebox<EntryRoutesOptions> = async (
  server,
  { system },
) => {
  server.post(
    '/entries',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Capture an entry',
        body: Type.Object(
          {
            content: contentSchema,
            externalId: Type.String({ minLength: 1 }),
          },
          {
            additionalProperties: false,
          },
        ),
        response: {
          202: Type.Union([
            Type.Object({
              id: Type.String(),
              status: Type.String(),
            }),
            Type.Object({
              proposal: proposalSchema,
            }),
          ]),
          400: errorSchema,
          403: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      const input = {
        content: request.body.content,
        origin: {
          source: request.identity.source,
          externalId: request.body.externalId,
        },
      };

      if (mode === 'approval') {
        const prepared = system.capture.captureEntry.prepare(input);
        const proposal = system.proposals.create(
          [
            {
              operation: 'create',
              target: 'entry',
              value: prepared.entry,
            },
            {
              operation: 'create',
              target: 'interpretation',
              value: prepared.interpretation,
            },
          ],
          async () => {
            const storedId = await system.capture.captureEntry.commit(prepared);

            if (storedId !== prepared.entry.id) {
              throw new ConflictError('Capture Proposal became stale');
            }
          },
        );

        return reply.code(202).send({
          proposal: createProposalResponse(proposal),
        });
      }

      const id = await system.capture.captureEntry.execute(input);
      const status = await system.interpretation.getEntryStatus.execute(id);

      return reply.code(202).send({
        id,
        status: status.status,
      });
    },
  );

  server.get(
    '/entries',
    {
      schema: {
        tags: ['Entries'],
        summary: 'List entries',
        querystring: cursorQuerySchema,
        response: {
          200: pageSchema(entrySchema),
          400: errorSchema,
        },
      },
    },
    async (request) => {
      const page = await system.capture.listEntries.execute(request.query.cursor);

      return {
        items: [...page.items],
        nextCursor: page.nextCursor,
      };
    },
  );

  server.get(
    '/entries/:id',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Read an entry',
        params: idParamsSchema,
        response: {
          200: entrySchema,
          404: errorSchema,
        },
      },
    },
    (request) => system.capture.getEntry.execute(request.params.id),
  );

  server.get(
    '/entries/:id/status',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Read entry interpretation status',
        params: idParamsSchema,
        response: {
          200: statusSchema,
          404: errorSchema,
        },
      },
    },
    async (request) =>
      createStatus(await system.interpretation.getEntryStatus.execute(request.params.id)),
  );

  server.post(
    '/entries/:id/retry',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Retry entry interpretation',
        params: idParamsSchema,
        response: {
          202: Type.Union([
            statusSchema,
            Type.Object({
              proposal: proposalSchema,
            }),
          ]),
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);

      if (mode === 'approval') {
        const interpretation = await system.interpretation.retryEntry.prepare(request.params.id);
        const proposal = system.proposals.create(
          [
            {
              operation: 'update',
              target: 'interpretation',
              value: interpretation,
            },
          ],
          () => system.interpretation.retryEntry.commit(interpretation),
        );

        return reply.code(202).send({
          proposal: createProposalResponse(proposal),
        });
      }

      await system.interpretation.retryEntry.execute(request.params.id);

      const status = await system.interpretation.getEntryStatus.execute(request.params.id);

      return reply.code(202).send(createStatus(status));
    },
  );
};

function createStatus(status: EntryStatusResult) {
  return {
    ...status,
    reviewIds: [...status.reviewIds],
  };
}
