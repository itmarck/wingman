import { assertText, normalizeText } from './guard.js';

export type ConceptId = string;

/**
 * Canonical data that defines a Concept identity.
 */
export interface ConceptMetadata {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly definition: string;
}

export interface CreateConceptInput extends ConceptMetadata {
  readonly id: ConceptId;
}

/**
 * Stable internal identity for something known by the system.
 */
export class Concept {
  readonly id: ConceptId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly definition: string;

  private constructor(id: ConceptId, metadata: ConceptMetadata) {
    this.id = id;
    this.name = metadata.name.trim();
    this.aliases = normalizeAliases(this.name, metadata.aliases);
    this.definition = metadata.definition.trim();

    Object.freeze(this);
  }

  /**
   * Creates a stable Concept from canonical metadata.
   */
  static create(input: CreateConceptInput): Concept {
    assertText(input.id, 'Concept id');
    assertMetadata(input);

    return new Concept(input.id, input);
  }

  /**
   * Reconstructs a Concept and its accumulated aliases from persistence.
   */
  static rehydrate(input: CreateConceptInput): Concept {
    return Concept.create(input);
  }

  /**
   * Adds alternative names without changing canonical Concept identity.
   */
  addAliases(aliases: readonly string[]): Concept {
    for (const alias of aliases) {
      assertText(alias, 'Concept alias');
    }

    const expanded = new Concept(this.id, {
      name: this.name,
      aliases: [...this.aliases, ...aliases],
      definition: this.definition,
    });
    const hasNewAlias = expanded.aliases.some((alias) => !this.aliases.includes(alias));

    return hasNewAlias ? expanded : this;
  }

  /**
   * Checks a canonical name or alias using deterministic normalization.
   */
  matches(value: string): boolean {
    const candidate = normalizeText(value);
    const names = [this.name, ...this.aliases].map(normalizeText);

    return names.includes(candidate);
  }

  /**
   * Checks a definition without attempting semantic inference.
   */
  hasDefinition(value: string): boolean {
    return normalizeText(this.definition) === normalizeText(value);
  }
}

function assertMetadata(metadata: ConceptMetadata): void {
  assertText(metadata.name, 'Concept name');
  assertText(metadata.definition, 'Concept definition');

  for (const alias of metadata.aliases ?? []) {
    assertText(alias, 'Concept alias');
  }
}

function normalizeAliases(name: string, aliases: readonly string[] = []): readonly string[] {
  const canonicalName = normalizeText(name);
  const uniqueAliases = new Map<string, string>();

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);

    const isCanonicalName = normalizedAlias === canonicalName;
    const isDuplicate = uniqueAliases.has(normalizedAlias);

    if (!isCanonicalName && !isDuplicate) {
      uniqueAliases.set(normalizedAlias, alias.trim());
    }
  }

  return Object.freeze([...uniqueAliases.values()]);
}
