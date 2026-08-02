import type { Condition } from '../../../core/state/condition.js';
import type { Modality } from '../../../core/state/state.js';

export interface DerivedStateDefinition {
  readonly id: string;
  readonly modality: Modality;
  readonly condition: Condition;
  readonly description: string;
}
