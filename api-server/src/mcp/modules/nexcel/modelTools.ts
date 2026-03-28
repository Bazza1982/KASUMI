/**
 * Phase 4 Nexcel MCP tools — backed by the extended nexcelStore model.
 * These tools require model fields added in Phase 4:
 *   colWidths, rowHeights, frozenRows/Cols, mergedCells, hyperlinks,
 *   namedRanges, formulas, sheetName.
 */
import type { McpToolDefinition, McpToolResult } from '../../types'
import { nexcelStore } from '../../../store/nexcelStore'
import { parseA1, parseRange, indexToColLetter } from './a1'
import { broadcast } from '../../services/WsServer'

function json(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

// ─── nexcel_set_row_height ────────────────────────────────────────────────────

const nexcel_set_row_height: McpToolDefinition = {
  name: 'nexcel_set_row_height',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Set the display height of a row (in pixels).',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      row:    { type: 'number', description: 'Row number (1-based)' },
      height: { type: 'number', description: 'Height in pixels (16–300)' },
    },
    required: ['sheetId', 'row', 'height'],
  },
  handler: async (args) => {
    const rowNum = Number(args.row)
    const height = Number(args.height)
    if (!nexcelStore.rows.find(r => r.id === rowNum)) return err(`Row ${rowNum} not found`)
    nexcelStore.setRowHeight(rowNum, height)
    broadcast('nexcel:row_height_changed', { sheetId: '1', rowId: rowNum, height: nexcelStore.rowHeights[rowNum] })
    return json({ rowId: rowNum, height: nexcelStore.rowHeights[rowNum] })
  },
}

// ─── nexcel_freeze_panes ──────────────────────────────────────────────────────

const nexcel_freeze_panes: McpToolDefinition = {
  name: 'nexcel_freeze_panes',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Freeze rows and/or columns. Set both to 0 to unfreeze.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      rows: { type: 'number', description: 'Number of rows to freeze from the top (0 = none)' },
      cols: { type: 'number', description: 'Number of columns to freeze from the left (0 = none)' },
    },
    required: ['sheetId', 'rows', 'cols'],
  },
  handler: async (args) => {
    nexcelStore.setFrozen(Number(args.rows ?? 0), Number(args.cols ?? 0))
    broadcast('nexcel:frozen_changed', { sheetId: '1', frozenRows: nexcelStore.frozenRows, frozenCols: nexcelStore.frozenCols })
    return json({ frozenRows: nexcelStore.frozenRows, frozenCols: nexcelStore.frozenCols })
  },
}

// ─── nexcel_merge_cells ───────────────────────────────────────────────────────

const nexcel_merge_cells: McpToolDefinition = {
  name: 'nexcel_merge_cells',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Merge a rectangular range of cells. Overlapping merges are removed.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      range: { type: 'string', description: 'Range to merge in A1 notation, e.g. "A1:C3"' },
    },
    required: ['sheetId', 'range'],
  },
  handler: async (args) => {
    const rangeStr = String(args.range ?? '')
    const r = parseRange(rangeStr)
    if (!r) return err(`Invalid range: "${rangeStr}"`)
    if (r.startRow === r.endRow && r.startCol === r.endCol) return err('Cannot merge a single cell')
    const merge = nexcelStore.mergeCells(r.startRow, r.startCol, r.endRow, r.endCol)
    broadcast('nexcel:cells_merged', { sheetId: '1', merge })
    return json(merge)
  },
}

// ─── nexcel_unmerge_cells ─────────────────────────────────────────────────────

const nexcel_unmerge_cells: McpToolDefinition = {
  name: 'nexcel_unmerge_cells',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Remove a cell merge. Provide the top-left cell of the merge.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      ref: { type: 'string', description: 'Top-left cell of the merged region, e.g. "A1"' },
    },
    required: ['sheetId', 'ref'],
  },
  handler: async (args) => {
    const coord = parseA1(String(args.ref ?? ''))
    if (!coord) return err(`Invalid ref: "${args.ref}"`)
    const removed = nexcelStore.unmergeCells(coord.row, coord.col)
    if (!removed) return err(`No merge found at ${args.ref}`)
    broadcast('nexcel:cells_unmerged', { sheetId: '1', ref: args.ref })
    return json({ unmerged: true, ref: args.ref })
  },
}

// ─── nexcel_create_hyperlink ──────────────────────────────────────────────────

const nexcel_create_hyperlink: McpToolDefinition = {
  name: 'nexcel_create_hyperlink',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Attach a hyperlink to a cell. The cell value becomes the label if no label provided.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      ref:   { type: 'string', description: 'Cell in A1 notation, e.g. "B5"' },
      url:   { type: 'string', description: 'URL the hyperlink points to' },
      label: { type: 'string', description: 'Display text for the link (optional)' },
    },
    required: ['sheetId', 'ref', 'url'],
  },
  handler: async (args) => {
    const ref = String(args.ref ?? '')
    const coord = parseA1(ref)
    if (!coord) return err(`Invalid ref: "${ref}"`)
    const url = String(args.url ?? '')
    if (!url.startsWith('http')) return err('url must start with http:// or https://')
    const label = args.label ? String(args.label) : undefined
    const hl = nexcelStore.setHyperlink(coord.row, coord.col, url, label)
    broadcast('nexcel:hyperlink_set', { sheetId: '1', ref, url })
    return json({ ref, url: hl.url, label: hl.label })
  },
}

// ─── nexcel_create_named_range ────────────────────────────────────────────────

const nexcel_create_named_range: McpToolDefinition = {
  name: 'nexcel_create_named_range',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Create or update a named range. Names are case-insensitive and must be unique.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      name:  { type: 'string', description: 'Name for the range, e.g. "SalesData"' },
      range: { type: 'string', description: 'Cell range in A1 notation, e.g. "A1:D20"' },
    },
    required: ['sheetId', 'name', 'range'],
  },
  handler: async (args) => {
    const name = String(args.name ?? '').trim()
    if (!name) return err('name cannot be empty')
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) return err('name must start with a letter or underscore, and contain only letters, digits, underscores, or dots')
    const rangeStr = String(args.range ?? '')
    if (!parseRange(rangeStr)) return err(`Invalid range: "${rangeStr}"`)
    const nr = nexcelStore.addNamedRange(name, rangeStr)
    return json(nr)
  },
}

// ─── nexcel_delete_named_range ────────────────────────────────────────────────

const nexcel_delete_named_range: McpToolDefinition = {
  name: 'nexcel_delete_named_range',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Delete a named range by name.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      name: { type: 'string', description: 'Named range to delete' },
    },
    required: ['sheetId', 'name'],
  },
  handler: async (args) => {
    const deleted = nexcelStore.deleteNamedRange(String(args.name ?? ''))
    if (!deleted) return err(`Named range "${args.name}" not found`)
    return json({ deleted: true, name: args.name })
  },
}

// ─── nexcel_get_named_ranges ──────────────────────────────────────────────────

const nexcel_get_named_ranges: McpToolDefinition = {
  name: 'nexcel_get_named_ranges',
  module: 'nexcel',
  version: '1.0.0',
  description: 'List all named ranges in the sheet.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
    },
    required: ['sheetId'],
  },
  handler: async () => json(nexcelStore.namedRanges),
}

// ─── nexcel_write_formula ─────────────────────────────────────────────────────

const nexcel_write_formula: McpToolDefinition = {
  name: 'nexcel_write_formula',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Store a formula string in a cell (e.g. "=SUM(A1:A10)"). The formula is stored as-is; live evaluation requires a future formula engine.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      ref:     { type: 'string', description: 'Cell in A1 notation, e.g. "D5"' },
      formula: { type: 'string', description: 'Formula string starting with "=", e.g. "=SUM(A1:A10)"' },
    },
    required: ['sheetId', 'ref', 'formula'],
  },
  handler: async (args) => {
    const ref = String(args.ref ?? '')
    const coord = parseA1(ref)
    if (!coord) return err(`Invalid ref: "${ref}"`)
    const formula = String(args.formula ?? '')
    if (!formula.startsWith('=')) return err('Formula must start with "="')
    nexcelStore.setFormula(coord.row, coord.col, formula)
    broadcast('nexcel:cells_updated', { sheetId: '1', cells: [{ ref, formula }] })
    return json({ ref, formula, note: 'Formula stored. Live evaluation deferred to Phase 4 formula engine.' })
  },
}

// ─── nexcel_get_formula ───────────────────────────────────────────────────────

const nexcel_get_formula: McpToolDefinition = {
  name: 'nexcel_get_formula',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Get the formula stored in a cell, if any.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      ref: { type: 'string', description: 'Cell in A1 notation, e.g. "D5"' },
    },
    required: ['sheetId', 'ref'],
  },
  handler: async (args) => {
    const ref = String(args.ref ?? '')
    const coord = parseA1(ref)
    if (!coord) return err(`Invalid ref: "${ref}"`)
    const formula = nexcelStore.getFormula(coord.row, coord.col)
    return json({ ref, formula })
  },
}

// ─── nexcel_rename_sheet ──────────────────────────────────────────────────────

const nexcel_rename_sheet: McpToolDefinition = {
  name: 'nexcel_rename_sheet',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Rename the current sheet.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
      name: { type: 'string', description: 'New sheet name' },
    },
    required: ['sheetId', 'name'],
  },
  handler: async (args) => {
    const name = String(args.name ?? '').trim()
    if (!name) return err('name cannot be empty')
    nexcelStore.renameSheet(name)
    broadcast('nexcel:sheet_renamed', { sheetId: '1', name: nexcelStore.sheetName })
    return json({ sheetId: '1', name: nexcelStore.sheetName })
  },
}

// ─── nexcel_get_sheet_meta ────────────────────────────────────────────────────

const nexcel_get_sheet_meta: McpToolDefinition = {
  name: 'nexcel_get_sheet_meta',
  module: 'nexcel',
  version: '1.0.0',
  description: 'Get full sheet metadata: name, dimensions, frozen panes, merged cells, named ranges.',
  inputSchema: {
    type: 'object',
    properties: {
      sheetId: { type: 'string' },
    },
    required: ['sheetId'],
  },
  handler: async () => json({
    sheetId: '1',
    name: nexcelStore.sheetName,
    columnCount: nexcelStore.fields.length,
    rowCount: nexcelStore.rows.length,
    frozenRows: nexcelStore.frozenRows,
    frozenCols: nexcelStore.frozenCols,
    mergedCells: nexcelStore.mergedCells,
    namedRanges: nexcelStore.namedRanges,
    hyperlinkCount: Object.keys(nexcelStore.hyperlinks).length,
    formulaCount: Object.keys(nexcelStore.formulas).length,
  }),
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const nexcelModelTools: McpToolDefinition[] = [
  nexcel_set_row_height,
  nexcel_freeze_panes,
  nexcel_merge_cells,
  nexcel_unmerge_cells,
  nexcel_create_hyperlink,
  nexcel_create_named_range,
  nexcel_delete_named_range,
  nexcel_get_named_ranges,
  nexcel_write_formula,
  nexcel_get_formula,
  nexcel_rename_sheet,
  nexcel_get_sheet_meta,
]
