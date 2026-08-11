import type { InterpretationAdapter } from '../../../modules/interpretation/services/interpreter.js';
import { createSystem } from '../../../system/system.js';
import { createMemoryTestStorage } from '../../../system/tests/storage.js';
import { createAccessToken } from '../auth.js';
import { createHttpServer } from '../server.js';

export const signingSecret = 'test-signing-secret-with-at-least-32-characters';

export const token = await createAccessToken('browser', signingSecret);

export const authorization = Object.freeze({
  authorization: `Bearer ${token}`,
  'x-mutation-mode': 'write',
});

export function createTestServer(readiness?: () => Promise<boolean>) {
  return createHttpServer(createTestSystem(), { signingSecret, readiness });
}

export function createTestSystem(mode: 'approval' | 'readonly' | 'write' = 'write') {
  return createSystem(createMemoryTestStorage(), {
    inference: {
      target: 'test.default',
      provider: 'test',
      model: 'test',
    },
    adapter: new EmptyInterpreter(),
    mode,
  });
}

export class EmptyInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'empty',
  });

  async interpret() {
    return {
      kind: 'empty' as const,
    };
  }
}

export function alterToken(value: string): string {
  const replacement = value.endsWith('a') ? 'b' : 'a';

  return `${value.slice(0, -1)}${replacement}`;
}
