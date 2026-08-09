import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import { errorSchema, idParamsSchema, mutationHeadersSchema } from './schema.js';

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
    async () => (await system.notification.service.list()).map(serialize),
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
    async (request) => serialize(await system.notification.service.read(request.params.id)),
  );
  server.post(
    '/notifications/:id/acknowledgement',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Acknowledge a launcher notification',
        headers: mutationHeadersSchema,
        params: idParamsSchema,
        response: {
          202: Type.Object({ proposal: proposalSchema }),
          204: Type.Null(),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [
            {
              operation: 'update',
              target: 'notificationAcknowledgement',
              value: { id: request.params.id },
            },
          ],
          () => system.notification.service.acknowledge(request.params.id),
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      await system.notification.service.acknowledge(request.params.id);
      return reply.code(204).send(null);
    },
  );
};

function serialize(notification: Awaited<ReturnType<System['notification']['service']['read']>>) {
  return {
    ...notification,
    evidence: [...notification.evidence],
    actions: ['acknowledge'] as ['acknowledge'],
  };
}
