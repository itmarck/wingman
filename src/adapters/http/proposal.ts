import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import { ConflictError, NotFoundError } from '../../system/error.js';
import {
  type Proposal,
  ProposalConflictError,
  ProposalNotFoundError,
  type ProposalRegistry,
} from '../../system/proposal.js';
import { requireMutation } from './mutation.js';
import { errorSchema, idParamsSchema } from './schema.js';

interface ProposalRoutesOptions {
  readonly proposals: ProposalRegistry;
}

const changeSchema = Type.Object({
  operation: Type.Union([Type.Literal('create'), Type.Literal('update'), Type.Literal('upsert')]),
  target: Type.String(),
  value: Type.Any(),
});

export const proposalSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  changes: Type.Array(changeSchema),
  approveUrl: Type.String(),
  rejectUrl: Type.String(),
});

export const proposalRoutes: FastifyPluginAsyncTypebox<ProposalRoutesOptions> = async (
  server,
  { proposals },
) => {
  server.get(
    '/proposals',
    {
      schema: {
        response: {
          200: Type.Object({
            items: Type.Array(proposalSchema),
          }),
        },
      },
    },
    async () => ({
      items: proposals.list().map(createProposalResponse),
    }),
  );

  server.get(
    '/proposals/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: proposalSchema,
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const proposal = proposals.find(request.params.id);

      if (!proposal) {
        throw new NotFoundError(`Proposal ${request.params.id} does not exist`);
      }

      return createProposalResponse(proposal);
    },
  );

  server.post(
    '/proposals/:id/approve',
    {
      schema: {
        params: idParamsSchema,
        response: {
          204: Type.Null(),
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      requireMutation(request.mutationMode);

      try {
        await proposals.approve(request.params.id);
      } catch (error) {
        translateProposalError(error);
      }

      return reply.code(204).send(null);
    },
  );

  server.post(
    '/proposals/:id/reject',
    {
      schema: {
        params: idParamsSchema,
        response: {
          204: Type.Null(),
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      requireMutation(request.mutationMode);

      try {
        proposals.reject(request.params.id);
      } catch (error) {
        translateProposalError(error);
      }

      return reply.code(204).send(null);
    },
  );
};

export function createProposalResponse(proposal: Proposal) {
  return {
    ...proposal,
    changes: proposal.changes.map((change) => ({ ...change })),
    approveUrl: `/api/proposals/${proposal.id}/approve`,
    rejectUrl: `/api/proposals/${proposal.id}/reject`,
  };
}

function translateProposalError(error: unknown): never {
  if (error instanceof ProposalNotFoundError) {
    throw new NotFoundError(error.message);
  }

  if (error instanceof ProposalConflictError) {
    throw new ConflictError(error.message);
  }

  throw error;
}
