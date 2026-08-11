interface InterpretationWork {
  execute(): Promise<boolean>;
}

interface AutomationWork {
  runDue(): Promise<number>;
}

interface ExecutionWork {
  runPending(): Promise<number>;
}

/** Drains the runtime work that must progress without an HTTP request. */
export class SystemWorkCommand {
  constructor(
    private readonly interpretations: InterpretationWork,
    private readonly automations: AutomationWork,
    private readonly executions: ExecutionWork,
  ) {}

  async execute(): Promise<boolean> {
    const [interpretation, automations] = await Promise.allSettled([
      this.interpretations.execute(),
      this.automations.runDue(),
    ]);
    const execution = await Promise.resolve()
      .then(() => this.executions.runPending())
      .then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason }),
      );

    const errors = [interpretation, automations, execution].flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length > 0) {
      if (errors.length === 1) {
        throw errors[0];
      }
      throw new AggregateError(errors, 'System work failed');
    }

    const interpreted = interpretation.status === 'fulfilled' && interpretation.value;
    const automationCount = automations.status === 'fulfilled' ? automations.value : 0;

    const executionCount = execution.status === 'fulfilled' ? execution.value : 0;
    return interpreted || automationCount > 0 || executionCount > 0;
  }
}
