import type { InterpretationAdapter } from '../services/interpreter.js';

/**
 * Produces an explicit valid empty result for tests and controlled local flows.
 */
export class EmptyInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'empty',
  });

  async interpret() {
    return Object.freeze({
      kind: 'empty',
    });
  }
}
