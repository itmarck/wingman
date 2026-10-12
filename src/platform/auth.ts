import type { onRequestHookHandler } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';

export const tokenAudience = 'wingman';
export const tokenSubject = 'Marcelo';

export interface AccessIdentity {
  readonly subject: string;
  readonly source: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity: AccessIdentity;
  }
}

/**
 * Creates a signed access token carrying its authenticated source.
 */
export async function createAccessToken(source: string, signingSecret: string): Promise<string> {
  assertSource(source);
  const secret = createSecret(signingSecret);

  return new SignJWT({ source })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(tokenSubject)
    .setAudience(tokenAudience)
    .sign(secret);
}

/**
 * Verifies a bearer Authorization header; returns the identity, or undefined when invalid.
 */
export async function verifyAuthorization(
  authorization: string | undefined,
  signingSecret: string,
): Promise<AccessIdentity | undefined> {
  const token = readBearerToken(authorization);
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, createSecret(signingSecret), {
      algorithms: ['HS256'],
      audience: tokenAudience,
      subject: tokenSubject,
    });
    return Object.freeze({ subject: tokenSubject, source: requireSource(payload.source) });
  } catch {
    return undefined;
  }
}

/**
 * Creates the bearer-token guard used by protected HTTP routes.
 */
export function createAuthHook(signingSecret: string): onRequestHookHandler {
  createSecret(signingSecret);
  return async (request, reply) => {
    const identity = await verifyAuthorization(request.headers.authorization, signingSecret);
    if (!identity) return unauthorized(reply);
    request.identity = identity;
  };
}

function createSecret(signingSecret: string): Uint8Array {
  if (signingSecret.trim().length === 0) {
    throw new Error('API signing secret cannot be empty');
  }

  return new TextEncoder().encode(signingSecret);
}

function readBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  return authorization.slice('Bearer '.length);
}

function requireSource(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Access token source is required');
  }

  assertSource(value);
  return value;
}

function assertSource(source: string): void {
  const camelCase = /^[a-z][a-zA-Z0-9]*$/;

  if (!camelCase.test(source)) {
    throw new Error('Access token source must be a camelCase word');
  }
}

function unauthorized(reply: Parameters<onRequestHookHandler>[1]) {
  return reply.code(401).send({
    error: {
      code: 'unauthorized',
      message: 'A valid bearer token is required',
    },
  });
}
