import { describe, expect, it } from 'vitest';
import { SystemWorkCommand } from '../../../system/work.js';
import { PollingWorker } from '../adapters/worker.js';

describe('run Interpretation worker', () => {
  it('drains queued work sequentially and stops cleanly', async () => {
    let remaining = 2;
    let complete: (() => void) | undefined;
    const completed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const command = {
      async execute() {
        if (remaining === 0) {
          complete?.();
          return false;
        }

        remaining -= 1;
        return true;
      },
    };
    const worker = new PollingWorker(command, { interval: 10 });

    worker.start();
    await completed;
    await worker.stop();

    expect(remaining).toBe(0);
  });
});

describe('system work command', () => {
  it('advances interpretations, Automations, and Intents in the same cycle', async () => {
    let interpretations = 1;
    let notifications = 1;
    const command = new SystemWorkCommand(
      {
        async execute() {
          const pending = interpretations > 0;
          interpretations -= Number(pending);
          return pending;
        },
      },
      {
        async runDue() {
          const due = notifications;
          notifications = 0;
          return due;
        },
      },
      {
        async runPending() {
          return 0;
        },
      },
    );

    expect(await command.execute()).toBe(true);
    expect(await command.execute()).toBe(false);
    expect({ interpretations, notifications }).toEqual({ interpretations: 0, notifications: 0 });
  });

  it('does not let failed interpretation work starve Automations or Intents', async () => {
    let notifications = 0;
    const command = new SystemWorkCommand(
      {
        async execute() {
          throw new Error('inference unavailable');
        },
      },
      {
        async runDue() {
          notifications += 1;
          return 0;
        },
      },
      {
        async runPending() {
          return 0;
        },
      },
    );

    await expect(command.execute()).rejects.toThrow('inference unavailable');
    expect(notifications).toBe(1);
  });
});
