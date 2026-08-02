import { ComponentRevision } from '../../../core/item/component.js';
import { Item } from '../../../core/item/item.js';
import {
  itemReference,
  type SchemaRegistry,
  selectCurrentRevisions,
} from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { normalizeText } from '../../../core/knowledge/guard.js';
import { ConflictError, InvalidInputError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type {
  InterpretationItem,
  ReferenceDecision,
  RegisterInterpretationInput,
} from '../domain/input.js';
import type { Interpretation, InterpreterIdentity } from '../domain/interpretation.js';
import { type ReferenceResolution, Review, type ReviewId } from '../domain/review.js';
import type { InterpretationLifecycle } from '../ports/lifecycle.js';
import type { InterpretationClaim } from '../ports/queue.js';
import type { InterpretationRegistration, InterpretationStore } from '../ports/store.js';
import { validateInterpretationDraft } from './validate.js';

export interface RegisterInterpretationResult {
  readonly interpretation: Interpretation;
  readonly reviewIds: readonly ReviewId[];
}
export interface PreparedReviewCompletion {
  readonly interpretation: Interpretation;
  readonly registration: InterpretationRegistration;
}

/** Registers Items and Component revisions extracted from an immutable Entry. */
export class RegisterInterpretationCommand {
  constructor(
    private readonly store: InterpretationStore,
    private readonly lifecycle: InterpretationLifecycle,
    private readonly registry: SchemaRegistry,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    interpretation: Interpretation,
    input: RegisterInterpretationInput,
    interpreter: InterpreterIdentity,
    claim?: InterpretationClaim,
  ): Promise<RegisterInterpretationResult> {
    const snapshot = await this.store.loadKnowledge();
    const completedInput = completeMissingResolutions(input, snapshot);
    validateInterpretationDraft(completedInput, snapshot, this.registry);
    if ((completedInput.referenceDecisions ?? []).length > 0)
      throw new InvalidInputError('Interpreter cannot make reference decisions');
    const resolutions = findPendingResolutions(completedInput, snapshot, new Map());
    if (resolutions.length > 0) {
      const reviews = resolutions.map((resolution) =>
        Review.createInterpretation({
          id: this.ids.generate(),
          interpretationId: interpretation.id,
          entryId: input.entryId,
          resolution,
          createdAt: this.clock.now().toISOString(),
        }),
      );
      const pending = interpretation.requestReview(
        completedInput,
        interpreter,
        this.clock.now().toISOString(),
      );
      await this.lifecycle.requestReviews(pending, reviews, claim);
      return Object.freeze({
        interpretation: pending,
        reviewIds: Object.freeze(reviews.map((review) => review.id)),
      });
    }
    return this.publish(interpretation, completedInput, interpreter, snapshot, new Map(), claim);
  }

  async completeEmpty(
    interpretation: Interpretation,
    interpreter: InterpreterIdentity,
    claim?: InterpretationClaim,
  ): Promise<Interpretation> {
    const completed = interpretation.completeEmpty(interpreter, this.clock.now().toISOString());
    await this.lifecycle.publish(completed, { items: [], revisions: [] }, claim);
    return completed;
  }

  async prepareReviewCompletion(
    interpretation: Interpretation,
    reviews: readonly Review[],
  ): Promise<PreparedReviewCompletion> {
    const input = requireDraft(interpretation);
    const snapshot = await this.store.loadKnowledge();
    validateInterpretationDraft(input, snapshot, this.registry);
    const decisions = new Map(
      reviews.map((review) => [review.resolution.reference, requireDecision(review)]),
    );
    if (findPendingResolutions(input, snapshot, decisions).length > 0)
      throw new ConflictError(
        `Interpretation ${interpretation.id} still has unresolved references`,
      );
    const prepared = createRegistration(
      input,
      snapshot,
      decisions,
      this.registry,
      this.ids,
      this.clock.now().toISOString(),
    );
    if (prepared.registration.items.length === 0 && prepared.registration.revisions.length === 0)
      throw new InvalidInputError('Interpretation Draft does not produce new knowledge');
    return Object.freeze({
      interpretation: interpretation.completeReview(
        [...decisions.values()],
        prepared.publication,
        this.clock.now().toISOString(),
      ),
      registration: prepared.registration,
    });
  }

  private async publish(
    interpretation: Interpretation,
    input: RegisterInterpretationInput,
    interpreter: InterpreterIdentity,
    snapshot: KnowledgeSnapshot,
    decisions: ReadonlyMap<string, ReferenceDecision>,
    claim?: InterpretationClaim,
  ): Promise<RegisterInterpretationResult> {
    const prepared = createRegistration(
      input,
      snapshot,
      decisions,
      this.registry,
      this.ids,
      this.clock.now().toISOString(),
    );
    if (prepared.registration.items.length === 0 && prepared.registration.revisions.length === 0)
      throw new InvalidInputError('Interpretation Draft does not produce new knowledge');
    const completed = interpretation.completeKnowledge(
      input,
      interpreter,
      prepared.publication,
      this.clock.now().toISOString(),
    );
    await this.lifecycle.publish(completed, prepared.registration, claim);
    return Object.freeze({ interpretation: completed, reviewIds: Object.freeze([]) });
  }
}

function createRegistration(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
  decisions: ReadonlyMap<string, ReferenceDecision>,
  registry: SchemaRegistry,
  ids: IdGenerator,
  recordedAt: string,
) {
  const references = new Map(snapshot.items.map((item) => [item.id, item]));
  const items: Item[] = [];
  for (const draft of input.items) {
    const selected = decisions.get(draft.reference)?.selectedItemId;
    const existing = selected
      ? references.get(selected)
      : findIdentityMatch(draft, input, snapshot);
    const item =
      existing ??
      Item.create({ id: ids.generate(), createdAt: recordedAt, profile: draft.profile });
    references.set(draft.reference, item);
    if (!snapshot.items.some((candidate) => candidate.id === item.id)) items.push(item);
  }
  const revisionReferences = new Map(
    snapshot.revisions.map((revision) => [revision.id, revision.id]),
  );
  const revisions: ComponentRevision[] = [];
  for (const draft of input.components) {
    const item = references.get(draft.itemReference);
    if (!item) throw new InvalidInputError(`Item reference ${draft.itemReference} does not exist`);
    const revision = ComponentRevision.create({
      id: ids.generate(),
      itemId: item.id,
      key: draft.key,
      schemaVersion: draft.schemaVersion,
      value: resolveValue(draft.value, references),
      evidence: [{ entryId: input.entryId, sourceLocators: draft.sourceLocators ?? [] }],
      recordedAt,
      validTime: draft.validTime,
      status: draft.status,
      supersedesRevisionId: draft.supersedesReference
        ? revisionReferences.get(draft.supersedesReference)
        : undefined,
    });
    registry.validateRevision(revision);
    revisionReferences.set(draft.reference, revision.id);
    revisions.push(revision);
  }
  for (const item of items)
    registry.validateComposition(item, [...snapshot.revisions, ...revisions]);
  selectCurrentRevisions([...snapshot.revisions, ...revisions]);
  return {
    registration: Object.freeze({
      items: Object.freeze(items),
      revisions: Object.freeze(revisions),
    }),
    publication: Object.freeze({
      itemIds: Object.freeze(items.map((item) => item.id)),
      revisionIds: Object.freeze(revisions.map((revision) => revision.id)),
    }),
  };
}

function findPendingResolutions(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
  decisions: ReadonlyMap<string, ReferenceDecision>,
): readonly ReferenceResolution[] {
  return Object.freeze(
    (input.referenceResolutions ?? [])
      .filter((request) => !decisions.has(request.reference))
      .map((request) => ({
        reference: request.reference,
        question: request.question,
        proposed: requireItem(input.items, request.reference),
        candidates: Object.freeze(
          request.candidateItemIds.map((id) => ({ id, label: itemLabel(id, snapshot) })),
        ),
      })),
  );
}

function completeMissingResolutions(
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): RegisterInterpretationInput {
  const existing = new Set((input.referenceResolutions ?? []).map((request) => request.reference));
  const additions = input.items
    .filter((item) => item.referenceStatus === 'uncertain' && !existing.has(item.reference))
    .map((item) => ({
      reference: item.reference,
      question: `¿A qué Item corresponde ${itemLabelFromDraft(item, input)}?`,
      candidateItemIds: identityCandidates(item, input, snapshot).map((candidate) => candidate.id),
    }));
  return Object.freeze({
    ...input,
    referenceResolutions: Object.freeze([...(input.referenceResolutions ?? []), ...additions]),
  });
}

function identityCandidates(
  item: InterpretationItem,
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): readonly Item[] {
  const label = normalizeText(itemLabelFromDraft(item, input));
  const current = selectCurrentRevisions(snapshot.revisions);
  return snapshot.items.filter((candidate) =>
    current.some(
      (revision) =>
        revision.itemId === candidate.id &&
        ['name', 'aliases'].includes(revision.key) &&
        values(revision.value).some((value) => normalizeText(value) === label),
    ),
  );
}

function findIdentityMatch(
  item: InterpretationItem,
  input: RegisterInterpretationInput,
  snapshot: KnowledgeSnapshot,
): Item | undefined {
  const candidates = identityCandidates(item, input, snapshot);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function itemLabel(id: string, snapshot: KnowledgeSnapshot): string {
  const revision = selectCurrentRevisions(snapshot.revisions).find(
    (candidate) => candidate.itemId === id && candidate.key === 'name',
  );
  return typeof revision?.value === 'string' ? revision.value : id;
}

function itemLabelFromDraft(item: InterpretationItem, input: RegisterInterpretationInput): string {
  const name = input.components.find(
    (component) => component.itemReference === item.reference && component.key === 'name',
  )?.value;
  return typeof name === 'string' ? name : item.reference;
}

function resolveValue(
  value: ComponentValue,
  references: ReadonlyMap<string, Item>,
): ComponentValue {
  if (!value || typeof value !== 'object') return value;
  if (
    !Array.isArray(value) &&
    (value as Readonly<Record<string, ComponentValue>>).kind === 'itemReference'
  ) {
    const reference = value as {
      readonly kind: 'itemReference';
      readonly itemId: string;
      readonly profile?: { readonly key: string; readonly version: number };
    };
    const item = references.get(reference.itemId);
    if (!item) throw new InvalidInputError(`Item reference ${reference.itemId} does not exist`);
    return itemReference(item.id, reference.profile);
  }
  if (Array.isArray(value))
    return Object.freeze(value.map((child) => resolveValue(child, references)));
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, resolveValue(child, references)]),
    ),
  );
}

function values(value: ComponentValue): readonly string[] {
  return typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((child): child is string => typeof child === 'string')
      : [];
}
function requireItem(items: readonly InterpretationItem[], reference: string): InterpretationItem {
  const item = items.find((candidate) => candidate.reference === reference);
  if (!item) throw new InvalidInputError(`Item reference ${reference} does not exist`);
  return item;
}
function requireDraft(interpretation: Interpretation): RegisterInterpretationInput {
  if (!interpretation.draft)
    throw new ConflictError(`Interpretation ${interpretation.id} has no Draft`);
  return interpretation.draft;
}
function requireDecision(review: Review): ReferenceDecision {
  if (!review.decision) throw new ConflictError(`Review ${review.id} is unresolved`);
  return review.decision;
}
