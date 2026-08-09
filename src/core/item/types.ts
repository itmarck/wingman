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

export interface ProfileInitialComponent extends ComponentRequirement {
  readonly value: ComponentValue;
}

export interface ProfileLifecycle {
  readonly component: ComponentRequirement;
  readonly initial: string;
  readonly transitions: Readonly<Record<string, readonly string[]>>;
}

export interface ProfileStateTemplate {
  readonly modality: 'observed' | 'desired' | 'required' | 'forbidden' | 'believed' | 'predicted';
  readonly operator: { readonly key: string; readonly version: number };
  readonly component: { readonly key: string; readonly field?: string };
  readonly value: ComponentValue;
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
  readonly optionalComponents?: readonly ComponentRequirement[];
  readonly initialComponents?: readonly ProfileInitialComponent[];
  readonly lifecycle?: ProfileLifecycle;
  readonly states?: readonly ProfileStateTemplate[];
  readonly relationship?: boolean;
}
