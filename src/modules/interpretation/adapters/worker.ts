import { defaultProcessingConfig } from '../config.js';

interface WorkerCommand {
  execute(): Promise<boolean>;
}

export interface PollingWorkerOptions {
  readonly interval?: number;
  readonly onError?: (error: unknown) => void;
}

/**
 * Sequentially drains in-process work and checks periodically for new jobs.
 */
export class PollingWorker {
  readonly #interval: number;
  readonly #onError: (error: unknown) => void;
  #active?: Promise<void>;
  #timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly command: WorkerCommand,
    options: PollingWorkerOptions = {},
  ) {
    this.#interval = options.interval ?? defaultProcessingConfig.pollingIntervalMs;
    this.#onError = options.onError ?? (() => undefined);
  }

  start(): void {
    if (this.#timer) {
      return;
    }

    this.schedule();
    this.#timer = setInterval(() => this.schedule(), this.#interval);
  }

  async stop(): Promise<void> {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }

    await this.#active;
  }

  private schedule(): void {
    if (this.#active) {
      return;
    }

    const active = this.drain();

    this.#active = active;
    void active.finally(() => {
      if (this.#active === active) {
        this.#active = undefined;
      }
    });
  }

  private async drain(): Promise<void> {
    try {
      while (await this.command.execute()) {
        // Continue until the queue is empty.
      }
    } catch (error) {
      this.#onError(error);
    }
  }
}
