import type { McpToolDefinition, McpToolResult } from '../../types'
import { nexcelStore } from '../../../store/nexcelStore'
import { parseA1, parseRange, indexToColLetter } from './a1'

function text(t: string): McpToolResult {
  return { content: [{ type: 'text', text: t }] }
}

function json(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }] }
}

function err(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

// ─── nexcel_list_sheets ───────────────────────────────────────────────────────

const nexcel_list_sheets: McpToolDefinition = {
  name: 'nexcel_list_sheets',
  module: 'nexcel',
  version: '1.0.0',
  description: 'List all sheets in the current NEXCEL workbook. Currently returns the single active sheet.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    const fields = nexcelStore.fields
    const rows = nexcelStore.rows
    return json([{
      id: '1',
      name: 'Sheet 1',
      columnCount: fields.length,
      rowCount: rows.length,
      columns: fields.map(f => ({
        id: f.id,
        name: f.name || indexToColLetter(f.order),
        type: f.type,
      })),
    }])
  },
}

// ─── nexcel_read_cell ─────────────────────────────────────────────────────────

const nexcel_read_cell: McpToolDefinition = {
  name: 'nexcel_read_cell',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Read the value of a single cell by A1 notation (e.g. "A1", "C5").',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1" for the current sheet)' },
      ref: { type: 'string', description: 'Cell reference in A1 notation, e.g. "B3"' },
    },
    required: ['sheetId', 'ref'],
  },
  handler: async (args) => {
    const ref = String(args.ref ?? '')
    const coord = parseA1(ref)
    if (!coord) return err(`Invalid cell reference: "${ref}". Use A1 notation (e.g. "B3").`)

    const field = nexcelStore.fields.find(f => f.id === coord.col)
    if (!field) return err(`Column ${indexToColLetter(coord.col)} does not exist (field id ${coord.col})`)

    const row = nexcelStore.rows.find(r => r.id === coord.row)
    if (!row) return err(`Row ${coord.row} does not exist`)

    const value = row.fields[field.id]
    return json({
      ref,
      fieldId: field.id,
      fieldName: field.name || indexToColLetter(field.order),
      rowId: row.id,
      value: value ?? null,
    })
  },
}

// ─── nexcel_read_range ────────────────────────────────────────────────────────

const nexcel_read_range: McpToolDefinition = {
  name: 'nexcel_read_range',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Read a rectangular range of cells by A1 notation (e.g. "A1:C10"). Returns a 2D array of values plus column headers.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      range: { type: 'string', description: 'Cell range in A1 notation, e.g. "A1:E20"' },
      includeHeaders: {
        type: 'boolean',
        description: 'If true, first row of output is column names. Default false.',
      },
    },
    required: ['sheetId', 'range'],
  },
  handler: async (args) => {
    const rangeStr = String(args.range ?? '')
    const r = parseRange(rangeStr)
    if (!r) return err(`Invalid range: "${rangeStr}". Use A1:B2 notation.`)

    const { startCol, endCol, startRow, endRow } = r

    // Collect relevant fields and rows
    const fields = nexcelStore.fields.filter(f => f.id >= startCol && f.id <= endCol)
    if (fields.length === 0) return err(`No columns in range ${rangeStr}`)

    const rows = nexcelStore.rows.filter(row => row.id >= startRow && row.id <= endRow)

    const includeHeaders = args.includeHeaders === true

    const data: (string | number | boolean | null)[][] = []

    if (includeHeaders) {
      data.push(fields.map(f => f.name || indexToColLetter(f.order)))
    }

    for (const row of rows) {
      data.push(fields.map(f => {
        const v = row.fields[f.id]
        if (v === undefined || v === null || v === '') return null
        return v as string | number | boolean
      }))
    }

    return json({
      range: rangeStr,
      columns: fields.map(f => ({
        id: f.id,
        letter: indexToColLetter(f.order),
        name: f.name || indexToColLetter(f.order),
      })),
      rowCount: rows.length,
      data,
    })
  },
}

// ─── nexcel_find_cells ────────────────────────────────────────────────────────

const nexcel_find_cells: McpToolDefinition = {
  name: 'nexcel_find_cells',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Search all cells in the sheet for a text query. Returns matching cell references, values, and context.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
      query: { type: 'string', description: 'Search term (case-insensitive)' },
      maxResults: { type: 'number', description: 'Maximum results to return. Default 50.' },
    },
    required: ['sheetId', 'query'],
  },
  handler: async (args) => {
    const query = String(args.query ?? '').toLowerCase()
    if (!query) return err('query cannot be empty')

    const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 50
    const matches: Array<{
      ref: string
      fieldId: number
      fieldName: string
      rowId: number
      value: unknown
    }> = []

    outer:
    for (const row of nexcelStore.rows) {
      for (const field of nexcelStore.fields) {
        const v = row.fields[field.id]
        if (v !== undefined && v !== null && String(v).toLowerCase().includes(query)) {
          matches.push({
            ref: `${indexToColLetter(field.order)}${row.id}`,
            fieldId: field.id,
            fieldName: field.name || indexToColLetter(field.order),
            rowId: row.id,
            value: v,
          })
          if (matches.length >= maxResults) break outer
        }
      }
    }

    return json({
      query,
      matchCount: matches.length,
      truncated: matches.length >= maxResults,
      matches,
    })
  },
}

// ─── nexcel_export_csv ────────────────────────────────────────────────────────

const nexcel_export_csv: McpToolDefinition = {
  name: 'nexcel_export_csv',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Export the entire sheet as a CSV string.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
    },
    required: ['sheetId'],
  },
  handler: async () => {
    const csv = nexcelStore.exportCsv()
    return { content: [{ type: 'text', text: csv, mimeType: 'text/csv' }] }
  },
}

// ─── Export all nexcel Phase 1c tools ─────────────────────────────────────────

export const nexcelTools: McpToolDefinition[] = [
  nexcel_list_sheets,
  nexcel_read_cell,
  nexcel_read_range,
  nexcel_find_cells,
  nexcel_export_csv,
]
