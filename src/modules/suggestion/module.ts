import type { SuggestionService } from './operations/service.js';
import type { DetectorRegistry } from './registry.js';

export interface SuggestionModule {
  readonly service: SuggestionService;
  readonly detectors: DetectorRegistry;
}
