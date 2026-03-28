import type { McpToolDefinition, McpToolResult } from '../../types'
import { nexcelStore } from '../../../store/nexcelStore'
import { parseA1, parseRange, indexToColLetter } from './a1'
import { broadcast } from '../../services/WsServer'

function text(t: string): McpToolResult {
  return { content: [{ type: 'text', text: t }] }
}

function json(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

// ─── nexcel_write_cell ────────────────────────────────────────────────────────

const nexcel_write_cell: McpToolDefinition = {
  name: 'nexcel_write_cell',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Write a value to a single cell by A1 notation. Creates the cell if it is empty.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      ref: { type: 'string', description: 'Cell reference in A1 notation, e.g. "B3"' },
      value: { type: 'string', description: 'Value to write (string, number, or boolean as string)' },
    },
    required: ['sheetId', 'ref', 'value'],
  },
  handler: async (args) => {
    const ref = String(args.ref ?? '')
    const coord = parseA1(ref)
    if (!coord) return err(`Invalid cell reference: "${ref}"`)

    const field = nexcelStore.fields.find(f => f.id === coord.col)
    if (!field) return err(`Column ${indexToColLetter(coord.col)} does not exist`)
    if (field.readOnly) return err(`Column ${indexToColLetter(coord.col)} is read-only`)

    const row = nexcelStore.rows.find(r => r.id === coord.row)
    if (!row) return err(`Row ${coord.row} does not exist`)

    // Coerce value to field type
    const raw = coerceValue(args.value, field.type)
    nexcelStore.updateRow(row.id, { [field.id]: raw })

    broadcast('nexcel:cells_updated', {
      sheetId: '1',
      cells: [{ ref, fieldId: field.id, rowId: row.id, value: raw }],
    })

    return json({ ref, value: raw, fieldId: field.id, rowId: row.id })
  },
}

// ─── nexcel_write_range ───────────────────────────────────────────────────────

const nexcel_write_range: McpToolDefinition = {
  name: 'nexcel_write_range',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Write a 2D array of values to a rectangular range. Top-left cell is the anchor. Rows are expanded if needed.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      startRef: { type: 'string', description: 'Top-left cell in A1 notation, e.g. "A1"' },
      data: {
        type: 'array',
        description: 'Array of rows. Each row is an array of values.',
        items: { type: 'array' },
      },
    },
    required: ['sheetId', 'startRef', 'data'],
  },
  handler: async (args) => {
    const startRef = String(args.startRef ?? '')
    const start = parseA1(startRef)
    if (!start) return err(`Invalid start ref: "${startRef}"`)

    if (!Array.isArray(args.data)) return err('data must be a 2D array')
    const data = args.data as unknown[][]

    const updatedCells: Array<{ ref: string; value: unknown }> = []

    for (let ri = 0; ri < data.length; ri++) {
      const rowNum = start.row + ri
      const row = nexcelStore.rows.find(r => r.id === rowNum)
      if (!row) continue  // row doesn't exist — skip

      const rowData = Array.isArray(data[ri]) ? data[ri] : [data[ri]]
      const fieldsToUpdate: Record<number, unknown> = {}

      for (let ci = 0; ci < rowData.length; ci++) {
        const colId = start.col + ci
        const field = nexcelStore.fields.find(f => f.id === colId)
        if (!field || field.readOnly) continue

        const raw = coerceValue(rowData[ci], field.type)
        fieldsToUpdate[field.id] = raw
        updatedCells.push({
          ref: `${indexToColLetter(field.order)}${rowNum}`,
          value: raw,
        })
      }

      if (Object.keys(fieldsToUpdate).length > 0) {
        nexcelStore.updateRow(row.id, fieldsToUpdate)
      }
    }

    broadcast('nexcel:cells_updated', { sheetId: '1', cells: updatedCells })

    return json({
      startRef,
      rowsWritten: data.length,
      cellsWritten: updatedCells.length,
    })
  },
}

// ─── nexcel_clear_range ───────────────────────────────────────────────────────

const nexcel_clear_range: McpToolDefinition = {
  name: 'nexcel_clear_range',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Clear all cell values in a rectangular range (set to empty string). Does not delete rows or columns.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      range: { type: 'string', description: 'Range in A1 notation, e.g. "A1:C5"' },
    },
    required: ['sheetId', 'range'],
  },
  handler: async (args) => {
    const rangeStr = String(args.range ?? '')
    const r = parseRange(rangeStr)
    if (!r) return err(`Invalid range: "${rangeStr}"`)

    const { startCol, endCol, startRow, endRow } = r
    const fields = nexcelStore.fields.filter(f => f.id >= startCol && f.id <= endCol)
    const rows = nexcelStore.rows.filter(row => row.id >= startRow && row.id <= endRow)

    let cleared = 0
    for (const row of rows) {
      const patch: Record<number, unknown> = {}
      for (const field of fields) {
        if (!field.readOnly) { patch[field.id] = ''; cleared++ }
      }
      if (Object.keys(patch).length > 0) nexcelStore.updateRow(row.id, patch)
    }

    broadcast('nexcel:cells_updated', { sheetId: '1', range: rangeStr, cleared: true })
    return json({ range: rangeStr, cellsCleared: cleared })
  },
}

// ─── nexcel_insert_rows ───────────────────────────────────────────────────────

const nexcel_insert_rows: McpToolDefinition = {
  name: 'nexcel_insert_rows',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Append one or more empty rows at the end of the sheet.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      count: { type: 'number', description: 'Number of rows to insert (default 1, max 100)' },
    },
    required: ['sheetId'],
  },
  handler: async (args) => {
    const count = Math.min(Math.max(1, Number(args.count ?? 1)), 100)
    const inserted: number[] = []
    for (let i = 0; i < count; i++) {
      const row = nexcelStore.addRow()
      inserted.push(row.id)
    }
    broadcast('nexcel:rows_inserted', { sheetId: '1', rowIds: inserted })
    return json({ inserted: inserted.length, rowIds: inserted })
  },
}

// ─── nexcel_delete_rows ───────────────────────────────────────────────────────

const nexcel_delete_rows: McpToolDefinition = {
  name: 'nexcel_delete_rows',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Delete specific rows by row number (1-based). Provide a list of row numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      rows: {
        type: 'array',
        description: 'List of row numbers to delete (1-based), e.g. [3, 5, 7]',
        items: { type: 'number' },
      },
    },
    required: ['sheetId', 'rows'],
  },
  handler: async (args) => {
    if (!Array.isArray(args.rows)) return err('rows must be an array of row numbers')
    const rowNums = (args.rows as number[]).map(Number).filter(n => !isNaN(n))

    let deleted = 0
    const deletedIds: number[] = []
    for (const rowNum of rowNums) {
      const row = nexcelStore.rows.find(r => r.id === rowNum)
      if (row && nexcelStore.deleteRow(row.id)) {
        deleted++
        deletedIds.push(row.id)
      }
    }

    broadcast('nexcel:rows_deleted', { sheetId: '1', rowIds: deletedIds })
    return json({ deleted, rowIds: deletedIds })
  },
}

// ─── nexcel_sort_range ────────────────────────────────────────────────────────

const nexcel_sort_range: McpToolDefinition = {
  name: 'nexcel_sort_range',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Sort all rows by the values in a specified column.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      byColumn: { type: 'string', description: 'Column letter to sort by, e.g. "A" or "C"' },
      direction: { type: 'string', description: '"asc" or "desc". Default "asc"', enum: ['asc', 'desc'] },
    },
    required: ['sheetId', 'byColumn'],
  },
  handler: async (args) => {
    const colLetter = String(args.byColumn ?? '').toUpperCase()
    // parse single letter col
    const colId = colLetter.charCodeAt(0) - 64
    const field = nexcelStore.fields.find(f => f.id === colId)
    if (!field) return err(`Column "${colLetter}" not found`)

    const direction = String(args.direction ?? 'asc') as 'asc' | 'desc'

    nexcelStore.rows.sort((a, b) => {
      const av = String(a.fields[field.id] ?? '')
      const bv = String(b.fields[field.id] ?? '')
      const cmp = av.localeCompare(bv, undefined, { numeric: true })
      return direction === 'asc' ? cmp : -cmp
    })

    broadcast('nexcel:sheet_sorted', { sheetId: '1', byColumn: colLetter, direction })
    return json({ sorted: nexcelStore.rows.length, byColumn: colLetter, direction })
  },
}

// ─── nexcel_set_format ────────────────────────────────────────────────────────

const nexcel_set_format: McpToolDefinition = {
  name: 'nexcel_set_format',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Apply formatting to a cell or range. Supports bold, italic, align, bgColor, textColor.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      range: { type: 'string', description: 'Cell or range in A1 notation, e.g. "A1" or "A1:C3"' },
      format: {
        type: 'object',
        description: 'Format properties to apply',
        properties: {
          bold:       { type: 'boolean' },
          italic:     { type: 'boolean' },
          align:      { type: 'string', enum: ['left', 'center', 'right'] },
          bgColor:    { type: 'string', description: 'CSS hex color, e.g. "#ffff00"' },
          textColor:  { type: 'string', description: 'CSS hex color, e.g. "#ff0000"' },
          numberFormat: { type: 'string', description: '"general", "number", "currency", "percent", "date"' },
        },
      },
    },
    required: ['sheetId', 'range', 'format'],
  },
  handler: async (args) => {
    const rangeStr = String(args.range ?? '')
    const r = parseRange(rangeStr)
    if (!r) return err(`Invalid range: "${rangeStr}"`)

    const format = (args.format ?? {}) as Record<string, unknown>
    const { startCol, endCol, startRow, endRow } = r
    let count = 0

    for (const row of nexcelStore.rows) {
      if (row.id < startRow || row.id > endRow) continue
      for (const field of nexcelStore.fields) {
        if (field.id < startCol || field.id > endCol) continue
        nexcelStore.setFormat(row.id, field.id, format as Record<string, unknown>)
        count++
      }
    }

    broadcast('nexcel:format_updated', { sheetId: '1', range: rangeStr, format })
    return json({ range: rangeStr, cellsFormatted: count, format })
  },
}

// ─── nexcel_set_column_width ──────────────────────────────────────────────────

const nexcel_set_column_width: McpToolDefinition = {
  name: 'nexcel_set_column_width',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Set the display width of a column (in pixels).',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      column: { type: 'string', description: 'Column letter, e.g. "A"' },
      width: { type: 'number', description: 'Width in pixels (20–500)' },
    },
    required: ['sheetId', 'column', 'width'],
  },
  handler: async (args) => {
    const colLetter = String(args.column ?? '').toUpperCase()
    const colId = colLetter.charCodeAt(0) - 64
    const field = nexcelStore.fields.find(f => f.id === colId)
    if (!field) return err(`Column "${colLetter}" not found`)

    const width = Math.min(500, Math.max(20, Number(args.width ?? 100)))

    // Column width is UI state — broadcast to frontend to update its colWidths map
    broadcast('nexcel:column_width_changed', { sheetId: '1', fieldId: field.id, column: colLetter, width })
    return json({ column: colLetter, fieldId: field.id, width })
  },
}

// ─── nexcel_import_csv ────────────────────────────────────────────────────────

const nexcel_import_csv: McpToolDefinition = {
  name: 'nexcel_import_csv',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Import CSV text data into the sheet. Matches columns by header name. Appends rows after existing data.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      csv: { type: 'string', description: 'CSV text content (first row is headers)' },
      replaceAll: { type: 'boolean', description: 'If true, reset sheet before importing. Default false.' },
    },
    required: ['sheetId', 'csv'],
  },
  handler: async (args) => {
    const csv = String(args.csv ?? '')
    if (!csv.trim()) return err('csv content is empty')

    if (args.replaceAll === true) nexcelStore.resetToBlank()

    const lines = csv.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return err('CSV must have at least a header row and one data row')

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    let imported = 0

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',')
      const fields: Record<number, unknown> = {}
      headers.forEach((h, ci) => {
        // Match by column name, or fall back to column letter
        const field = nexcelStore.fields.find(f =>
          f.name.toLowerCase() === h.toLowerCase() ||
          indexToColLetter(f.order).toLowerCase() === h.toLowerCase()
        )
        if (field) fields[field.id] = vals[ci]?.trim().replace(/^"|"$/g, '') ?? ''
      })
      nexcelStore.addRow(fields)
      imported++
    }

    broadcast('nexcel:sheet_reset', { sheetId: '1' })
    return json({ imported, headers })
  },
}

// ─── nexcel_new_sheet ─────────────────────────────────────────────────────────

const nexcel_new_sheet: McpToolDefinition = {
  name: 'nexcel_new_sheet',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Reset the current sheet to a blank 26-column × 100-row workbook (like Excel New).',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
    },
    required: ['sheetId'],
  },
  handler: async () => {
    nexcelStore.resetToBlank()
    broadcast('nexcel:sheet_reset', { sheetId: '1' })
    return json({
      sheetId: '1',
      columns: 26,
      rows: 100,
      status: 'Sheet reset to blank',
    })
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceValue(raw: unknown, fieldType: string): unknown {
  const s = String(raw ?? '')
  switch (fieldType) {
    case 'number':
      return s === '' ? '' : (isNaN(Number(s)) ? s : Number(s))
    case 'boolean':
      return s.toLowerCase() === 'true' || s === '1'
    default:
      return s
  }
}

// ─── Export all write tools ───────────────────────────────────────────────────

export const nexcelWriteTools: McpToolDefinition[] = [
  nexcel_write_cell,
  nexcel_write_range,
  nexcel_clear_range,
  nexcel_insert_rows,
  nexcel_delete_rows,
  nexcel_sort_range,
  nexcel_set_format,
  nexcel_set_column_width,
  nexcel_import_csv,
  nexcel_new_sheet,
]
