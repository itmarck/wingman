import { describe, expect, it } from 'vitest';
import type { Server } from '../adapters/http/start.js';
import type { Database, DatabaseResult } from '../adapters/postgres/database.js';
import type { PollingWorker } from '../modules/interpretation/adapters/worker.js';
import { Runtime } from '../runtime.js';
import type { System } from '../system/system.js';

describe('Runtime lifecycle', () => {
  it('starts and closes process resources in dependency order', async () => {
    const events: string[] = [];
    const runtime = new Runtime({
      server: createServer(events),
      worker: createWorker(events),
      system: createClosable<System>('system', events),
      database: createDatabase(events),
    });

    await runtime.start();
    await runtime.close('test');
    await runtime.close('duplicate');

    expect(events).toEqual([
      'server:start',
      'worker:start',
      'runtime:test',
      'server:close',
      'worker:close',
      'system:close',
      'database:close',
    ]);
  });

  it('closes every owned resource when startup fails', async () => {
    const events: string[] = [];
    const worker = createWorker(events);
    worker.start = () => {
      events.push('worker:start');
      throw new Error('worker failed');
    };
    const runtime = new Runtime({
      server: createServer(events),
      worker,
      system: createClosable<System>('system', events),
      database: createDatabase(events),
    });

    await expect(runtime.start()).rejects.toThrow('worker failed');
    expect(events).toEqual([
      'server:start',
      'worker:start',
      'runtime:startupFailure',
      'server:close',
      'worker:close',
      'system:close',
      'database:close',
    ]);
  });
});

function createServer(events: string[]): Server {
  return {
    logger: {
      info(context) {
        const reason = 'reason' in context ? context.reason : 'unknown';

        events.push(`runtime:${String(reason)}`);
      },
      error() {},
    },
    async start() {
      events.push('server:start');
    },
    async close() {
      events.push('server:close');
    },
  };
}

function createWorker(events: string[]): PollingWorker {
  return {
    start() {
      events.push('worker:start');
    },
    async stop() {
      events.push('worker:close');
    },
  } as PollingWorker;
}

function createDatabase(events: string[]): Database {
  return {
    async query<Row>(): Promise<DatabaseResult<Row>> {
      return { rows: [] };
    },
    async close() {
      events.push('database:close');
    },
  };
}

function createClosable<Value>(name: string, events: string[]): Value {
  return {
    async close() {
      events.push(`${name}:close`);
    },
  } as Value;
}
