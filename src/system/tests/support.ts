import type { ProcessingConfig } from '../../modules/interpretation/config.js';
import type { InterpretationAdapter } from '../../modules/interpretation/services/interpreter.js';
import type { MutationMode } from '../proposal.js';
import { createSystem, type System } from '../system.js';

interface TestSystemOptions {
  readonly adapter: InterpretationAdapter;
  readonly mode?: MutationMode;
  readonly processing?: ProcessingConfig;
}

export function createTestSystem(options: TestSystemOptions): System {
  return createSystem('memory', {
    inference: {
      target: 'test.default',
      provider: 'test',
      model: 'test',
    },
    adapter: options.adapter,
    mode: options.mode ?? 'write',
    processing: options.processing,
  });
}
