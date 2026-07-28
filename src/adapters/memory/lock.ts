/**
 * Serializes compound in-memory writes so tests exercise transaction-like boundaries.
 */
export class MemoryLock {
  #tail = Promise.resolve();

  async run<Value>(operation: () => Promise<Value>): Promise<Value> {
    const previous = this.#tail;
    let release = (): void => {};

    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await operation();
    } finally {
      release();
    }
  }
}
