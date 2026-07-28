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
        response: {
          200: Type.Array(metadataSchema),
        },
      },
    },
    () => [...system.projection.listProjections.execute()],
  );

  server.get(
    '/projections/:key',
    {
      schema: {
        params: keyParamsSchema,
        response: {
          200: Type.Object({
            metadata: metadataSchema,
            data: Type.Unknown(),
          }),
          404: errorSchema,
        },
      },
    },
    (request) => system.projection.readProjection.execute(request.params.key),
  );
};
