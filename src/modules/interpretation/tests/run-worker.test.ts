import { describe, expect, it } from 'vitest';
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
