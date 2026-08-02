import swagger from '@fastify/swagger';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { System } from '../../system/system.js';
import { createAuthHook } from './auth.js';
import { entryRoutes } from './entry.js';
import { registerErrorHandling } from './error.js';
import { executionRoutes } from './execution.js';
import { readMutationMode } from './mutation.js';
import { planningRoutes } from './planning.js';
import { proactivityRoutes } from './proactivity.js';
import { projectionRoutes } from './projection.js';
import { proposalRoutes } from './proposal.js';
import { reminderRoutes } from './reminder.js';
import { reviewRoutes } from './review.js';
import { ruleRoutes } from './rule.js';
import { stateRoutes } from './state.js';

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
        version: '2.1.0',
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
        { name: 'States' },
        { name: 'Execution' },
        { name: 'Rules' },
        { name: 'Planning' },
        { name: 'Reminders' },
        { name: 'Proactivity' },
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
      await protectedServer.register(stateRoutes, { system });
      await protectedServer.register(executionRoutes, { system });
      await protectedServer.register(ruleRoutes, { system });
      await protectedServer.register(planningRoutes, { system });
      await protectedServer.register(reminderRoutes, { system });
      await protectedServer.register(proactivityRoutes, { system });
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
      selectedItemId: '<<itemId>>',
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
