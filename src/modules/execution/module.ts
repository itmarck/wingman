import type { CapabilityRegistry } from '../../core/execution/capability.js';
import type { CancelIntentCommand } from './operations/cancel.js';
import type { GrantIntentConsentCommand } from './operations/consent.js';
import type { ExecuteIntentCommand } from './operations/execute.js';
import type { ProposeIntentCommand } from './operations/propose.js';
import type { ExecutionStore } from './ports/store.js';

export interface ExecutionModule {
  readonly proposeIntent: ProposeIntentCommand;
  readonly grantIntentConsent: GrantIntentConsentCommand;
  readonly cancelIntent: CancelIntentCommand;
  readonly executeIntent: ExecuteIntentCommand;
  readonly capabilities: CapabilityRegistry;
  readonly store: ExecutionStore;
}
