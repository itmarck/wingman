import { createTriggerRegistry } from '../../../../core/automation/registry.js';
import { CapabilityRegistry } from '../../../../core/execution/capability.js';
import { createKnowledgeRegistry } from '../../../../core/item/system.js';
import type { ComponentValue } from '../../../../core/item/types.js';
import { Entry } from '../../../../core/knowledge/entry.js';
import { createOperatorRegistry } from '../../../../core/state/registry.js';
import { NotificationCapability } from '../../../execution/capabilities/notification.js';
import { InterpretationCompiler } from '../../services/compiler.js';

export const recordedAt = '2026-08-10T12:00:00.000Z';
export const entry = Entry.create({
  id: 'entry-1',
  content: { kind: 'text', text: 'Pagar la tarjeta' },
  origin: { source: 'test' },
  capturedAt: recordedAt,
});
export const snapshot = { entries: [entry], items: [], revisions: [] } as const;

export function createCompiler(): InterpretationCompiler {
  const capabilities = new CapabilityRegistry();
  capabilities.register(new NotificationCapability());
  return new InterpretationCompiler(
    createKnowledgeRegistry(),
    createOperatorRegistry(),
    createTriggerRegistry(),
    capabilities,
  );
}

export function item(
  reference: string,
  profile: { readonly key: string; readonly version: number } | undefined,
  key: string,
  value: ComponentValue,
) {
  return {
    kind: 'item' as const,
    version: 1 as const,
    reference,
    dependsOn: [],
    unresolved: [],
    profile,
    referenceStatus: 'identified' as const,
    components: [{ reference: `${reference}.${key}`, key, schemaVersion: 1, value }],
  };
}
