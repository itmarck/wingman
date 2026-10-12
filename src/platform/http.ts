import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { type TSchema, Type } from 'typebox';
import * as collections from '../core/collections.js';
import * as entries from '../core/entries.js';
import * as links from '../core/links.js';
import {
  areas,
  captureSchema,
  collectionPatchSchema,
  collectionSchema,
  contextSchema,
  contexts,
  dateSchema,
  entryFilterSchema,
  entryPatchSchema,
  fieldTypes,
  idSchema,
  kinds,
  linkSchema,
  preferenceSchema,
  projectSchema,
  recordColumns,
  recordPatchSchema,
  recordSchema,
  validate,
} from '../core/model.js';
import * as processing from '../core/processing.js';
import { catalog } from '../core/questions.js';
import { createAccessToken, createAuthHook, verifyAuthorization } from './auth.js';
import type { Database } from './storage.js';
import { track } from './telemetry.js';

type Input = { params: Record<string, string>; query: never; body: never };
type Handler = (input: Input, request: FastifyRequest) => Promise<unknown>;
type Schemas = { params?: TSchema; query?: TSchema; body?: TSchema };
const idParams = Type.Object({ id: idSchema });
const panelRoot = fileURLToPath(new URL('../../panel', import.meta.url));

/** The launcher API, the panel's internal routes and the static panel. */
export async function createServer(db: Database, secret: string, development = false) {
  const app = Fastify({
    logger: true,
    bodyLimit: 65536,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: true } },
  });
  await app.register(swagger, {
    openapi: {
      info: { title: 'Wingman', version: '5.0.0' },
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
  // Private system: nothing on this domain should be indexed by search engines.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  });
  app.get('/robots.txt', async (_request, reply) =>
    reply.type('text/plain').send('User-agent: *\nDisallow: /\n'),
  );
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ready', async () => {
    await db.query('SELECT 1 FROM collections LIMIT 1');
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
  if (existsSync(panelRoot))
    await app.register(async (panel) => {
      // The browser sends the API token itself (e.g. via an extension); there is no login page.
      panel.addHook('onRequest', async (request, reply) => {
        if (!request.headers.authorization) return page(reply, 404, 'Not found');
        const identity = await verifyAuthorization(request.headers.authorization, secret);
        if (!identity) return page(reply, 401, 'Unauthorized');
        if (identity.source !== 'panel') return page(reply, 403, 'Forbidden');
      });
      await panel.register(fastifyStatic, { root: panelRoot });
    });
  await app.register(async (api) => {
    api.addHook('onRequest', createAuthHook(secret));
    // Separation of responsibilities: only panel tokens use the panel's routes.
    api.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/admin/') && request.identity.source !== 'panel')
        return reply.code(403).send({ error: { message: 'Panel token required' } });
    });
    api.addHook('onResponse', async (request, reply) => {
      if (request.headers['x-background']) return;
      track(
        db,
        'request',
        {
          method: request.method,
          route: request.routeOptions.url,
          status: reply.statusCode,
          source: request.identity?.source,
        },
        reply.elapsedTime,
        (error) => request.log.error(error),
      );
    });
    launcherRoutes(api, db);
    panelRoutes(api, db);
  });
  await app.ready();
  return app;
}

const errorPages: Record<number, string> = {
  401: 'The Authorization header has an invalid or expired token.',
  403: 'This token cannot open the panel. Use a token with source=panel.',
  404: 'The page you are looking for does not exist.',
};

/** An error page with the panel's look; inline because panel assets require a token. */
function page(reply: FastifyReply, status: number, title: string) {
  const description = errorPages[status] ?? 'Something went wrong.';
  return reply
    .code(status)
    .type('text/html')
    .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${status} ${title}</title>
<style>
:root{color-scheme:dark;--background:oklch(0.145 0 0);--foreground:oklch(0.985 0 0);--card:oklch(0.205 0 0);--muted-foreground:oklch(0.708 0 0);--border:oklch(1 0 0 / 10%)}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--background);color:var(--foreground);font:14px/1.5 "Geist Variable",ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:24rem;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--card);box-shadow:0 1px 3px 0 rgb(0 0 0 / .1),0 1px 2px -1px rgb(0 0 0 / .1);text-align:center}
.status{display:inline-block;margin-bottom:12px;padding:2px 10px;border:1px solid var(--border);border-radius:999px;color:var(--muted-foreground);font-size:12px;font-weight:500;font-variant-numeric:tabular-nums}
h1{margin:0 0 8px;font-size:18px;font-weight:600;line-height:1.2}
p{margin:0;color:var(--muted-foreground)}
</style></head>
<body><main><span class="status">${status}</span><h1>${title}</h1><p>${description}</p></main></body></html>`);
}

function route(
  api: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  schemas: Schemas,
  handler: Handler,
) {
  api.route({
    method,
    url,
    schema: {
      security: [{ bearer: [] }],
      ...(schemas.params && { params: schemas.params }),
      ...(schemas.query && { querystring: schemas.query }),
      ...(schemas.body && { body: schemas.body }),
    },
    handler: async (request) => {
      if (schemas.body) validate(schemas.body, request.body);
      return handler(request as unknown as Input, request);
    },
  });
}

function launcherRoutes(api: FastifyInstance, db: Database) {
  route(api, 'GET', '/api/entries', { query: entryFilterSchema }, ({ query }) =>
    entries.listEntries(db, query),
  );
  route(api, 'POST', '/api/entries', { body: captureSchema }, ({ body }, request) =>
    entries.capture(db, request.identity.source, body),
  );
  route(api, 'GET', '/api/entries/:id', { params: idParams }, ({ params }) =>
    entries.getEntry(db, params.id),
  );
  route(
    api,
    'PATCH',
    '/api/entries/:id',
    { params: idParams, body: entryPatchSchema },
    ({ params, body }) => entries.updateEntry(db, params.id, body),
  );
  route(api, 'GET', '/api/entries/:id/links', { params: idParams }, ({ params }) =>
    links.listLinks(db, params.id),
  );
  route(
    api,
    'POST',
    '/api/entries/:id/links',
    { params: idParams, body: linkSchema },
    ({ params, body }) => links.saveLink(db, params.id, body),
  );
  route(
    api,
    'DELETE',
    '/api/entries/:id/links/:otherId',
    { params: Type.Object({ id: idSchema, otherId: idSchema }) },
    ({ params }) => links.removeLink(db, params.id, params.otherId),
  );
  route(
    api,
    'GET',
    '/api/tasks',
    {
      query: Type.Object(
        {
          view: Type.Optional(Type.Union([Type.Literal('now'), Type.Literal('all')])),
          context: Type.Optional(contextSchema),
          minutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 1440 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        },
        { additionalProperties: false },
      ),
    },
    ({ query }) => {
      const { view = 'now', ...options } = query as {
        view?: string;
        context?: keyof typeof contexts;
        minutes?: number;
        limit?: number;
      };
      return view === 'now'
        ? entries.nowTasks(db, options)
        : entries.listEntries(db, { kind: 'task', open: true, limit: 200 });
    },
  );
  route(api, 'POST', '/api/tasks/:id/finish', { params: idParams }, ({ params }) =>
    entries.setFinished(db, params.id, true, ['task']),
  );
  route(api, 'POST', '/api/tasks/:id/reopen', { params: idParams }, ({ params }) =>
    entries.setFinished(db, params.id, false, ['task']),
  );
  route(
    api,
    'POST',
    '/api/tasks/:id/postpone',
    {
      params: idParams,
      body: Type.Object({ until: Type.Optional(dateSchema) }, { additionalProperties: false }),
    },
    ({ params, body }) =>
      entries.interact(db, params.id, 'postponed', (body as { until?: string } | null)?.until),
  );
  route(api, 'POST', '/api/tasks/:id/skip', { params: idParams }, ({ params }) =>
    entries.interact(db, params.id, 'skipped'),
  );
  route(
    api,
    'GET',
    '/api/journal',
    { query: Type.Object({ from: dateSchema, to: dateSchema }, { additionalProperties: false }) },
    ({ query }) => {
      const { from, to } = query as { from: string; to: string };
      return entries.journal(db, from, to);
    },
  );
  route(
    api,
    'GET',
    '/api/search',
    {
      query: Type.Object(
        { q: Type.String({ minLength: 1, maxLength: 200 }) },
        { additionalProperties: false },
      ),
    },
    ({ query }) => links.search(db, (query as { q: string }).q),
  );
  route(api, 'GET', '/api/notifications', {}, () => entries.notifications(db));
  route(api, 'GET', '/api/collections', {}, () => collections.listCollections(db));
  route(
    api,
    'GET',
    '/api/collections/:id/records',
    {
      params: idParams,
      query: Type.Object(
        { offset: Type.Optional(Type.Integer({ minimum: 0 })) },
        { additionalProperties: false },
      ),
    },
    ({ params, query }) =>
      collections.listRecords(db, params.id, (query as { offset?: number }).offset),
  );
  route(
    api,
    'POST',
    '/api/collections/:id/records',
    { params: idParams, body: recordSchema },
    ({ params, body }) => collections.createRecord(db, params.id, body),
  );
}

/** Internal routes for the administrative panel; same token, not part of the launcher API. */
function panelRoutes(api: FastifyInstance, db: Database) {
  route(api, 'GET', '/api/admin/catalog', {}, async () => ({
    areas,
    kinds,
    contexts,
    fieldTypes,
    recordColumns,
    questions: catalog,
    settings: Object.fromEntries(
      Object.entries(collections.settingDefinitions).map(([key, d]) => [
        key,
        { default: d.default, description: d.description },
      ]),
    ),
  }));
  route(
    api,
    'GET',
    '/api/admin/flow',
    {
      query: Type.Object(
        { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) },
        { additionalProperties: false },
      ),
    },
    ({ query }) => processing.flow(db, (query as { limit?: number }).limit),
  );
  route(api, 'POST', '/api/admin/entries/:id/retry', { params: idParams }, ({ params }) =>
    processing.retry(db, params.id),
  );
  route(api, 'POST', '/api/admin/projects', { body: projectSchema }, ({ body }, request) =>
    entries.createProject(db, request.identity.source, body),
  );
  route(api, 'POST', '/api/admin/projects/:id/finish', { params: idParams }, ({ params }) =>
    entries.setFinished(db, params.id, true, ['project']),
  );
  route(api, 'POST', '/api/admin/projects/:id/reopen', { params: idParams }, ({ params }) =>
    entries.setFinished(db, params.id, false, ['project']),
  );
  route(api, 'POST', '/api/admin/collections', { body: collectionSchema }, ({ body }) =>
    collections.createCollection(db, body),
  );
  route(
    api,
    'PATCH',
    '/api/admin/collections/:id',
    { params: idParams, body: collectionPatchSchema },
    ({ params, body }) => collections.updateCollection(db, params.id, body),
  );
  route(
    api,
    'PATCH',
    '/api/admin/records/:id',
    { params: idParams, body: recordPatchSchema },
    ({ params, body }) => collections.updateRecord(db, params.id, body),
  );
  route(api, 'GET', '/api/admin/preferences', {}, () => processing.listPreferences(db));
  route(api, 'POST', '/api/admin/preferences', { body: preferenceSchema }, ({ body }) =>
    processing.createPreference(db, body),
  );
  route(
    api,
    'PATCH',
    '/api/admin/preferences/:id',
    { params: idParams, body: preferenceSchema },
    ({ params, body }) => processing.updatePreference(db, params.id, body),
  );
  route(api, 'DELETE', '/api/admin/preferences/:id', { params: idParams }, ({ params }) =>
    processing.archivePreference(db, params.id),
  );
  route(api, 'GET', '/api/admin/settings', {}, () => collections.readSettings(db));
  route(
    api,
    'PUT',
    '/api/admin/settings/:key',
    {
      params: Type.Object({ key: Type.String({ maxLength: 100 }) }),
      body: Type.Object(
        { value: Type.String({ maxLength: 1000 }) },
        { additionalProperties: false },
      ),
    },
    ({ params, body }) =>
      collections.saveSetting(db, params.key, (body as { value: string }).value),
  );
  route(
    api,
    'POST',
    '/api/admin/archive',
    {
      body: Type.Object(
        { id: idSchema, archived: Type.Boolean() },
        { additionalProperties: false },
      ),
    },
    ({ body }) => {
      const { id, archived } = body as { id: string; archived: boolean };
      return entries.archive(db, id, archived);
    },
  );
}
