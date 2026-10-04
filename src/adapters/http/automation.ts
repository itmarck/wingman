import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { RegisterAutomationInput } from '../../modules/automation/operations/register.js';
import type { System } from '../../system/system.js';
import { errorSchema, idParamsSchema } from './schema.js';

interface AutomationRoutesOptions {
  readonly system: System;
}
export const automationRoutes: FastifyPluginAsyncTypebox<AutomationRoutesOptions> = async (
  server,
  { system },
) => {
  server.get(
    '/automations',
    {
      schema: {
        tags: ['Automations'],
        summary: 'List declarative Automations',
        response: { 200: Type.Array(Type.Unknown()), 401: errorSchema },
      },
    },
    async () => [...(await system.automation.store.list())],
  );
  server.post(
    '/automations',
    {
      schema: {
        tags: ['Automations'],
        summary: 'Register a declarative Automation',
        body: Type.Unknown(),
        response: {
          201: Type.Object({ id: Type.String() }),
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const input = request.body as RegisterAutomationInput;
      return reply
        .code(201)
        .send({ id: await system.automation.registerAutomation.execute(input) });
    },
  );
  server.post(
    '/automations/:id/control',
    {
      schema: {
        tags: ['Automations'],
        summary: 'Pause, resume or stop an Automation',
        params: idParamsSchema,
        body: Type.Object({
          action: Type.Union([Type.Literal('pause'), Type.Literal('resume'), Type.Literal('stop')]),
        }),
        response: {
          204: Type.Null(),
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      await system.automation.controlAutomation.execute(request.params.id, request.body.action);
      return reply.code(204).send(null);
    },
  );
};
