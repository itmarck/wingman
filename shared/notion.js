import { Client } from '@notionhq/client';
import { createLogger } from './logger.js';

const log = createLogger('notn');

let client = null;

/**
 * Get or create singleton Notion client.
 * Reads NOTION_TOKEN from environment.
 */
export function getNotionClient() {
  if (!client) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error('NOTION_TOKEN not set in .env');
    client = new Client({ auth: token });
    log.verb('Notion client initialized');
  }
  return client;
}

// ─── Property value helpers ─────────────────────────────────────
// Build Notion property values from plain JS values.

export const props = {
  title(text) {
    return { title: [{ text: { content: text } }] };
  },
  richText(text) {
    return { rich_text: [{ text: { content: text } }] };
  },
  select(name) {
    return { select: { name } };
  },
  date(isoString) {
    return { date: { start: isoString } };
  },
  number(value) {
    return { number: value };
  },
  checkbox(value) {
    return { checkbox: value };
  },
  relation(pageIds) {
    return { relation: pageIds.map((id) => ({ id })) };
  },
};

// ─── Database operations ────────────────────────────────────────

/**
 * Query a database with optional filter and sorts.
 * Handles pagination internally — returns all matching pages.
 */
export async function queryDatabase(databaseId, filter = undefined, sorts = undefined, pageSize = 100) {
  const notion = getNotionClient();
  const allResults = [];
  let cursor;

  log.verb(`Query DB ${databaseId.slice(0, 8)}... filter: ${JSON.stringify(filter) || 'none'}`);

  do {
    const params = {
      database_id: databaseId,
      page_size: pageSize,
    };
    if (filter) params.filter = filter;
    if (sorts) params.sorts = sorts;
    if (cursor) params.start_cursor = cursor;

    const response = await notion.databases.query(params);
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  log.verb(`Query returned ${allResults.length} results`);
  return allResults;
}

/**
 * Create a page in a database.
 * @param {string} databaseId - target database
 * @param {object} properties - Notion property values (use props helpers)
 * @param {Array} children - optional block children (e.g. paragraph blocks)
 * @returns {object} created page
 */
export async function createPage(databaseId, properties, children = []) {
  const notion = getNotionClient();

  const params = {
    parent: { database_id: databaseId },
    properties,
  };
  if (children.length > 0) params.children = children;

  const page = await notion.pages.create(params);
  log.verb(`Created page ${page.id.slice(0, 8)}... in DB ${databaseId.slice(0, 8)}...`);
  return page;
}

/**
 * Update properties on an existing page.
 */
export async function updatePage(pageId, properties) {
  const notion = getNotionClient();
  const page = await notion.pages.update({ page_id: pageId, properties });
  log.verb(`Updated page ${pageId.slice(0, 8)}...`);
  return page;
}

/**
 * Create a new database under a parent page.
 * @param {string} parentPageId - parent page ID
 * @param {string} title - database title
 * @param {object} properties - Notion DB property schema
 * @param {string} icon - optional emoji icon
 * @returns {object} created database (with .id)
 */
export async function createDatabase(parentPageId, title, properties, icon = null) {
  const notion = getNotionClient();

  const params = {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: title } }],
    properties,
    is_inline: false,
  };
  if (icon) {
    params.icon = {
      type: 'external',
      external: {
        url: `https://www.notion.so/icons/${icon}_lightgray.svg`,
      },
    };
  }

  const db = await notion.databases.create(params);
  log.ok(`Created database "${title}" → ${db.id.slice(0, 8)}...`);
  return db;
}

/**
 * Update an existing database's title, icon, and/or properties.
 * Only properties included in the update are affected — others are left unchanged.
 * For select properties: include ALL options (existing + new) since Notion replaces the list.
 * @param {string} databaseId - database to update
 * @param {object} params - { title?, icon?, properties? }
 * @returns {object} updated database
 */
export async function updateDatabase(databaseId, params) {
  const notion = getNotionClient();
  const updateParams = { database_id: databaseId, ...params };

  const db = await notion.databases.update(updateParams);
  log.verb(`Updated database ${databaseId.slice(0, 8)}...`);
  return db;
}

/**
 * Retrieve database metadata including property schemas.
 * Used to validate that a DB exists and has the expected structure.
 */
export async function getDatabaseSchema(databaseId) {
  const notion = getNotionClient();
  const db = await notion.databases.retrieve({ database_id: databaseId });
  log.verb(`Retrieved schema for DB ${databaseId.slice(0, 8)}... ("${db.title?.[0]?.plain_text || 'untitled'}")`);
  return db;
}

// ─── Standalone test ────────────────────────────────────────────

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  log.head('Testing Notion API connection...');

  try {
    const notion = getNotionClient();
    const me = await notion.users.me();
    log.ok(`Connected as: ${me.name || me.id} (${me.type})`);
    log.ok('Notion API test passed');
  } catch (err) {
    log.error(`Notion API test failed: ${err.message}`);
    process.exit(1);
  }
}
