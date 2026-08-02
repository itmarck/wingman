import { DomainError } from '../error.js';
import { assertText, assertUtcDateTime } from '../knowledge/guard.js';
import type { ItemId, ProfileReference } from './types.js';

export type { ItemId } from './types.js';

export interface CreateItemInput {
  readonly id: ItemId;
  readonly createdAt: string;
  readonly profile?: ProfileReference;
}

/** Stable identity composed from independently revisioned Components. */
export class Item {
  readonly id: ItemId;
  readonly createdAt: string;
  readonly profile?: ProfileReference;

  private constructor(input: CreateItemInput) {
    this.id = input.id;
    this.createdAt = input.createdAt;
    this.profile = input.profile ? Object.freeze({ ...input.profile }) : undefined;
    Object.freeze(this);
  }

  static create(input: CreateItemInput): Item {
    assertText(input.id, 'Item id');
    assertUtcDateTime(input.createdAt, 'Item createdAt');

    if (input.profile) {
      assertRegistryKey(input.profile.key, 'Profile key');
      assertVersion(input.profile.version, 'Profile version');
    }

    return new Item(input);
  }

  static rehydrate(input: CreateItemInput): Item {
    return Item.create(input);
  }
}

export function assertRegistryKey(value: string, name = 'Registry key'): void {
  if (!/^[a-z][A-Za-z0-9]*$/.test(value)) {
    throw new DomainError(`${name} must be an unqualified camelCase key`);
  }
}

export function assertVersion(value: number, name = 'Version'): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DomainError(`${name} must be a positive integer`);
  }
}
