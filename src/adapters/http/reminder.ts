import { type FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox';
import type { CreateReminderInput } from '../../modules/reminder/operations/manage.js';
import type { System } from '../../system/system.js';
import { requireMutation } from './mutation.js';
import { createProposalResponse, proposalSchema } from './proposal.js';
import { errorSchema, mutationHeadersSchema } from './schema.js';

interface Options {
  readonly system: System;
}
const scheduleSchema = Type.Object({
  occurrences: Type.Array(Type.String(), { minItems: 1 }),
  quietHours: Type.Optional(
    Type.Object({
      startHour: Type.Integer({ minimum: 0, maximum: 23 }),
      endHour: Type.Integer({ minimum: 0, maximum: 23 }),
    }),
  ),
  expiresAt: Type.Optional(Type.String()),
});
const createSchema = Type.Object({
  entryId: Type.String(),
  subjectItemId: Type.Optional(Type.String()),
  subject: Type.Optional(Type.String()),
  message: Type.String({ minLength: 1 }),
  temporal: Type.Optional(
    Type.Object({ from: Type.Optional(Type.String()), to: Type.Optional(Type.String()) }),
  ),
  occurrences: Type.Array(Type.String(), { minItems: 1 }),
  quietHours: Type.Optional(
    Type.Object({
      startHour: Type.Integer({ minimum: 0, maximum: 23 }),
      endHour: Type.Integer({ minimum: 0, maximum: 23 }),
    }),
  ),
  expiresAt: Type.Optional(Type.String()),
  maxOccurrences: Type.Optional(Type.Integer({ minimum: 1 })),
  authorized: Type.Optional(Type.Boolean()),
});

export const reminderRoutes: FastifyPluginAsyncTypebox<Options> = async (server, { system }) => {
  server.get(
    '/reminders',
    {
      schema: {
        tags: ['Reminders'],
        summary: 'List explainable reminders',
        response: { 200: Type.Array(Type.Unknown()), 401: errorSchema },
      },
    },
    async () => [...(await system.reminder.manage.list())],
  );
  server.get(
    '/reminders/:id',
    {
      schema: {
        tags: ['Reminders'],
        summary: 'Explain a reminder',
        params: Type.Object({ id: Type.String() }),
        response: { 200: Type.Unknown(), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request) => system.reminder.manage.read(request.params.id),
  );
  server.post(
    '/reminders',
    {
      schema: {
        tags: ['Reminders'],
        summary: 'Compose an explicit reminder workflow',
        headers: mutationHeadersSchema,
        body: createSchema,
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
      const input = request.body as CreateReminderInput;
      if (mode === 'approval') {
        const proposal = system.proposals.create(
          [{ operation: 'create', target: 'reminder', value: input }],
          async () => {
            await system.reminder.manage.create(input);
          },
        );
        return reply.code(202).send({ proposal: createProposalResponse(proposal) });
      }
      return reply.code(201).send({ id: await system.reminder.manage.create(input) });
    },
  );
  server.post(
    '/reminders/:id/cancel',
    {
      schema: {
        tags: ['Reminders'],
        summary: 'Cancel a reminder',
        headers: mutationHeadersSchema,
        params: Type.Object({ id: Type.String() }),
        response: { 204: Type.Null(), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      requireMutation(request.mutationMode);
      await system.reminder.manage.cancel(request.params.id);
      return reply.code(204).send(null);
    },
  );
  server.post(
    '/reminders/:id/reschedule',
    {
      schema: {
        tags: ['Reminders'],
        summary: 'Replace a reminder schedule policy',
        headers: mutationHeadersSchema,
        params: Type.Object({ id: Type.String() }),
        body: scheduleSchema,
        response: { 204: Type.Null(), 400: errorSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      requireMutation(request.mutationMode);
      await system.reminder.manage.reschedule(request.params.id, request.body);
      return reply.code(204).send(null);
    },
  );
};
