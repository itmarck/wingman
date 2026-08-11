import { Event } from '../../../core/execution/event.js';
import type { Evidence } from '../../../core/item/types.js';
import { NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { AutomationStore } from '../../automation/ports/store.js';
import { isNotificationInput } from '../capabilities/notification.js';
import type { ExecutionStore } from '../ports/store.js';

export interface NotificationView {
  readonly id: string;
  readonly automationId: string;
  readonly occurrenceId: string;
  readonly subjectItemId: string;
  readonly message: string;
  readonly priority: number;
  readonly deliveredAt: string;
  readonly evidence: readonly Evidence[];
  readonly actions: readonly ['acknowledge'];
}

/** Derives the compact launcher inbox and records acknowledgement outcomes. */
export class NotificationService {
  constructor(
    private readonly executions: ExecutionStore,
    private readonly automations: AutomationStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<readonly NotificationView[]> {
    const intents = await this.executions.listIntents();
    const events = await this.executions.listEvents();
    const acknowledged = new Set(
      events
        .filter(({ key }) => key === 'notificationAcknowledged')
        .flatMap(({ causation }) => (causation.intentId ? [causation.intentId] : [])),
    );
    const deliveries = new Map(
      events
        .filter(({ key, causation }) => key === 'notificationDelivered' && causation.intentId)
        .map((event) => [event.causation.intentId as string, event]),
    );
    const candidates = (
      await Promise.all(
        intents.flatMap((intent) => {
          const delivery = deliveries.get(intent.id);
          return !delivery || acknowledged.has(intent.id) || !isNotificationInput(intent.input)
            ? []
            : [this.view(intent, delivery.occurredAt)];
        }),
      )
    ).filter((candidate): candidate is NotificationView => candidate !== undefined);
    const compact = new Map<string, NotificationView>();
    for (const candidate of candidates) {
      const key = `${candidate.subjectItemId}:${normalize(candidate.message)}`;
      const current = compact.get(key);
      if (!current || compare(candidate, current) < 0) compact.set(key, candidate);
    }
    return Object.freeze([...compact.values()].sort(compare));
  }

  async read(id: string): Promise<NotificationView> {
    const notification = (await this.list()).find((candidate) => candidate.id === id);
    if (!notification) throw new NotFoundError(`Notification ${id} does not exist`);
    return notification;
  }

  async acknowledge(id: string): Promise<void> {
    await this.read(id);
    await this.executions.appendEvent(
      Event.create({
        id: this.ids.generate(),
        key: 'notificationAcknowledged',
        occurredAt: this.clock.now().toISOString(),
        causation: { intentId: id },
        data: { status: 'acknowledged' },
      }),
    );
  }

  private async view(
    intent: Awaited<ReturnType<ExecutionStore['listIntents']>>[number],
    deliveredAt: string,
  ): Promise<NotificationView | undefined> {
    if (!isNotificationInput(intent.input)) return undefined;
    const automationId = intent.proposer.kind === 'automation' ? intent.proposer.id : undefined;
    const occurrenceId = intent.trigger?.value;
    const runtime = automationId ? await this.automations.find(automationId) : undefined;
    const subjectItemId = runtime?.automation.subjects[0]?.itemId;
    if (!automationId || !occurrenceId || !subjectItemId) return undefined;
    const input =
      intent.input as unknown as import('../capabilities/notification.js').NotificationInput;
    return Object.freeze({
      id: intent.id,
      automationId,
      occurrenceId,
      subjectItemId,
      message: input.message,
      priority: input.priority ?? runtime.automation.controls.priority ?? 0,
      deliveredAt,
      evidence: intent.evidence,
      actions: Object.freeze(['acknowledge'] as const),
    });
  }
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function compare(left: NotificationView, right: NotificationView): number {
  return (
    right.priority - left.priority ||
    right.deliveredAt.localeCompare(left.deliveredAt) ||
    right.occurrenceId.localeCompare(left.occurrenceId)
  );
}
