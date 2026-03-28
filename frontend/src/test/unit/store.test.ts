import { describe, it, expect, beforeEach } from 'vitest'
import {
  getEnterNavigationTarget,
  getFieldByVisibleCol,
  getSelectionBounds,
  getTabNavigationTarget,
  useExcelStore,
} from '../../modules/excel-shell/stores/useExcelStore'
import { renderCellValue } from '../../modules/excel-shell/grid/renderers'
import type { FieldMeta, RowRecord, SheetContext } from '../../modules/excel-shell/types'

// The store reads localStorage at module evaluation time to decide which adapter
// to use. The setup.ts file mocks localStorage, and since `kasumi_use_mock` is
// not set to 'false', the store will use MockAdapter for all tests.

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

const makeSheetFixture = (): SheetContext => {
  const fields: FieldMeta[] = [
    { id: 1, name: 'Name', type: 'text', order: 1, primary: true, readOnly: false },
    { id: 2, name: 'Status', type: 'single_select', order: 2, primary: false, readOnly: false },
    { id: 3, name: 'Budget', type: 'number', order: 3, primary: false, readOnly: false },
  ]
  const rows: RowRecord[] = [
    { id: 101, order: '1.0', fields: { 1: 'Alpha', 2: { id: 1, value: 'Todo', color: 'blue' }, 3: 120 } },
    { id: 102, order: '2.0', fields: { 1: 'Beta', 2: { id: 2, value: 'Done', color: 'green' }, 3: 240 } },
  ]

  return {
    tableId: 1,
    tableName: 'Fixture',
    viewId: 1,
    fields,
    rows,
    totalCount: rows.length,
    isLoading: false,
    error: null,
  }
}

const seedSheetFixture = () => {
  const sheet = makeSheetFixture()
  useExcelStore.setState({
    sheet,
    allRows: sheet.rows,
    activeCell: { rowIndex: 0, colIndex: 0 },
    selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
    hiddenFieldIds: [],
    sortConfig: null,
  })
  return sheet
}

describe('useExcelStore', () => {
  beforeEach(() => {
    resetState()
  })

  // ── 1. Initial state ───────────────────────────────────────────────────────

  it('has correct initial state', () => {
    const store = useExcelStore.getState()
    expect(store.activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(store.isEditing).toBe(false)
    expect(store.tables).toEqual([])
    expect(store.sheet).toBeNull()
  })

  // ── 2. loadTables ─────────────────────────────────────────────────────────

  it('loadTables: populates tables and loads a sheet', async () => {
    await useExcelStore.getState().loadTables()
    const store = useExcelStore.getState()
    expect(store.tables.length).toBeGreaterThan(0)
    expect(store.sheet).not.toBeNull()
  })

  // ── 3. setActiveCell ──────────────────────────────────────────────────────

  it('setActiveCell sets activeCell and clears isEditing', () => {
    useExcelStore.getState().setActiveCell(2, 3)
    const store = useExcelStore.getState()
    expect(store.activeCell).toEqual({ rowIndex: 2, colIndex: 3 })
    expect(store.isEditing).toBe(false)
  })

  // ── 4. setSelection ───────────────────────────────────────────────────────

  it('setSelection sets selection range', () => {
    useExcelStore.getState().setSelection(0, 0, 4, 2)
    const store = useExcelStore.getState()
    expect(store.selection?.endRow).toBe(4)
    expect(store.selection?.endCol).toBe(2)
  })

  it('setSelectionState preserves explicit active cell and anchor', () => {
    useExcelStore.getState().setSelectionState(
      { startRow: 1, startCol: 0, endRow: 3, endCol: 2 },
      { rowIndex: 3, colIndex: 0 },
      { rowIndex: 1, colIndex: 0 },
    )
    const store = useExcelStore.getState()
    expect(store.selection).toEqual({ startRow: 1, startCol: 0, endRow: 3, endCol: 2 })
    expect(store.activeCell).toEqual({ rowIndex: 3, colIndex: 0 })
    expect(store.anchorCell).toEqual({ rowIndex: 1, colIndex: 0 })
  })

  // ── 5. enterEdit ──────────────────────────────────────────────────────────

  it('enterEdit sets isEditing to true', () => {
    useExcelStore.getState().enterEdit('some value')
    expect(useExcelStore.getState().isEditing).toBe(true)
  })

  // ── 6. exitEdit ───────────────────────────────────────────────────────────

  it('exitEdit(false) sets isEditing to false without committing', () => {
    useExcelStore.setState({ isEditing: true, editValue: 'pending' })
    useExcelStore.getState().exitEdit(false)
    expect(useExcelStore.getState().isEditing).toBe(false)
  })

  // ── 7. setEditValue ───────────────────────────────────────────────────────

  it('setEditValue updates editValue', () => {
    useExcelStore.getState().setEditValue('hello')
    expect(useExcelStore.getState().editValue).toBe('hello')
  })

  // ── 8. toggleSort ─────────────────────────────────────────────────────────

  it('toggleSort cycles asc → desc → null', () => {
    seedSheetFixture()
    const store = useExcelStore.getState()

    store.toggleSort(0)
    expect(useExcelStore.getState().sortConfig).toEqual({ fieldIndex: 0, direction: 'asc' })

    useExcelStore.getState().toggleSort(0)
    expect(useExcelStore.getState().sortConfig).toEqual({ fieldIndex: 0, direction: 'desc' })

    useExcelStore.getState().toggleSort(0)
    expect(useExcelStore.getState().sortConfig).toBeNull()
  })

  it('toggleSort on a different field resets to asc', () => {
    seedSheetFixture()
    useExcelStore.getState().toggleSort(0)
    useExcelStore.getState().toggleSort(1)
    expect(useExcelStore.getState().sortConfig).toEqual({ fieldIndex: 1, direction: 'asc' })
  })

  // ── 9. toggleFreezeFirstCol ───────────────────────────────────────────────

  it('toggleFreezeFirstCol toggles frozenColCount between 0 and 1', () => {
    expect(useExcelStore.getState().frozenColCount).toBe(0)

    useExcelStore.getState().toggleFreezeFirstCol()
    expect(useExcelStore.getState().frozenColCount).toBe(1)

    useExcelStore.getState().toggleFreezeFirstCol()
    expect(useExcelStore.getState().frozenColCount).toBe(0)
  })

  // ── 10. toggleHideColumn ──────────────────────────────────────────────────

  it('toggleHideColumn adds then removes a field id', () => {
    useExcelStore.getState().toggleHideColumn(1)
    expect(useExcelStore.getState().hiddenFieldIds).toContain(1)

    useExcelStore.getState().toggleHideColumn(1)
    expect(useExcelStore.getState().hiddenFieldIds).not.toContain(1)
  })

  // ── 11. showAllColumns ────────────────────────────────────────────────────

  it('showAllColumns clears hiddenFieldIds', () => {
    useExcelStore.setState({ hiddenFieldIds: [1, 2, 3] })
    useExcelStore.getState().showAllColumns()
    expect(useExcelStore.getState().hiddenFieldIds).toEqual([])
  })

  // ── 12. undo on untouched sheet ───────────────────────────────────────────

  it('undo() on an untouched sheet does not crash and undoStack stays empty', async () => {
    await useExcelStore.getState().loadTables()
    const storeBefore = useExcelStore.getState()
    expect(storeBefore.undoStack).toHaveLength(0)

    // Should not throw
    expect(() => useExcelStore.getState().undo()).not.toThrow()

    expect(useExcelStore.getState().undoStack).toHaveLength(0)
  })

  // ── 13. setSearchText ─────────────────────────────────────────────────────

  it('setSearchText updates searchText', () => {
    useExcelStore.getState().setSearchText('test')
    expect(useExcelStore.getState().searchText).toBe('test')
  })

  // ── 14. getCellDisplay after loadTables ───────────────────────────────────

  it('getCellDisplay returns the visible-column cell display', () => {
    seedSheetFixture()
    const display = useExcelStore.getState().getCellDisplay(0, 0)
    expect(display).toBe('Alpha')
  })

  // ── 15. getFieldAt after loadTables ───────────────────────────────────────

  it('getFieldAt(0) returns the visible field', () => {
    seedSheetFixture()
    const field = useExcelStore.getState().getFieldAt(0)
    expect(field).not.toBeNull()
    expect(field!.id).toBe(1)
  })

  it('maps visible columns after a hidden column for reads and sorts', async () => {
    const sheet = seedSheetFixture()
    const hiddenField = sheet.fields[1]
    const expectedVisibleField = sheet.fields[2]
    const expectedDisplay = renderCellValue(
      sheet.rows[0].fields[expectedVisibleField.id],
      expectedVisibleField,
    )

    useExcelStore.getState().toggleHideColumn(hiddenField.id)

    const afterHide = useExcelStore.getState()
    expect(getFieldByVisibleCol(afterHide.sheet, afterHide.hiddenFieldIds, 1)?.id).toBe(expectedVisibleField.id)
    expect(afterHide.getCellDisplay(0, 1)).toBe(expectedDisplay)

    afterHide.toggleSort(1)
    expect(useExcelStore.getState().sortConfig).toEqual({ fieldIndex: 2, direction: 'asc' })
  })

  it('getSelectionBounds normalizes reversed selections', () => {
    expect(getSelectionBounds({ startRow: 4, startCol: 3, endRow: 1, endCol: 0 })).toEqual({
      minRow: 1,
      maxRow: 4,
      minCol: 0,
      maxCol: 3,
    })
  })

  it('tab navigation loops inside a rectangular selection', () => {
    const next = getTabNavigationTarget(
      { rowIndex: 1, colIndex: 2 },
      false,
      { startRow: 0, startCol: 1, endRow: 1, endCol: 2 },
      10,
      10,
    )
    expect(next).toEqual({ rowIndex: 0, colIndex: 1 })
  })

  it('enter navigation loops inside a rectangular selection', () => {
    const next = getEnterNavigationTarget(
      { rowIndex: 1, colIndex: 1 },
      false,
      { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
      10,
    )
    expect(next).toEqual({ rowIndex: 0, colIndex: 0 })
  })
})
