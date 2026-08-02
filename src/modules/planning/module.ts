import type { PlanningQueries, PlanningView } from './operations/query.js';
import type { PlanningCommands } from './operations/write.js';

export interface PlanningModule {
  readonly commands: PlanningCommands;
  readonly queries: PlanningQueries;
  readonly views: readonly PlanningView[];
}
