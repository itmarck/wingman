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
  it('advances interpretations and due reminders in the same cycle', async () => {
    let interpretations = 1;
    let reminders = 1;
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
          const due = reminders;
          reminders = 0;
          return due;
        },
      },
    );

    expect(await command.execute()).toBe(true);
    expect(await command.execute()).toBe(false);
    expect({ interpretations, reminders }).toEqual({ interpretations: 0, reminders: 0 });
  });

  it('does not let failed interpretation work starve reminders', async () => {
    let reminders = 0;
    const command = new SystemWorkCommand(
      {
        async execute() {
          throw new Error('inference unavailable');
        },
      },
      {
        async runDue() {
          reminders += 1;
          return 0;
        },
      },
    );

    await expect(command.execute()).rejects.toThrow('inference unavailable');
    expect(reminders).toBe(1);
  });
});
