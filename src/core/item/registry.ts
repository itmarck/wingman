import { DomainError } from '../error.js';
import { assertText } from '../knowledge/guard.js';
import type { ComponentRevision } from './component.js';
import type { Item } from './item.js';
import { assertRegistryKey, assertVersion } from './item.js';
import type {
  ComponentRequirement,
  ComponentRevisionId,
  ComponentSchema,
  ComponentValue,
  ItemId,
  Profile,
} from './types.js';

/** Append-only catalog of closed Component schemas and composition Profiles. */
export class SchemaRegistry {
  readonly #components = new Map<string, ComponentSchema>();
  readonly #profiles = new Map<string, Profile>();

  registerComponent(schema: ComponentSchema): void {
    assertContract(schema);
    const identity = contractIdentity(schema.key, schema.version);
    if (this.#components.has(identity)) {
      throw new DomainError(`Component schema ${identity} is already registered`);
    }
    this.#components.set(identity, Object.freeze({ ...schema }));
  }

  registerProfile(profile: Profile): void {
    assertContract(profile);
    const identity = contractIdentity(profile.key, profile.version);
    if (this.#profiles.has(identity)) {
      throw new DomainError(`Profile ${identity} is already registered`);
    }
    const components = Object.freeze(profile.components.map(assertRequirement));
    const optionalComponents = Object.freeze(
      (profile.optionalComponents ?? []).map(assertRequirement),
    );
    const declared = [...components, ...optionalComponents];
    if (new Set(declared.map(({ key }) => key)).size !== declared.length)
      throw new DomainError(`Profile ${identity} declares a Component more than once`);
    for (const requirement of declared) this.requireComponent(requirement.key, requirement.version);
    const initialComponents = Object.freeze(
      (profile.initialComponents ?? []).map((initial) => {
        const requirement = assertRequirement(initial);
        const schema = this.requireComponent(requirement.key, requirement.version);
        if (
          !declared.some(({ key, version }) => key === initial.key && version === initial.version)
        )
          throw new DomainError(
            `Initial Component ${initial.key}@${initial.version} is not declared by Profile ${identity}`,
          );
        schema.validate(initial.value);
        return freezeValue({ ...initial, value: structuredClone(initial.value) });
      }),
    );
    if (profile.lifecycle) {
      const lifecycle = assertRequirement(profile.lifecycle.component);
      if (
        !declared.some(({ key, version }) => key === lifecycle.key && version === lifecycle.version)
      )
        throw new DomainError(`Profile ${identity} lifecycle Component is not declared`);
      assertText(profile.lifecycle.initial, 'Profile lifecycle initial status');
      if (!profile.lifecycle.transitions[profile.lifecycle.initial])
        throw new DomainError(`Profile ${identity} lifecycle initial status has no transitions`);
    }
    for (const state of profile.states ?? []) {
      const component = declared.find(({ key }) => key === state.component.key);
      if (!component)
        throw new DomainError(
          `Profile ${identity} State Component ${state.component.key} is not declared`,
        );
      this.requireComponent(component.key, component.version);
    }
    this.#profiles.set(
      identity,
      freezeValue({
        ...profile,
        components,
        optionalComponents,
        initialComponents,
        states: structuredClone(profile.states ?? []),
      }),
    );
  }

  requireComponent(key: string, version: number): ComponentSchema {
    const schema = this.#components.get(contractIdentity(key, version));
    if (!schema) throw new DomainError(`Component schema ${key}@${version} is not registered`);
    return schema;
  }

  requireProfile(key: string, version: number): Profile {
    const profile = this.#profiles.get(contractIdentity(key, version));
    if (!profile) throw new DomainError(`Profile ${key}@${version} is not registered`);
    return profile;
  }

  listComponents(): readonly ComponentSchema[] {
    return Object.freeze([...this.#components.values()]);
  }

  listProfiles(): readonly Profile[] {
    return Object.freeze([...this.#profiles.values()]);
  }

  validateRevision(revision: ComponentRevision): void {
    this.requireComponent(revision.key, revision.schemaVersion).validate(revision.value);
  }

  validateComposition(item: Item, revisions: readonly ComponentRevision[]): void {
    const itemRevisions = revisions.filter((revision) => revision.itemId === item.id);
    for (const revision of itemRevisions) this.validateRevision(revision);
    if (!item.profile) return;
    const profile = this.requireProfile(item.profile.key, item.profile.version);
    const current = selectCurrentRevisions(itemRevisions);
    for (const required of profile.components) {
      if (
        !current.some(
          (revision) =>
            revision.key === required.key && revision.schemaVersion === required.version,
        )
      ) {
        throw new DomainError(
          `Item ${item.id} requires Component ${required.key}@${required.version}`,
        );
      }
    }
    if (profile.relationship) assertRelationshipParticipants(current, item.id);
  }
}

export function selectCurrentRevisions(
  revisions: readonly ComponentRevision[],
): readonly ComponentRevision[] {
  const byId = new Map<ComponentRevisionId, ComponentRevision>();
  for (const revision of revisions) {
    if (byId.has(revision.id))
      throw new DomainError(`Component revision ${revision.id} is duplicated`);
    byId.set(revision.id, revision);
  }
  const superseded = new Set<ComponentRevisionId>();
  for (const revision of revisions) {
    if (!revision.supersedesRevisionId) continue;
    const target = byId.get(revision.supersedesRevisionId);
    if (!target)
      throw new DomainError(`Superseded revision ${revision.supersedesRevisionId} does not exist`);
    if (target.itemId !== revision.itemId || target.key !== revision.key) {
      throw new DomainError(
        'A Component revision can supersede only the same Item and Component key',
      );
    }
    assertNoSupersessionCycle(revision, byId);
    superseded.add(target.id);
  }
  return Object.freeze(
    revisions.filter((revision) => revision.status !== 'rejected' && !superseded.has(revision.id)),
  );
}

export function itemReference(
  itemId: ItemId,
  profile?: { readonly key: string; readonly version: number },
): ComponentValue {
  assertText(itemId, 'Item reference itemId');
  if (profile) {
    assertRegistryKey(profile.key, 'Item reference Profile key');
    assertVersion(profile.version, 'Item reference Profile version');
  }
  return Object.freeze({
    kind: 'itemReference',
    itemId,
    profile: profile ? Object.freeze({ ...profile }) : undefined,
  });
}

function assertRelationshipParticipants(
  revisions: readonly ComponentRevision[],
  itemId: string,
): void {
  const participants = revisions.filter((revision) => revision.key === 'participants');
  if (participants.length !== 1)
    throw new DomainError(
      `Relationship Item ${itemId} requires one current participants Component`,
    );
  const value = participants[0]?.value;
  if (!Array.isArray(value) || value.length < 2 || !value.every(isParticipant)) {
    throw new DomainError(`Relationship Item ${itemId} requires at least two typed participants`);
  }
}

function isParticipant(value: ComponentValue): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const participant = value as Readonly<Record<string, ComponentValue>>;
  const item = participant.item;
  return Boolean(
    typeof participant.role === 'string' &&
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      (item as Readonly<Record<string, ComponentValue>>).kind === 'itemReference',
  );
}

function assertNoSupersessionCycle(
  revision: ComponentRevision,
  byId: ReadonlyMap<string, ComponentRevision>,
): void {
  const visited = new Set([revision.id]);
  let current: ComponentRevision | undefined = revision;
  while (current.supersedesRevisionId) {
    if (visited.has(current.supersedesRevisionId))
      throw new DomainError('Component supersession cannot form a cycle');
    visited.add(current.supersedesRevisionId);
    current = byId.get(current.supersedesRevisionId);
    if (!current) return;
  }
}

function assertContract(contract: {
  readonly key: string;
  readonly version: number;
  readonly description: string;
}): void {
  assertRegistryKey(contract.key);
  assertVersion(contract.version);
  assertText(contract.description, 'Contract description');
}

function assertRequirement(requirement: ComponentRequirement): ComponentRequirement {
  assertRegistryKey(requirement.key, 'Required Component key');
  assertVersion(requirement.version, 'Required Component version');
  return Object.freeze({ ...requirement });
}

function contractIdentity(key: string, version: number): string {
  return `${key}@${version}`;
}

function freezeValue<Value>(value: Value): Value {
  if (Array.isArray(value)) {
    for (const child of value) freezeValue(child);
    return Object.freeze(value) as Value;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeValue(child);
    return Object.freeze(value);
  }
  return value;
}
