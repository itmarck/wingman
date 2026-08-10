import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { ProcessingConfig } from '../config.js';
import type { InterpretationQueue } from '../ports.js';
import type { ProcessInterpretationCommand } from './process.js';

/**
 * Runs at most one queued Entry so the daemon controls scheduling and load.
 */
export class ProcessNextCommand {
  constructor(
    private readonly queue: InterpretationQueue,
    private readonly processInterpretation: ProcessInterpretationCommand,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly config: ProcessingConfig,
  ) {}

  async execute(): Promise<boolean> {
    const claimedAt = this.clock.now();
    const claim = await this.queue.claim({
      claimId: this.ids.generate(),
      claimedAt: claimedAt.toISOString(),
      leaseUntil: addMilliseconds(claimedAt, this.config.leaseDurationMs),
    });

    if (!claim) {
      return false;
    }

    let renewalError: unknown;
    let renewal = Promise.resolve();
    const timer = setInterval(() => {
      renewal = renewal
        .then(() =>
          this.queue.renew(claim, addMilliseconds(this.clock.now(), this.config.leaseDurationMs)),
        )
        .catch((error: unknown) => {
          renewalError = error;
        });
    }, this.config.leaseRenewalIntervalMs);

    try {
      await this.processInterpretation.execute(claim);
      clearInterval(timer);
      await renewal;

      if (renewalError) {
        throw renewalError;
      }

      await this.queue.complete(claim);
    } finally {
      clearInterval(timer);
    }

    return true;
  }
}

function addMilliseconds(date: Date, milliseconds: number): string {
  return new Date(date.getTime() + milliseconds).toISOString();
}
