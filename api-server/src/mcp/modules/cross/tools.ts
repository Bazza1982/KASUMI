/**
 * Phase 5 cross-module MCP tools — workflows that span Nexcel and Wordo.
 */
import type { McpToolDefinition, McpToolResult } from '../../types'
import { nexcelStore } from '../../../store/nexcelStore'
import { wordoStore } from '../../../store/wordoStore'
import { broadcast } from '../../services/WsServer'
import type { TableBlock, TableRowData } from '../../../types'

function json(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

// ─── kasumi_wordo_table_to_nexcel ─────────────────────────────────────────────

const kasumi_wordo_table_to_nexcel: McpToolDefinition = {
  name: 'kasumi_wordo_table_to_nexcel',
  module: 'cross',
  version: '1.0.0',
  description:
    'Convert a Wordo table block into Nexcel rows. The first row of the table is treated as ' +
    'headers and matched to existing Nexcel field names (case-insensitive). ' +
    'Data rows are appended to the current Nexcel sheet.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Wordo document identifier (use "1")' },
      blockId:    { type: 'string', description: 'Table block UUID to convert' },
      sheetId:    { type: 'string', description: 'Nexcel sheet identifier (use "1")' },
    },
    required: ['documentId', 'blockId', 'sheetId'],
  },
  handler: async (args) => {
    const blockId = String(args.blockId ?? '')
    const found = wordoStore.findBlock(blockId)
    if (!found) return err(`Block not found: ${blockId}`)
    if (found.block.type !== 'table') return err(`Block ${blockId} is not a table`)

    const tb = found.block as TableBlock
    if (tb.rows.length < 2) return err('Table must have at least a header row and one data row')

    // Extract headers from first row
    const headerRow = tb.rows[0]
    const headers = headerRow.cells.map(c => c.content.map(i => i.text).join('').trim())

    // Map header names to nexcel field IDs
    const fields = nexcelStore.fields
    const fieldMap: Record<string, number> = {}
    for (const h of headers) {
      const match = fields.find(f => f.name.toLowerCase() === h.toLowerCase())
      if (match) fieldMap[h] = match.id
    }

    const mappedCount = Object.keys(fieldMap).length
    if (mappedCount === 0) return err(`No Wordo table headers match Nexcel field names. Headers: ${headers.join(', ')}`)

    // Insert data rows
    const inserted: number[] = []
    for (const dataRow of tb.rows.slice(1)) {
      const rowFields: Record<number, unknown> = {}
      dataRow.cells.forEach((cell, i) => {
        const header = headers[i]
        if (header && fieldMap[header] !== undefined) {
          rowFields[fieldMap[header]] = cell.content.map(c => c.text).join('')
        }
      })
      const newRow = nexcelStore.addRow(rowFields)
      inserted.push(newRow.id)
    }

    broadcast('nexcel:cells_updated', { sheetId: '1', source: 'wordo_import' })

    return json({
      sheetId: '1',
      documentId: '1',
      blockId,
      headersMatched: mappedCount,
      headersSkipped: headers.length - mappedCount,
      rowsInserted: inserted.length,
      insertedRowIds: inserted,
    })
  },
}

// ─── kasumi_nexcel_to_wordo_table ─────────────────────────────────────────────

const kasumi_nexcel_to_wordo_table: McpToolDefinition = {
  name: 'kasumi_nexcel_to_wordo_table',
  module: 'cross',
  version: '1.0.0',
  description:
    'Snapshot a range of Nexcel rows as a proper table block inserted into a Wordo document section. ' +
    'Field names become column headers. The table is a static snapshot (not a live embed).',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId:      { type: 'string', description: 'Nexcel sheet identifier (use "1")' },
      documentId:   { type: 'string', description: 'Wordo document identifier (use "1")' },
      sectionId:    { type: 'string', description: 'Section UUID to insert the table into' },
      fieldIds:     { type: 'array', items: { type: 'number' }, description: 'Field IDs to include (optional — all fields if omitted)' },
      maxRows:      { type: 'number', description: 'Max rows to include (default 50)' },
      afterBlockId: { type: 'string', description: 'Insert after this block ID (optional)' },
    },
    required: ['sheetId', 'documentId', 'sectionId'],
  },
  handler: async (args) => {
    const sectionId = String(args.sectionId ?? '')
    const section = wordoStore.getSection(sectionId)
    if (!section) return err(`Section not found: ${sectionId}`)

    const maxRows = typeof args.maxRows === 'number' ? args.maxRows : 50
    const { rows: allRows } = nexcelStore.getRows({})
    const rowSlice = allRows.slice(0, maxRows)

    const allFields = nexcelStore.fields
    const fieldIds: number[] = Array.isArray(args.fieldIds) && args.fieldIds.length > 0
      ? (args.fieldIds as number[])
      : allFields.map(f => f.id)
    const fields = allFields.filter(f => fieldIds.includes(f.id))

    if (fields.length === 0) return err('No valid fields selected')

    // Build table rows
    const headerRow: TableRowData = {
      cells: fields.map(f => ({
        content: [{ text: f.name }],
        header: true,
      })),
    }

    const dataRows: TableRowData[] = rowSlice.map(row => ({
      cells: fields.map(f => ({
        content: [{ text: String(row.fields[f.id] ?? '') }],
      })),
    }))

    const tableDef = {
      type: 'table' as const,
      rows: [headerRow, ...dataRows],
    }

    const afterBlockId = args.afterBlockId ? String(args.afterBlockId) : undefined
    const inserted = wordoStore.insertBlock(sectionId, tableDef as never, afterBlockId)

    broadcast('wordo:block_inserted', { documentId: '1', sectionId, blockId: inserted.id })

    return json({
      documentId: '1',
      sectionId,
      blockId: inserted.id,
      columnCount: fields.length,
      rowCount: rowSlice.length,
    })
  },
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const crossTools: McpToolDefinition[] = [
  kasumi_wordo_table_to_nexcel,
  kasumi_nexcel_to_wordo_table,
]
