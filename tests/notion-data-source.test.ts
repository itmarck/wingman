/**
 * Verifies that all Notion operations use the data sources API introduced in
 * v2025-09-03: initialization resolves data_source_ids, schema reads go through
 * dataSources.retrieve, and page writes use data_source_id as parent.
 */
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { Relation, expandProperty } from '../agents/tasks/schema.js'

// Real IDs captured from Notion (database_id → data_source_id mapping).
import idMap from './mocks/notion-db-id-map.json'

// Real tasks schema — most complex (has numbers, selects, date, relation, rich_text).
import tasksSchema from './mocks/notion-data-source-tasks.json'

// Build minimal per-database schemas for syncProperties ("in sync" means same keys, types irrelevant).
const EXPECTED_PROPS: Record<string, string[]> = {
  Projects: ['active', 'progress', 'description', 'goal', 'context'],
  Tasks: ['priority', 'energy', 'progress', 'context', 'goal', 'due', 'project', 'description'],
  Subtasks: ['progress', 'task', 'order'],
  Inbox: ['source', 'status'],
}
function minimalSchema(dsId: string, propNames: string[]) {
  const properties: Record<string, unknown> = {
    name: { type: 'title' },
    created: { type: 'created_time' },
    updated: { type: 'last_edited_time' },
  }
  for (const name of propNames) properties[name] = { type: 'rich_text' }
  return { object: 'data_source', id: dsId, properties, title: [{ plain_text: dsId }] }
}

const FAKE_DS_ID = 'aaaaaaaa-0000-0000-0000-000000000000'
const FAKE_PAGE_ID = 'page-aaaa-bbbb-cccc-dddddddddddd'

const {
  mockBlocksList,
  mockDatabasesRetrieve,
  mockDataSourcesRetrieve,
  mockDataSourcesUpdate,
  mockDataSourcesQuery,
  mockPagesCreate,
  mockPagesUpdate,
  mockClient,
} = vi.hoisted(() => {
  const mockBlocksList = vi.fn()
  const mockDatabasesRetrieve = vi.fn()
  const mockDataSourcesRetrieve = vi.fn()
  const mockDataSourcesUpdate = vi.fn()
  const mockDataSourcesQuery = vi.fn()
  const mockPagesCreate = vi.fn()
  const mockPagesUpdate = vi.fn()
  const mockClient = {
    blocks: { children: { list: mockBlocksList } },
    databases: { retrieve: mockDatabasesRetrieve },
    dataSources: {
      retrieve: mockDataSourcesRetrieve,
      update: mockDataSourcesUpdate,
      query: mockDataSourcesQuery,
    },
    pages: { create: mockPagesCreate, update: mockPagesUpdate },
  }
  return {
    mockBlocksList,
    mockDatabasesRetrieve,
    mockDataSourcesRetrieve,
    mockDataSourcesUpdate,
    mockDataSourcesQuery,
    mockPagesCreate,
    mockPagesUpdate,
    mockClient,
  }
})

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(function () {
    return mockClient
  }),
}))

describe('Notion data source ops', () => {
  let dbIds: Record<string, string>

  beforeAll(async () => {
    process.env.NOTION_TOKEN = 'fake-token'
    process.env.NOTION_ROOT_PAGE_ID = 'fake-root-page'

    // Return 4 child_database blocks built from the real ID map.
    mockBlocksList.mockResolvedValue({
      results: Object.entries(idMap).map(([title, { database_id }]) => ({
        type: 'child_database',
        id: database_id,
        child_database: { title },
      })),
      has_more: false,
      next_cursor: null,
    })

    // Map each database_id to its data_source_id.
    mockDatabasesRetrieve.mockImplementation(({ database_id }: { database_id: string }) => {
      const entry = Object.values(idMap).find((e) => e.database_id === database_id)
      if (!entry) throw new Error(`Unknown database_id in mock: ${database_id}`)
      return Promise.resolve({ data_sources: [{ id: entry.data_source_id }] })
    })

    // Return a minimal schema per database so syncProperties sees everything in sync.
    mockDataSourcesRetrieve.mockImplementation(({ data_source_id }: { data_source_id: string }) => {
      const entry = Object.entries(idMap).find(([, v]) => v.data_source_id === data_source_id)
      if (!entry) throw new Error(`Unknown data_source_id in mock: ${data_source_id}`)
      const [title, { data_source_id: dsId }] = entry
      return Promise.resolve(minimalSchema(dsId, EXPECTED_PROPS[title]))
    })

    mockDataSourcesUpdate.mockResolvedValue({ object: 'data_source' })
    mockDataSourcesQuery.mockResolvedValue({ results: [{ id: FAKE_PAGE_ID }], has_more: false })
    mockPagesCreate.mockResolvedValue({ id: FAKE_PAGE_ID })
    mockPagesUpdate.mockResolvedValue({
      id: FAKE_PAGE_ID,
      properties: { status: { select: { name: 'processed' } } },
    })

    const { initialize } = await import('../agents/tasks/database.js')
    dbIds = await initialize()
  }, 30_000)

  it('initialize resolves each database block to its data_source_id', () => {
    expect(dbIds.projects).toBe(idMap.Projects.data_source_id)
    expect(dbIds.tasks).toBe(idMap.Tasks.data_source_id)
    expect(dbIds.subtasks).toBe(idMap.Subtasks.data_source_id)
    expect(dbIds.inbox).toBe(idMap.Inbox.data_source_id)
  })

  it('getDatabaseSchema returns a properties map with correct types from the tasks schema', async () => {
    // Override retrieve to return the real tasks schema for this assertion.
    mockDataSourcesRetrieve.mockResolvedValueOnce(tasksSchema)
    const { getDatabaseSchema } = await import('../lib/notion.js')
    const schema = (await getDatabaseSchema(dbIds.tasks)) as any
    expect(schema.properties.priority.type).toBe('number')
    expect(schema.properties.context.type).toBe('select')
    expect(schema.properties.project.type).toBe('relation')
    expect(schema.properties.project.relation.data_source_id).toBeDefined()
  })

  it('createPage sends parent.data_source_id (not database_id)', async () => {
    const { createPage, props } = await import('../lib/notion.js')
    await createPage(FAKE_DS_ID, { name: props.title('test') })
    const { parent } = mockPagesCreate.mock.calls.at(-1)![0]
    expect(parent).toEqual({ data_source_id: FAKE_DS_ID })
    expect(parent.database_id).toBeUndefined()
  })

  it('queryDatabase calls dataSources.query with data_source_id and returns results', async () => {
    const { queryDatabase } = await import('../lib/notion.js')
    const filter = { property: 'status', select: { equals: 'received' } }
    const results = await (queryDatabase as any)(FAKE_DS_ID, filter)
    const callArgs = mockDataSourcesQuery.mock.calls.at(-1)![0]
    expect(callArgs.data_source_id).toBe(FAKE_DS_ID)
    expect(callArgs.filter).toEqual(filter)
    expect(results).toHaveLength(1)
  })

  it('expandProperty for Relation() produces data_source_id (not database_id)', () => {
    const result = expandProperty(Relation('Projects'), { projects: FAKE_DS_ID }) as any
    expect(result.relation.data_source_id).toBe(FAKE_DS_ID)
    expect(result.relation.database_id).toBeUndefined()
  })
})
