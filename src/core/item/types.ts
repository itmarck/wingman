import type { EntryId } from '../knowledge/entry.js';
import type { SourceLocator } from '../knowledge/source.js';

export type ItemId = string;
export type ComponentRevisionId = string;
export type CandidateStatus = 'accepted' | 'candidate' | 'rejected';

export type ScalarValue = boolean | number | string | null;
export type ComponentValue =
  | ScalarValue
  | ItemReference
  | readonly ComponentValue[]
  | { readonly [key: string]: ComponentValue };

export interface ItemReference {
  readonly kind: 'itemReference';
  readonly itemId: ItemId;
  readonly profile?: ProfileReference;
}

export interface ProfileReference {
  readonly key: string;
  readonly version: number;
}

export interface Evidence {
  readonly entryId: EntryId;
  readonly sourceLocators: readonly SourceLocator[];
}

export interface ValidTime {
  readonly from?: string;
  readonly to?: string;
}

export interface ComponentRequirement {
  readonly key: string;
  readonly version: number;
}

export interface ComponentSchema {
  readonly key: string;
  readonly version: number;
  readonly description: string;
  validate(value: ComponentValue): void;
}

export interface Profile {
  readonly key: string;
  readonly version: number;
  readonly description: string;
  readonly components: readonly ComponentRequirement[];
  readonly relationship?: boolean;
}
