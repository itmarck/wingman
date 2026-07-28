import { describe, expect, it } from 'vitest';
import { createHttpServer } from '../server.js';
import { authorization, createTestSystem, signingSecret } from './support.js';

describe('approve HTTP mutation', () => {
  it('keeps readonly as the default and commits the exact approved capture', async () => {
    const system = createTestSystem();
    const server = createHttpServer(system, { signingSecret });
    const payload = {
      content: {
        kind: 'text' as const,
        text: 'A proposal protects production knowledge.',
      },
      externalId: 'proposal-entry',
    };
    const readonly = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: {
        authorization: authorization.authorization,
      },
      payload,
    });
    const proposed = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: {
        authorization: authorization.authorization,
        'x-mutation-mode': 'approval',
      },
      payload,
    });
    const body = proposed.json<{
      proposal: {
        id: string;
        approveUrl: string;
        changes: Array<{ target: string; value: { id: string } }>;
        rejectUrl: string;
      };
    }>();
    const entryId = body.proposal.changes.find((change) => change.target === 'entry')?.value.id;
    const beforeApproval = await system.capture.listEntries.execute();
    const approved = await server.inject({
      method: 'POST',
      url: body.proposal.approveUrl,
      headers: {
        authorization: authorization.authorization,
        'x-mutation-mode': 'approval',
      },
    });
    const entry = await system.capture.getEntry.execute(entryId ?? '');

    expect(readonly.statusCode).toBe(403);
    expect(proposed.statusCode).toBe(202);
    expect(body.proposal.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(body.proposal.rejectUrl).toBe(`/api/proposals/${body.proposal.id}/reject`);
    expect(beforeApproval.items).toHaveLength(0);
    expect(approved.statusCode).toBe(204);
    expect(entry.id).toBe(entryId);
    expect(system.proposals.list()).toHaveLength(0);

    await server.close();
  });

  it('rejects an unknown mutation mode', async () => {
    const server = createHttpServer(createTestSystem(), {
      signingSecret,
    });
    const response = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers: {
        authorization: authorization.authorization,
        'x-mutation-mode': 'unknown',
      },
      payload: {
        content: { kind: 'text', text: 'Unsafe direct write.' },
        externalId: 'unsafe-write',
      },
    });

    expect(response.statusCode).toBe(400);

    await server.close();
  });
});
