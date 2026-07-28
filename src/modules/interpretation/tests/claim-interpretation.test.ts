import { describe, expect, it } from 'vitest';
import { MemoryLock } from '../../../adapters/memory/lock.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { MemoryInterpretations } from '../adapters/memory/interpretation.js';
import { MemoryInterpretationLifecycle } from '../adapters/memory/lifecycle.js';
import { MemoryReviewStore } from '../adapters/memory/review.js';
import { Interpretation } from '../domain/interpretation.js';

describe('Interpretation queue', () => {
  it('recovers an expired lease and rejects the previous claim', async () => {
    const lock = new MemoryLock();
    const queue = new MemoryInterpretations(lock);
    const lifecycle = new MemoryInterpretationLifecycle(
      new MemoryKnowledgeStore(),
      queue,
      new MemoryReviewStore(lock),
      lock,
    );
    const interpretation = createInterpretation();

    await queue.saveInterpretation(interpretation);
    await queue.enqueue(interpretation.id);

    const first = requireValue(
      await queue.claim({
        claimId: 'claim-first',
        claimedAt: '2026-07-20T12:00:00Z',
        leaseUntil: '2026-07-20T12:05:00Z',
      }),
    );

    const processing = interpretation.start('2026-07-20T12:00:00Z');

    await queue.start(first, processing);

    expect(
      await queue.claim({
        claimId: 'claim-early',
        claimedAt: '2026-07-20T12:04:00Z',
        leaseUntil: '2026-07-20T12:09:00Z',
      }),
    ).toBeUndefined();

    const recovered = requireValue(
      await queue.claim({
        claimId: 'claim-recovered',
        claimedAt: '2026-07-20T12:06:00Z',
        leaseUntil: '2026-07-20T12:11:00Z',
      }),
    );

    expect(recovered.recovered).toBe(true);
    await expect(queue.complete(first)).rejects.toMatchObject({
      name: 'InterpretationClaimError',
    });
    await expect(
      lifecycle.publish(
        completeInterpretation(processing, '2026-07-20T12:06:00Z'),
        {
          concepts: [],
          predicates: [],
          axioms: [],
          links: [],
        },
        first,
      ),
    ).rejects.toMatchObject({
      name: 'InterpretationClaimError',
    });
    await queue.renew(recovered, '2026-07-20T12:12:00Z');
    const recoveredProcessing = processing.recover('2026-07-20T12:06:00Z');

    await queue.start(recovered, recoveredProcessing);
    await lifecycle.publish(
      completeInterpretation(recoveredProcessing, '2026-07-20T12:07:00Z'),
      {
        concepts: [],
        predicates: [],
        axioms: [],
        links: [],
      },
      recovered,
    );
    await queue.complete(recovered);
  });

  it('does not claim a retry before availableAt', async () => {
    const queue = new MemoryInterpretations();
    const processing = createInterpretation().start('2026-07-20T12:00:00Z');
    const queued = processing.reschedule(
      'Provider unavailable',
      '2026-07-20T12:00:00Z',
      '2026-07-20T12:03:00Z',
    );

    await queue.saveInterpretation(queued);
    await queue.enqueue(queued.id);

    expect(
      await queue.claim({
        claimId: 'claim-early',
        claimedAt: '2026-07-20T12:02:59Z',
        leaseUntil: '2026-07-20T12:07:59Z',
      }),
    ).toBeUndefined();

    expect(
      await queue.claim({
        claimId: 'claim-ready',
        claimedAt: '2026-07-20T12:03:00Z',
        leaseUntil: '2026-07-20T12:08:00Z',
      }),
    ).toMatchObject({
      interpretationId: queued.id,
      claimId: 'claim-ready',
      recovered: false,
    });
  });
});

function createInterpretation(): Interpretation {
  return Interpretation.create({
    id: 'interpretation-queue',
    entryId: 'entry-queue',
    createdAt: '2026-07-20T12:00:00Z',
  });
}

function completeInterpretation(
  interpretation: Interpretation,
  completedAt: string,
): Interpretation {
  return interpretation.completeKnowledge(
    {
      entryId: interpretation.entryId,
      concepts: [],
      predicates: [],
      axioms: [],
    },
    {
      key: 'test',
    },
    {
      conceptIds: [],
      predicateIds: [],
      axiomIds: [],
      linkIds: [],
    },
    completedAt,
  );
}

function requireValue<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error('Expected value');
  }

  return value;
}
