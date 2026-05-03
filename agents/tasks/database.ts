import { createLogger } from '../../lib/logger.js'
import {
  createDatabase,
  getDatabaseSchema,
  getNotionClient,
  updateDatabase,
} from '../../lib/notion.js'
import { AUTO_PROPS, DATABASES, expandSchema, type DbIds } from './schema.js'

const log = createLogger('task')

const identifiers: DbIds = {}
let initialized = false

async function discoverDatabasesByName(rootPageId: string): Promise<Map<string, string>> {
  const notion = getNotionClient()
  const allByTitle = new Map<string, string[]>()
  let cursor: string | undefined

  do {
    const response: any = await notion.blocks.children.list({
      block_id: rootPageId,
      start_cursor: cursor,
      page_size: 100,
    })

    for (const block of response.results) {
      if (block.type !== 'child_database') continue
      const title = block.child_database?.title
      if (!title) continue
      if (!allByTitle.has(title)) allByTitle.set(title, [])
      allByTitle.get(title)!.push(block.id)
    }

    cursor = response.has_more ? response.next_cursor : undefined
  } while (cursor)

  const found = new Map<string, string>()
  for (const [title, ids] of allByTitle) {
    found.set(title, ids[0])
    if (ids.length > 1) {
      log.warn(
        `"${title}" has ${ids.length} copies under root — using ${ids[0].slice(0, 8)}. ` +
          `Delete extras in Notion: ${ids
            .slice(1)
            .map((id) => id.slice(0, 8))
            .join(', ')}`,
      )
    }
  }

  log.verb(`Discovered ${found.size} databases under root page`)
  return found
}

async function syncProperties(
  databaseId: string,
  expectedProps: Record<string, any>,
  databaseName: string,
): Promise<void> {
  const current: any = await getDatabaseSchema(databaseId)
  const currentProps: Record<string, any> = current.properties ?? {}

  const patch: Record<string, any> = {}
  let added = 0
  let removed = 0

  for (const [key, expected] of Object.entries(expectedProps)) {
    if (AUTO_PROPS.has(key)) continue
    if (!(key in currentProps)) {
      patch[key] = expected
      added++
    }
  }

  for (const key of Object.keys(currentProps)) {
    if (AUTO_PROPS.has(key)) continue
    if (currentProps[key].type === 'title') continue
    if (!(key in expectedProps)) {
      patch[key] = null
      removed++
    }
  }

  if (Object.keys(patch).length === 0) {
    log.ok(`"${databaseName}" in sync`, 1)
    return
  }

  await updateDatabase(databaseId, { properties: patch })
  log.ok(`"${databaseName}" patched: +${added} -${removed}`, 1)
}

/**
 * One-time startup: discover databases by name under the root page,
 * create any that are missing, and sync each one's properties.
 * IDs are kept in memory — call getDbIds() from agents.
 */
export async function initialize(): Promise<DbIds> {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID
  if (!rootPageId) throw new Error('NOTION_ROOT_PAGE_ID not set')

  const discovered = await discoverDatabasesByName(rootPageId)

  for (const [title, definition] of Object.entries(DATABASES)) {
    const key = title.toLowerCase()
    const existingId = discovered.get(title)

    if (existingId) {
      identifiers[key] = existingId
      const expectedProps = expandSchema(definition, identifiers)
      try {
        await syncProperties(existingId, expectedProps, title)
      } catch (error: any) {
        log.error(`Failed to sync "${title}": ${error.message}`)
      }
    } else {
      log.info(`Creating "${title}"...`)
      const expectedProps = expandSchema(definition, identifiers)
      const database: any = await createDatabase(
        rootPageId,
        title,
        expectedProps,
        definition.__icon,
      )
      identifiers[key] = database.id
      log.ok(`"${title}" created → ${database.id.slice(0, 8)}`, 1)
    }
  }

  initialized = true
  return identifiers
}

/**
 * Discovery-only: finds database IDs by name without syncing schemas.
 * For use by standalone CLI scripts that need DB IDs without a full daemon startup.
 */
export async function loadDatabaseIds(): Promise<DbIds> {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID
  if (!rootPageId) throw new Error('NOTION_ROOT_PAGE_ID not set')

  const discovered = await discoverDatabasesByName(rootPageId)
  for (const title of Object.keys(DATABASES)) {
    const id = discovered.get(title)
    if (id) identifiers[title.toLowerCase()] = id
  }

  initialized = true
  return identifiers
}

/**
 * Returns the in-memory database IDs populated by initialize() or loadDatabaseIds().
 * Throws if called before either.
 */
export function getDbIds(): DbIds {
  if (!initialized) {
    throw new Error('Notion not initialized. Call initialize() first')
  }

  return identifiers
}
