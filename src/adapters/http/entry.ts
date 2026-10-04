import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { EntryStatusResult } from '../../modules/interpretation/operations/status.js';
import type { System } from '../../system/system.js';
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
  declarations: Type.Array(Type.Unknown()),
  declarationStatus: Type.String(),
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
          202: Type.Object({ id: Type.String(), status: Type.String() }),
          400: errorSchema,
          401: errorSchema,
          409: errorSchema,
          415: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const input = {
        content: request.body.content,
        origin: {
          source: request.identity.source,
          externalId: request.body.externalId,
        },
      };

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
          401: errorSchema,
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
          401: errorSchema,
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
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const status = await system.interpretation.getEntryStatus.execute(request.params.id);

      return createStatus(status);
    },
  );

  server.post(
    '/entries/:id/retry',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Retry entry interpretation',
        params: idParamsSchema,
        response: {
          202: statusSchema,
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
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
    declarations: [...status.declarations],
  };
}
