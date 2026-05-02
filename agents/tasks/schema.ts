export const GOALS = ['career', 'english', 'minima', 'automation'] as const
export const CONTEXTS = ['work', 'personal', 'family', 'brand'] as const

export type DbIds = Record<string, string>

export type Strings = string[] | readonly string[]
export type RelationRef = { __relation: string }
export type NativeTypes = typeof Boolean | typeof Number | typeof Date | typeof String
export type SchemaValue = Strings | RelationRef | NativeTypes

/**
 * Full database definition: Notion property schemas plus optional meta-config.
 * Keys prefixed with `__` are meta-config (e.g. `__icon`) and are skipped
 * during property expansion.
 */
export type DatabaseDefinition = {
  __icon?: string
  [key: string]: SchemaValue | string | undefined
}

// Auto-managed by Notion — never written or removed via API.
export const AUTO_PROPS = new Set(['name', 'created', 'updated'])

export const Relation = (databaseName: string): RelationRef => ({
  __relation: databaseName.toLowerCase(),
})

export const DATABASES: Record<string, DatabaseDefinition> = {
  Projects: {
    __icon: 'bullseye',
    active: Boolean,
    progress: Number,
    description: String,
    goal: GOALS,
    context: CONTEXTS,
  },

  Tasks: {
    __icon: 'checkmark',
    priority: Number,
    energy: Number,
    progress: Number,
    context: CONTEXTS,
    goal: GOALS,
    due: Date,
    project: Relation('Projects'),
    description: String,
  },

  Subtasks: {
    __icon: 'copy',
    progress: Number,
    task: Relation('Tasks'),
    order: Number,
  },

  Inbox: {
    __icon: 'inbox',
    source: ['minima', 'manual', 'cli'],
    status: ['received', 'processed', 'failed'],
  },
}

const TYPE_MAP = new Map<unknown, () => any>([
  [Boolean, () => ({ checkbox: {} })],
  [Number, () => ({ number: { format: 'number' } })],
  [Date, () => ({ date: {} })],
  [String, () => ({ rich_text: {} })],
])

export function expandProperty(value: SchemaValue, ids: DbIds = {}): any {
  if (TYPE_MAP.has(value as any)) return TYPE_MAP.get(value as any)!()

  if ((value as RelationRef)?.__relation) {
    const target = (value as RelationRef).__relation
    if (!ids[target]) return null
    return { relation: { database_id: ids[target], single_property: {} } }
  }

  if (Array.isArray(value)) {
    return {
      select: { options: (value as string[]).map((name) => ({ name })) },
    }
  }

  throw new Error(`Unknown property shorthand: ${JSON.stringify(value)}`)
}

export function expandSchema(definition: DatabaseDefinition, ids: DbIds = {}): Record<string, any> {
  const properties: Record<string, any> = { name: { title: {} } }

  for (const [key, value] of Object.entries(definition)) {
    if (key.startsWith('__')) continue
    const expanded = expandProperty(value as SchemaValue, ids)
    if (expanded) properties[key] = expanded
  }

  properties.created = { created_time: {} }
  properties.updated = { last_edited_time: {} }

  return properties
}
