import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { RegisterRuleInput } from '../../modules/rule/operations/register.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import { errorSchema, idParamsSchema, mutationHeadersSchema } from './schema.js';

interface RuleRoutesOptions {
  readonly system: System;
}
export const ruleRoutes: FastifyPluginAsyncTypebox<RuleRoutesOptions> = async (
  server,
  { system },
) => {
  server.get(
    '/rules',
    {
      schema: {
        tags: ['Rules'],
        summary: 'List declarative Rules',
        response: { 200: Type.Array(Type.Unknown()), 401: errorSchema },
      },
    },
    async () => [...(await system.rule.store.list())],
  );
  server.post(
    '/rules',
    {
      schema: {
        tags: ['Rules'],
        summary: 'Register a declarative Rule',
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
      const input = request.body as RegisterRuleInput;
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [{ operation: 'create', target: 'rule', value: input }],
          async () => {
            await system.rule.registerRule.execute(input);
          },
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      return reply.code(201).send({ id: await system.rule.registerRule.execute(input) });
    },
  );
  server.post(
    '/rules/:id/control',
    {
      schema: {
        tags: ['Rules'],
        summary: 'Pause, resume or stop a Rule',
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
      const apply = () => system.rule.controlRule.execute(request.params.id, request.body.action);
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [
            {
              operation: 'update',
              target: 'rule',
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
