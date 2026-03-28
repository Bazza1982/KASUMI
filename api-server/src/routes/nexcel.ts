import { Router, Request, Response } from 'express'
import { nexcelStore } from '../store/nexcelStore'
import { ok, err } from '../middleware/respond'
import type { FilterRule, SortConfig } from '../types'

const router = Router()

// GET /api/nexcel/state — full snapshot
router.get('/state', (_req: Request, res: Response) => {
  res.json(ok({
    fields: nexcelStore.fields,
    rowCount: nexcelStore.rows.length,
    accessMode: nexcelStore.accessMode,
    conditionalRules: nexcelStore.conditionalRules,
  }))
})

// GET /api/nexcel/data — rows with optional filtering/sorting/pagination
router.get('/data', (req: Request, res: Response) => {
  const { search, page, size, sort_field, sort_dir } = req.query as Record<string, string>
  const filter = req.query.filter ? JSON.parse(req.query.filter as string) as FilterRule[] : undefined
  const sort: SortConfig | undefined = sort_field
    ? { fieldId: parseInt(sort_field), direction: (sort_dir ?? 'asc') as 'asc' | 'desc' }
    : undefined

  const result = nexcelStore.getRows({
    search,
    filter,
    sort,
    page: page ? parseInt(page) : 1,
    size: size ? parseInt(size) : 100,
  })
  res.json(ok({ ...result, count: result.total }))
})

// GET /api/nexcel/search — alias with query param
router.get('/search', (req: Request, res: Response) => {
  const q = String(req.query.q ?? '')
  const result = nexcelStore.getRows({ search: q })
  // `count` aliases `total` so AI agents can use either field name
  res.json(ok({ ...result, count: result.total }))
})

// GET /api/nexcel/columns — field definitions
router.get('/columns', (_req: Request, res: Response) => {
  res.json(ok(nexcelStore.fields))
})

// POST /api/nexcel/columns — add column
router.post('/columns', (req: Request, res: Response) => {
  const { name, type, ...rest } = req.body
  if (!name || !type) return res.status(400).json(err('name and type are required', 400))
  const field = nexcelStore.addField({ name, type, primary: false, readOnly: false, ...rest })
  return res.status(201).json(ok(field))
})

// PUT /api/nexcel/columns/:id — update column
router.put('/columns/:id', (req: Request, res: Response) => {
  const field = nexcelStore.updateField(parseInt(req.params.id), req.body)
  if (!field) return res.status(404).json(err('Column not found', 404))
  return res.json(ok(field))
})

// DELETE /api/nexcel/columns/:id — delete column
router.delete('/columns/:id', (req: Request, res: Response) => {
  const deleted = nexcelStore.deleteField(parseInt(req.params.id))
  if (!deleted) return res.status(404).json(err('Column not found', 404))
  return res.json(ok({ deleted: true }))
})

// POST /api/nexcel/rows — insert row
router.post('/rows', (req: Request, res: Response) => {
  const row = nexcelStore.addRow(req.body.fields)
  return res.status(201).json(ok(row))
})

// PUT /api/nexcel/rows/:id — update row fields
router.put('/rows/:id', (req: Request, res: Response) => {
  const row = nexcelStore.updateRow(parseInt(req.params.id), req.body.fields ?? req.body)
  if (!row) return res.status(404).json(err('Row not found', 404))
  return res.json(ok(row))
})

// DELETE /api/nexcel/rows/:id — delete row
router.delete('/rows/:id', (req: Request, res: Response) => {
  const deleted = nexcelStore.deleteRow(parseInt(req.params.id))
  if (!deleted) return res.status(404).json(err('Row not found', 404))
  return res.json(ok({ deleted: true }))
})

// POST /api/nexcel/rows/deduplicate — remove duplicate rows
router.post('/rows/deduplicate', (_req: Request, res: Response) => {
  const seen = new Set<string>()
  const toDelete: number[] = []
  const rows = nexcelStore.getRows({ page: 1, size: 999999 }).rows
  for (const row of rows) {
    const key = JSON.stringify(row.fields)
    if (seen.has(key)) {
      toDelete.push(row.id)
    } else {
      seen.add(key)
    }
  }
  toDelete.forEach(id => nexcelStore.deleteRow(id))
  return res.json(ok({ removed: toDelete.length }))
})

// POST /api/nexcel/rows/batch — batch upsert
router.post('/rows/batch', (req: Request, res: Response) => {
  const { ops } = req.body as { ops: Array<{ id?: number; fields: Record<number, unknown> }> }
  if (!Array.isArray(ops)) return res.status(400).json(err('ops must be an array', 400))
  const result = nexcelStore.batchUpsert(ops)
  return res.json(ok(result))
})

// POST /api/nexcel/sort
router.post('/sort', (req: Request, res: Response) => {
  const { fieldId, direction } = req.body as SortConfig
  const result = nexcelStore.getRows({ sort: { fieldId, direction } })
  res.json(ok(result))
})

// POST /api/nexcel/filter
router.post('/filter', (req: Request, res: Response) => {
  const { filter } = req.body as { filter: FilterRule[] }
  const result = nexcelStore.getRows({ filter })
  res.json(ok({ ...result, count: result.total }))
})

// POST /api/nexcel/reset-blank — reset to a blank 26-column / 100-row workbook
router.post('/reset-blank', (_req: Request, res: Response) => {
  nexcelStore.resetToBlank()
  return res.json(ok({ fields: nexcelStore.fields, rowCount: nexcelStore.rows.length }))
})

// POST /api/nexcel/format — set cell format (single or batch)
// Accepts: { rowId, fieldId, format } OR { cells: [{ rowId, fieldId }], format }
// Also accepts snake_case aliases: row_id / field_id
router.post('/format', (req: Request, res: Response) => {
  const body = req.body
  const format = body.format
  if (!format) return res.status(400).json(err('format is required', 400))

  // Batch mode: { cells: [{ rowId, fieldId }], format }
  if (Array.isArray(body.cells)) {
    const results = body.cells.map((c: { rowId?: number; row_id?: number; fieldId?: number; field_id?: number }) => {
      const rId = c.rowId ?? c.row_id
      const fId = c.fieldId ?? c.field_id
      if (!rId || !fId) return null
      nexcelStore.setFormat(rId, fId, format)
      return { rowId: rId, fieldId: fId, format: nexcelStore.getFormat(rId, fId) }
    }).filter(Boolean)
    return res.json(ok({ updated: results.length, cells: results }))
  }

  // Single mode — accept both camelCase and snake_case
  const rowId  = body.rowId  ?? body.row_id
  const fieldId = body.fieldId ?? body.field_id
  if (!rowId || !fieldId) return res.status(400).json(err('rowId (or row_id) and fieldId (or field_id) required', 400))
  nexcelStore.setFormat(rowId, fieldId, format)
  return res.json(ok({ rowId, fieldId, format: nexcelStore.getFormat(rowId, fieldId) }))
})

// GET /api/nexcel/conditional-format
router.get('/conditional-format', (_req: Request, res: Response) => {
  res.json(ok(nexcelStore.conditionalRules))
})

// POST /api/nexcel/conditional-format
router.post('/conditional-format', (req: Request, res: Response) => {
  const rule = nexcelStore.addConditionalRule(req.body)
  return res.status(201).json(ok(rule))
})

// DELETE /api/nexcel/conditional-format/:id
router.delete('/conditional-format/:id', (req: Request, res: Response) => {
  const deleted = nexcelStore.deleteConditionalRule(req.params.id)
  if (!deleted) return res.status(404).json(err('Rule not found', 404))
  return res.json(ok({ deleted: true }))
})

// POST /api/nexcel/undo
router.post('/undo', (_req: Request, res: Response) => {
  const success = nexcelStore.undo()
  res.json(ok({ success, rowCount: nexcelStore.rows.length }))
})

// POST /api/nexcel/redo
router.post('/redo', (_req: Request, res: Response) => {
  const success = nexcelStore.redo()
  res.json(ok({ success, rowCount: nexcelStore.rows.length }))
})

// POST /api/nexcel/clipboard/copy
// Accepts discrete lists: { rowIds, fieldIds }
// OR a GUI-style range:  { selection: { startRow, endRow, startCol, endCol } }
router.post('/clipboard/copy', (req: Request, res: Response) => {
  let rowIds: number[] = req.body.rowIds
  let fieldIds: number[] = req.body.fieldIds

  if (!rowIds && req.body.selection) {
    const { startRow, endRow, startCol, endCol } = req.body.selection as {
      startRow: number; endRow: number; startCol: number; endCol: number
    }
    const allRows = nexcelStore.getRows({ page: 1, size: 999999 }).rows
    rowIds = allRows
      .slice(Math.min(startRow, endRow), Math.max(startRow, endRow) + 1)
      .map(r => r.id)
    const allFields = nexcelStore.fields
    const colMin = Math.min(startCol, endCol)
    const colMax = Math.max(startCol, endCol)
    fieldIds = allFields.slice(colMin, colMax + 1).map(f => f.id)
  }

  if (!rowIds || !fieldIds) return res.status(400).json(err('rowIds and fieldIds required, or provide selection: { startRow, endRow, startCol, endCol }', 400))
  nexcelStore.copyToClipboard(rowIds, fieldIds)
  return res.json(ok({ copied: rowIds.length * fieldIds.length, rowIds, fieldIds }))
})

// POST /api/nexcel/clipboard/paste
router.post('/clipboard/paste', (req: Request, res: Response) => {
  const { targetRowId, targetFieldId } = req.body as { targetRowId: number; targetFieldId: number }
  if (!targetRowId || !targetFieldId) return res.status(400).json(err('targetRowId and targetFieldId required', 400))
  const result = nexcelStore.pasteFromClipboard(targetRowId, targetFieldId)
  return res.json(ok(result))
})

// POST /api/nexcel/import — import CSV text
router.post('/import', (req: Request, res: Response) => {
  const { csv } = req.body as { csv: string }
  if (!csv) return res.status(400).json(err('csv field required', 400))
  const lines = csv.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim())
  let imported = 0
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',')
    const fields: Record<number, unknown> = {}
    headers.forEach((h, ci) => {
      const field = nexcelStore.fields.find(f => f.name === h)
      if (field) fields[field.id] = vals[ci]?.trim()
    })
    nexcelStore.addRow(fields)
    imported++
  }
  return res.json(ok({ imported }))
})

// GET /api/nexcel/export
router.get('/export', (req: Request, res: Response) => {
  const format = req.query.format ?? 'csv'
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="nexcel-export.csv"')
    return res.send(nexcelStore.exportCsv())
  }
  return res.status(400).json(err('Only csv format supported via API (xlsx requires browser)', 400))
})

// GET /api/nexcel/access-mode
router.get('/access-mode', (_req: Request, res: Response) => {
  res.json(ok({ mode: nexcelStore.accessMode }))
})

// PUT /api/nexcel/access-mode
router.put('/access-mode', (req: Request, res: Response) => {
  const { mode } = req.body as { mode: 'data-entry' | 'analyst' | 'admin' }
  if (!['data-entry', 'analyst', 'admin'].includes(mode)) {
    return res.status(400).json(err('Invalid mode. Use data-entry, analyst, or admin', 400))
  }
  nexcelStore.accessMode = mode
  return res.json(ok({ mode }))
})

export default router
