import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import FormulaBar from '../../modules/excel-shell/components/FormulaBar'
import { useExcelStore } from '../../modules/excel-shell/stores/useExcelStore'
import type { FieldMeta, RowRecord, SheetContext } from '../../modules/excel-shell/types'

const resetState = () => {
  useExcelStore.setState({
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
    undoStack: [],
    redoStack: [],
    frozenColCount: 0,
    hiddenFieldIds: [],
  })
}

const seedSheetFixture = () => {
  const fields: FieldMeta[] = [
    { id: 1, name: 'Name', type: 'text', order: 1, primary: true, readOnly: false },
    { id: 2, name: 'Status', type: 'text', order: 2, primary: false, readOnly: false },
  ]
  const rows: RowRecord[] = [
    { id: 101, order: '1.0', fields: { 1: 'Alpha', 2: 'Todo' } },
    { id: 102, order: '2.0', fields: { 1: 'Beta', 2: 'Done' } },
  ]
  const sheet: SheetContext = {
    tableId: 1,
    tableName: 'Fixture',
    viewId: 1,
    fields,
    rows,
    totalCount: rows.length,
    isLoading: false,
    error: null,
  }

  useExcelStore.setState({
    sheet,
    allRows: rows,
    activeCell: { rowIndex: 0, colIndex: 0 },
    selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
  })
}

describe('FormulaBar', () => {
  beforeEach(() => {
    resetState()
    seedSheetFixture()
  })

  it('focus does not force edit mode', () => {
    render(<FormulaBar />)
    const input = screen.getByRole('textbox')

    fireEvent.focus(input)

    expect(useExcelStore.getState().isEditing).toBe(false)
    expect(input).toHaveValue('Alpha')
  })

  it('typing in the formula bar enters edit mode with the typed value', () => {
    render(<FormulaBar />)
    const input = screen.getByRole('textbox')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Alpha 2' } })

    expect(useExcelStore.getState().isEditing).toBe(true)
    expect(useExcelStore.getState().editValue).toBe('Alpha 2')
  })

  it('enter commits and returns focus intent to the grid', () => {
    const onNavigateToGrid = vi.fn()
    const commitSpy = vi.spyOn(useExcelStore.getState(), 'commitCell')

    render(<FormulaBar onNavigateToGrid={onNavigateToGrid} />)
    const input = screen.getByRole('textbox')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Alpha 2' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onNavigateToGrid).toHaveBeenCalledTimes(1)
    expect(useExcelStore.getState().activeCell).toEqual({ rowIndex: 1, colIndex: 0 })
    expect(commitSpy).toHaveBeenCalledWith(0, 0, 'Alpha 2')
  })

  it('tab follows the current multi-cell selection flow', () => {
    const onNavigateToGrid = vi.fn()
    useExcelStore.setState({
      activeCell: { rowIndex: 0, colIndex: 1 },
      selection: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
    })

    render(<FormulaBar onNavigateToGrid={onNavigateToGrid} />)
    const input = screen.getByRole('textbox')

    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Tab' })

    expect(onNavigateToGrid).toHaveBeenCalledTimes(1)
    expect(useExcelStore.getState().activeCell).toEqual({ rowIndex: 1, colIndex: 0 })
  })

  it('shows the current range in the name box for multi-cell selections', () => {
    useExcelStore.setState({
      activeCell: { rowIndex: 1, colIndex: 1 },
      selection: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
    })

    render(<FormulaBar />)

    expect(screen.getByText('A1:B2')).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.textContent === '· 2R x 2C')).toBeInTheDocument()
  })

  it('syncs the trailing formula reference when the selection changes', () => {
    const { rerender } = render(<FormulaBar />)

    useExcelStore.setState({
      isEditing: true,
      editValue: '=SUM(',
      activeCell: { rowIndex: 0, colIndex: 0 },
      selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    })
    rerender(<FormulaBar />)

    expect(useExcelStore.getState().editValue).toBe('=SUM(A1')

    useExcelStore.setState({
      activeCell: { rowIndex: 1, colIndex: 1 },
      selection: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
    })
    rerender(<FormulaBar />)

    expect(useExcelStore.getState().editValue).toBe('=SUM(A1:B2')
  })
})
