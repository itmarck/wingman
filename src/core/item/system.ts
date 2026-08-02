import { DomainError } from '../error.js';
import { SchemaRegistry } from './registry.js';
import type { ComponentValue } from './types.js';

/** Creates the closed schemas available to the provider-independent knowledge interpreter. */
export function createKnowledgeRegistry(): SchemaRegistry {
  const registry = new SchemaRegistry();
  registry.registerComponent(textSchema('name', 'Nombre canónico del Item'));
  registry.registerComponent({
    key: 'aliases',
    version: 1,
    description: 'Nombres alternativos del Item',
    validate(value) {
      if (
        !Array.isArray(value) ||
        !value.every((alias) => typeof alias === 'string' && alias.trim())
      ) {
        throw new DomainError('aliases must be an array of non-empty strings');
      }
    },
  });
  registry.registerComponent(textSchema('description', 'Descripción canónica del Item'));
  registry.registerComponent({
    key: 'statement',
    version: 1,
    description: 'Conocimiento descriptivo tipado por una clave de atributo',
    validate(value) {
      if (
        !isRecord(value) ||
        typeof value.attribute !== 'string' ||
        !value.attribute.trim() ||
        !('value' in value)
      ) {
        throw new DomainError('statement must contain a non-empty attribute and value');
      }
    },
  });
  registry.registerComponent(textSchema('quote', 'Cita textual exacta'));
  registry.registerComponent({
    key: 'participants',
    version: 1,
    description: 'Participantes con roles de una relación',
    validate(value) {
      if (!Array.isArray(value) || value.length < 2)
        throw new DomainError('participants requires at least two values');
    },
  });
  registry.registerProfile({
    key: 'relationship',
    version: 1,
    description: 'Conexión con participantes y semántica propia',
    relationship: true,
    components: [{ key: 'participants', version: 1 }],
  });
  return registry;
}

function textSchema(key: string, description: string) {
  return {
    key,
    version: 1,
    description,
    validate(value: ComponentValue) {
      if (typeof value !== 'string' || !value.trim())
        throw new DomainError(`${key} must be non-empty text`);
    },
  };
}

function isRecord(value: ComponentValue): value is Readonly<Record<string, ComponentValue>> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
