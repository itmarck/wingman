import { DomainError } from '../error.js';
import { assertText, assertUtcDateTime } from './guard.js';

export type EntryId = string;

export type EntryContent =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'url'; readonly url: string };

export interface EntryOrigin {
  readonly source: string;
  readonly externalId?: string;
}

export interface EntryMetadata {
  readonly origin: EntryOrigin;
  readonly capturedAt: string;
}

export interface CreateEntryInput extends EntryMetadata {
  readonly id: EntryId;
  readonly content: EntryContent;
}

/**
 * Original immutable information received by the system.
 */
export class Entry {
  readonly id: EntryId;
  readonly content: EntryContent;
  readonly origin: EntryOrigin;
  readonly capturedAt: string;

  private constructor(input: CreateEntryInput) {
    this.id = input.id;
    this.content = Object.freeze({ ...input.content });
    this.origin = Object.freeze({ ...input.origin });
    this.capturedAt = input.capturedAt;

    Object.freeze(this);
  }

  /**
   * Creates an Entry while preserving the exact supplied content.
   */
  static create(input: CreateEntryInput): Entry {
    assertText(input.id, 'Entry id');
    assertMetadata(input);
    assertContent(input.content);

    return new Entry(input);
  }

  /**
   * Reconstructs an Entry from persistence without changing its identity or timestamps.
   */
  static rehydrate(input: CreateEntryInput): Entry {
    return Entry.create(input);
  }
}

function assertContent(content: EntryContent): void {
  if (content.kind === 'text') {
    assertText(content.text, 'Entry text');
    return;
  }

  assertUrl(content.url);
}

function assertMetadata(metadata: EntryMetadata): void {
  assertText(metadata.origin.source, 'Entry origin source');
  assertUtcDateTime(metadata.capturedAt, 'Entry capturedAt');

  if (metadata.origin.externalId !== undefined) {
    assertText(metadata.origin.externalId, 'Entry origin externalId');
  }
}

function assertUrl(value: string): void {
  try {
    new URL(value);
  } catch {
    throw new DomainError('Entry url must be valid');
  }
}
