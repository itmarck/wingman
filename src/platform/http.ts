import swagger from '@fastify/swagger';
import Fastify from 'fastify';
import { type Static, type TSchema, Type } from 'typebox';
import { createAccessToken, createAuthHook } from './auth.js';
import * as content from '../core/content.js';
import {
  areas,
  captureSchema,
  collectionSchema,
  dateSchema,
  idSchema,
  linkSchema,
  recordSchema,
  settingsSchema,
  temporalSchema,
  validate,
} from '../core/model.js';
import type { Database } from './storage.js';
import * as work from '../core/work.js';

/** The launcher API, plus health and development authentication. */
export async function createServer(db: Database, secret: string, development = false) {
  const app = Fastify({
    logger: true,
    bodyLimit: 65536,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(swagger, {
    openapi: {
      info: { title: 'Wingman', version: '4.0.0' },
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
  });
  app.setErrorHandler((error, request, reply) => {
    const failure = error as { statusCode?: number; code?: string; message?: string };
    const status =
      failure.statusCode ??
      (['23505', '23503', '23514', '22P02', '22007', '22008'].includes(failure.code ?? '')
        ? 409
        : 500);
    if (status >= 500) request.log.error(error);
    reply.code(status).send({
      error: {
        message: status >= 500 ? 'Internal server error' : (failure.message ?? 'Invalid request'),
      },
    });
  });
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ready', async () => {
    await db.query('SELECT id FROM settings WHERE id=true');
    return { ok: true };
  });
  app.get('/api/openapi', async () => app.swagger());
  if (development) {
    app.post(
      '/api/token',
      {
        schema: {
          querystring: Type.Object(
            { source: Type.Optional(Type.String({ pattern: '^[a-z][a-zA-Z0-9]*$' })) },
            { additionalProperties: false },
          ),
        },
      },
      async (request) => {
        const { source = 'browser' } = request.query as { source?: string };
        return { token: await createAccessToken(source, secret) };
      },
    );
  }
  await app.register(async (api) => {
    api.addHook('onRequest', createAuthHook(secret));
    const security = [{ bearer: [] }];
    function post<S extends TSchema>(
      path: string,
      schema: S,
      action: (body: Static<S>, source: string) => Promise<unknown>,
    ) {
      api.post(path, { schema: { body: schema, security } }, async (request) => {
        validate(schema, request.body);
        return action(request.body, request.identity.source);
      });
    }
    post('/api/content/capture', captureSchema, (body, source) =>
      content.capture(db, source, body),
    );
    post('/api/content/records', recordSchema, (body) => content.saveRecord(db, body));
    post('/api/collections', collectionSchema, (body) => content.saveCollection(db, body));
    post('/api/references', linkSchema, (body) => content.saveLink(db, body));
    post('/api/references/remove', linkSchema, (body) => content.removeLink(db, body));
    post(
      '/api/work/complete',
      Type.Object({ id: idSchema, finished: Type.Boolean() }, { additionalProperties: false }),
      (body) => work.complete(db, body.id, body.finished),
    );
    post(
      '/api/notifications/respond',
      Type.Object(
        {
          id: idSchema,
          action: Type.Union([Type.Literal('acknowledge'), Type.Literal('defer')]),
          until: Type.Optional(temporalSchema),
        },
        { additionalProperties: false },
      ),
      (body) => work.respond(db, body.id, body.action, body.until ?? undefined),
    );
    post('/api/settings', settingsSchema, (body) => work.saveSettings(db, body));
    api.get('/api/catalog', { schema: { security } }, async () => ({
      areas,
      presets: ['organize', 'taskCapture'],
      fieldTypes: ['text', 'number', 'boolean', 'date', 'select', 'reference'],
      settings: await work.readSettings(db),
    }));
    api.get(
      '/api/collections',
      {
        schema: {
          security,
          querystring: Type.Object(
            {
              id: Type.Optional(idSchema),
              offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 1000000 })),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request) => {
        const query = request.query as { id?: string; offset?: number };
        return content.collections(db, query.id, query.offset);
      },
    );
    api.get(
      '/api/references/search',
      {
        schema: {
          security,
          querystring: Type.Object(
            {
              text: Type.String({ minLength: 1, maxLength: 200 }),
              collectionId: Type.Optional(idSchema),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request) => {
        const query = request.query as { text: string; collectionId?: string };
        return content.searchReferences(db, query.text, query.collectionId);
      },
    );
    api.get(
      '/api/references',
      {
        schema: {
          security,
          querystring: Type.Object({ id: idSchema }, { additionalProperties: false }),
        },
      },
      async (request) => content.queryLinks(db, (request.query as { id: string }).id),
    );
    api.get(
      '/api/work/day',
      {
        schema: {
          security,
          querystring: Type.Object(
            {
              from: dateSchema,
              to: Type.Optional(dateSchema),
              timezone: Type.Optional(Type.String({ maxLength: 100 })),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request) => {
        const query = request.query as { from: string; to?: string; timezone?: string };
        return work.day(
          db,
          query.from,
          query.to,
          query.timezone ?? (await work.readSettings(db)).timezone,
        );
      },
    );
    api.get('/api/notifications', { schema: { security } }, async () => work.notifications(db));
  });
  await app.ready();
  return app;
}
