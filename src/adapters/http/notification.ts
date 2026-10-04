import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { System } from '../../system/system.js';
import { errorSchema, idParamsSchema } from './schema.js';

interface Options {
  readonly system: System;
}

const notificationSchema = Type.Object({
  id: Type.String(),
  automationId: Type.String(),
  occurrenceId: Type.String(),
  subjectItemId: Type.String(),
  message: Type.String(),
  priority: Type.Integer(),
  deliveredAt: Type.String(),
  evidence: Type.Array(Type.Unknown()),
  actions: Type.Tuple([Type.Literal('acknowledge')]),
});

export const notificationRoutes: FastifyPluginAsyncTypebox<Options> = async (
  server,
  { system },
) => {
  server.get(
    '/notifications',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'List compact active launcher notifications',
        response: { 200: Type.Array(notificationSchema), 401: errorSchema },
      },
    },
    async () => (await system.execution.notifications.list()).map(serialize),
  );
  server.get(
    '/notifications/:id',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Inspect an active launcher notification',
        params: idParamsSchema,
        response: { 200: notificationSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => serialize(await system.execution.notifications.read(request.params.id)),
  );
  server.post(
    '/notifications/:id/acknowledgement',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Acknowledge a launcher notification',
        params: idParamsSchema,
        response: {
          204: Type.Null(),
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      await system.execution.notifications.acknowledge(request.params.id);
      return reply.code(204).send(null);
    },
  );
};

function serialize(
  notification: Awaited<ReturnType<System['execution']['notifications']['read']>>,
) {
  return {
    ...notification,
    evidence: [...notification.evidence],
    actions: ['acknowledge'] as ['acknowledge'],
  };
}
