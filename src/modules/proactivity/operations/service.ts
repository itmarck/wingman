import type { CapabilityRegistry } from '../../../core/execution/capability.js';
import { type AutonomyLevel, resolveAutonomy } from '../../../core/execution/policy.js';
import type { ComponentValue } from '../../../core/item/types.js';
import { NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { GrantIntentConsentCommand } from '../../execution/operations/consent.js';
import type { ProposeIntentCommand } from '../../execution/operations/propose.js';
import type { ItemStore } from '../../knowledge/ports/store.js';
import type { PlanningQueries } from '../../planning/operations/query.js';
import type { ListStateViewQuery } from '../../state/operations/list.js';
import type { DetectorFinding, ProactivitySignal } from '../domain/detector.js';
import type { FeedbackKind, ProactiveFeedback, ProactiveProposal } from '../domain/proposal.js';
import type { ProactivityStore } from '../ports/store.js';
import type { DetectorRegistry } from '../registry.js';

export interface ProactivityPolicy {
  readonly global: AutonomyLevel;
  readonly user?: AutonomyLevel;
  readonly capabilities?: Readonly<Record<string, AutonomyLevel>>;
}
export interface FeedbackInput {
  readonly kind: FeedbackKind;
  readonly reviewAt?: string;
  readonly modification?: ComponentValue;
  readonly note?: string;
}
interface StateViews {
  execute(view: 'required' | 'forbidden'): ReturnType<ListStateViewQuery['execute']>;
}

/** Evaluates registered detectors and creates bounded, explainable Intent proposals without executing them. */
export class ProactivityService {
  constructor(
    private readonly store: ProactivityStore,
    readonly detectors: DetectorRegistry,
    private readonly knowledge: ItemStore,
    private readonly planning: PlanningQueries,
    private readonly states: StateViews,
    private readonly capabilities: CapabilityRegistry,
    private readonly proposeIntent: Pick<ProposeIntentCommand, 'execute'>,
    private readonly grantIntentConsent: Pick<GrantIntentConsentCommand, 'execute'>,
    private readonly policy: ProactivityPolicy,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async evaluate(signal: ProactivitySignal): Promise<readonly ProactiveProposal[]> {
    await this.expire();
    const [snapshot, actionable, blocked, overdue, progress, pending, required, forbidden] =
      await Promise.all([
        this.knowledge.loadKnowledge(),
        this.planning.list('actionable'),
        this.planning.list('blocked'),
        this.planning.list('overdue'),
        this.planning.list('progress'),
        this.planning.list('pending'),
        this.states.execute('required'),
        this.states.execute('forbidden'),
      ]);
    const context = {
      signal,
      snapshot,
      planning: { actionable, blocked, overdue, progress, pending },
      states: { required, forbidden },
      now: this.clock.now(),
    };
    const created: ProactiveProposal[] = [];
    for (const detector of this.detectors.relevant(signal))
      for (const finding of detector.detect(context)) {
        const fingerprint = fingerprintFor(detector.key, finding);
        if (await this.suppressed(fingerprint)) continue;
        const proposal = await this.createProposal(
          detector.key,
          detector.version,
          fingerprint,
          finding,
          signal,
        );
        await this.store.save(proposal);
        created.push(proposal);
      }
    return Object.freeze(created);
  }

  async list(): Promise<readonly ProactiveProposal[]> {
    await this.expire();
    return this.store.list();
  }
  async read(id: string): Promise<ProactiveProposal> {
    await this.expire();
    const proposal = await this.store.find(id);
    if (!proposal) throw new NotFoundError(`Proactive proposal ${id} does not exist`);
    return proposal;
  }
  async feedback(id: string, input: FeedbackInput): Promise<void> {
    const proposal = await this.read(id);
    validateFeedback(input, this.clock.now());
    if (input.kind === 'accepted' && proposal.intentId && proposal.autonomy.explicitConsent)
      await this.grantIntentConsent.execute(proposal.intentId);
    const feedback: ProactiveFeedback = Object.freeze({
      ...input,
      at: this.clock.now().toISOString(),
    });
    await this.store.save(
      Object.freeze({
        ...proposal,
        status: input.kind,
        feedback: Object.freeze([...proposal.feedback, feedback]),
      }),
    );
  }

  private async createProposal(
    detectorKey: string,
    detectorVersion: number,
    fingerprint: string,
    finding: DetectorFinding,
    signal: ProactivitySignal,
  ): Promise<ProactiveProposal> {
    const now = this.clock.now();
    const id = this.ids.generate();
    const capability = this.capabilities.find(finding.capability.key, finding.capability.version);
    const resolved = capability
      ? resolveAutonomy({
          global: this.policy.global,
          capability: this.policy.capabilities?.[capability.key] ?? capability.defaultAutonomy,
          user: this.policy.user,
          explicitlyConsented: false,
          safetyCeiling: capability.safetyCeiling,
        })
      : 'blocked';
    let intentId: string | undefined;
    if (capability && resolved !== 'blocked' && finding.evidence.length > 0)
      intentId = await this.proposeIntent.execute({
        capability: finding.capability,
        input: replaceProposalId(finding.input, id),
        proposer: { kind: 'system', id: detectorKey },
        conditions: finding.conditions,
        expectedState: [],
        consent: resolved === 'execute' ? 'none' : 'explicit',
        trigger: triggerFor(signal),
        evidence: finding.evidence,
      });
    return Object.freeze({
      id,
      fingerprint,
      detector: { key: detectorKey, version: detectorVersion },
      subjectItemId: finding.subjectItemId,
      relevantState: Object.freeze([...finding.relevantState]),
      evidence: Object.freeze([...finding.evidence]),
      rationale: finding.rationale,
      expectedEffect: finding.expectedEffect,
      urgency: finding.urgency,
      expiresAt: new Date(now.getTime() + finding.expiresInMs).toISOString(),
      capability: finding.capability,
      autonomy: Object.freeze({
        resolved,
        explicitConsent: resolved !== 'execute',
        safetyCeiling: capability?.safetyCeiling,
      }),
      intentId,
      status: capability ? 'active' : 'unsupported',
      createdAt: now.toISOString(),
      feedback: Object.freeze([]),
    });
  }
  private async suppressed(fingerprint: string): Promise<boolean> {
    const previous = await this.store.findFingerprint(fingerprint);
    if (!previous) return false;
    if (previous.status === 'postponed')
      return Boolean(
        previous.feedback.at(-1)?.reviewAt &&
          Date.parse(previous.feedback.at(-1)?.reviewAt ?? '') > this.clock.now().getTime(),
      );
    return (
      ['active', 'accepted', 'modified', 'rejected', 'unsupported'].includes(previous.status) &&
      Date.parse(previous.expiresAt) > this.clock.now().getTime()
    );
  }
  private async expire(): Promise<void> {
    const now = this.clock.now();
    for (const proposal of await this.store.list())
      if (
        ['active', 'postponed', 'modified'].includes(proposal.status) &&
        Date.parse(proposal.expiresAt) <= now.getTime()
      ) {
        const feedback = Object.freeze({ kind: 'expired' as const, at: now.toISOString() });
        await this.store.save(
          Object.freeze({
            ...proposal,
            status: 'expired',
            feedback: Object.freeze([...proposal.feedback, feedback]),
          }),
        );
      }
  }
}

function fingerprintFor(detector: string, finding: DetectorFinding): string {
  const stableState = finding.relevantState.filter(
    (value) => !/^(elapsedMs|remainingMs|inactiveMs):/.test(value),
  );
  return `${detector}:${finding.subjectItemId ?? 'system'}:${finding.capability.key}:${JSON.stringify(stableState)}`;
}
function replaceProposalId(value: ComponentValue, id: string): ComponentValue {
  if (value === '$proposalId') return id;
  if (Array.isArray(value)) return value.map((child) => replaceProposalId(child, id));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replaceProposalId(child, id)]),
    );
  return value;
}
function triggerFor(signal: ProactivitySignal) {
  return signal.kind === 'event'
    ? { kind: 'event' as const, value: signal.event.id }
    : { kind: 'manual' as const };
}
function validateFeedback(input: FeedbackInput, now: Date): void {
  if (
    input.kind === 'postponed' &&
    (!input.reviewAt ||
      Number.isNaN(Date.parse(input.reviewAt)) ||
      Date.parse(input.reviewAt) <= now.getTime())
  )
    throw new Error('Postponed feedback requires a future reviewAt');
  if (input.kind === 'modified' && input.modification === undefined)
    throw new Error('Modified feedback requires a modification');
}
