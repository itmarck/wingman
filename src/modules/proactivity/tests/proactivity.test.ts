import { describe, expect, it } from 'vitest';
import type { Capability } from '../../../core/execution/capability.js';
import { Event } from '../../../core/execution/event.js';
import type { ComponentValue, Evidence } from '../../../core/item/types.js';
import { createTestSystem } from '../../../system/tests/support.js';
import type { InterpretationRequest } from '../../interpretation/services/request.js';
import type { ProactiveDetector } from '../domain/detector.js';

describe('proactive assistance', () => {
  it('detects useful planning risks with complete explanations and no direct effects', async () => {
    const system = createTestSystem({
      adapter: new EmptyInterpreter(),
      detectorThresholds: { blockerMs: 0, deadlineLeadMs: 86_400_000, inactivityMs: 0 },
    });
    const entryId = await entry(system, 'Objetivo, bloqueo y fecha.');
    const evidence = [{ entryId, sourceLocators: [] }];
    await system.planning.commands.create({
      profile: 'objective',
      title: 'Lanzar producto',
      evidence,
    });
    const blocker = await system.planning.commands.create({
      profile: 'task',
      title: 'Decidir alcance',
      evidence,
    });
    await system.planning.commands.create({
      profile: 'plan',
      title: 'Plan bloqueado',
      dependencyIds: [blocker],
      evidence,
    });
    await system.planning.commands.create({
      profile: 'task',
      title: 'Entrega vencida',
      dueAt: new Date(Date.now() - 60_000).toISOString(),
      evidence,
    });

    const proposals = await system.proactivity.service.evaluate({ kind: 'scan' });
    const keys = new Set(proposals.map((proposal) => proposal.detector.key));
    expect([...keys]).toEqual(
      expect.arrayContaining([
        'missingNextAction',
        'blockerDuration',
        'deadlineRisk',
        'inactivity',
      ]),
    );
    for (const proposal of proposals)
      expect(proposal).toMatchObject({
        rationale: expect.any(String),
        expectedEffect: expect.any(String),
        evidence: expect.arrayContaining([expect.objectContaining({ entryId })]),
        autonomy: { resolved: 'propose', explicitAuthorization: true },
        intentId: expect.any(String),
      });
    expect(await system.notification.service.list()).toEqual([]);
    expect(await system.proactivity.service.evaluate({ kind: 'scan' })).toEqual([]);
    await system.close();
  });

  it('detects conflicts and only evaluates dependencies related to a signal', async () => {
    const system = createTestSystem({ adapter: new EmptyInterpreter() });
    const entryId = await entry(system, 'La misma condición no puede ser obligatoria y prohibida.');
    const evidence = [{ entryId, sourceLocators: [] }];
    const condition = {
      operator: { key: 'equal' as const, version: 1 },
      operands: [
        { kind: 'literal' as const, value: true },
        { kind: 'literal' as const, value: true },
      ],
    };
    await system.state.createState.execute({
      modality: 'required',
      condition,
      author: { kind: 'user' },
      evidence,
    });
    await system.state.createState.execute({
      modality: 'forbidden',
      condition,
      author: { kind: 'user' },
      evidence,
    });
    expect(
      await system.proactivity.service.evaluate({
        kind: 'knowledge',
        itemIds: [],
        componentKeys: ['name'],
      }),
    ).toEqual([]);
    const conflict = await system.proactivity.service.evaluate({ kind: 'state', itemIds: [] });
    expect(conflict).toHaveLength(1);
    expect(conflict[0]).toMatchObject({
      detector: { key: 'conflict' },
      urgency: 'critical',
      relevantState: expect.arrayContaining([
        expect.stringContaining('required:'),
        expect.stringContaining('forbidden:'),
      ]),
    });
    await system.close();
  });

  it('handles relevant knowledge and Events without turning them into a background loop', async () => {
    const system = createTestSystem({ adapter: new EmptyInterpreter() });
    const entryId = await entry(system, 'Nueva información relevante.');
    const evidence = [{ entryId, sourceLocators: [] }];
    const taskId = await system.planning.commands.create({
      profile: 'task',
      title: 'Revisar cambio',
      evidence,
    });
    expect(
      (
        await system.proactivity.service.evaluate({
          kind: 'knowledge',
          itemIds: [taskId],
          componentKeys: ['planning'],
        })
      ).map((proposal) => proposal.detector.key),
    ).toContain('relevantChange');
    const event = Event.create({
      id: 'event-new-knowledge',
      key: 'notificationDelivered',
      occurredAt: new Date().toISOString(),
      causation: { entryId },
      data: { subjectItemId: taskId },
    });
    expect(
      (await system.proactivity.service.evaluate({ kind: 'event', event })).map(
        (proposal) => proposal.detector.key,
      ),
    ).toEqual(['relevantChange']);
    await system.close();
  });

  it('bounds registered effects, rejects unsupported inferred effects and preserves feedback', async () => {
    const system = createTestSystem({
      adapter: new EmptyInterpreter(),
      proactivity: { global: 'execute' },
    });
    const entryId = await entry(system, 'Sugerencia segura.');
    const evidence = [{ entryId, sourceLocators: [] }];
    const subjectItemId = await system.planning.commands.create({
      profile: 'task',
      title: 'Sujeto',
      evidence,
    });
    const safe = new CountingCapability();
    system.execution.capabilities.register(safe);
    system.proactivity.detectors.register(
      customDetector('safeSuggestion', 'safeEffect', subjectItemId, evidence),
    );
    system.proactivity.detectors.register(
      customDetector('unsupportedSuggestion', 'inventedEffect', subjectItemId, evidence),
    );

    const proposals = await system.proactivity.service.evaluate({
      kind: 'knowledge',
      itemIds: [subjectItemId],
      componentKeys: ['customSignal'],
    });
    const supported = requireDefined(
      proposals.find((proposal) => proposal.detector.key === 'safeSuggestion'),
    );
    const unsupported = requireDefined(
      proposals.find((proposal) => proposal.detector.key === 'unsupportedSuggestion'),
    );
    expect(supported).toMatchObject({
      autonomy: { resolved: 'propose', safetyCeiling: 'propose' },
      status: 'active',
      intentId: expect.any(String),
    });
    expect(unsupported).toMatchObject({ status: 'unsupported', intentId: undefined });
    expect(safe.executions).toBe(0);

    const reviewAt = new Date(Date.now() + 60_000).toISOString();
    await system.proactivity.service.feedback(supported.id, { kind: 'postponed', reviewAt });
    expect(
      await system.proactivity.service.evaluate({
        kind: 'knowledge',
        itemIds: [subjectItemId],
        componentKeys: ['customSignal'],
      }),
    ).toEqual([]);
    await system.proactivity.service.feedback(supported.id, { kind: 'accepted' });
    expect(
      (await system.execution.store.findIntent(requireDefined(supported.intentId)))?.status,
    ).toBe('authorized');
    await system.proactivity.service.feedback(supported.id, {
      kind: 'modified',
      modification: { message: 'Ajustada' },
    });
    await system.proactivity.service.feedback(supported.id, { kind: 'rejected', note: 'No ahora' });
    await system.proactivity.service.feedback(supported.id, { kind: 'completed' });
    await system.proactivity.service.feedback(unsupported.id, { kind: 'expired' });
    expect(
      (await system.proactivity.service.read(supported.id)).feedback.map(
        (feedback) => feedback.kind,
      ),
    ).toEqual(['postponed', 'accepted', 'modified', 'rejected', 'completed']);
    expect(safe.executions).toBe(0);
    await system.close();
  });
});

class CountingCapability implements Capability {
  readonly key = 'safeEffect';
  readonly version = 1;
  readonly description = 'Safe proposed effect';
  readonly defaultAutonomy = 'execute' as const;
  readonly safetyCeiling = 'propose' as const;
  executions = 0;
  validateInput(): void {}
  idempotencyKey(_input: ComponentValue, intentId: string): string {
    return intentId;
  }
  async execute() {
    this.executions += 1;
    return { kind: 'success' as const };
  }
}
function customDetector(
  key: string,
  capability: string,
  subjectItemId: string,
  evidence: readonly Evidence[],
): ProactiveDetector {
  return {
    key,
    version: 1,
    description: key,
    dependencies: { componentKeys: ['customSignal'] },
    detect: () => [
      {
        subjectItemId,
        relevantState: ['custom:risk'],
        evidence,
        rationale: 'A registered deterministic risk was detected.',
        expectedEffect: 'Apply the bounded effect.',
        urgency: 'medium',
        expiresInMs: 60_000,
        capability: { key: capability, version: 1 },
        input: { subjectItemId },
        conditions: [],
      },
    ],
  };
}
async function entry(system: ReturnType<typeof createTestSystem>, text: string): Promise<string> {
  return system.capture.captureEntry.execute({
    content: { kind: 'text', text },
    origin: { source: 'test' },
  });
}
function requireDefined<Value>(value: Value | undefined): Value {
  if (value === undefined) throw new Error('Expected test value');
  return value;
}
class EmptyInterpreter {
  readonly identity = Object.freeze({ key: 'empty' });
  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge' as const,
      draft: { entryId: request.entry.id, items: [], components: [] },
    };
  }
}
