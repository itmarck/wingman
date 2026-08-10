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
  registry.registerComponent(
    textSchema(
      'quote',
      'Valor string que es un substring exacto, sensible a mayúsculas, de la Entry',
    ),
  );
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
  registerPlanningSchemas(registry);
  return registry;
}

function registerPlanningSchemas(registry: SchemaRegistry): void {
  registry.registerComponent(
    recordSchema(
      'descriptive',
      'Valor { title: texto no vacío, notes?: texto }',
      (value) =>
        typeof value.title === 'string' &&
        Boolean(value.title.trim()) &&
        (value.notes === undefined || typeof value.notes === 'string'),
    ),
  );
  registry.registerComponent(
    recordSchema(
      'lifecycle',
      'Valor { status: texto, transitions: array }; el Profile lo inicializa, no declararlo al crear',
      (value) => typeof value.status === 'string' && Array.isArray(value.transitions),
    ),
  );
  registry.registerComponent(
    recordSchema('temporal', 'Valor { startAt?: UTC, dueAt?: UTC, recurrence?: texto }', (value) =>
      ['startAt', 'dueAt', 'recurrence'].every(
        (key) => value[key] === undefined || typeof value[key] === 'string',
      ),
    ),
  );
  registry.registerComponent(
    recordSchema('assignment', 'Valor { responsible: itemReference }', (value) =>
      isItemReference(value.responsible),
    ),
  );
  registry.registerComponent(
    recordSchema(
      'planning',
      'Valor { objective?: itemReference, plan?: itemReference, dependencies?: itemReference[] }; el Profile inicializa dependencies',
      (value) =>
        (value.objective === undefined || isItemReference(value.objective)) &&
        (value.plan === undefined || isItemReference(value.plan)) &&
        (value.dependencies === undefined ||
          (Array.isArray(value.dependencies) && value.dependencies.every(isItemReference))),
    ),
  );
  registry.registerComponent(
    recordSchema(
      'progress',
      'Valor { current: número, target: número positivo, unit?: texto }',
      (value) =>
        typeof value.current === 'number' &&
        Number.isFinite(value.current) &&
        typeof value.target === 'number' &&
        Number.isFinite(value.target) &&
        value.target > 0 &&
        (value.unit === undefined || typeof value.unit === 'string'),
    ),
  );
  registry.registerComponent({
    key: 'unresolved',
    version: 1,
    description: 'Valor string[] no vacío con datos fuente pendientes',
    validate(value) {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every((item) => typeof item === 'string' && Boolean(item.trim()))
      )
        throw new DomainError('unresolved must contain non-empty source values');
    },
  });

  for (const profile of ['task', 'plan', 'habit'] as const) {
    const lifecycle = {
      task: {
        initial: 'pending',
        transitions: {
          pending: ['inProgress', 'completed', 'cancelled'],
          inProgress: ['pending', 'completed', 'cancelled'],
          completed: ['pending'],
          cancelled: ['pending'],
        },
      },
      plan: {
        initial: 'draft',
        transitions: {
          draft: ['active', 'cancelled'],
          active: ['completed', 'cancelled'],
          completed: ['active'],
          cancelled: ['draft'],
        },
      },
      habit: {
        initial: 'active',
        transitions: {
          active: ['paused', 'retired'],
          paused: ['active', 'retired'],
          retired: ['active'],
        },
      },
    }[profile];
    registry.registerProfile({
      key: profile,
      version: 1,
      description: `Composición de planificación ${profile}`,
      components: [
        { key: 'descriptive', version: 1 },
        { key: 'lifecycle', version: 1 },
        { key: 'planning', version: 1 },
      ],
      optionalComponents: [
        { key: 'temporal', version: 1 },
        { key: 'assignment', version: 1 },
        { key: 'unresolved', version: 1 },
      ],
      initialComponents: [{ key: 'planning', version: 1, value: { dependencies: [] } }],
      lifecycle: {
        component: { key: 'lifecycle', version: 1 },
        initial: lifecycle.initial,
        transitions: lifecycle.transitions as unknown as Readonly<
          Record<string, readonly string[]>
        >,
      },
    });
  }
  registry.registerProfile({
    key: 'objective',
    version: 1,
    description: 'Resultado deseado medible',
    components: [
      { key: 'descriptive', version: 1 },
      { key: 'lifecycle', version: 1 },
      { key: 'progress', version: 1 },
    ],
    optionalComponents: [
      { key: 'temporal', version: 1 },
      { key: 'assignment', version: 1 },
      { key: 'unresolved', version: 1 },
    ],
    initialComponents: [{ key: 'progress', version: 1, value: { current: 0, target: 1 } }],
    lifecycle: {
      component: { key: 'lifecycle', version: 1 },
      initial: 'active',
      transitions: {
        active: ['achieved', 'abandoned'],
        achieved: ['active'],
        abandoned: ['active'],
      },
    },
    states: [
      {
        modality: 'desired',
        operator: { key: 'equal', version: 1 },
        component: { key: 'lifecycle', field: 'status' },
        value: 'achieved',
      },
    ],
  });
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

function recordSchema(
  key: string,
  description: string,
  validateRecord: (value: Readonly<Record<string, ComponentValue>>) => boolean,
) {
  return {
    key,
    version: 1,
    description,
    validate(value: ComponentValue) {
      if (!isRecord(value) || !validateRecord(value)) throw new DomainError(`${key} is invalid`);
    },
  };
}

function isItemReference(value: ComponentValue | undefined): boolean {
  if (!value || !isRecord(value as ComponentValue)) return false;
  const candidate = value as Readonly<Record<string, ComponentValue>>;
  return (
    candidate.kind === 'itemReference' &&
    typeof candidate.itemId === 'string' &&
    Boolean(candidate.itemId.trim())
  );
}
