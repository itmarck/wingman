interface InterpretationWork {
  execute(): Promise<boolean>;
}

interface ScheduledNotificationWork {
  runDue(): Promise<number>;
}

/** Drains the runtime work that must progress without an HTTP request. */
export class SystemWorkCommand {
  constructor(
    private readonly interpretations: InterpretationWork,
    private readonly notifications: ScheduledNotificationWork,
  ) {}

  async execute(): Promise<boolean> {
    const [interpretation, notifications] = await Promise.allSettled([
      this.interpretations.execute(),
      this.notifications.runDue(),
    ]);

    const errors = [interpretation, notifications].flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length > 0) {
      if (errors.length === 1) {
        throw errors[0];
      }
      throw new AggregateError(errors, 'System work failed');
    }

    const interpreted = interpretation.status === 'fulfilled' && interpretation.value;
    const notificationCount = notifications.status === 'fulfilled' ? notifications.value : 0;

    return interpreted || notificationCount > 0;
  }
}
