import { describe, expect, it } from 'vitest';
import { Entry } from '../../../core/knowledge/entry.js';
import type { InferenceRun, InferenceTelemetry } from '../ports/telemetry.js';
import {
  type InferenceExecution,
  type InterpretationAdapter,
  Interpreter,
} from '../services/interpreter.js';
import type { InterpretationRequest } from '../services/request.js';

describe('Interpreter operation contract', () => {
  it('builds provider-independent instructions and passes bounded context to an Adapter', async () => {
    const adapter = new CapturingAdapter();
    const interpreter = new Interpreter(adapter, {
      target: 'test.default',
      provider: 'test',
      model: 'test-model',
    });
    const entry = Entry.create({
      id: 'entry-request',
      content: {
        kind: 'text',
        text: 'Remember this information.',
      },
      origin: {
        source: 'minima',
      },
      capturedAt: '2026-07-20T12:00:00Z',
    });
    const context = Object.freeze({
      concepts: Object.freeze([]),
      predicates: Object.freeze([]),
      axioms: Object.freeze([]),
    });

    await interpreter.execute(entry, context, {
      interpretationId: 'interpretation-request',
      attempt: 1,
    });

    expect(adapter.request).toMatchObject({
      operation: 'interpretEntry',
      reasoning: 'low',
      instructionsVersion: 'interpretEntry.v6',
      objective: 'Interpret one Entry as durable structured knowledge.',
      entry,
      context,
    });
    expect(adapter.request?.instructions).toContain(
      'Write all newly created human-readable knowledge in Spanish, including Concept names, aliases, definitions, Predicate definitions, and invalid reasons.',
    );
    expect(adapter.request?.instructions).toContain(
      'Preserve proper names, acronyms, quotations, and technical terms in their original language when translating them would lose meaning or context.',
    );
    expect(adapter.request?.instructions).toContain(
      'Resolve first-person references to Marcelo only when the Entry is his direct personal statement.',
    );
    expect(adapter.request?.instructions).toContain(
      'Never infer authorship from origin.source. Mark every proposed Concept reference as identified or uncertain; an uncertain reference must request referenceResolution with a concise question and candidate Concept IDs from context.',
    );
    expect(adapter.request?.instructions).toContain(
      'Every Axiom must have a unique reference. Every Link must use valid sourceReference and targetReference values.',
    );
    expect(adapter.request?.instructions).toContain(
      'Use stable English lower camelCase Predicate keys such as worksAt; do not translate keys or use spaces, hyphens, underscores, or PascalCase.',
    );
    expect(adapter.request?.instructions).toContain(
      'Return empty only when the Entry legitimately contains no durable knowledge.',
    );
    expect(adapter.request?.outputContract).toContain('knowledge');
    expect(adapter.request?.outputContract).toContain('empty');
    expect(adapter.request?.outputContract).toContain('invalid');
  });

  it('records provider metadata and usage without exposing complete inputs or outputs', async () => {
    const telemetry = new RecordingTelemetry();
    const interpreter = new Interpreter(
      new MeteredAdapter(),
      {
        target: 'test.default',
        provider: 'provider',
        model: 'requested-model',
      },
      telemetry,
    );

    await interpreter.execute(createEntry(), emptyContext, {
      interpretationId: 'interpretation-telemetry',
      attempt: 2,
    });

    expect(telemetry.runs).toEqual([
      expect.objectContaining({
        interpretationId: 'interpretation-telemetry',
        operation: 'interpretEntry',
        reasoning: 'low',
        target: 'test.default',
        provider: 'provider',
        requestedModel: 'requested-model',
        usedModel: 'used-model',
        instructionsVersion: 'interpretEntry.v6',
        attempt: 2,
        result: 'empty',
        inputTokens: 10,
        outputTokens: 2,
        estimatedCostUsd: 0.001,
      }),
    ]);
  });

  it('does not fail Interpretation when telemetry is unavailable', async () => {
    const interpreter = new Interpreter(
      new CapturingAdapter(),
      {
        target: 'test.default',
        provider: 'test',
        model: 'test-model',
      },
      {
        async record() {
          throw new Error('Telemetry unavailable');
        },
      },
    );

    await expect(
      interpreter.execute(createEntry(), emptyContext, {
        interpretationId: 'interpretation-best-effort',
        attempt: 1,
      }),
    ).resolves.toMatchObject({
      kind: 'empty',
    });
  });
});

class CapturingAdapter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'capturing',
  });

  request?: InterpretationRequest;

  async interpret(request: InterpretationRequest) {
    this.request = request;

    return {
      kind: 'empty',
    };
  }
}

class MeteredAdapter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'metered',
  });

  async interpret(): Promise<InferenceExecution> {
    return {
      kind: 'inferenceExecution',
      output: {
        kind: 'empty',
      },
      usedModel: 'used-model',
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        estimatedCostUsd: 0.001,
      },
    };
  }
}

class RecordingTelemetry implements InferenceTelemetry {
  readonly runs: InferenceRun[] = [];

  async record(run: InferenceRun): Promise<void> {
    this.runs.push(run);
  }
}

function createEntry(): Entry {
  return Entry.create({
    id: 'entry-telemetry',
    content: {
      kind: 'text',
      text: 'Remember this information.',
    },
    origin: {
      source: 'minima',
    },
    capturedAt: '2026-07-20T12:00:00Z',
  });
}

const emptyContext = Object.freeze({
  concepts: Object.freeze([]),
  predicates: Object.freeze([]),
  axioms: Object.freeze([]),
});
