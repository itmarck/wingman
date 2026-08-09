import type { ComponentRevision } from '../../../core/item/component.js';
import type { Item } from '../../../core/item/item.js';
import type { Profile } from '../../../core/item/types.js';
import type { Entry } from '../../../core/knowledge/entry.js';

export interface InterpretationContext {
  readonly items: readonly Item[];
  readonly revisions: readonly ComponentRevision[];
  readonly componentSchemas: readonly {
    readonly key: string;
    readonly version: number;
    readonly description: string;
  }[];
  readonly profiles: readonly Profile[];
  readonly conditionOperators?: readonly ContractDescription[];
  readonly triggerOperators?: readonly ContractDescription[];
  readonly capabilities?: readonly (ContractDescription & {
    readonly defaultAutonomy: string;
    readonly safetyCeiling: string;
  })[];
}

interface ContractDescription {
  readonly key: string;
  readonly version: number;
  readonly description: string;
}

export interface InterpretationContextSource {
  findInterpretationContext(entry: Entry): Promise<InterpretationContext>;
}
