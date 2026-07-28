import {
  type InterpretationAdapter,
  InterpreterUnavailableError,
} from '../services/interpreter.js';

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

/**
 * Prevents unconfigured runtime processing from publishing knowledge.
 */
export class UnavailableInterpreter implements InterpretationAdapter {
  readonly identity = Object.freeze({
    key: 'unavailable',
  });

  async interpret(): Promise<never> {
    throw new InterpreterUnavailableError('No Interpreter adapter is configured');
  }
}
