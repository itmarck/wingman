import type { ProposeIntentCommand } from './operations/propose.js';

export interface IntentModule {
  readonly proposeIntent: ProposeIntentCommand;
}
