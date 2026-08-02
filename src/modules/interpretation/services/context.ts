import type { ComponentRevision } from '../../../core/item/component.js';
import type { Item } from '../../../core/item/item.js';
import type { Entry } from '../../../core/knowledge/entry.js';

export interface InterpretationContext {
  readonly items: readonly Item[];
  readonly revisions: readonly ComponentRevision[];
  readonly componentSchemas: readonly {
    readonly key: string;
    readonly version: number;
    readonly description: string;
  }[];
  readonly profiles: readonly {
    readonly key: string;
    readonly version: number;
    readonly description: string;
  }[];
}

export interface InterpretationContextSource {
  findInterpretationContext(entry: Entry): Promise<InterpretationContext>;
}
