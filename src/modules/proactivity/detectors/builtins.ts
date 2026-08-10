import type { ComponentRevision } from '../../../core/item/component.js';
import type { Evidence } from '../../../core/item/types.js';
import type { Condition } from '../../../core/state/condition.js';
import type { DetectorContext, DetectorFinding, ProactiveDetector } from '../domain/detector.js';
import { DetectorRegistry } from '../registry.js';

const day = 86_400_000;

export interface DetectorThresholds {
  readonly blockerMs: number;
  readonly deadlineLeadMs: number;
  readonly inactivityMs: number;
}
export const defaultDetectorThresholds: DetectorThresholds = {
  blockerMs: 7 * day,
  deadlineLeadMs: 3 * day,
  inactivityMs: 14 * day,
};

export function createDetectorRegistry(
  thresholds: DetectorThresholds = defaultDetectorThresholds,
): DetectorRegistry {
  const registry = new DetectorRegistry();
  registry.register(missingNextAction());
  registry.register(blockerDuration(thresholds.blockerMs));
  registry.register(deadlineRisk(thresholds.deadlineLeadMs));
  registry.register(inactivity(thresholds.inactivityMs));
  registry.register(conflict());
  registry.register(relevantChange());
  return registry;
}

function missingNextAction(): ProactiveDetector {
  return detector(
    'missingNextAction',
    'Active objective without an actionable next task',
    { profiles: ['objective'], componentKeys: ['lifecycle', 'planning'] },
    (context) =>
      context.planning.progress
        .filter(
          (objective) => objective.status === 'active' && objective.hasActionableNextStep === false,
        )
        .flatMap((objective) =>
          suggestion(
            context,
            objective.itemId,
            objective.status,
            [`objective:${objective.itemId}:noNextAction`],
            `The active objective “${objective.title}” has no actionable next task.`,
            'Create or choose one concrete next task.',
            'medium',
            3 * day,
          ),
        ),
  );
}
function blockerDuration(windowMs: number): ProactiveDetector {
  return detector(
    'blockerDuration',
    'Planning Item blocked beyond its review window',
    { componentKeys: ['planning', 'lifecycle'] },
    (context) =>
      context.planning.blocked.flatMap((item) => {
        const created = context.snapshot.items.find(
          (candidate) => candidate.id === item.itemId,
        )?.createdAt;
        const elapsed = created ? context.now.getTime() - Date.parse(created) : 0;
        return elapsed >= windowMs
          ? suggestion(
              context,
              item.itemId,
              item.status,
              [`blockedBy:${item.blockerIds.join(',')}`, `elapsedMs:${elapsed}`],
              `“${item.title}” has remained blocked for ${Math.floor(elapsed / day)} days by ${item.blockerIds.join(', ')}.`,
              'Review or remove the blocking dependency.',
              'high',
              day,
            )
          : [];
      }),
  );
}
function deadlineRisk(leadMs: number): ProactiveDetector {
  return detector(
    'deadlineRisk',
    'Incomplete work approaching or past its deadline',
    { componentKeys: ['temporal', 'lifecycle'] },
    (context) =>
      context.planning.pending.flatMap((item) => {
        if (!item.dueAt) return [];
        const remaining = Date.parse(item.dueAt) - context.now.getTime();
        if (remaining > leadMs) return [];
        return suggestion(
          context,
          item.itemId,
          item.status,
          [`dueAt:${item.dueAt}`, `remainingMs:${remaining}`],
          remaining < 0
            ? `“${item.title}” is overdue.`
            : `“${item.title}” is due within ${Math.ceil(remaining / day)} days.`,
          'Review priority or schedule focused work.',
          remaining < 0 ? 'critical' : 'high',
          Math.max(60_000, Math.min(day, Math.abs(remaining))),
        );
      }),
  );
}
function inactivity(windowMs: number): ProactiveDetector {
  return detector(
    'inactivity',
    'Pending planning Item without recent updates',
    { componentKeys: ['lifecycle', 'progress'] },
    (context) =>
      context.planning.pending.flatMap((item) => {
        const revisions = context.snapshot.revisions.filter(
          (revision) => revision.itemId === item.itemId,
        );
        const latest = Math.max(...revisions.map((revision) => Date.parse(revision.recordedAt)));
        const elapsed = context.now.getTime() - latest;
        return elapsed >= windowMs
          ? suggestion(
              context,
              item.itemId,
              item.status,
              [`inactiveMs:${elapsed}`],
              `“${item.title}” has no recorded progress for ${Math.floor(elapsed / day)} days.`,
              'Confirm whether it remains relevant or update its status.',
              'low',
              3 * day,
            )
          : [];
      }),
  );
}
function conflict(): ProactiveDetector {
  return detector(
    'conflict',
    'Required and forbidden State share the same condition',
    { state: true },
    (context) =>
      context.states.required.flatMap((required) => {
        const opposite = context.states.forbidden.find(
          (forbidden) =>
            JSON.stringify(forbidden.state?.condition) ===
            JSON.stringify(required.state?.condition),
        );
        if (!opposite) return [];
        const evidence = uniqueEvidence([
          ...(required.state?.evidence ?? []),
          ...(opposite.state?.evidence ?? []),
        ]);
        return [
          baseFinding(
            undefined,
            undefined,
            [`required:${required.id}`, `forbidden:${opposite.id}`],
            evidence,
            'The same condition is both required and forbidden.',
            'Resolve the conflicting constraints before acting.',
            'critical',
            day,
          ),
        ];
      }),
  );
}
function relevantChange(): ProactiveDetector {
  return detector(
    'relevantChange',
    'Relevant new knowledge or Event',
    { componentKeys: ['planning', 'temporal', 'progress'], eventKeys: ['notificationDelivered'] },
    (context) => {
      if (context.signal.kind === 'event') {
        const entryId = context.signal.event.causation.entryId;
        return [
          baseFinding(
            undefined,
            undefined,
            [`event:${context.signal.event.id}`],
            entryId ? [{ entryId, sourceLocators: [] }] : [],
            `Relevant Event ${context.signal.event.key} occurred.`,
            'Review whether the new event changes the current plan.',
            'low',
            day,
          ),
        ];
      }
      if (context.signal.kind === 'knowledge') {
        const signal = context.signal;
        return signal.itemIds.flatMap((itemId) =>
          suggestion(
            context,
            itemId,
            undefined,
            [`components:${signal.componentKeys.join(',')}`],
            'Relevant planning knowledge changed.',
            'Review affected plans and next actions.',
            'low',
            day,
          ),
        );
      }
      return [];
    },
  );
}

function detector(
  key: string,
  description: string,
  dependencies: ProactiveDetector['dependencies'],
  detect: ProactiveDetector['detect'],
): ProactiveDetector {
  return { key, version: 1, description, dependencies, detect };
}
function suggestion(
  context: DetectorContext,
  itemId: string,
  status: string | undefined,
  state: readonly string[],
  rationale: string,
  effect: string,
  urgency: DetectorFinding['urgency'],
  expiresInMs: number,
): readonly DetectorFinding[] {
  const evidence = evidenceFor(context.snapshot.revisions, itemId);
  return evidence.length > 0
    ? [baseFinding(itemId, status, state, evidence, rationale, effect, urgency, expiresInMs)]
    : [];
}
function baseFinding(
  subjectItemId: string | undefined,
  status: string | undefined,
  relevantState: readonly string[],
  evidence: readonly Evidence[],
  rationale: string,
  expectedEffect: string,
  urgency: DetectorFinding['urgency'],
  expiresInMs: number,
): DetectorFinding {
  const conditions: readonly Condition[] =
    subjectItemId && status
      ? [
          {
            operator: { key: 'equal', version: 1 },
            operands: [
              { kind: 'component', itemId: subjectItemId, key: 'lifecycle', field: 'status' },
              { kind: 'literal', value: status },
            ],
          },
        ]
      : [];
  return Object.freeze({
    subjectItemId,
    relevantState: Object.freeze([...relevantState]),
    evidence: Object.freeze([...evidence]),
    rationale,
    expectedEffect,
    urgency,
    expiresInMs,
    capability: { key: 'notification', version: 1 },
    input: { message: rationale },
    conditions,
  });
}
function evidenceFor(revisions: readonly ComponentRevision[], itemId: string): readonly Evidence[] {
  return uniqueEvidence(
    revisions
      .filter((revision) => revision.itemId === itemId)
      .flatMap((revision) => revision.evidence),
  );
}
function uniqueEvidence(evidence: readonly Evidence[]): readonly Evidence[] {
  const seen = new Set<string>();
  return Object.freeze(
    evidence.filter((value) => {
      const key = `${value.entryId}:${JSON.stringify(value.sourceLocators)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}
