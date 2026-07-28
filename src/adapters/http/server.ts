import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { System } from '../../system/system.js';
import { createAuthHook } from './auth.js';
import { entryRoutes } from './entry.js';
import { registerErrorHandling } from './error.js';
import { readMutationMode } from './mutation.js';
import { projectionRoutes } from './projection.js';
import { proposalRoutes } from './proposal.js';
import { reviewRoutes } from './review.js';

export interface HttpServerOptions {
  readonly logger?: FastifyServerOptions['logger'];
  readonly signingSecret: string;
}

/**
 * Creates the HTTP adapter without binding it to a network port.
 */
export function createHttpServer(system: System, options: HttpServerOptions): FastifyInstance {
  const server = Fastify({
    bodyLimit: 1_048_576,
    logger: options.logger ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  registerErrorHandling(server);
  server.decorateRequest('identity');
  server.decorateRequest('mutationMode', 'readonly');

  server.get(
    '/api/health',
    {
      schema: {
        response: {
          200: Type.Object({
            status: Type.Literal('ok'),
          }),
        },
      },
    },
    async () => ({ status: 'ok' as const }),
  );

  server.register(
    async (protectedServer) => {
      protectedServer.addHook('onRequest', createAuthHook(options.signingSecret));
      protectedServer.addHook('onRequest', async (request) => {
        request.mutationMode = readMutationMode(request);
      });
      await protectedServer.register(entryRoutes, { system });
      await protectedServer.register(reviewRoutes, { system });
      await protectedServer.register(projectionRoutes, { system });
      await protectedServer.register(proposalRoutes, { proposals: system.proposals });
    },
    { prefix: '/api' },
  );

  return server;
}
