import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { System } from '../../system/system.js';
import { errorSchema, keyParamsSchema } from './schema.js';

interface ProjectionRoutesOptions {
  readonly system: System;
}

const metadataSchema = Type.Object({
  key: Type.String(),
  name: Type.String(),
  description: Type.String(),
});

export const projectionRoutes: FastifyPluginAsyncTypebox<ProjectionRoutesOptions> = async (
  server,
  { system },
) => {
  server.get(
    '/projections',
    {
      schema: {
        tags: ['Projections'],
        summary: 'List available projections',
        response: {
          200: Type.Array(metadataSchema),
          401: errorSchema,
        },
      },
    },
    () => [...system.projection.list()],
  );

  server.get(
    '/projections/:key',
    {
      schema: {
        tags: ['Projections'],
        summary: 'Read a projection',
        params: keyParamsSchema,
        response: {
          200: Type.Object({
            metadata: metadataSchema,
            data: Type.Unknown(),
          }),
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    (request) => system.projection.read(request.params.key),
  );
};
