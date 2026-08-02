import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { PersistStateInput } from '../../modules/state/operations/create.js';
import { stateViews } from '../../modules/state/operations/list.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import { errorSchema, mutationHeadersSchema } from './schema.js';

interface StateRoutesOptions {
  readonly system: System;
}
const locatorSchema = Type.Union([
  Type.Object({ kind: Type.Literal('page'), page: Type.Integer({ minimum: 1 }) }),
  Type.Object({ kind: Type.Literal('paragraph'), paragraph: Type.Integer({ minimum: 1 }) }),
  Type.Object({ kind: Type.Literal('timestamp'), seconds: Type.Number({ minimum: 0 }) }),
]);
const stateInputSchema = Type.Object(
  {
    modality: Type.Union(
      ['observed', 'believed', 'desired', 'required', 'forbidden', 'predicted'].map((value) =>
        Type.Literal(value),
      ),
    ),
    condition: Type.Unknown(),
    author: Type.Object({
      kind: Type.Union([Type.Literal('user'), Type.Literal('system'), Type.Literal('inference')]),
      id: Type.Optional(Type.String()),
    }),
    evidence: Type.Array(
      Type.Object({ entryId: Type.String(), sourceLocators: Type.Array(locatorSchema) }),
      { minItems: 1 },
    ),
    validTime: Type.Optional(
      Type.Object({ from: Type.Optional(Type.String()), to: Type.Optional(Type.String()) }),
    ),
    confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  },
  { additionalProperties: false },
);

export const stateRoutes: FastifyPluginAsyncTypebox<StateRoutesOptions> = async (
  server,
  { system },
) => {
  server.get(
    '/states/:view',
    {
      schema: {
        tags: ['States'],
        summary: 'Read a modality-aware State view',
        params: Type.Object({ view: Type.Union(stateViews.map((view) => Type.Literal(view))) }),
        response: { 200: Type.Array(Type.Unknown()), 401: errorSchema },
      },
    },
    async (request) => [...(await system.state.listView.execute(request.params.view))],
  );

  server.post(
    '/states',
    {
      schema: {
        tags: ['States'],
        summary: 'Preserve non-derivable modal State',
        headers: mutationHeadersSchema,
        body: stateInputSchema,
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
      const input = request.body as PersistStateInput;
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [{ operation: 'create', target: 'state', value: input }],
          async () => {
            await system.state.createState.execute(input);
          },
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      const id = await system.state.createState.execute(input);
      return reply.code(201).send({ id });
    },
  );
};
