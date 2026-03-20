import { describe, it, expect, beforeEach } from 'vitest'
import { MockAdapter } from '../../modules/excel-shell/adapters/baserow/MockAdapter'

describe('MockAdapter', () => {
  let adapter: MockAdapter

  // Each test gets a fresh adapter so mutations don't bleed between tests
  beforeEach(() => {
    adapter = new MockAdapter()
  })

  // ── getTables ─────────────────────────────────────────────────────────────

  describe('getTables', () => {
    it('returns an array with exactly 3 tables', async () => {
      const tables = await adapter.getTables(1)
      expect(tables).toHaveLength(3)
    })

    it('each table has id, name, databaseId, and order', async () => {
      const tables = await adapter.getTables(1)
      for (const t of tables) {
        expect(typeof t.id).toBe('number')
        expect(typeof t.name).toBe('string')
        expect(typeof t.databaseId).toBe('number')
        expect(typeof t.order).toBe('number')
      }
    })
  })

  // ── getFields ─────────────────────────────────────────────────────────────

  describe('getFields', () => {
    it('returns 10 fields', async () => {
      const fields = await adapter.getFields(1)
      expect(fields).toHaveLength(10)
    })

    it('first field is primary text named Name', async () => {
      const fields = await adapter.getFields(1)
      expect(fields[0].type).toBe('text')
      expect(fields[0].primary).toBe(true)
      expect(fields[0].name).toBe('Name')
    })

    it('each field has id, name, type, and order', async () => {
      const fields = await adapter.getFields(1)
      for (const f of fields) {
        expect(typeof f.id).toBe('number')
        expect(typeof f.name).toBe('string')
        expect(typeof f.type).toBe('string')
        expect(typeof f.order).toBe('number')
      }
    })
  })

  // ── getViews ──────────────────────────────────────────────────────────────

  describe('getViews', () => {
    it('returns an array of views', async () => {
      const views = await adapter.getViews(1)
      expect(Array.isArray(views)).toBe(true)
      expect(views.length).toBeGreaterThan(0)
    })

    it('each view has id, name, type, and order', async () => {
      const views = await adapter.getViews(1)
      for (const v of views) {
        expect(typeof v.id).toBe('number')
        expect(typeof v.name).toBe('string')
        expect(typeof v.type).toBe('string')
        expect(typeof v.order).toBe('number')
      }
    })
  })

  // ── getRows (pagination) ──────────────────────────────────────────────────

  describe('getRows', () => {
    it('returns exactly 10 rows for page 1, size 10', async () => {
      const result = await adapter.getRows(1, null, 1, 10)
      expect(result.rows).toHaveLength(10)
    })

    it('total is 500', async () => {
      const result = await adapter.getRows(1, null, 1, 10)
      expect(result.total).toBe(500)
    })

    it('page 2 starts at index 10', async () => {
      const page1 = await adapter.getRows(1, null, 1, 10)
      const page2 = await adapter.getRows(1, null, 2, 10)
      // The first row of page 2 should differ from the last row of page 1
      expect(page2.rows[0].id).not.toBe(page1.rows[9].id)
      // And should be the 11th row overall
      expect(page2.rows[0].id).toBe(page1.rows[0].id + 10)
    })

    it('reports total of 500 even with a large page size', async () => {
      const result = await adapter.getRows(1, null, 1, 200)
      expect(result.total).toBe(500)
    })
  })

  // ── updateCell ────────────────────────────────────────────────────────────

  describe('updateCell', () => {
    it('mutates the in-memory row correctly', async () => {
      // Row id=1, field id=1 (Name)
      await adapter.updateCell(1, 1, 1, 'Updated Name')
      const result = await adapter.getRows(1, null, 1, 10)
      const row1 = result.rows.find(r => r.id === 1)
      expect(row1?.fields[1]).toBe('Updated Name')
    })

    it('getRows returns the updated value after updateCell', async () => {
      await adapter.updateCell(1, 5, 5, 'NewAssignee')
      const result = await adapter.getRows(1, null, 1, 10)
      const row5 = result.rows.find(r => r.id === 5)
      expect(row5?.fields[5]).toBe('NewAssignee')
    })
  })

  // ── batchUpdate ───────────────────────────────────────────────────────────

  describe('batchUpdate', () => {
    it('mutates multiple rows correctly', async () => {
      await adapter.batchUpdate(1, [
        { rowId: 1, fieldId: 1, value: 'Batch Row 1' },
        { rowId: 2, fieldId: 1, value: 'Batch Row 2' },
      ])
      const result = await adapter.getRows(1, null, 1, 10)
      const row1 = result.rows.find(r => r.id === 1)
      const row2 = result.rows.find(r => r.id === 2)
      expect(row1?.fields[1]).toBe('Batch Row 1')
      expect(row2?.fields[1]).toBe('Batch Row 2')
    })

    it('leaves unmodified rows unchanged', async () => {
      const before = await adapter.getRows(1, null, 1, 10)
      const originalRow3Name = before.rows.find(r => r.id === 3)?.fields[1]

      await adapter.batchUpdate(1, [
        { rowId: 1, fieldId: 1, value: 'Only row 1' },
      ])

      const after = await adapter.getRows(1, null, 1, 10)
      const row3After = after.rows.find(r => r.id === 3)
      expect(row3After?.fields[1]).toBe(originalRow3Name)
    })
  })
})
