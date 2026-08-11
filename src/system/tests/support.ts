import type { ProcessingConfig } from '../../modules/interpretation/config.js';
import type { InterpretationAdapter } from '../../modules/interpretation/services/interpreter.js';
import type { DetectorThresholds } from '../../modules/suggestion/detectors/builtins.js';
import type { SuggestionPolicy } from '../../modules/suggestion/operations/service.js';
import type { MutationMode } from '../proposal.js';
import { createSystem, type System } from '../system.js';
import { createMemoryTestStorage } from './storage.js';

interface TestSystemOptions {
  readonly adapter: InterpretationAdapter;
  readonly mode?: MutationMode;
  readonly processing?: ProcessingConfig;
  readonly suggestion?: SuggestionPolicy;
  readonly detectorThresholds?: DetectorThresholds;
}

export function createTestSystem(options: TestSystemOptions): System {
  return createSystem(createMemoryTestStorage(), {
    inference: {
      target: 'test.default',
      provider: 'test',
      model: 'test',
    },
    adapter: options.adapter,
    mode: options.mode ?? 'write',
    processing: options.processing,
    suggestion: options.suggestion,
    detectorThresholds: options.detectorThresholds,
  });
}
