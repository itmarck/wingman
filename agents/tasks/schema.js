import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { createDatabase, getDatabaseSchema } from '../../shared/notion.js';

const log = createLogger('task');
const STATE_FILE = 'state/notion-dbs.json';

export const GOALS = ['career', 'english', 'minima', 'automation'];
export const CONTEXTS = ['work', 'personal', 'family', 'brand'];

export const DB_ICONS = {
  Projects: 'bullseye',
  Tasks: 'checkmark',
  Subtasks: 'copy',
  Inbox: 'inbox',
};

export const Relation = (db) => ({ __relation: db.toLowerCase() });

export const DATABASES = {
  Projects: {
    active: Boolean,
    progress: Number,
    description: String,
    goal: GOALS,
    context: CONTEXTS,
  },

  Tasks: {
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
    progress: Number,
    task: Relation('Tasks'),
    order: Number,
  },

  Inbox: {
    source: ['minima', 'manual', 'cli'],
    status: ['received', 'processed', 'failed'],
  },
};

const TYPE_MAP = new Map([
  [Boolean, () => ({ checkbox: {} })],
  [Number, () => ({ number: { format: 'number' } })],
  [Date, () => ({ date: {} })],
  [String, () => ({ rich_text: {} })],
]);

export function expandProperty(value, dbIds = {}) {
  if (TYPE_MAP.has(value)) return TYPE_MAP.get(value)();

  if (value?.__relation) {
    if (!dbIds[value.__relation]) return null;
    return {
      relation: { database_id: dbIds[value.__relation], single_property: {} },
    };
  }

  if (Array.isArray(value)) {
    return {
      select: { options: value.map((name) => ({ name })) },
    };
  }

  throw new Error(`Unknown property shorthand: ${JSON.stringify(value)}`);
}

export function expandSchema(schema, dbIds = {}) {
  const properties = { name: { title: {} } };

  for (const [key, value] of Object.entries(schema)) {
    const expanded = expandProperty(value, dbIds);
    if (expanded) properties[key] = expanded;
  }

  properties.created = { created_time: {} };
  properties.updated = { last_edited_time: {} };

  return properties;
}

export async function loadDbIds() {
  try {
    const data = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function saveDbIds(dbIds) {
  await mkdir('state', { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(dbIds, null, 2));
}

export async function ensureSchema() {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootPageId) throw new Error('NOTION_ROOT_PAGE_ID not set in .env');

  let dbIds = await loadDbIds();

  for (const [title, schema] of Object.entries(DATABASES)) {
    const key = title.toLowerCase();

    if (dbIds[key]) {
      try {
        await getDatabaseSchema(dbIds[key]);
        log.ok(`"${title}" exists`, 1);
        continue;
      } catch (err) {
        log.warn(`DB "${key}" not reachable (${err.message}), recreating...`);
        dbIds[key] = null;
      }
    }

    const properties = expandSchema(schema, dbIds);
    const icon = DB_ICONS[title] || null;

    log.info(`Creating database "${title}"...`);
    const db = await createDatabase(rootPageId, title, properties, icon);
    dbIds[key] = db.id;
    log.ok(`Created "${title}" → ${db.id.slice(0, 8)}...`);

    await saveDbIds(dbIds);
  }

  log.ok('Schema ensured — all databases ready');
  return dbIds;
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  log.head('Ensuring Notion database schema...');
  try {
    const dbIds = await ensureSchema();
    log.ok('Database IDs:');
    for (const [key, id] of Object.entries(dbIds)) {
      log.info(`  ${key}: ${id}`, 1);
    }
  } catch (err) {
    log.error(`Schema setup failed: ${err.message}`);
    process.exit(1);
  }
}
