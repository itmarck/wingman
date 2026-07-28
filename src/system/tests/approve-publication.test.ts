import { describe, expect, it } from 'vitest';
import { EmptyInterpreter } from '../../modules/interpretation/adapters/interpreter.js';
import { defaultProcessingConfig } from '../../modules/interpretation/config.js';
import type { System } from '../system.js';
import { createTestSystem } from './support.js';

describe('approve asynchronous publication', () => {
  it('keeps the worker waiting until its exact publication is approved', async () => {
    const system = createTestSystem({
      adapter: new EmptyInterpreter(),
      processing: defaultProcessingConfig,
      mode: 'approval',
    });
    const entryId = await system.capture.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'This Entry has no durable knowledge.',
      },
      origin: {
        source: 'test',
      },
    });
    const processing = system.interpretation.processNext.execute();
    const proposal = await waitForProposal(system);
    const pending = await system.interpretation.getEntryStatus.execute(entryId);

    expect(pending.status).toBe('processing');
    expect(proposal.changes.map((change) => change.target)).toEqual(['interpretation']);

    await system.proposals.approve(proposal.id);
    await processing;

    expect((await system.interpretation.getEntryStatus.execute(entryId)).status).toBe('completed');
    expect(system.proposals.list()).toHaveLength(0);
  });
});

async function waitForProposal(system: System) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const proposal = system.proposals.list()[0];

    if (proposal) {
      return proposal;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error('Worker did not create a Proposal');
}
