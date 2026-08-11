import { describe, expect, it } from 'vitest';
import { MemoryLock } from '../../../adapters/memory/lock.js';
import { MemoryAutomationStore } from '../../automation/adapters/memory/store.js';
import { MemoryExecutionStore } from '../../execution/adapters/memory/store.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { MemoryStateStore } from '../../state/adapters/memory/store.js';
import { MemoryInterpretations } from '../adapters/memory/interpretation.js';
import { MemoryInterpretationLifecycle } from '../adapters/memory/lifecycle.js';
import { MemoryReviewStore } from '../adapters/memory/review.js';
import { Interpretation } from '../domain/interpretation.js';
import { createCompiler, entry, item, recordedAt, snapshot } from './support/compiler.js';

describe('atomic Interpretation publication', () => {
  it('restores every memory store when one plan write fails', async () => {
    const draft = {
      entryId: entry.id,
      declarations: [
        item('task', { key: 'task', version: 1 }, 'descriptive', { title: 'Pagar' }),
        {
          kind: 'intent' as const,
          version: 1 as const,
          reference: 'notice',
          dependsOn: ['task'],
          unresolved: [],
          capability: { key: 'notification', version: 1 },
          input: { message: 'Pagar' },
          conditions: [],
          expectedState: [],
          consent: 'none' as const,
          trigger: undefined,
        },
      ],
    };
    const plan = createCompiler().compile('interpretation-rollback', draft, snapshot, recordedAt);
    const knowledge = new MemoryKnowledgeStore();
    await knowledge.saveEntry(entry);
    const interpretations = new MemoryInterpretations();
    const states = new MemoryStateStore();
    const executions = new FailingExecutionStore();
    const lifecycle = new MemoryInterpretationLifecycle(
      knowledge,
      interpretations,
      new MemoryReviewStore(),
      new MemoryLock(),
      states,
      new MemoryAutomationStore(),
      executions,
    );
    const processing = Interpretation.create({
      id: 'interpretation-rollback',
      entryId: entry.id,
      createdAt: recordedAt,
    }).start(recordedAt);
    const completed = processing.completeKnowledge(
      draft,
      { key: 'test' },
      plan.publication,
      recordedAt,
    );

    await expect(lifecycle.publish(completed, plan)).rejects.toThrow('injected failure');
    expect((await knowledge.loadKnowledge()).items).toEqual([]);
    expect(await states.listStates()).toEqual([]);
    expect(await interpretations.listDeclarationOutcomes()).toEqual([]);
  });
});

class FailingExecutionStore extends MemoryExecutionStore {
  override async saveIntent(): Promise<void> {
    throw new Error('injected failure');
  }
}
