import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { RegisterAutomationInput } from '../../modules/automation/operations/register.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import { errorSchema, idParamsSchema, mutationHeadersSchema } from './schema.js';

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
        headers: mutationHeadersSchema,
        body: Type.Unknown(),
        response: {
          201: Type.Object({ id: Type.String() }),
          202: Type.Object({ proposal: proposalSchema }),
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      const input = request.body as RegisterAutomationInput;
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [{ operation: 'create', target: 'automation', value: input }],
          async () => {
            await system.automation.registerAutomation.execute(input);
          },
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
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
        headers: mutationHeadersSchema,
        params: idParamsSchema,
        body: Type.Object({
          action: Type.Union([Type.Literal('pause'), Type.Literal('resume'), Type.Literal('stop')]),
        }),
        response: {
          202: Type.Object({ proposal: proposalSchema }),
          204: Type.Null(),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = requireMutation(request.mutationMode);
      const apply = () =>
        system.automation.controlAutomation.execute(request.params.id, request.body.action);
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [
            {
              operation: 'update',
              target: 'automation',
              value: { id: request.params.id, action: request.body.action },
            },
          ],
          apply,
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      await apply();
      return reply.code(204).send(null);
    },
  );
};
