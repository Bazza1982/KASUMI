import { useExcelStore } from '../stores/useExcelStore'
import { useCommentStore } from '../stores/useCommentStore'
import { useCellFormatStore } from '../stores/useCellFormatStore'
import { useCellChangeStore } from '../stores/useCellChangeStore'
import { renderCellValue } from '../grid/renderers'
import { NexcelLogger } from './logger'
import { commandBus } from '../../../platform/command-bus'

export interface NexcelAIContext {
  table: {
    id: number
    name: string
    totalRows: number
    visibleRows: number
    fields: {
      id: number
      name: string
      type: string
      primary: boolean
    }[]
  }
  activeCell: {
    cellRef: string
    rowId: number
    fieldId: number
    fieldName: string
    fieldType: string
    value: unknown
    displayValue: string
    format: object | null
    comments: object[]
    recentChanges: object[]
  } | null
  selection: {
    rangeRef: string
    rowCount: number
    colCount: number
    cellCount: number
    numericSummary: {
      sum: number
      avg: number
      min: number
      max: number
      count: number
    } | null
    sampleValues: string[]
  } | null
  activeRow: {
    rowId: number
    fields: Record<string, {
      fieldName: string
      fieldType: string
      value: unknown
      displayValue: string
      hasComment: boolean
    }>
    recentChanges: object[]
  } | null
  viewState: {
    sortField: string | null
    sortDirection: string | null
    searchText: string
    activeFilters: { fieldName: string; rule: string }[]
  }
}

export class AIContextSerializer {
  getContext(): NexcelAIContext {
    const excelState = useExcelStore.getState()
    const commentState = useCommentStore.getState()
    const formatState = useCellFormatStore.getState()
    const changeState = useCellChangeStore.getState()

    const { sheet, activeCell, selection, sortConfig, searchText, columnFilters } = excelState

    // Table context
    const table = sheet ? {
      id: sheet.tableId,
      name: sheet.tableName,
      totalRows: sheet.totalCount,
      visibleRows: sheet.rows.length,
      fields: sheet.fields.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        primary: f.primary,
      })),
    } : { id: 0, name: '', totalRows: 0, visibleRows: 0, fields: [] }

    // Active cell context
    let activeCellCtx: NexcelAIContext['activeCell'] = null
    if (sheet && activeCell) {
      const field = sheet.fields[activeCell.colIndex]
      const row = sheet.rows[activeCell.rowIndex]
      if (field && row) {
        const cellRef = `${row.id}:${field.id}`
        const value = row.fields[field.id]
        activeCellCtx = {
          cellRef,
          rowId: row.id,
          fieldId: field.id,
          fieldName: field.name,
          fieldType: field.type,
          value,
          displayValue: renderCellValue(value, field),
          format: formatState.getFormat(cellRef) ?? null,
          comments: commentState.getCommentsForCell(cellRef),
          recentChanges: changeState.getChangesForCell(cellRef),
        }
      }
    }

    // Selection context
    let selectionCtx: NexcelAIContext['selection'] = null
    if (sheet && selection) {
      const minRow = Math.min(selection.startRow, selection.endRow)
      const maxRow = Math.max(selection.startRow, selection.endRow)
      const minCol = Math.min(selection.startCol, selection.endCol)
      const maxCol = Math.max(selection.startCol, selection.endCol)
      const rowCount = maxRow - minRow + 1
      const colCount = maxCol - minCol + 1

      const nums: number[] = []
      const sampleValues: string[] = []

      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const row = sheet.rows[r]
          const field = sheet.fields[c]
          if (!row || !field) continue
          const raw = row.fields[field.id]
          const display = renderCellValue(raw, field)
          if (sampleValues.length < 20) sampleValues.push(display)
          const n = parseFloat(String(raw))
          if (!isNaN(n)) nums.push(n)
        }
      }

      const numericSummary = nums.length > 0 ? {
        sum: nums.reduce((a, b) => a + b, 0),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        min: Math.min(...nums),
        max: Math.max(...nums),
        count: nums.length,
      } : null

      selectionCtx = {
        rangeRef: `R${minRow + 1}C${minCol + 1}:R${maxRow + 1}C${maxCol + 1}`,
        rowCount,
        colCount,
        cellCount: rowCount * colCount,
        numericSummary,
        sampleValues,
      }
    }

    // Active row context
    let activeRowCtx: NexcelAIContext['activeRow'] = null
    if (sheet && activeCell) {
      const row = sheet.rows[activeCell.rowIndex]
      if (row) {
        const fields: Record<string, { fieldName: string; fieldType: string; value: unknown; displayValue: string; hasComment: boolean }> = {}
        for (const field of sheet.fields) {
          const cellRef = `${row.id}:${field.id}`
          const value = row.fields[field.id]
          fields[String(field.id)] = {
            fieldName: field.name,
            fieldType: field.type,
            value,
            displayValue: renderCellValue(value, field),
            hasComment: commentState.hasCellComment(cellRef),
          }
        }
        activeRowCtx = {
          rowId: row.id,
          fields,
          recentChanges: changeState.getChangesForRow(row.id),
        }
      }
    }

    // View state
    const sortField = sheet && sortConfig !== null
      ? (sheet.fields[sortConfig.fieldIndex]?.name ?? null)
      : null
    const sortDirection = sortConfig?.direction ?? null
    const activeFilters = sheet
      ? Object.entries(columnFilters).map(([fieldIdStr, rule]) => {
          const fieldId = parseInt(fieldIdStr, 10)
          const field = sheet.fields.find(f => f.id === fieldId)
          return { fieldName: field?.name ?? fieldIdStr, rule: `${rule.type}:${rule.value}` }
        })
      : []

    NexcelLogger.aiContext('debug', 'getContext', { tableId: table.id })

    return {
      table,
      activeCell: activeCellCtx,
      selection: selectionCtx,
      activeRow: activeRowCtx,
      viewState: {
        sortField,
        sortDirection,
        searchText,
        activeFilters,
      },
    }
  }

  getCellContext(cellRef: string) {
    const excelState = useExcelStore.getState()
    const commentState = useCommentStore.getState()
    const formatState = useCellFormatStore.getState()
    const changeState = useCellChangeStore.getState()
    const { sheet } = excelState
    if (!sheet) return null

    const [rowIdStr, fieldIdStr] = cellRef.split(':')
    const rowId = parseInt(rowIdStr, 10)
    const fieldId = parseInt(fieldIdStr, 10)

    const row = sheet.rows.find(r => r.id === rowId)
    const field = sheet.fields.find(f => f.id === fieldId)
    if (!row || !field) return null

    const value = row.fields[field.id]
    return {
      cellRef,
      rowId,
      fieldId,
      fieldName: field.name,
      fieldType: field.type,
      value,
      displayValue: renderCellValue(value, field),
      format: formatState.getFormat(cellRef) ?? null,
      comments: commentState.getCommentsForCell(cellRef),
      recentChanges: changeState.getChangesForCell(cellRef),
    }
  }

  getRowContext(rowId: number) {
    const excelState = useExcelStore.getState()
    const commentState = useCommentStore.getState()
    const changeState = useCellChangeStore.getState()
    const { sheet } = excelState
    if (!sheet) return null

    const row = sheet.rows.find(r => r.id === rowId)
    if (!row) return null

    const fields: Record<string, unknown> = {}
    for (const field of sheet.fields) {
      const cellRef = `${row.id}:${field.id}`
      const value = row.fields[field.id]
      fields[field.name] = {
        fieldId: field.id,
        fieldType: field.type,
        value,
        displayValue: renderCellValue(value, field),
        hasComment: commentState.hasCellComment(cellRef),
      }
    }

    return {
      rowId,
      fields,
      recentChanges: changeState.getChangesForRow(rowId),
    }
  }

  getSelectionContext() {
    const { sheet, selection } = useExcelStore.getState()
    if (!sheet || !selection) return null

    const minRow = Math.min(selection.startRow, selection.endRow)
    const maxRow = Math.max(selection.startRow, selection.endRow)
    const minCol = Math.min(selection.startCol, selection.endCol)
    const maxCol = Math.max(selection.startCol, selection.endCol)

    const nums: number[] = []
    const cells: { cellRef: string; value: unknown; displayValue: string }[] = []

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const row = sheet.rows[r]
        const field = sheet.fields[c]
        if (!row || !field) continue
        const raw = row.fields[field.id]
        const display = renderCellValue(raw, field)
        cells.push({ cellRef: `${row.id}:${field.id}`, value: raw, displayValue: display })
        const n = parseFloat(String(raw))
        if (!isNaN(n)) nums.push(n)
      }
    }

    return {
      rangeRef: `R${minRow + 1}C${minCol + 1}:R${maxRow + 1}C${maxCol + 1}`,
      cells,
      numericSummary: nums.length > 0 ? {
        sum: nums.reduce((a, b) => a + b, 0),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        min: Math.min(...nums),
        max: Math.max(...nums),
        count: nums.length,
      } : null,
    }
  }

  exportForAI(): string {
    const ctx = this.getContext()
    NexcelLogger.aiContext('info', 'exportForAI')
    return JSON.stringify(ctx, (_, v) => (v === null ? undefined : v))
  }
}

export const nexcelAIContext = new AIContextSerializer()

// Register AI context commands on the command bus
commandBus.register('nexcel', async (command) => {
  if (command.type === 'getContext') {
    const ctx = nexcelAIContext.getContext()
    NexcelLogger.aiContext('info', 'commandBus:getContext')
    return { success: true, data: ctx } as { success: boolean }
  }
  if (command.type === 'exportForAI') {
    const json = nexcelAIContext.exportForAI()
    NexcelLogger.aiContext('info', 'commandBus:exportForAI')
    return { success: true, data: json } as { success: boolean }
  }
  return { success: false, error: `Unknown nexcel command: ${command.type}` }
})
