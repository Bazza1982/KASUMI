import { create } from 'zustand'
import type { GridCoord, SelectionRange, SheetContext, FieldMeta, RowRecord, TableMeta, FilterRule } from '../types'
import { MockAdapter } from '../adapters/baserow/MockAdapter'
import { NexcelApiAdapter } from '../adapters/baserow/NexcelApiAdapter'
import { BaserowAdapter } from '../adapters/baserow/BaserowAdapter'
import { renderCellValue } from '../grid/renderers'
import { objectRegistry, makeObjectId } from '../../../platform/object-registry'
import { NexcelLogger } from '../services/logger'
import { useCellChangeStore } from './useCellChangeStore'

// Adapter selection — reads from localStorage so ConnectionPanel can switch at runtime.
// Default: MockAdapter for offline demo mode.
// Set kasumi_use_mock=false to use the api-server, and kasumi_use_baserow=true to force an external Baserow instance instead.
const _useMock = typeof localStorage !== 'undefined' ? localStorage.getItem('kasumi_use_mock') !== 'false' : true
const _useBaserow = typeof localStorage !== 'undefined' && localStorage.getItem('kasumi_use_baserow') === 'true'
const adapter = _useMock
  ? new MockAdapter()
  : _useBaserow
    ? new BaserowAdapter({
      baseUrl: (typeof localStorage !== 'undefined' ? localStorage.getItem('kasumi_baserow_url') : null) || 'http://localhost:8000',
      token: (typeof localStorage !== 'undefined' ? localStorage.getItem('kasumi_baserow_token') : null) || '',
    })
    : new NexcelApiAdapter()

const configuredDbId = typeof localStorage !== 'undefined'
  ? parseInt(localStorage.getItem('kasumi_baserow_db_id') || '1', 10)
  : 1

export const getVisibleFields = (sheet: SheetContext | null, hiddenFieldIds: number[]): FieldMeta[] => {
  if (!sheet) return []
  if (hiddenFieldIds.length === 0) return sheet.fields
  return sheet.fields.filter(field => !hiddenFieldIds.includes(field.id))
}

export const getFieldByVisibleCol = (
  sheet: SheetContext | null,
  hiddenFieldIds: number[],
  colIndex: number,
): FieldMeta | null => getVisibleFields(sheet, hiddenFieldIds)[colIndex] ?? null

export const getActualFieldIndexFromVisibleCol = (
  sheet: SheetContext | null,
  hiddenFieldIds: number[],
  colIndex: number,
): number => {
  const field = getFieldByVisibleCol(sheet, hiddenFieldIds, colIndex)
  if (!sheet || !field) return -1
  return sheet.fields.findIndex(candidate => candidate.id === field.id)
}

export const getVisibleColIndexFromFieldIndex = (
  sheet: SheetContext | null,
  hiddenFieldIds: number[],
  fieldIndex: number,
): number => {
  if (!sheet) return -1
  const field = sheet.fields[fieldIndex]
  if (!field || hiddenFieldIds.includes(field.id)) return -1
  return getVisibleFields(sheet, hiddenFieldIds).findIndex(candidate => candidate.id === field.id)
}

export const getSelectionBounds = (selection: SelectionRange | null) => {
  if (!selection) return null
  return {
    minRow: Math.min(selection.startRow, selection.endRow),
    maxRow: Math.max(selection.startRow, selection.endRow),
    minCol: Math.min(selection.startCol, selection.endCol),
    maxCol: Math.max(selection.startCol, selection.endCol),
  }
}

export const getArrowNavigationTarget = (
  from: GridCoord,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  rowCount: number,
  colCount: number,
): GridCoord => {
  switch (key) {
    case 'ArrowUp':
      return { rowIndex: Math.max(0, from.rowIndex - 1), colIndex: from.colIndex }
    case 'ArrowDown':
      return { rowIndex: Math.min(rowCount - 1, from.rowIndex + 1), colIndex: from.colIndex }
    case 'ArrowLeft':
      return { rowIndex: from.rowIndex, colIndex: Math.max(0, from.colIndex - 1) }
    case 'ArrowRight':
      return { rowIndex: from.rowIndex, colIndex: Math.min(colCount - 1, from.colIndex + 1) }
  }
}

export const getFormulaReferenceSelectionTarget = (
  activeCell: GridCoord,
  selection: SelectionRange | null,
  anchorCell: GridCoord | null,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  extendSelection: boolean,
  rowCount: number,
  colCount: number,
): { selection: SelectionRange; activeCell: GridCoord; anchorCell: GridCoord } => {
  const current = selection
    ? { rowIndex: selection.endRow, colIndex: selection.endCol }
    : activeCell
  const next = getArrowNavigationTarget(current, key, rowCount, colCount)
  const anchor = extendSelection
    ? (anchorCell ?? activeCell)
    : next

  return {
    selection: {
      startRow: anchor.rowIndex,
      startCol: anchor.colIndex,
      endRow: next.rowIndex,
      endCol: next.colIndex,
    },
    activeCell: next,
    anchorCell: anchor,
  }
}

export const getTabNavigationTarget = (
  from: GridCoord,
  backwards: boolean,
  selection: SelectionRange | null,
  rowCount: number,
  colCount: number,
): GridCoord => {
  const bounds = getSelectionBounds(selection)
  if (bounds && (bounds.minRow !== bounds.maxRow || bounds.minCol !== bounds.maxCol)) {
    if (backwards) {
      if (from.colIndex > bounds.minCol) return { rowIndex: from.rowIndex, colIndex: from.colIndex - 1 }
      if (from.rowIndex > bounds.minRow) return { rowIndex: from.rowIndex - 1, colIndex: bounds.maxCol }
      return { rowIndex: bounds.maxRow, colIndex: bounds.maxCol }
    }
    if (from.colIndex < bounds.maxCol) return { rowIndex: from.rowIndex, colIndex: from.colIndex + 1 }
    if (from.rowIndex < bounds.maxRow) return { rowIndex: from.rowIndex + 1, colIndex: bounds.minCol }
    return { rowIndex: bounds.minRow, colIndex: bounds.minCol }
  }

  if (!backwards) {
    if (from.colIndex === colCount - 1) {
      return {
        rowIndex: Math.min(Math.max(rowCount - 1, 0), from.rowIndex + 1),
        colIndex: 0,
      }
    }
    return { rowIndex: from.rowIndex, colIndex: Math.min(colCount - 1, from.colIndex + 1) }
  }

  return { rowIndex: from.rowIndex, colIndex: Math.max(0, from.colIndex - 1) }
}

export const getEnterNavigationTarget = (
  from: GridCoord,
  backwards: boolean,
  selection: SelectionRange | null,
  rowCount: number,
): GridCoord => {
  const bounds = getSelectionBounds(selection)
  if (bounds && (bounds.minRow !== bounds.maxRow || bounds.minCol !== bounds.maxCol)) {
    if (backwards) {
      if (from.rowIndex > bounds.minRow) return { rowIndex: from.rowIndex - 1, colIndex: from.colIndex }
      if (from.colIndex > bounds.minCol) return { rowIndex: bounds.maxRow, colIndex: from.colIndex - 1 }
      return { rowIndex: bounds.maxRow, colIndex: bounds.maxCol }
    }
    if (from.rowIndex < bounds.maxRow) return { rowIndex: from.rowIndex + 1, colIndex: from.colIndex }
    if (from.colIndex < bounds.maxCol) return { rowIndex: bounds.minRow, colIndex: from.colIndex + 1 }
    return { rowIndex: bounds.minRow, colIndex: bounds.minCol }
  }

  return {
    rowIndex: backwards ? Math.max(0, from.rowIndex - 1) : Math.min(Math.max(rowCount - 1, 0), from.rowIndex + 1),
    colIndex: from.colIndex,
  }
}

interface ExcelState {
  // ── Workbook context ───────────────────────────────
  tables: TableMeta[]
  activeTableId: number | null
  sheet: SheetContext | null

  // ── Selection ──────────────────────────────────────
  activeCell: GridCoord | null
  selection: SelectionRange | null
  anchorCell: GridCoord | null   // drag/shift anchor

  // ── Edit mode ─────────────────────────────────────
  isEditing: boolean
  editValue: string
  formulaSelectionStart: number
  formulaSelectionEnd: number
  formulaEditor: 'formula-bar' | 'grid' | null

  // ── Status ────────────────────────────────────────
  statusText: string

  // ── Sheet lifecycle ───────────────────────────────
  newSheet: () => Promise<void>
  addColumn: (name?: string) => Promise<void>
  deleteColumn: (fieldId: number) => Promise<void>
  renameField: (fieldId: number, name: string) => Promise<void>

  // ── Sort ──────────────────────────────────────────
  sortConfig: { fieldIndex: number; direction: 'asc' | 'desc' } | null

  // ── Undo / Redo ───────────────────────────────────
  undoStack: RowRecord[][]
  redoStack: RowRecord[][]

  // ── Actions ───────────────────────────────────────
  loadTables: () => Promise<void>
  loadSheet: (tableId: number) => Promise<void>

  setActiveCell: (rowIndex: number, colIndex: number) => void
  setSelection: (startRow: number, startCol: number, endRow: number, endCol: number) => void
  setSelectionState: (selection: SelectionRange, activeCell?: GridCoord, anchorCell?: GridCoord) => void
  setAnchor: (rowIndex: number, colIndex: number) => void

  enterEdit: (value?: string) => void
  exitEdit: (commit: boolean) => void
  setEditValue: (v: string) => void
  setFormulaSelection: (start: number, end?: number) => void
  setFormulaEditor: (editor: 'formula-bar' | 'grid' | null) => void

  commitCell: (rowIndex: number, colIndex: number, rawValue: unknown) => Promise<void>
  clearCells: (coords: GridCoord[]) => Promise<void>
  pasteGrid: (startRow: number, startCol: number, data: string[][]) => Promise<void>

  addRow: () => Promise<void>
  deleteSelectedRows: () => Promise<void>
  insertRowAt: (index: number) => Promise<void>

  // ── Search / filter ───────────────────────────────
  searchText: string
  setSearchText: (text: string) => void
  columnFilters: Record<number, FilterRule>
  setColumnFilter: (fieldId: number, rule: FilterRule | null) => void

  // ── All rows (unfiltered original) ────────────────
  allRows: RowRecord[]

  // ── Sort ──────────────────────────────────────────
  toggleSort: (fieldIndex: number) => void

  // ── Undo / Redo ───────────────────────────────────
  undo: () => void
  redo: () => void

  // ── Export / Import ───────────────────────────────
  exportToCsv: () => void
  exportToXlsx: () => void
  importFromCsv: (file: File) => Promise<void>
  importFromXlsx: (file: File) => Promise<void>

  // ── Fill handle ───────────────────────────────────
  fillRange: (
    srcStartRow: number, srcStartCol: number, srcEndRow: number, srcEndCol: number,
    dstStartRow: number, dstStartCol: number, dstEndRow: number, dstEndCol: number
  ) => Promise<void>

  // ── Zoom ──────────────────────────────────────────
  zoomLevel: number          // 0.75 | 1.0 | 1.25 | 1.5
  setZoomLevel: (z: number) => void

  // ── Freeze columns ────────────────────────────────
  frozenColCount: number
  toggleFreezeFirstCol: () => void

  // ── Freeze rows ───────────────────────────────────
  frozenRowCount: number
  toggleFreezeFirstRow: () => void

  // ── Column widths (local UI state) ────────────────
  colWidths: Record<number, number>
  setColWidth: (fieldId: number, width: number) => void

  // ── Deduplicate rows ──────────────────────────────
  deduplicateRows: () => Promise<void>

  // ── Hidden columns ────────────────────────────────
  hiddenFieldIds: number[]
  toggleHideColumn: (fieldId: number) => void
  showAllColumns: () => void

  // ── Cut/Paste ─────────────────────────────────────
  cutSelection: SelectionRange | null
  cutCells: () => void
  clearCutAfterPaste: () => void

  // ── Helpers (pure read) ───────────────────────────
  getCellDisplay: (rowIndex: number, colIndex: number) => string
  getCellRaw: (rowIndex: number, colIndex: number) => unknown
  getFieldAt: (colIndex: number) => FieldMeta | null
  getRowAt: (rowIndex: number) => RowRecord | null

  // Commit by field ID (hidden-column-safe)
  commitCellByField: (rowIndex: number, fieldId: number, rawValue: unknown) => Promise<void>
}

export const useExcelStore = create<ExcelState>((set, get) => {
  // Closure-scoped helper — not part of the public interface
  const pushUndo = () => {
    const { sheet, undoStack } = get()
    if (!sheet) return
    set({ undoStack: [...undoStack.slice(-49), [...sheet.rows]], redoStack: [] })
  }

  // Apply column filters, search text, and sort to allRows → sheet.rows
  const applyFiltersAndSort = () => {
    const { sheet, allRows, searchText, columnFilters, sortConfig } = get()
    if (!sheet) return

    NexcelLogger.filter('debug', 'applyFiltersAndSort', {
      totalRows: allRows.length,
      activeFilters: Object.keys(columnFilters).length,
      searchText,
      sortConfig,
    })

    let rows = [...allRows]

    // Apply column filters
    const activeFilters = Object.entries(columnFilters)
    if (activeFilters.length > 0) {
      rows = rows.filter(row => {
        return activeFilters.every(([fieldIdStr, rule]) => {
          const fieldId = parseInt(fieldIdStr, 10)
          const field = sheet.fields.find(f => f.id === fieldId)
          if (!field) return true
          const raw = row.fields[fieldId]
          const strVal = renderCellValue(raw, field).toLowerCase()
          const ruleVal = rule.value.toLowerCase()
          switch (rule.type) {
            case 'contains': return strVal.includes(ruleVal)
            case 'equals': return strVal === ruleVal
            case 'is_empty': return strVal === ''
            case 'not_empty': return strVal !== ''
            case 'gt': return parseFloat(strVal) > parseFloat(ruleVal)
            case 'lt': return parseFloat(strVal) < parseFloat(ruleVal)
            default: return true
          }
        })
      })
    }

    // Apply search text
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      rows = rows.filter(row =>
        sheet.fields.some(field => {
          const val = renderCellValue(row.fields[field.id] ?? '', field)
          return val.toLowerCase().includes(q)
        })
      )
    }

    // Apply sort
    if (sortConfig !== null) {
      const field = sheet.fields[sortConfig.fieldIndex]
      if (field) {
        rows = rows.sort((a, b) => {
          const valA = a.fields[field.id]
          const valB = b.fields[field.id]
          let cmp = 0
          if (field.type === 'number' || field.type === 'rating' || field.type === 'autonumber') {
            cmp = (parseFloat(String(valA ?? 0)) || 0) - (parseFloat(String(valB ?? 0)) || 0)
          } else if (field.type === 'date' || field.type === 'created_on' || field.type === 'last_modified') {
            cmp = Date.parse(String(valA ?? '')) - Date.parse(String(valB ?? ''))
          } else if (field.type === 'boolean') {
            cmp = (valA ? 1 : 0) - (valB ? 1 : 0)
          } else {
            const sa = renderCellValue(valA, field)
            const sb = renderCellValue(valB, field)
            cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' })
          }
          return sortConfig.direction === 'asc' ? cmp : -cmp
        })
      }
    }

    NexcelLogger.filter('info', 'filtered', { resultRows: rows.length })
    set({ sheet: { ...sheet, rows } })
  }

  const getFieldForCol = (rowIndex: number, colIndex: number) => {
    const { sheet, hiddenFieldIds } = get()
    if (!sheet) return { field: null, row: null as RowRecord | null }
    const field = getFieldByVisibleCol(sheet, hiddenFieldIds, colIndex)
    const row = sheet.rows[rowIndex] ?? null
    return { field, row }
  }

  return {
    tables: [],
    activeTableId: null,
    sheet: null,
    activeCell: { rowIndex: 0, colIndex: 0 },
    selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
    isEditing: false,
    editValue: '',
    formulaSelectionStart: 0,
    formulaSelectionEnd: 0,
    formulaEditor: null,
    statusText: 'Ready',
    searchText: '',
    sortConfig: null,
    columnFilters: {},
    allRows: [],
    undoStack: [],
    redoStack: [],
    zoomLevel: 1.0,
    frozenColCount: 0,
    frozenRowCount: 0,
    colWidths: {},
    hiddenFieldIds: [],
    cutSelection: null,

    // ── Data loading ──────────────────────────────────

    loadTables: async () => {
      const tables = await adapter.getTables(configuredDbId)
      set({ tables })
      // Register every table in the platform object registry so WORDO can reference them
      tables.forEach(t => objectRegistry.register({
        id: makeObjectId('nexcel', t.id),
        shell: 'nexcel',
        label: t.name,
      }))
      if (tables.length > 0 && !get().activeTableId) {
        await get().loadSheet(tables[0].id)
      }
    },

    loadSheet: async (tableId: number) => {
      set(s => ({ sheet: s.sheet ? { ...s.sheet, isLoading: true, error: null } : {
        tableId, tableName: '', viewId: null, fields: [], rows: [], totalCount: 0, isLoading: true, error: null
      }, activeTableId: tableId }))

      try {
        const [fields, views, rowsResult] = await Promise.all([
          adapter.getFields(tableId),
          adapter.getViews(tableId),
          adapter.getRows(tableId, null, 1, 200),
        ])
        const tableName = get().tables.find(t => t.id === tableId)?.name ?? `Table ${tableId}`
        NexcelLogger.store('info', 'loadSheet', { tableId, rows: rowsResult.total })
        set({
          sheet: {
            tableId,
            tableName,
            viewId: views[0]?.id ?? null,
            fields,
            rows: rowsResult.rows,
            totalCount: rowsResult.total,
            isLoading: false,
            error: null,
          },
          allRows: rowsResult.rows,
          columnFilters: {},
          statusText: `${rowsResult.total} rows`,
          undoStack: [],
          redoStack: [],
        })
      } catch (err) {
        set(s => ({ sheet: s.sheet ? { ...s.sheet, isLoading: false, error: String(err) } : null }))
      }
    },

    // ── Selection ─────────────────────────────────────

    setActiveCell: (rowIndex, colIndex) => set({
      activeCell: { rowIndex, colIndex },
      anchorCell: { rowIndex, colIndex },
      selection: { startRow: rowIndex, startCol: colIndex, endRow: rowIndex, endCol: colIndex },
      isEditing: false,
      formulaEditor: null,
    }),

    setSelection: (startRow, startCol, endRow, endCol) => set({
      selection: { startRow, startCol, endRow, endCol },
      activeCell: { rowIndex: endRow, colIndex: endCol },
    }),

    setSelectionState: (selection, activeCell, anchorCell) => set({
      selection,
      ...(activeCell ? { activeCell } : {}),
      ...(anchorCell ? { anchorCell } : {}),
    }),

    setAnchor: (rowIndex, colIndex) => set({ anchorCell: { rowIndex, colIndex } }),

    // ── Edit mode ─────────────────────────────────────

    enterEdit: (value) => {
      const { activeCell, getCellDisplay } = get()
      if (!activeCell) return
      const current = value !== undefined ? value : getCellDisplay(activeCell.rowIndex, activeCell.colIndex)
      set({
        isEditing: true,
        editValue: current,
        formulaSelectionStart: current.length,
        formulaSelectionEnd: current.length,
        formulaEditor: null,
      })
    },

    exitEdit: (commit) => {
      const { activeCell, editValue } = get()
      set({
        isEditing: false,
        formulaSelectionStart: 0,
        formulaSelectionEnd: 0,
        formulaEditor: null,
      })
      if (commit && activeCell) {
        get().commitCell(activeCell.rowIndex, activeCell.colIndex, editValue)
      }
    },

    setEditValue: (v) => set({ editValue: v }),
    setFormulaSelection: (start, end = start) => set({ formulaSelectionStart: start, formulaSelectionEnd: end }),
    setFormulaEditor: (editor) => set({ formulaEditor: editor }),

    // ── Data mutations ────────────────────────────────

    commitCell: async (rowIndex: number, colIndex: number, rawValue: unknown) => {
      const { sheet, allRows } = get()
      if (!sheet) return
      const { field, row } = getFieldForCol(rowIndex, colIndex)
      if (!field || !row) return

      const oldValue = row.fields[field.id]
      useCellChangeStore.getState().recordChange({
        cellRef: `${row.id}:${field.id}`,
        fieldId: field.id,
        rowId: row.id,
        oldValue,
        newValue: rawValue,
        source: 'user_edit',
      })

      pushUndo()

      // Optimistic update in sheet.rows
      const newRows = [...sheet.rows]
      newRows[rowIndex] = { ...row, fields: { ...row.fields, [field.id]: rawValue } }
      // Sync to allRows
      const newAllRows = allRows.map(r => r.id === row.id ? { ...r, fields: { ...r.fields, [field.id]: rawValue } } : r)
      set({ sheet: { ...sheet, rows: newRows }, allRows: newAllRows })

      try {
        await adapter.updateCell(sheet.tableId, row.id, field.id, rawValue)
      } catch (err) {
        // Rollback on error
        set({ sheet: { ...sheet, rows: [...sheet.rows] }, statusText: `Error: ${String(err)}` })
      }
    },

    clearCells: async (coords) => {
      const { sheet, allRows, hiddenFieldIds } = get()
      if (!sheet) return

      pushUndo()

      const updates: Array<{ rowId: number; fieldId: number; value: unknown }> = []
      const newRows = [...sheet.rows]
      let newAllRows = [...allRows]

      for (const { rowIndex, colIndex } of coords) {
        const field = getFieldByVisibleCol(sheet, hiddenFieldIds, colIndex)
        const row = newRows[rowIndex]
        if (!field || !row || field.readOnly) continue
        newRows[rowIndex] = { ...row, fields: { ...row.fields, [field.id]: '' } }
        // Sync to allRows so applyFiltersAndSort() doesn't revert the clear
        const allIdx = newAllRows.findIndex(r => r.id === row.id)
        if (allIdx >= 0) {
          newAllRows[allIdx] = { ...newAllRows[allIdx], fields: { ...newAllRows[allIdx].fields, [field.id]: '' } }
        }
        updates.push({ rowId: row.id, fieldId: field.id, value: '' })
      }

      set({ sheet: { ...sheet, rows: newRows }, allRows: newAllRows })
      if (updates.length > 0) {
        await adapter.batchUpdate(sheet.tableId, updates)
      }
    },

    pasteGrid: async (startRow, startCol, data) => {
      const { sheet, hiddenFieldIds, allRows } = get()
      if (!sheet) return

      pushUndo()

      const updates: Array<{ rowId: number; fieldId: number; value: unknown }> = []
      const newRows = [...sheet.rows]
      let newAllRows = [...allRows]

      for (let rOff = 0; rOff < data.length; rOff++) {
        for (let cOff = 0; cOff < data[rOff].length; cOff++) {
          const rIdx = startRow + rOff
          const cIdx = startCol + cOff
          const field = getFieldByVisibleCol(sheet, hiddenFieldIds, cIdx)
          const row = newRows[rIdx]
          if (!field || !row || field.readOnly) continue
          const val = data[rOff][cOff].trim()
          const oldValue = row.fields[field.id]
          useCellChangeStore.getState().recordChange({
            cellRef: `${row.id}:${field.id}`,
            fieldId: field.id,
            rowId: row.id,
            oldValue,
            newValue: val,
            source: 'paste',
          })
          newRows[rIdx] = { ...row, fields: { ...row.fields, [field.id]: val } }
          const allIdx = newAllRows.findIndex(candidate => candidate.id === row.id)
          if (allIdx >= 0) {
            newAllRows[allIdx] = { ...newAllRows[allIdx], fields: { ...newAllRows[allIdx].fields, [field.id]: val } }
          }
          updates.push({ rowId: row.id, fieldId: field.id, value: val })
        }
      }

      const pastedRowCount = Math.max(1, data.length)
      const pastedColCount = Math.max(1, ...data.map(row => row.length))
      const endRow = Math.min(sheet.rows.length - 1, startRow + pastedRowCount - 1)
      const endCol = Math.min(getVisibleFields(sheet, hiddenFieldIds).length - 1, startCol + pastedColCount - 1)

      set({
        sheet: { ...sheet, rows: newRows },
        allRows: newAllRows,
        activeCell: { rowIndex: startRow, colIndex: startCol },
        anchorCell: { rowIndex: startRow, colIndex: startCol },
        selection: { startRow, startCol, endRow, endCol },
      })
      if (updates.length > 0) {
        await adapter.batchUpdate(sheet.tableId, updates)
      }
    },

    // ── Row mutations ─────────────────────────────────

    addRow: async () => {
      const { sheet, allRows } = get()
      if (!sheet) return

      pushUndo()

      const newId = Math.max(...allRows.map(r => r.id), 0) + 1
      const newRow: RowRecord = {
        id: newId,
        order: `${allRows.length + 1}.00000000000000000000`,
        fields: {},
      }
      const newAllRows = [...allRows, newRow]
      NexcelLogger.store('info', 'addRow', { newId })
      set({ allRows: newAllRows })
      applyFiltersAndSort()
      set(s => ({ sheet: s.sheet ? { ...s.sheet, totalCount: s.sheet.totalCount + 1 } : null }))
    },

    deleteSelectedRows: async () => {
      const { sheet, allRows, selection } = get()
      if (!sheet || !selection) return

      pushUndo()

      const minRow = Math.min(selection.startRow, selection.endRow)
      const maxRow = Math.max(selection.startRow, selection.endRow)
      // Get IDs of rows to delete from the current filtered view
      const idsToDelete = new Set(
        sheet.rows.slice(minRow, maxRow + 1).map(r => r.id)
      )
      const newAllRows = allRows.filter(r => !idsToDelete.has(r.id))
      const deletedCount = idsToDelete.size
      NexcelLogger.store('info', 'deleteSelectedRows', { deletedCount })
      set({ allRows: newAllRows })
      applyFiltersAndSort()
      set(s => ({
        sheet: s.sheet ? { ...s.sheet, totalCount: s.sheet.totalCount - deletedCount } : null,
        activeCell: { rowIndex: Math.min(minRow, Math.max(0, newAllRows.length - 1)), colIndex: selection.startCol },
        selection: null,
      }))
    },

    insertRowAt: async (index: number) => {
      const { sheet, allRows } = get()
      if (!sheet) return

      pushUndo()

      const newId = Math.max(...allRows.map(r => r.id), 0) + 1
      const newRow: RowRecord = { id: newId, order: `${newId}.00`, fields: {} }
      // Insert into allRows at the corresponding position in the filtered view
      const refRow = sheet.rows[index]
      const allRowsIndex = refRow ? allRows.findIndex(r => r.id === refRow.id) : allRows.length
      const newAllRows = [...allRows]
      newAllRows.splice(allRowsIndex, 0, newRow)
      NexcelLogger.store('info', 'insertRowAt', { index, newId })
      set({ allRows: newAllRows })
      applyFiltersAndSort()
      set(s => ({ sheet: s.sheet ? { ...s.sheet, totalCount: s.sheet.totalCount + 1 } : null }))
    },

    // ── Search / filter ───────────────────────────────

    setSearchText: (text) => {
      NexcelLogger.filter('debug', 'setSearchText', { text })
      set({ searchText: text })
      applyFiltersAndSort()
    },

    setColumnFilter: (fieldId, rule) => {
      const { columnFilters } = get()
      if (rule === null) {
        const updated = { ...columnFilters }
        delete updated[fieldId]
        NexcelLogger.filter('info', 'clearColumnFilter', { fieldId })
        set({ columnFilters: updated })
      } else {
        NexcelLogger.filter('info', 'setColumnFilter', { fieldId, rule })
        set({ columnFilters: { ...columnFilters, [fieldId]: rule } })
      }
      applyFiltersAndSort()
    },

    // ── Sort ──────────────────────────────────────────

    toggleSort: (fieldIndex) => {
      const { sheet, hiddenFieldIds, sortConfig } = get()
      const actualFieldIndex = getActualFieldIndexFromVisibleCol(sheet, hiddenFieldIds, fieldIndex)
      if (actualFieldIndex < 0) return
      let newSortConfig: typeof sortConfig
      if (sortConfig?.fieldIndex === actualFieldIndex) {
        if (sortConfig.direction === 'asc') {
          newSortConfig = { fieldIndex: actualFieldIndex, direction: 'desc' }
        } else {
          newSortConfig = null
        }
      } else {
        newSortConfig = { fieldIndex: actualFieldIndex, direction: 'asc' }
      }
      NexcelLogger.filter('debug', 'toggleSort', { fieldIndex: actualFieldIndex, newSortConfig })
      set({ sortConfig: newSortConfig })
      applyFiltersAndSort()
    },

    // ── Undo / Redo ───────────────────────────────────

    undo: () => {
      const { undoStack, redoStack, sheet } = get()
      if (!sheet || undoStack.length === 0) return
      const prev = undoStack[undoStack.length - 1]
      const newUndoStack = undoStack.slice(0, -1)
      const newRedoStack = [...redoStack, [...sheet.rows]]
      set({
        sheet: { ...sheet, rows: prev },
        undoStack: newUndoStack,
        redoStack: newRedoStack,
      })
    },

    redo: () => {
      const { undoStack, redoStack, sheet } = get()
      if (!sheet || redoStack.length === 0) return
      const next = redoStack[redoStack.length - 1]
      const newRedoStack = redoStack.slice(0, -1)
      const newUndoStack = [...undoStack, [...sheet.rows]]
      set({
        sheet: { ...sheet, rows: next },
        undoStack: newUndoStack,
        redoStack: newRedoStack,
      })
    },

    // ── Sheet lifecycle ───────────────────────────────

    newSheet: async () => {
      const { sheet } = get()
      if (!sheet) return
      NexcelLogger.store('info', 'newSheet', {})

      // Reset server state first so api-server stays in sync
      try {
        const res = await fetch('/api/nexcel/reset-blank', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          const serverFields: FieldMeta[] = data.data?.fields ?? []
          const rowCount: number = data.data?.rowCount ?? 100
          const blankRows: RowRecord[] = Array.from({ length: rowCount }, (_, i) => ({
            id: i + 1,
            order: `${(i + 1).toFixed(5)}`,
            fields: {} as Record<number, unknown>,
          }))
          set({
            allRows: blankRows,
            sheet: { ...sheet, fields: serverFields, rows: blankRows, totalCount: rowCount },
            undoStack: [],
            redoStack: [],
            sortConfig: null,
            columnFilters: {},
            searchText: '',
            selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
            activeCell: { rowIndex: 0, colIndex: 0 },
            frozenRowCount: 0,
            frozenColCount: 0,
            colWidths: {},
            zoomLevel: 1.0,
          })
          return
        }
      } catch {
        // fall through to local-only reset if server unreachable
      }

      // Fallback: local-only reset (server unreachable)
      const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const blankFields: FieldMeta[] = LETTERS.split('').map((_, i) => ({
        id: i + 1,
        name: '',
        type: 'text' as const,
        order: i + 1,
        primary: i === 0,
        readOnly: false,
      }))
      const blankRows: RowRecord[] = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        order: `${(i + 1).toFixed(5)}`,
        fields: {} as Record<number, unknown>,
      }))

      set({
        allRows: blankRows,
        sheet: { ...sheet, fields: blankFields, rows: blankRows, totalCount: 100 },
        undoStack: [],
        redoStack: [],
        sortConfig: null,
        columnFilters: {},
        searchText: '',
        selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
        activeCell: { rowIndex: 0, colIndex: 0 },
        frozenRowCount: 0,
        frozenColCount: 0,
        colWidths: {},
        zoomLevel: 1.0,
      })
    },

    addColumn: async (name?: string) => {
      const { sheet } = get()
      if (!sheet) return
      const colName = name ?? `Column ${sheet.fields.length + 1}`
      NexcelLogger.store('info', 'addColumn', { name: colName })
      const res = await fetch('/api/nexcel/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: colName, type: 'text' }),
      }).catch(() => null)
      if (!res?.ok) return
      const data = await res.json()
      const newField: FieldMeta = data.data
      set(s => ({
        sheet: s.sheet ? { ...s.sheet, fields: [...s.sheet.fields, newField] } : s.sheet,
      }))
    },

    deleteColumn: async (fieldId: number) => {
      const { sheet } = get()
      if (!sheet) return
      NexcelLogger.store('info', 'deleteColumn', { fieldId })
      const res = await fetch(`/api/nexcel/columns/${fieldId}`, { method: 'DELETE' }).catch(() => null)
      if (!res?.ok) return
      set(s => {
        if (!s.sheet) return s
        const newAllRows = s.allRows.map(r => {
          const f = { ...r.fields }
          delete f[fieldId]
          return { ...r, fields: f }
        })
        return {
          allRows: newAllRows,
          sheet: {
            ...s.sheet,
            fields: s.sheet.fields.filter(f => f.id !== fieldId),
            rows: s.sheet.rows.map(r => {
              const f = { ...r.fields }
              delete f[fieldId]
              return { ...r, fields: f }
            }),
          },
        }
      })
    },

    renameField: async (fieldId: number, name: string) => {
      const res = await fetch(`/api/nexcel/columns/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).catch(() => null)
      if (!res?.ok) return
      set(s => ({
        sheet: s.sheet
          ? { ...s.sheet, fields: s.sheet.fields.map(f => f.id === fieldId ? { ...f, name } : f) }
          : s.sheet,
      }))
    },

    // ── Export ────────────────────────────────────────

    exportToCsv: () => {
      const { sheet } = get()
      if (!sheet) return

      // Build header row
      const headers = sheet.fields.map(f => `"${f.name.replace(/"/g, '""')}"`)

      // Build data rows
      const rows = sheet.rows.map(row =>
        sheet.fields.map(field => {
          const val = renderCellValue(row.fields[field.id], field)
          // Escape for CSV
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`
          }
          return val
        }).join(',')
      )

      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      import('../../../platform/native/useNativeBridge').then(({ saveFile }) => {
        saveFile({ defaultName: `${sheet.tableName}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }], data: blob })
      })
    },

    importFromCsv: async (file: File) => {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length === 0) return

      // Parse CSV (handles quoted fields with commas)
      const parse = (line: string) => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"' && !inQuotes) { inQuotes = true }
          else if (ch === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++ }
          else if (ch === '"' && inQuotes) { inQuotes = false }
          else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
          else { current += ch }
        }
        result.push(current)
        return result
      }

      const headers = parse(lines[0])
      const { sheet } = get()
      if (!sheet) return

      // Map CSV columns to fields by name (case-insensitive)
      const fieldMap: Record<number, number> = {} // csvColIndex -> fieldIndex
      headers.forEach((h, i) => {
        const fi = sheet.fields.findIndex(f => f.name.toLowerCase() === h.toLowerCase())
        if (fi >= 0) fieldMap[i] = fi
      })

      // Build new rows (appended to existing)
      const newRows: RowRecord[] = []
      const maxId = Math.max(...sheet.rows.map(r => r.id), 0)

      lines.slice(1).forEach((line, li) => {
        if (!line.trim()) return
        const cols = parse(line)
        const fields: Record<number, unknown> = {}
        cols.forEach((val, ci) => {
          const fi = fieldMap[ci]
          if (fi !== undefined) {
            const field = sheet.fields[fi]
            fields[field.id] = val
          }
        })
        newRows.push({
          id: maxId + li + 1,
          order: `${maxId + li + 1}.00`,
          fields,
        })
      })

      const allRows = [...sheet.rows, ...newRows]
      set({
        sheet: { ...sheet, rows: allRows, totalCount: sheet.totalCount + newRows.length },
        statusText: `Imported ${newRows.length} rows`,
      })
    },

    exportToXlsx: () => {
      const { sheet } = get()
      if (!sheet || typeof window === 'undefined') return

      // Dynamically import xlsx to avoid bundle issues
      import('xlsx').then(XLSX => {
        // Build worksheet data
        const headers = sheet.fields.map(f => f.name)
        const rows = sheet.rows.map(row =>
          sheet.fields.map(field => renderCellValue(row.fields[field.id] ?? '', field))
        )

        const wsData = [headers, ...rows]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, sheet.tableName.slice(0, 31)) // Excel sheet name limit
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
        import('../../../platform/native/useNativeBridge').then(({ saveFile }) => {
          saveFile({ defaultName: `${sheet.tableName}.xlsx`, filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }], data: buf })
        })
      })
    },

    importFromXlsx: async (file: File) => {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      const { sheet } = get()
      if (!sheet) return

      // Use first sheet
      const wsName = wb.SheetNames[0]
      if (!wsName) return
      const ws = wb.Sheets[wsName]

      // Parse to array of arrays
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      if (data.length === 0) return

      const headers = data[0].map(h => String(h ?? ''))

      // Map headers to fields by name (case-insensitive)
      const fieldMap: Record<number, number> = {}
      headers.forEach((h, i) => {
        const fi = sheet.fields.findIndex(f => f.name.toLowerCase() === h.toLowerCase())
        if (fi >= 0) fieldMap[i] = fi
      })

      // Build new rows
      const newRows: RowRecord[] = []
      const maxId = Math.max(...sheet.rows.map(r => r.id), 0)

      data.slice(1).forEach((rowData, li) => {
        if (!rowData.some(v => v !== '')) return  // skip empty rows
        const fields: Record<number, unknown> = {}
        rowData.forEach((val, ci) => {
          const fi = fieldMap[ci]
          if (fi !== undefined) {
            const field = sheet.fields[fi]
            fields[field.id] = String(val)
          }
        })
        newRows.push({ id: maxId + li + 1, order: `${maxId + li + 1}.00`, fields })
      })

      const allRows = [...sheet.rows, ...newRows]
      set({
        sheet: { ...sheet, rows: allRows, totalCount: sheet.totalCount + newRows.length },
        statusText: `Imported ${newRows.length} rows from ${wsName}`,
      })
    },

    // ── Fill handle ───────────────────────────────────

    fillRange: async (srcStartRow, srcStartCol, srcEndRow, srcEndCol, dstStartRow, dstStartCol, dstEndRow, dstEndCol) => {
      const { sheet, hiddenFieldIds, allRows } = get()
      if (!sheet) return
      pushUndo()

      const updates: Array<{ rowId: number; fieldId: number; value: unknown }> = []
      const newRows = [...sheet.rows]
      let newAllRows = [...allRows]

      const srcHeight = srcEndRow - srcStartRow + 1
      const srcWidth = srcEndCol - srcStartCol + 1

      const fillingDown = dstEndRow > srcEndRow
      const fillingRight = dstEndCol > srcEndCol

      if (fillingDown) {
        for (let c = dstStartCol; c <= dstEndCol; c++) {
          const srcCol = Math.min(c, srcEndCol)
          const field = getFieldByVisibleCol(sheet, hiddenFieldIds, srcCol)
          if (!field || field.readOnly) continue

          const srcVals = Array.from({ length: srcHeight }, (_, i) => {
            const row = sheet.rows[srcStartRow + i]
            return row?.fields[field.id]
          })

          const nums = srcVals.map(v => parseFloat(String(v)))
          const isNumericSeries = nums.every(n => !isNaN(n)) && srcHeight >= 2
          const increment = isNumericSeries ? (nums[nums.length - 1] - nums[0]) / (srcHeight - 1) : 0

          for (let r = srcEndRow + 1; r <= dstEndRow; r++) {
            const row = sheet.rows[r]
            if (!row) continue
            const offset = r - srcEndRow - 1
            let fillVal: unknown
            if (isNumericSeries && srcHeight >= 2) {
              fillVal = String(nums[nums.length - 1] + increment * (offset + 1))
            } else {
              fillVal = srcVals[offset % srcHeight]
            }
            const oldVal = row.fields[field.id]
            useCellChangeStore.getState().recordChange({
              cellRef: `${row.id}:${field.id}`,
              fieldId: field.id,
              rowId: row.id,
              oldValue: oldVal,
              newValue: fillVal,
              source: 'fill',
            })
            newRows[r] = { ...row, fields: { ...row.fields, [field.id]: fillVal } }
            const allIdx = newAllRows.findIndex(candidate => candidate.id === row.id)
            if (allIdx >= 0) {
              newAllRows[allIdx] = { ...newAllRows[allIdx], fields: { ...newAllRows[allIdx].fields, [field.id]: fillVal } }
            }
            updates.push({ rowId: row.id, fieldId: field.id, value: fillVal })
          }
        }
      } else if (fillingRight) {
        for (let r = dstStartRow; r <= dstEndRow; r++) {
          const srcRow = sheet.rows[r]
          if (!srcRow) continue

          const srcVals = Array.from({ length: srcWidth }, (_, i) => {
            const field = getFieldByVisibleCol(sheet, hiddenFieldIds, srcStartCol + i)
            return field ? srcRow.fields[field.id] : undefined
          })

          for (let c = srcEndCol + 1; c <= dstEndCol; c++) {
            const field = getFieldByVisibleCol(sheet, hiddenFieldIds, c)
            if (!field || field.readOnly) continue
            const offset = c - srcEndCol - 1
            const fillVal = srcVals[offset % srcWidth]
            const oldVal = newRows[r].fields[field.id]
            useCellChangeStore.getState().recordChange({
              cellRef: `${srcRow.id}:${field.id}`,
              fieldId: field.id,
              rowId: srcRow.id,
              oldValue: oldVal,
              newValue: fillVal,
              source: 'fill',
            })
            newRows[r] = { ...newRows[r], fields: { ...newRows[r].fields, [field.id]: fillVal } }
            const allIdx = newAllRows.findIndex(candidate => candidate.id === srcRow.id)
            if (allIdx >= 0) {
              newAllRows[allIdx] = { ...newAllRows[allIdx], fields: { ...newAllRows[allIdx].fields, [field.id]: fillVal } }
            }
            updates.push({ rowId: srcRow.id, fieldId: field.id, value: fillVal })
          }
        }
      }

      set({ sheet: { ...sheet, rows: newRows }, allRows: newAllRows })
      if (updates.length > 0) {
        await adapter.batchUpdate(sheet.tableId, updates)
      }
    },

    // ── Freeze columns ────────────────────────────────

    setZoomLevel: (z: number) => {
      const clamped = Math.min(2.0, Math.max(0.5, z))
      NexcelLogger.store('info', 'setZoomLevel', { zoom: clamped })
      set({ zoomLevel: clamped })
    },

    toggleFreezeFirstCol: () => {
      const { frozenColCount } = get()
      set({ frozenColCount: frozenColCount > 0 ? 0 : 1 })
    },

    // ── Freeze rows ───────────────────────────────────

    toggleFreezeFirstRow: () => {
      const { frozenRowCount } = get()
      set({ frozenRowCount: frozenRowCount > 0 ? 0 : 1 })
    },

    // ── Column widths ─────────────────────────────────

    setColWidth: (fieldId: number, width: number) => {
      set(s => ({ colWidths: { ...s.colWidths, [fieldId]: width } }))
    },

    // ── Deduplicate rows ──────────────────────────────

    deduplicateRows: async () => {
      const res = await fetch('/api/nexcel/rows/deduplicate', { method: 'POST' }).catch(() => null)
      if (!res?.ok) return
      const { allRows, sheet } = get()
      if (!sheet) return
      // Deduplicate allRows locally matching the server logic
      const seen = new Set<string>()
      const newAllRows = allRows.filter(row => {
        const key = JSON.stringify(row.fields)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      set({ allRows: newAllRows })
      applyFiltersAndSort()
    },

    // ── Hidden columns ────────────────────────────────

    toggleHideColumn: (fieldId: number) => {
      const { hiddenFieldIds } = get()
      if (hiddenFieldIds.includes(fieldId)) {
        set({ hiddenFieldIds: hiddenFieldIds.filter(id => id !== fieldId) })
      } else {
        set({ hiddenFieldIds: [...hiddenFieldIds, fieldId] })
      }
    },

    showAllColumns: () => set({ hiddenFieldIds: [] }),

    // ── Cut/Paste ─────────────────────────────────────

    cutCells: () => {
      const { selection, getCellDisplay, sheet } = get()
      if (!selection || !sheet) return

      const minRow = Math.min(selection.startRow, selection.endRow)
      const maxRow = Math.max(selection.startRow, selection.endRow)
      const minCol = Math.min(selection.startCol, selection.endCol)
      const maxCol = Math.max(selection.startCol, selection.endCol)
      const lines: string[] = []
      for (let r = minRow; r <= maxRow; r++) {
        const cells: string[] = []
        for (let c = minCol; c <= maxCol; c++) cells.push(getCellDisplay(r, c))
        lines.push(cells.join('\t'))
      }
      navigator.clipboard.writeText(lines.join('\n'))
      NexcelLogger.store('info', 'cutCells', { minRow, maxRow, minCol, maxCol })
      set({ cutSelection: { ...selection } })
    },

    clearCutAfterPaste: async () => {
      const { cutSelection, sheet } = get()
      if (!cutSelection || !sheet) return

      const minRow = Math.min(cutSelection.startRow, cutSelection.endRow)
      const maxRow = Math.max(cutSelection.startRow, cutSelection.endRow)
      const minCol = Math.min(cutSelection.startCol, cutSelection.endCol)
      const maxCol = Math.max(cutSelection.startCol, cutSelection.endCol)

      const coords: GridCoord[] = []
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          coords.push({ rowIndex: r, colIndex: c })
        }
      }
      NexcelLogger.store('info', 'clearCutAfterPaste', { coords: coords.length })
      set({ cutSelection: null })
      await get().clearCells(coords)
    },

    // ── Pure helpers ──────────────────────────────────

    getCellDisplay: (rowIndex, colIndex) => {
      const { sheet, hiddenFieldIds } = get()
      if (!sheet) return ''
      const field = getFieldByVisibleCol(sheet, hiddenFieldIds, colIndex)
      const row = sheet.rows[rowIndex]
      if (!field || !row) return ''
      const val = row.fields[field.id]
      return renderCellValue(val, field)
    },

    getCellRaw: (rowIndex, colIndex) => {
      const { sheet, hiddenFieldIds } = get()
      if (!sheet) return undefined
      const field = getFieldByVisibleCol(sheet, hiddenFieldIds, colIndex)
      const row = sheet.rows[rowIndex]
      if (!field || !row) return undefined
      return row.fields[field.id]
    },

    getFieldAt: (colIndex) => {
      const { sheet, hiddenFieldIds } = get()
      return getFieldByVisibleCol(sheet, hiddenFieldIds, colIndex)
    },
    getRowAt: (rowIndex) => get().sheet?.rows[rowIndex] ?? null,

    commitCellByField: async (rowIndex: number, fieldId: number, rawValue: unknown) => {
      const { sheet, allRows } = get()
      if (!sheet) return
      const field = sheet.fields.find(f => f.id === fieldId)
      const row = sheet.rows[rowIndex]
      if (!field || !row || field.readOnly) return

      const oldValue = row.fields[field.id]
      useCellChangeStore.getState().recordChange({
        cellRef: `${row.id}:${field.id}`,
        fieldId: field.id,
        rowId: row.id,
        oldValue,
        newValue: rawValue,
        source: 'user_edit',
      })

      pushUndo()

      const newRows = [...sheet.rows]
      newRows[rowIndex] = { ...row, fields: { ...row.fields, [field.id]: rawValue } }
      const newAllRows = allRows.map(r => r.id === row.id ? { ...r, fields: { ...r.fields, [field.id]: rawValue } } : r)
      set({ sheet: { ...sheet, rows: newRows }, allRows: newAllRows })

      try {
        await adapter.updateCell(sheet.tableId, row.id, field.id, rawValue)
      } catch (err) {
        set({ sheet: { ...sheet, rows: [...sheet.rows] }, statusText: `Error: ${String(err)}` })
      }
    },
  }
})
