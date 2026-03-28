/**
 * Phase 5 Nexcel AI-native MCP tools.
 * These tools perform structural analysis and data-aware operations
 * on the sheet without requiring an external LLM.
 */
import type { McpToolDefinition, McpToolResult } from '../../types'
import { nexcelStore } from '../../../store/nexcelStore'
import { broadcast } from '../../services/WsServer'
import { parseRange, parseA1, indexToColLetter } from './a1'

function json(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

// ─── nexcel_analyse_sheet ─────────────────────────────────────────────────────

const nexcel_analyse_sheet: McpToolDefinition = {
  name: 'nexcel_analyse_sheet',
  module: 'nexcel',
  version: '1.0.0',
  description:
    'Analyse the sheet structure: row/column counts, per-column type inference, ' +
    'fill rates, numeric stats (min/max/avg), and unique value counts for text columns.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string', description: 'Sheet identifier (use "1")' },
    },
    required: ['sheetId'],
  },
  handler: async () => {
    const { rows: allRows } = nexcelStore.getRows({})
    const fields = nexcelStore.fields

    const columnStats = fields.map(field => {
      const values = allRows.map(r => r.fields[field.id])
      const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '')
      const fillRate = values.length > 0 ? nonEmpty.length / values.length : 0

      const stat: Record<string, unknown> = {
        fieldId: field.id,
        name: field.name,
        type: field.type,
        fillRate: Math.round(fillRate * 1000) / 10,  // percent
        nonEmptyCount: nonEmpty.length,
        emptyCount: values.length - nonEmpty.length,
      }

      if (field.type === 'number') {
        const nums = nonEmpty.map(v => parseFloat(String(v))).filter(n => !isNaN(n))
        if (nums.length > 0) {
          stat.min = Math.min(...nums)
          stat.max = Math.max(...nums)
          stat.avg = Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100
        }
      } else if (field.type === 'text' || field.type === 'single_select') {
        const uniq = new Set(nonEmpty.map(v => String(v)))
        stat.uniqueValues = uniq.size
        if (uniq.size <= 20) {
          const freq: Record<string, number> = {}
          for (const v of nonEmpty) { const k = String(v); freq[k] = (freq[k] ?? 0) + 1 }
          stat.topValues = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([value, count]) => ({ value, count }))
        }
      }

      return stat
    })

    return json({
      sheetId: '1',
      sheetName: nexcelStore.sheetName,
      rowCount: allRows.length,
      columnCount: fields.length,
      frozenRows: nexcelStore.frozenRows,
      frozenCols: nexcelStore.frozenCols,
      mergedCellCount: nexcelStore.mergedCells.length,
      namedRangeCount: nexcelStore.namedRanges.length,
      columnStats,
    })
  },
}

// ─── nexcel_extract_table ─────────────────────────────────────────────────────

const nexcel_extract_table: McpToolDefinition = {
  name: 'nexcel_extract_table',
  module: 'nexcel',
  version: '1.0.0',
  description:
    'Extract a rectangular data region as a structured table (array of header+row objects). ' +
    'If no range given, uses all columns and all rows.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId:    { type: 'string', description: 'Sheet identifier (use "1")' },
      range:      { type: 'string', description: 'A1-notation range, e.g. "A1:E20" (optional — defaults to full sheet)' },
      hasHeader:  { type: 'boolean', description: 'Whether the first row of the range is a header row (default true)' },
    },
    required: ['sheetId'],
  },
  handler: async (args) => {
    const { rows: allRows } = nexcelStore.getRows({})
    const fields = nexcelStore.fields
    const hasHeader = args.hasHeader !== false

    let fieldSlice = fields
    let rowSlice = allRows

    if (args.range) {
      const parsed = parseRange(String(args.range))
      if (!parsed) return err(`Invalid range: ${args.range}`)
      const { startRow, endRow, startCol, endCol } = parsed
      fieldSlice = fields.filter(f => f.order >= startCol && f.order <= endCol)
      rowSlice = allRows.slice(startRow - 1, endRow)
    }

    const headers = fieldSlice.map(f => f.name)
    const dataRows = hasHeader ? rowSlice : rowSlice
    const records = dataRows.map(row => {
      const record: Record<string, unknown> = {}
      for (const f of fieldSlice) {
        record[f.name] = row.fields[f.id] ?? null
      }
      return record
    })

    return json({
      sheetId: '1',
      headers,
      rowCount: records.length,
      records,
    })
  },
}

// ─── nexcel_auto_format_table ─────────────────────────────────────────────────

const nexcel_auto_format_table: McpToolDefinition = {
  name: 'nexcel_auto_format_table',
  module: 'nexcel',
  version: '1.0.0',
  description:
    'Auto-size column widths based on actual content length in the sheet. ' +
    'Optionally restrict to a specific range.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId:  { type: 'string', description: 'Sheet identifier (use "1")' },
      minWidth: { type: 'number', description: 'Minimum column width in px (default 80)' },
      maxWidth: { type: 'number', description: 'Maximum column width in px (default 300)' },
    },
    required: ['sheetId'],
  },
  handler: async (args) => {
    const { rows: allRows } = nexcelStore.getRows({})
    const fields = nexcelStore.fields
    const minW = typeof args.minWidth === 'number' ? args.minWidth : 80
    const maxW = typeof args.maxWidth === 'number' ? args.maxWidth : 300
    const CHAR_PX = 8   // approx pixels per character

    const updated: Array<{ fieldId: number; name: string; width: number }> = []

    for (const field of fields) {
      // Start with header length
      let maxLen = field.name.length
      for (const row of allRows) {
        const val = String(row.fields[field.id] ?? '')
        if (val.length > maxLen) maxLen = val.length
      }
      const width = Math.min(maxW, Math.max(minW, maxLen * CHAR_PX + 16))
      nexcelStore.setColWidth(field.id, width)
      updated.push({ fieldId: field.id, name: field.name, width })
    }

    broadcast('nexcel:column_width_changed', { sheetId: '1', auto: true })
    return json({ sheetId: '1', columnsUpdated: updated.length, columns: updated })
  },
}

// ─── nexcel_fill_series ───────────────────────────────────────────────────────

const nexcel_fill_series: McpToolDefinition = {
  name: 'nexcel_fill_series',
  module: 'nexcel',
  version: '1.0.0',
  description:
    'Detect a numeric or date series pattern in a column and fill downward into empty cells. ' +
    'The source cells must form a linear series (e.g. 1, 2, 3 or 2025-01-01, 2025-01-08).',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId:   { type: 'string',  description: 'Sheet identifier (use "1")' },
      fieldId:   { type: 'number',  description: 'Column field ID to fill' },
      startRow:  { type: 'number',  description: 'First row ID containing seed values' },
      endRow:    { type: 'number',  description: 'Last row ID to fill (inclusive)' },
      seedCount: { type: 'number',  description: 'Number of seed values to detect pattern from (default 2)' },
    },
    required: ['sheetId', 'fieldId', 'startRow', 'endRow'],
  },
  handler: async (args) => {
    const fieldId = Number(args.fieldId)
    const startRow = Number(args.startRow)
    const endRow = Number(args.endRow)
    const seedCount = typeof args.seedCount === 'number' ? args.seedCount : 2

    const field = nexcelStore.fields.find(f => f.id === fieldId)
    if (!field) return err(`Field not found: ${fieldId}`)

    const { rows: allRows } = nexcelStore.getRows({})
    const inRange = allRows.filter(r => r.id >= startRow && r.id <= endRow)
    if (inRange.length < seedCount) return err('Not enough rows in range to detect pattern')

    const seeds = inRange.slice(0, seedCount)
    const seedVals = seeds.map(r => r.fields[fieldId])

    // Detect numeric series
    const nums = seedVals.map(v => parseFloat(String(v)))
    const isNumeric = nums.every(n => !isNaN(n))

    if (!isNumeric) return err('Could not detect a numeric series — only numeric fill is supported')

    const step = seedCount >= 2 ? nums[1] - nums[0] : 1
    // Verify all seed diffs are equal
    for (let i = 1; i < nums.length; i++) {
      if (Math.abs((nums[i] - nums[i - 1]) - step) > 0.0001) {
        return err('Seed values do not form a linear series')
      }
    }

    let filled = 0
    for (let i = seedCount; i < inRange.length; i++) {
      const row = inRange[i]
      const val = nums[0] + step * i
      nexcelStore.updateRow(row.id, { [fieldId]: val })
      filled++
    }

    broadcast('nexcel:cells_updated', { sheetId: '1', fieldId, fill: true })
    return json({ sheetId: '1', fieldId, step, filledCount: filled })
  },
}

// ─── nexcel_query_cluster ─────────────────────────────────────────────────────

const nexcel_query_cluster: McpToolDefinition = {
  name: 'nexcel_query_cluster',
  module: 'nexcel',
  version: '1.0.0',
  description:
    'Query a subset ("cluster") of rows matching a field value. Returns summary stats ' +
    'and a sample of matching rows. Useful for AI agents to inspect a segment of data.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId:  { type: 'string', description: 'Sheet identifier (use "1")' },
      fieldId:  { type: 'number', description: 'Field ID to filter on' },
      value:    { type: 'string', description: 'Value to match (case-insensitive contains)' },
      maxRows:  { type: 'number', description: 'Max rows to return in sample (default 20)' },
    },
    required: ['sheetId', 'fieldId', 'value'],
  },
  handler: async (args) => {
    const fieldId = Number(args.fieldId)
    const value = String(args.value ?? '').toLowerCase()
    const maxRows = typeof args.maxRows === 'number' ? args.maxRows : 20

    const field = nexcelStore.fields.find(f => f.id === fieldId)
    if (!field) return err(`Field not found: ${fieldId}`)

    const { rows: allRows } = nexcelStore.getRows({})
    const matched = allRows.filter(r =>
      String(r.fields[fieldId] ?? '').toLowerCase().includes(value)
    )

    const sample = matched.slice(0, maxRows).map(r => {
      const out: Record<string, unknown> = { rowId: r.id }
      for (const f of nexcelStore.fields) out[f.name] = r.fields[f.id]
      return out
    })

    return json({
      sheetId: '1',
      filterField: field.name,
      filterValue: value,
      matchCount: matched.length,
      truncated: matched.length > maxRows,
      sample,
    })
  },
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const nexcelAiTools: McpToolDefinition[] = [
  nexcel_analyse_sheet,
  nexcel_extract_table,
  nexcel_auto_format_table,
  nexcel_fill_series,
  nexcel_query_cluster,
]
