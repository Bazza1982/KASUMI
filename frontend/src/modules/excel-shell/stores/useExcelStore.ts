import { create } from 'zustand'
import type { GridCoord, SelectionRange, SheetContext, FieldMeta, RowRecord, TableMeta, FilterRule } from '../types'
import { MockAdapter } from '../adapters/baserow/MockAdapter'
import { BaserowAdapter } from '../adapters/baserow/BaserowAdapter'
import { renderCellValue } from '../grid/renderers'
import { objectRegistry, makeObjectId } from '../../../platform/object-registry'
import { NexcelLogger } from '../services/logger'
import { useCellChangeStore } from './useCellChangeStore'

// Adapter selection — reads from localStorage so ConnectionPanel can switch at runtime
const _useMock = typeof localStorage !== 'undefined' ? localStorage.getItem('kasumi_use_mock') !== 'false' : true
const adapter = _useMock
  ? new MockAdapter()
  : new BaserowAdapter({
      baseUrl: (typeof localStorage !== 'undefined' ? localStorage.getItem('kasumi_baserow_url') : null) || 'http://localhost:8000',
      token: (typeof localStorage !== 'undefined' ? localStorage.getItem('kasumi_baserow_token') : null) || '',
    })

const configuredDbId = typeof localStorage !== 'undefined'
  ? parseInt(localStorage.getItem('kasumi_baserow_db_id') || '1', 10)
  : 1

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

  // ── Status ────────────────────────────────────────
  statusText: string

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
  setAnchor: (rowIndex: number, colIndex: number) => void

  enterEdit: (value?: string) => void
  exitEdit: (commit: boolean) => void
  setEditValue: (v: string) => void

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

  // ── Freeze columns ────────────────────────────────
  frozenColCount: number
  toggleFreezeFirstCol: () => void

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

  return {
    tables: [],
    activeTableId: null,
    sheet: null,
    activeCell: { rowIndex: 0, colIndex: 0 },
    selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
    isEditing: false,
    editValue: '',
    statusText: 'Ready',
    searchText: '',
    sortConfig: null,
    columnFilters: {},
    allRows: [],
    undoStack: [],
    redoStack: [],
    frozenColCount: 0,
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
    }),

    setSelection: (startRow, startCol, endRow, endCol) => set({
      selection: { startRow, startCol, endRow, endCol },
      activeCell: { rowIndex: endRow, colIndex: endCol },
    }),

    setAnchor: (rowIndex, colIndex) => set({ anchorCell: { rowIndex, colIndex } }),

    // ── Edit mode ─────────────────────────────────────

    enterEdit: (value) => {
      const { activeCell, getCellDisplay } = get()
      if (!activeCell) return
      const current = value !== undefined ? value : getCellDisplay(activeCell.rowIndex, activeCell.colIndex)
      set({ isEditing: true, editValue: current })
    },

    exitEdit: (commit) => {
      const { activeCell, editValue } = get()
      set({ isEditing: false })
      if (commit && activeCell) {
        get().commitCell(activeCell.rowIndex, activeCell.colIndex, editValue)
      }
    },

    setEditValue: (v) => set({ editValue: v }),

    // ── Data mutations ────────────────────────────────

    commitCell: async (rowIndex: number, colIndex: number, rawValue: unknown) => {
      const { sheet, allRows } = get()
      if (!sheet) return
      const field = sheet.fields[colIndex]
      const row = sheet.rows[rowIndex]
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
      const { sheet } = get()
      if (!sheet) return

      pushUndo()

      const updates: Array<{ rowId: number; fieldId: number; value: unknown }> = []
      const newRows = [...sheet.rows]

      for (const { rowIndex, colIndex } of coords) {
        const field = sheet.fields[colIndex]
        const row = sheet.rows[rowIndex]
        if (!field || !row || field.readOnly) continue
        newRows[rowIndex] = { ...row, fields: { ...row.fields, [field.id]: '' } }
        updates.push({ rowId: row.id, fieldId: field.id, value: '' })
      }

      set({ sheet: { ...sheet, rows: newRows } })
      if (updates.length > 0) {
        await adapter.batchUpdate(sheet.tableId, updates)
      }
    },

    pasteGrid: async (startRow, startCol, data) => {
      const { sheet } = get()
      if (!sheet) return

      pushUndo()

      const updates: Array<{ rowId: number; fieldId: number; value: unknown }> = []
      const newRows = [...sheet.rows]

      for (let rOff = 0; rOff < data.length; rOff++) {
        for (let cOff = 0; cOff < data[rOff].length; cOff++) {
          const rIdx = startRow + rOff
          const cIdx = startCol + cOff
          const field = sheet.fields[cIdx]
          const row = sheet.rows[rIdx]
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
          updates.push({ rowId: row.id, fieldId: field.id, value: val })
        }
      }

      set({ sheet: { ...sheet, rows: newRows } })
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
      const { sortConfig } = get()
      let newSortConfig: typeof sortConfig
      if (sortConfig?.fieldIndex === fieldIndex) {
        if (sortConfig.direction === 'asc') {
          newSortConfig = { fieldIndex, direction: 'desc' }
        } else {
          newSortConfig = null
        }
      } else {
        newSortConfig = { fieldIndex, direction: 'asc' }
      }
      NexcelLogger.filter('debug', 'toggleSort', { fieldIndex, newSortConfig })
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
      const { sheet } = get()
      if (!sheet) return
      pushUndo()

      const updates: Array<{ rowId: number; fieldId: number; value: unknown }> = []
      const newRows = [...sheet.rows]

      const srcHeight = srcEndRow - srcStartRow + 1
      const srcWidth = srcEndCol - srcStartCol + 1

      const fillingDown = dstEndRow > srcEndRow
      const fillingRight = dstEndCol > srcEndCol

      if (fillingDown) {
        for (let c = dstStartCol; c <= dstEndCol; c++) {
          const srcCol = Math.min(c, srcEndCol)
          const field = sheet.fields[srcCol]
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
            updates.push({ rowId: row.id, fieldId: field.id, value: fillVal })
          }
        }
      } else if (fillingRight) {
        for (let r = dstStartRow; r <= dstEndRow; r++) {
          const srcRow = sheet.rows[r]
          if (!srcRow) continue

          const srcVals = Array.from({ length: srcWidth }, (_, i) => {
            const field = sheet.fields[srcStartCol + i]
            return field ? srcRow.fields[field.id] : undefined
          })

          for (let c = srcEndCol + 1; c <= dstEndCol; c++) {
            const field = sheet.fields[c]
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
            updates.push({ rowId: srcRow.id, fieldId: field.id, value: fillVal })
          }
        }
      }

      set({ sheet: { ...sheet, rows: newRows } })
      if (updates.length > 0) {
        await adapter.batchUpdate(sheet.tableId, updates)
      }
    },

    // ── Freeze columns ────────────────────────────────

    toggleFreezeFirstCol: () => {
      const { frozenColCount } = get()
      set({ frozenColCount: frozenColCount > 0 ? 0 : 1 })
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
      const { sheet } = get()
      if (!sheet) return ''
      const field = sheet.fields[colIndex]
      const row = sheet.rows[rowIndex]
      if (!field || !row) return ''
      const val = row.fields[field.id]
      return renderCellValue(val, field)
    },

    getCellRaw: (rowIndex, colIndex) => {
      const { sheet } = get()
      if (!sheet) return undefined
      const field = sheet.fields[colIndex]
      const row = sheet.rows[rowIndex]
      if (!field || !row) return undefined
      return row.fields[field.id]
    },

    getFieldAt: (colIndex) => get().sheet?.fields[colIndex] ?? null,
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
