import type { Server } from './adapters/http/start.js';
import type { Database } from './adapters/postgres/database.js';
import type { PollingWorker } from './modules/interpretation/adapters/worker.js';
import type { System } from './system/system.js';

export interface RuntimeOptions {
  readonly server: Server;
  readonly worker: PollingWorker;
  readonly system: System;
  readonly database: Database;
}

/**
 * Coordinates the lifecycle of the complete Wingman process.
 */
export class Runtime {
  readonly #server: Server;
  readonly #worker: PollingWorker;
  readonly #system: System;
  readonly #database: Database;
  #started = false;
  #closing?: Promise<void>;

  constructor(options: RuntimeOptions) {
    this.#server = options.server;
    this.#worker = options.worker;
    this.#system = options.system;
    this.#database = options.database;
  }

  async start(): Promise<void> {
    if (this.#started) {
      return;
    }

    try {
      await this.#server.start();
      this.#worker.start();
      this.#started = true;
    } catch (error) {
      try {
        await this.close('startupFailure');
      } catch (closeError) {
        throw new AggregateError([error, closeError], 'Runtime startup and cleanup failed');
      }
      throw error;
    }
  }

  async close(reason: string): Promise<void> {
    if (!this.#closing) {
      this.#closing = this.stop(reason);
    }

    await this.#closing;
  }

  private async stop(reason: string): Promise<void> {
    this.#server.logger.info({ reason }, 'Stopping runtime');

    await closeAll([
      () => this.#server.close(),
      () => this.#worker.stop(),
      () => this.#system.close(),
      () => this.#database.close(),
    ]);
  }
}

async function closeAll(actions: readonly (() => Promise<void>)[]): Promise<void> {
  const errors: unknown[] = [];

  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Runtime shutdown failed');
  }
}
