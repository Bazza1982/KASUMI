import { Router } from 'express'
import { nexcelState, pushUndo, applyUndo, applyRedo } from '../state.js'
import type { RowRecord, FieldMeta, CellFormat, ConditionalFormatRule, Comment } from '../state.js'

const router = Router()

// ── Helper ───────────────────────────────────────────────────────────────────
function ok(res: any, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data })
}
function err(res: any, message: string, status = 400) {
  res.status(status).json({ ok: false, error: message })
}
function findRow(id: number) {
  return nexcelState.rows.find(r => r.id === id)
}

// ── GET /api/nexcel/state ─────────────────────────────────────────────────────
router.get('/state', (_, res) => {
  ok(res, {
    rowCount: nexcelState.rows.length,
    fieldCount: nexcelState.fields.length,
    accessMode: nexcelState.accessMode,
    undoDepth: nexcelState.undoStack.length,
    redoDepth: nexcelState.redoStack.length,
    conditionalRules: nexcelState.conditionalRules.length,
    comments: nexcelState.comments.length,
  })
})

// ── GET /api/nexcel/data ──────────────────────────────────────────────────────
router.get('/data', (req, res) => {
  const page     = Math.max(1, parseInt(req.query.page as string)  || 1)
  const pageSize = Math.min(1000, parseInt(req.query.page_size as string) || 100)
  const offset   = (page - 1) * pageSize
  const slice    = nexcelState.rows.slice(offset, offset + pageSize)
  ok(res, { total: nexcelState.rows.length, page, page_size: pageSize, rows: slice })
})

// ── GET /api/nexcel/columns ───────────────────────────────────────────────────
router.get('/columns', (_, res) => {
  ok(res, { fields: nexcelState.fields })
})

// ── POST /api/nexcel/columns ──────────────────────────────────────────────────
router.post('/columns', (req, res) => {
  const { name, type = 'text' } = req.body
  if (!name) return err(res, 'name is required')
  const field: FieldMeta = {
    id: nexcelState.nextFieldId++,
    name, type,
    order: nexcelState.fields.length + 1,
    primary: false,
    readOnly: false,
  }
  nexcelState.fields.push(field)
  ok(res, field, 201)
})

// ── PUT /api/nexcel/columns/:id ───────────────────────────────────────────────
router.put('/columns/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const field = nexcelState.fields.find(f => f.id === id)
  if (!field) return err(res, 'Column not found', 404)
  Object.assign(field, req.body)
  field.id = id  // prevent id mutation
  ok(res, field)
})

// ── DELETE /api/nexcel/columns/:id ────────────────────────────────────────────
router.delete('/columns/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const idx = nexcelState.fields.findIndex(f => f.id === id)
  if (idx === -1) return err(res, 'Column not found', 404)
  nexcelState.fields.splice(idx, 1)
  ok(res, { deleted: id })
})

// ── POST /api/nexcel/rows ─────────────────────────────────────────────────────
router.post('/rows', (req, res) => {
  pushUndo()
  const fields = req.body.fields ?? {}
  const row: RowRecord = {
    id: nexcelState.nextRowId++,
    order: `${nexcelState.rows.length + 1}.00000000000000000000`,
    fields,
  }
  nexcelState.rows.push(row)
  ok(res, row, 201)
})

// ── PUT /api/nexcel/rows/:id ──────────────────────────────────────────────────
router.put('/rows/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const row = findRow(id)
  if (!row) return err(res, 'Row not found', 404)
  pushUndo()
  Object.assign(row.fields, req.body.fields ?? req.body)
  ok(res, row)
})

// ── DELETE /api/nexcel/rows/:id ───────────────────────────────────────────────
router.delete('/rows/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const idx = nexcelState.rows.findIndex(r => r.id === id)
  if (idx === -1) return err(res, 'Row not found', 404)
  pushUndo()
  nexcelState.rows.splice(idx, 1)
  ok(res, { deleted: id })
})

// ── POST /api/nexcel/rows/batch ───────────────────────────────────────────────
router.post('/rows/batch', (req, res) => {
  const { insert = [], update = [] } = req.body
  pushUndo()
  const inserted: RowRecord[] = []
  const updated: RowRecord[] = []

  for (const item of insert) {
    const row: RowRecord = {
      id: nexcelState.nextRowId++,
      order: `${nexcelState.rows.length + 1}.00000000000000000000`,
      fields: item.fields ?? {},
    }
    nexcelState.rows.push(row)
    inserted.push(row)
  }

  for (const item of update) {
    const row = findRow(item.id)
    if (row) {
      Object.assign(row.fields, item.fields)
      updated.push(row)
    }
  }

  ok(res, { inserted, updated })
})

// ── POST /api/nexcel/rows/deduplicate ────────────────────────────────────────
router.post('/rows/deduplicate', (_, res) => {
  pushUndo()
  const seen = new Set<string>()
  const before = nexcelState.rows.length
  nexcelState.rows = nexcelState.rows.filter(row => {
    const key = JSON.stringify(row.fields)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  ok(res, { removed: before - nexcelState.rows.length, total: nexcelState.rows.length })
})

// ── POST /api/nexcel/sort ─────────────────────────────────────────────────────
router.post('/sort', (req, res) => {
  const { field_id, direction = 'asc' } = req.body
  if (!field_id) return err(res, 'field_id required')
  const dir = direction === 'desc' ? -1 : 1
  nexcelState.rows.sort((a, b) => {
    const av = String(a.fields[field_id] ?? '')
    const bv = String(b.fields[field_id] ?? '')
    return av.localeCompare(bv) * dir
  })
  ok(res, { sorted_by: field_id, direction, row_count: nexcelState.rows.length })
})

// ── POST /api/nexcel/filter ───────────────────────────────────────────────────
router.post('/filter', (req, res) => {
  const { field_id, operator = 'contains', value = '' } = req.body
  const lower = String(value).toLowerCase()
  const rows = nexcelState.rows.filter(row => {
    const cell = String(row.fields[field_id] ?? '').toLowerCase()
    switch (operator) {
      case 'equals':     return cell === lower
      case 'not_equals': return cell !== lower
      case 'contains':   return cell.includes(lower)
      case 'starts_with':return cell.startsWith(lower)
      case 'gt':         return parseFloat(cell) > parseFloat(lower)
      case 'lt':         return parseFloat(cell) < parseFloat(lower)
      default:           return true
    }
  })
  ok(res, { total: rows.length, rows })
})

// ── GET /api/nexcel/search ────────────────────────────────────────────────────
router.get('/search', (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase()
  if (!q) return ok(res, { total: 0, rows: [] })
  const rows = nexcelState.rows.filter(row =>
    Object.values(row.fields).some(v => String(v ?? '').toLowerCase().includes(q))
  )
  ok(res, { total: rows.length, rows: rows.slice(0, 200) })
})

// ── POST /api/nexcel/format ───────────────────────────────────────────────────
router.post('/format', (req, res) => {
  const { row_id, field_id, format } = req.body as { row_id: number; field_id: number; format: CellFormat }
  if (!row_id || !field_id) return err(res, 'row_id and field_id required')
  const key = `${row_id}:${field_id}`
  nexcelState.cellFormats[key] = { ...(nexcelState.cellFormats[key] ?? {}), ...format }
  ok(res, { key, format: nexcelState.cellFormats[key] })
})

// ── GET /api/nexcel/conditional-format ───────────────────────────────────────
router.get('/conditional-format', (_, res) => {
  ok(res, { rules: nexcelState.conditionalRules })
})

// ── POST /api/nexcel/conditional-format ──────────────────────────────────────
router.post('/conditional-format', (req, res) => {
  const rule: ConditionalFormatRule = {
    id: `cf-${Date.now()}`,
    fieldId:   req.body.field_id,
    fieldName: req.body.field_name ?? '',
    operator:  req.body.operator ?? 'equals',
    value:     req.body.value ?? '',
    bgColor:   req.body.bg_color ?? '#fef08a',
    textColor: req.body.text_color,
  }
  nexcelState.conditionalRules.push(rule)
  ok(res, rule, 201)
})

// ── DELETE /api/nexcel/conditional-format/:id ─────────────────────────────────
router.delete('/conditional-format/:id', (req, res) => {
  const idx = nexcelState.conditionalRules.findIndex(r => r.id === req.params.id)
  if (idx === -1) return err(res, 'Rule not found', 404)
  nexcelState.conditionalRules.splice(idx, 1)
  ok(res, { deleted: req.params.id })
})

// ── POST /api/nexcel/import ───────────────────────────────────────────────────
router.post('/import', (req, res) => {
  const { csv } = req.body
  if (!csv) return err(res, 'csv string required')
  const lines  = csv.trim().split('\n')
  const headers = lines[0].split(',').map((h: string) => h.trim())
  pushUndo()
  let inserted = 0
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',')
    const fields: Record<number, unknown> = {}
    headers.forEach((h: string, j: number) => {
      const field = nexcelState.fields.find(f => f.name.toLowerCase() === h.toLowerCase())
      if (field) fields[field.id] = vals[j]?.trim() ?? ''
    })
    nexcelState.rows.push({ id: nexcelState.nextRowId++, order: `${nexcelState.rows.length + 1}.00`, fields })
    inserted++
  }
  ok(res, { inserted })
})

// ── GET /api/nexcel/export ────────────────────────────────────────────────────
router.get('/export', (req, res) => {
  const format = req.query.format === 'json' ? 'json' : 'csv'
  if (format === 'json') return ok(res, { fields: nexcelState.fields, rows: nexcelState.rows })

  const headers = nexcelState.fields.map(f => f.name).join(',')
  const dataRows = nexcelState.rows.map(row =>
    nexcelState.fields.map(f => {
      const v = row.fields[f.id]
      if (v && typeof v === 'object' && 'value' in (v as any)) return (v as any).value
      return String(v ?? '')
    }).join(',')
  ).join('\n')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="nexcel-export.csv"')
  res.send(`${headers}\n${dataRows}`)
})

// ── POST /api/nexcel/undo ─────────────────────────────────────────────────────
router.post('/undo', (_, res) => {
  const success = applyUndo()
  ok(res, { success, row_count: nexcelState.rows.length })
})

// ── POST /api/nexcel/redo ─────────────────────────────────────────────────────
router.post('/redo', (_, res) => {
  const success = applyRedo()
  ok(res, { success, row_count: nexcelState.rows.length })
})

// ── POST /api/nexcel/clipboard/copy ──────────────────────────────────────────
router.post('/clipboard/copy', (req, res) => {
  const { row_ids } = req.body as { row_ids: number[] }
  nexcelState.clipboard = nexcelState.rows
    .filter(r => row_ids?.includes(r.id))
    .map(r => ({ ...r, fields: { ...r.fields } }))
  ok(res, { copied: nexcelState.clipboard.length })
})

// ── POST /api/nexcel/clipboard/paste ─────────────────────────────────────────
router.post('/clipboard/paste', (req, res) => {
  if (!nexcelState.clipboard?.length) return err(res, 'Clipboard is empty')
  pushUndo()
  const inserted: RowRecord[] = []
  const { start_row } = req.body
  for (const src of nexcelState.clipboard) {
    const row: RowRecord = {
      id: nexcelState.nextRowId++,
      order: `${nexcelState.rows.length + 1}.00`,
      fields: { ...src.fields },
    }
    if (start_row != null) {
      const idx = nexcelState.rows.findIndex(r => r.id === start_row)
      nexcelState.rows.splice(idx + 1, 0, row)
    } else {
      nexcelState.rows.push(row)
    }
    inserted.push(row)
  }
  ok(res, { pasted: inserted.length, rows: inserted })
})

// ── GET /api/nexcel/access-mode ───────────────────────────────────────────────
router.get('/access-mode', (_, res) => {
  ok(res, { mode: nexcelState.accessMode })
})

// ── PUT /api/nexcel/access-mode ───────────────────────────────────────────────
router.put('/access-mode', (req, res) => {
  const { mode } = req.body
  if (!['data-entry', 'analyst', 'admin'].includes(mode)) return err(res, 'Invalid mode')
  nexcelState.accessMode = mode
  ok(res, { mode })
})

// ── GET /api/nexcel/comments ──────────────────────────────────────────────────
router.get('/comments', (_, res) => {
  ok(res, { comments: nexcelState.comments })
})

// ── POST /api/nexcel/comments ─────────────────────────────────────────────────
router.post('/comments', (req, res) => {
  const { cell_ref, text, author = 'AI Agent' } = req.body
  if (!cell_ref || !text) return err(res, 'cell_ref and text required')
  const comment: Comment = {
    id: `nc-${Date.now()}`,
    cellRef: cell_ref, text, author,
    createdAt: new Date().toISOString(),
    resolved: false,
  }
  nexcelState.comments.push(comment)
  ok(res, comment, 201)
})

// ── DELETE /api/nexcel/comments/:id ──────────────────────────────────────────
router.delete('/comments/:id', (req, res) => {
  const idx = nexcelState.comments.findIndex(c => c.id === req.params.id)
  if (idx === -1) return err(res, 'Comment not found', 404)
  nexcelState.comments.splice(idx, 1)
  ok(res, { deleted: req.params.id })
})

export default router
