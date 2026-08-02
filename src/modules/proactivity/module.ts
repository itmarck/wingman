import type { ProactivityService } from './operations/service.js';
import type { DetectorRegistry } from './registry.js';

export interface ProactivityModule {
  readonly service: ProactivityService;
  readonly detectors: DetectorRegistry;
}
