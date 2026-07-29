import swagger from '@fastify/swagger';
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

  void server.register(swagger, {
    openapi: {
      info: {
        title: 'Wingman API',
        description: 'Authenticated API for capturing, interpreting and projecting knowledge.',
        version: '2.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'System' },
        { name: 'Entries' },
        { name: 'Reviews' },
        { name: 'Projections' },
        { name: 'Proposals' },
      ],
    },
  });

  server.register(async (publicServer) => {
    publicServer.get(
      '/api/health',
      {
        schema: {
          tags: ['System'],
          summary: 'Check server health',
          security: [],
          response: {
            200: Type.Object({
              status: Type.Literal('ok'),
            }),
          },
        },
      },
      async () => ({ status: 'ok' as const }),
    );

    publicServer.get(
      '/api/openapi.json',
      {
        schema: {
          tags: ['System'],
          summary: 'Read the current OpenAPI document',
          security: [],
        },
      },
      async (request) => ({
        ...createOpenApiDocument(server),
        servers: [
          {
            url: `${request.protocol}://${request.host}`,
          },
        ],
      }),
    );
  });

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

function createOpenApiDocument(server: FastifyInstance) {
  const document = server.swagger();
  const paths = document.paths ?? {};
  const publicPaths = ['/api/health', '/api/openapi.json'];

  for (const path of publicPaths) {
    const operation = paths[path]?.get;

    if (operation) {
      operation.security = [];
    }
  }

  setJsonRequestExample(paths['/api/entries']?.post, {
    externalId: '<<$guid>>',
    content: {
      kind: 'text',
      text: 'Wingman preserves knowledge from captured entries.',
    },
  });
  setJsonRequestExample(paths['/api/reviews/{id}/resolution']?.post, {
    decision: {
      reference: 'reference-from-review',
      selectedConceptId: '<<conceptId>>',
    },
  });

  return document;
}

function setJsonRequestExample(operation: object | undefined, example: unknown): void {
  const requestBody = operation && 'requestBody' in operation ? operation.requestBody : undefined;

  if (
    typeof requestBody !== 'object' ||
    requestBody === null ||
    !('content' in requestBody) ||
    typeof requestBody.content !== 'object' ||
    requestBody.content === null
  ) {
    return;
  }

  const content = requestBody.content as Record<string, { example?: unknown }>;
  const json = content['application/json'];

  if (json) {
    json.example = example;
  }
}
