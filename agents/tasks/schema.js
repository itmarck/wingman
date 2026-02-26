import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { createDatabase, getDatabaseSchema } from '../../shared/notion.js';

const log = createLogger('task');
const STATE_FILE = 'state/notion-dbs.json';

// ─── Database schemas ───────────────────────────────────────────
// Creation order matters for relations: Projects → Tasks → Subtasks → Inbox
// Each schema defines the Notion property types for its database.
// Property names use lowercase to follow JS naming conventions.

const GOAL_OPTIONS = [
  { name: 'career', color: 'blue' },
  { name: 'english', color: 'purple' },
  { name: 'minima', color: 'orange' },
  { name: 'automation', color: 'green' },
  { name: 'none', color: 'default' },
];

const CONTEXT_OPTIONS = [
  { name: 'work', color: 'blue' },
  { name: 'personal', color: 'green' },
  { name: 'family', color: 'yellow' },
  { name: 'digital', color: 'purple' },
];

export const DB_SCHEMAS = {
  projects: {
    title: 'Projects',
    icon: 'bullseye',
    properties: {
      name: { title: {} },
      status: {
        select: {
          options: [
            { name: 'active', color: 'blue' },
            { name: 'hold', color: 'yellow' },
            { name: 'done', color: 'green' },
          ],
        },
      },
      description: { rich_text: {} },
      goal: { select: { options: GOAL_OPTIONS } },
      area: { select: { options: CONTEXT_OPTIONS } },
      created: { date: {} },
    },
  },

  tasks: {
    title: 'Tasks',
    icon: 'checkmark',
    properties: {
      name: { title: {} },
      status: {
        select: {
          options: [
            { name: 'pending', color: 'red' },
            { name: 'in_progress', color: 'yellow' },
            { name: 'done', color: 'green' },
          ],
        },
      },
      urgency: {
        select: {
          options: [
            { name: 'none', color: 'default' },
            { name: 'low', color: 'blue' },
            { name: 'medium', color: 'yellow' },
            { name: 'high', color: 'red' },
          ],
        },
      },
      energy: {
        select: {
          options: [
            { name: 'low', color: 'green' },
            { name: 'medium', color: 'yellow' },
            { name: 'high', color: 'red' },
          ],
        },
      },
      context: { select: { options: CONTEXT_OPTIONS } },
      goal: { select: { options: GOAL_OPTIONS } },
      due: { date: {} },
      // project relation — injected at creation time with actual DB ID
      project: { relation: { single_property: {} } },
      description: { rich_text: {} },
      created: { date: {} },
    },
  },

  subtasks: {
    title: 'Subtasks',
    icon: 'copy',
    properties: {
      name: { title: {} },
      done: { checkbox: {} },
      // task relation — injected at creation time with actual DB ID
      task: { relation: { single_property: {} } },
      order: { number: { format: 'number' } },
    },
  },

  inbox: {
    title: 'Inbox',
    icon: 'inbox',
    properties: {
      name: { title: {} },
      source: {
        select: {
          options: [
            { name: 'minima', color: 'default' },
            { name: 'manual', color: 'blue' },
            { name: 'cli', color: 'green' },
          ],
        },
      },
      status: {
        select: {
          options: [
            { name: 'pending', color: 'blue' },
            { name: 'processed', color: 'green' },
            { name: 'failed', color: 'red' },
          ],
        },
      },
      created: { date: {} },
    },
  },
};

// ─── State persistence ──────────────────────────────────────────

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

// ─── Schema management ──────────────────────────────────────────

/**
 * Prepare expected properties for a DB, injecting relation IDs where needed.
 */
function prepareProperties(key, schema, dbIds) {
  const properties = structuredClone(schema.properties);

  if (key === 'tasks' && dbIds.projects) {
    properties.project = {
      relation: { database_id: dbIds.projects, single_property: {} },
    };
  } else if (key === 'tasks' && !dbIds.projects) {
    delete properties.project;
    log.warn('Projects DB not available, skipping project relation on Tasks');
  }

  if (key === 'subtasks' && dbIds.tasks) {
    properties.task = {
      relation: { database_id: dbIds.tasks, single_property: {} },
    };
  } else if (key === 'subtasks' && !dbIds.tasks) {
    delete properties.task;
    log.warn('Tasks DB not available, skipping task relation on Subtasks');
  }

  return properties;
}

/**
 * Ensure all 4 databases exist in Notion with the correct schema.
 * Creates missing databases, validates existing ones are reachable.
 * Returns an object with database IDs: { projects, tasks, subtasks, inbox }
 */
export async function ensureSchema() {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootPageId) throw new Error('NOTION_ROOT_PAGE_ID not set in .env');

  let dbIds = await loadDbIds();

  const creationOrder = ['projects', 'tasks', 'subtasks', 'inbox'];

  for (const key of creationOrder) {
    const schema = DB_SCHEMAS[key];

    // Validate existing DB is reachable
    if (dbIds[key]) {
      try {
        await getDatabaseSchema(dbIds[key]);
        log.ok(`"${schema.title}" exists`, 1);
        continue;
      } catch (err) {
        log.warn(`DB "${key}" not reachable (${err.message}), recreating...`);
        dbIds[key] = null;
      }
    }

    // Create new DB
    const properties = prepareProperties(key, schema, dbIds);

    log.info(`Creating database "${schema.title}"...`);
    const db = await createDatabase(rootPageId, schema.title, properties, schema.icon);
    dbIds[key] = db.id;
    log.ok(`Created "${schema.title}" → ${db.id.slice(0, 8)}...`);

    await saveDbIds(dbIds);
  }

  log.ok('Schema ensured — all databases ready');
  return dbIds;
}

// ─── Direct execution ───────────────────────────────────────────

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
