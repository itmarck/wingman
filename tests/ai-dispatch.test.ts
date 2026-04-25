import { describe, it, expect, beforeEach } from 'vitest';
import { getProvider, _resetProvider, classify, classifyRaw } from '../shared/ai/index.js';

beforeEach(() => {
  _resetProvider();
});

describe('AI dispatcher', () => {
  it('selects mock provider when AI_PROVIDER=mock', () => {
    process.env.AI_PROVIDER = 'mock';
    expect(getProvider().name).toBe('mock');
  });

  it('falls back to claude on unknown provider name', () => {
    process.env.AI_PROVIDER = 'nonsense';
    expect(getProvider().name).toBe('claude');
  });

  it('mock classify routes promotion → noise/trash (action routing depends on this)', async () => {
    process.env.AI_PROVIDER = 'mock';
    const r = await classify('Subject: Gran descuento de promo');
    expect(r.classification).toBe('noise');
    expect(r.email_action).toBe('trash');
  });

  it('mock classifyRaw infers project type from keyword', async () => {
    process.env.AI_PROVIDER = 'mock';
    const r = await classifyRaw('Lanzar nuevo proyecto interno');
    expect(r.type).toBe('project');
  });
});
