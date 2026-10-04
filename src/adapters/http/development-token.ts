import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import { createAccessToken } from './auth.js';

const sourcePattern = '^[a-z][a-zA-Z0-9]*$';

interface DevelopmentTokenOptions {
  readonly signingSecret: string;
}

/** Registers the unauthenticated token issuer available only in development. */
export const developmentTokenRoutes: FastifyPluginAsync<DevelopmentTokenOptions> = async (
  server,
  options,
) => {
  const api = server.withTypeProvider<TypeBoxTypeProvider>();

  api.post(
    '/api/token',
    {
      schema: {
        tags: ['System'],
        summary: 'Create a local development access token',
        security: [],
        querystring: Type.Object(
          {
            source: Type.Optional(Type.String({ pattern: sourcePattern })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({ token: Type.String() }),
        },
      },
    },
    async (request) => ({
      token: await createAccessToken(request.query.source ?? 'browser', options.signingSecret),
    }),
  );
};
