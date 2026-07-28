import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { token } from './support.js';

describe('create access token', () => {
  it('creates a non-expiring token with the expected identity', () => {
    expect(decodeJwt(token)).toEqual({
      aud: 'wingman',
      source: 'browser',
      sub: 'Marcelo',
    });
  });
});
