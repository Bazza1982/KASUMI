import { describe, it, expect, vi, afterEach } from 'vitest'
import { BaserowAdapter } from '../../modules/excel-shell/adapters/baserow/BaserowAdapter'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stubFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

const config = { baseUrl: 'http://localhost:8000', token: 'tok' }

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BaserowAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── 1. getTables: normalizes database_id → databaseId ─────────────────────

  describe('getTables', () => {
    it('normalizes database_id to databaseId', async () => {
      vi.stubGlobal('fetch', stubFetch({
        tables: [
          { id: 10, name: 'Customers', database_id: 5, order: 1 },
          { id: 11, name: 'Orders',    database_id: 5, order: 2 },
        ],
      }))

      const adapter = new BaserowAdapter(config)
      const tables = await adapter.getTables(5)

      expect(tables).toHaveLength(2)
      expect(tables[0].databaseId).toBe(5)
      expect(tables[0].id).toBe(10)
      expect(tables[0].name).toBe('Customers')
      expect(tables[0].order).toBe(1)
      // The raw key must NOT appear
      expect((tables[0] as unknown as Record<string, unknown>)['database_id']).toBeUndefined()
    })
  })

  // ── 2. getFields: normalizes snake_case → camelCase, sorts by order ────────

  describe('getFields', () => {
    it('normalizes read_only → readOnly and number_decimal_places → numberDecimalPlaces', async () => {
      vi.stubGlobal('fetch', stubFetch({
        count: 2,
        results: [
          {
            id: 2, name: 'Budget', type: 'number', order: 2,
            primary: false, read_only: false, number_decimal_places: 2,
          },
          {
            id: 1, name: 'Name', type: 'text', order: 1,
            primary: true, read_only: false,
          },
        ],
      }))

      const adapter = new BaserowAdapter(config)
      const fields = await adapter.getFields(1)

      // Sorted by order
      expect(fields[0].id).toBe(1)
      expect(fields[1].id).toBe(2)

      expect(fields[1].readOnly).toBe(false)
      expect(fields[1].numberDecimalPlaces).toBe(2)

      // Raw keys must not appear on the normalised object
      expect((fields[1] as unknown as Record<string, unknown>)['read_only']).toBeUndefined()
      expect((fields[1] as unknown as Record<string, unknown>)['number_decimal_places']).toBeUndefined()
    })

    it('sorts fields by order ascending', async () => {
      vi.stubGlobal('fetch', stubFetch({
        count: 3,
        results: [
          { id: 3, name: 'C', type: 'text', order: 3, primary: false, read_only: false },
          { id: 1, name: 'A', type: 'text', order: 1, primary: true,  read_only: false },
          { id: 2, name: 'B', type: 'text', order: 2, primary: false, read_only: false },
        ],
      }))

      const adapter = new BaserowAdapter(config)
      const fields = await adapter.getFields(1)

      expect(fields.map(f => f.order)).toEqual([1, 2, 3])
    })
  })

  // ── 3. getViews ───────────────────────────────────────────────────────────

  describe('getViews', () => {
    it('returns correctly shaped ViewMeta array', async () => {
      vi.stubGlobal('fetch', stubFetch({
        count: 2,
        results: [
          { id: 1, name: 'Grid View', type: 'grid', order: 1 },
          { id: 2, name: 'Gallery',   type: 'gallery', order: 2 },
        ],
      }))

      const adapter = new BaserowAdapter(config)
      const views = await adapter.getViews(1)

      expect(views).toHaveLength(2)
      expect(views[0]).toEqual({ id: 1, name: 'Grid View', type: 'grid', order: 1 })
      expect(views[1]).toEqual({ id: 2, name: 'Gallery', type: 'gallery', order: 2 })
    })
  })

  // ── 4. getRows: normalizes field_N keys → fields[N] ───────────────────────

  describe('getRows', () => {
    it('normalizes field_1 and field_2 keys to fields[1] and fields[2]', async () => {
      vi.stubGlobal('fetch', stubFetch({
        count: 1,
        results: [
          { id: 42, order: '1.00', field_1: 'Alice', field_2: { value: 'Active', id: 1 } },
        ],
      }))

      const adapter = new BaserowAdapter(config)
      const { rows, total } = await adapter.getRows(1, null, 1, 100)

      expect(total).toBe(1)
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(42)
      expect(rows[0].fields[1]).toBe('Alice')
      expect(rows[0].fields[2]).toEqual({ value: 'Active', id: 1 })
    })

    it('ignores non-field_ keys in the row', async () => {
      vi.stubGlobal('fetch', stubFetch({
        count: 1,
        results: [{ id: 1, order: '1.00', field_1: 'test', extra_key: 'ignored' }],
      }))

      const adapter = new BaserowAdapter(config)
      const { rows } = await adapter.getRows(1, null, 1, 10)

      expect(rows[0].fields[1]).toBe('test')
      // extra_key should not appear in fields
      expect(Object.keys(rows[0].fields)).toEqual(['1'])
    })
  })

  // ── 5. updateCell: sends PATCH with field_${fieldId} key ──────────────────

  describe('updateCell', () => {
    it('sends PATCH to the correct URL with field_N key', async () => {
      const mockFetch = stubFetch({})
      vi.stubGlobal('fetch', mockFetch)

      const adapter = new BaserowAdapter(config)
      await adapter.updateCell(7, 99, 3, 'new value')

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/database/rows/table/7/99/')
      expect(init.method).toBe('PATCH')

      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ field_3: 'new value' })
    })
  })

  // ── 6. batchUpdate: groups by rowId, sends one PATCH ─────────────────────

  describe('batchUpdate', () => {
    it('groups updates by rowId and sends a single PATCH with items array', async () => {
      const mockFetch = stubFetch({})
      vi.stubGlobal('fetch', mockFetch)

      const adapter = new BaserowAdapter(config)
      await adapter.batchUpdate(7, [
        { rowId: 10, fieldId: 1, value: 'Alice' },
        { rowId: 10, fieldId: 2, value: 'Active' },
        { rowId: 11, fieldId: 1, value: 'Bob' },
      ])

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/database/rows/table/7/batch/')
      expect(init.method).toBe('PATCH')

      const body = JSON.parse(init.body as string) as { items: unknown[] }
      // Should have one item per distinct rowId
      expect(body.items).toHaveLength(2)

      const item10 = (body.items as Array<Record<string, unknown>>).find(i => i.id === 10)
      expect(item10).toBeDefined()
      expect(item10!['field_1']).toBe('Alice')
      expect(item10!['field_2']).toBe('Active')

      const item11 = (body.items as Array<Record<string, unknown>>).find(i => i.id === 11)
      expect(item11).toBeDefined()
      expect(item11!['field_1']).toBe('Bob')
    })
  })
})
