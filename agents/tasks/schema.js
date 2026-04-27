import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import {
  getNotionClient,
  createDatabase,
  getDatabaseSchema,
  updateDatabase,
} from '../../shared/notion.js';

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

// Auto-managed by Notion — never patched.
const AUTO_PROPS = new Set(['name', 'created', 'updated']);

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

// ─── Discovery ───────────────────────────────────────────────────

/**
 * List child_database blocks under the root page, return name → id map.
 * Handles pagination.
 */
async function discoverDatabasesByName(rootPageId) {
  const notion = getNotionClient();
  const allByTitle = new Map(); // title → array of ids (to detect duplicates)
  let cursor;

  do {
    const res = await notion.blocks.children.list({
      block_id: rootPageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of res.results) {
      if (block.type === 'child_database') {
        const title = block.child_database?.title;
        if (!title) continue;
        if (!allByTitle.has(title)) allByTitle.set(title, []);
        allByTitle.get(title).push(block.id);
      }
    }

    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  // Pick the first ID per title; warn on duplicates so the user can clean up.
  const found = new Map();
  for (const [title, ids] of allByTitle) {
    found.set(title, ids[0]);
    if (ids.length > 1) {
      log.warn(
        `"${title}" has ${ids.length} copies under root — using ${ids[0].slice(0, 8)}.... Delete extras manually in Notion: ${ids.slice(1).map((i) => i.slice(0, 8)).join(', ')}`,
      );
    }
  }

  log.verb(`Discovered ${found.size} unique databases under root page`);
  return found;
}

// ─── Property diffing ────────────────────────────────────────────

/**
 * Compare an expected property definition against an existing one.
 * Returns the value to PATCH ({} when no change needed).
 *
 * For select properties we UNION options (preserving user-added options).
 * For relation, we update if database_id differs.
 * For everything else we replace if the type label differs.
 */
function diffProperty(expected, current) {
  if (!current) return expected; // missing → add as-is

  const expectedType = Object.keys(expected).find((k) => k !== 'name' && k !== 'description');
  const currentType = current.type;

  // Type changed — replace fully.
  if (expectedType !== currentType) return expected;

  if (expectedType === 'select') {
    const existingNames = new Set((current.select?.options || []).map((o) => o.name));
    const expectedNames = expected.select.options.map((o) => o.name);
    const missing = expectedNames.filter((n) => !existingNames.has(n));
    if (missing.length === 0) return null; // no change
    const merged = [
      ...(current.select?.options || []).map((o) => ({ name: o.name, color: o.color })),
      ...missing.map((name) => ({ name })),
    ];
    return { select: { options: merged } };
  }

  if (expectedType === 'relation') {
    const expectedDbId = expected.relation.database_id;
    const currentDbId = current.relation?.database_id;
    if (expectedDbId === currentDbId) return null;
    return expected;
  }

  // checkbox, number, date, rich_text, title, created_time, last_edited_time:
  // structural equality is enough.
  return null;
}

/**
 * Sync a database's properties to match the expected schema.
 * Adds missing, removes extra, updates changed. Returns counts for logging.
 */
async function syncProperties(dbId, expectedProps, dbName) {
  const current = await getDatabaseSchema(dbId);
  const currentProps = current.properties || {};

  const patch = {};
  let added = 0;
  let removed = 0;
  let updated = 0;

  // Add or update
  for (const [key, expected] of Object.entries(expectedProps)) {
    if (AUTO_PROPS.has(key)) continue;
    const change = diffProperty(expected, currentProps[key]);
    if (change) {
      patch[key] = change;
      if (currentProps[key]) updated++;
      else added++;
    }
  }

  // Remove extras (not in expected and not auto-managed)
  for (const key of Object.keys(currentProps)) {
    if (AUTO_PROPS.has(key)) continue;
    // Title property has type 'title' — never remove even if user renamed it.
    if (currentProps[key].type === 'title') continue;
    if (!(key in expectedProps)) {
      patch[key] = null;
      removed++;
    }
  }

  if (Object.keys(patch).length === 0) {
    log.ok(`"${dbName}" schema in sync`, 1);
    return { added: 0, removed: 0, updated: 0 };
  }

  await updateDatabase(dbId, { properties: patch });
  log.ok(`"${dbName}" patched: +${added} ~${updated} -${removed}`, 1);
  return { added, removed, updated };
}

// ─── Main ────────────────────────────────────────────────────────

export async function ensureSchema() {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID;
  if (!rootPageId) throw new Error('NOTION_ROOT_PAGE_ID not set');

  const cachedIds = await loadDbIds();
  const discovered = await discoverDatabasesByName(rootPageId);
  const dbIds = {};

  for (const [title, schema] of Object.entries(DATABASES)) {
    const key = title.toLowerCase();

    let id = discovered.get(title);

    // Fall back to cached ID only if it's still reachable (covers DBs
    // moved out of the root page but still owned by the integration).
    if (!id && cachedIds[key]) {
      try {
        await getDatabaseSchema(cachedIds[key]);
        id = cachedIds[key];
        log.verb(`Using cached id for "${title}" (not found under root)`);
      } catch {
        log.warn(`Cached "${title}" id unreachable, will recreate`);
      }
    }

    if (id) {
      dbIds[key] = id;
      const expected = expandSchema(schema, dbIds);
      try {
        await syncProperties(id, expected, title);
      } catch (err) {
        log.error(`Failed to sync "${title}" properties: ${err.message}`);
      }
    } else {
      log.info(`Creating database "${title}"...`);
      const expected = expandSchema(schema, dbIds);
      const db = await createDatabase(rootPageId, title, expected, DB_ICONS[title] || null);
      dbIds[key] = db.id;
    }

    await saveDbIds(dbIds);
  }

  log.ok('Schema ensured — all databases ready');
  return dbIds;
}

// ─── Direct execution ────────────────────────────────────────────

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  const { loadConfig } = await import('../../shared/env.js');
  loadConfig();

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
