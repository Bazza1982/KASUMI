import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getArrowNavigationTarget,
  getEnterNavigationTarget,
  getFieldByVisibleCol,
  getFormulaReferenceSelectionTarget,
  getSelectionBounds,
  getTabNavigationTarget,
  useExcelStore,
} from '../../modules/excel-shell/stores/useExcelStore'
import { renderCellValue } from '../../modules/excel-shell/grid/renderers'
import { useCellFormatStore } from '../../modules/excel-shell/stores/useCellFormatStore'
import { useConditionalFormatStore } from '../../modules/excel-shell/stores/useConditionalFormatStore'
import { useCommentStore } from '../../modules/excel-shell/stores/useCommentStore'
import { useCellChangeStore } from '../../modules/excel-shell/stores/useCellChangeStore'
import type { FieldMeta, RowRecord, SheetContext } from '../../modules/excel-shell/types'

// The store reads localStorage at module evaluation time to decide which adapter
// to use. The setup.ts file mocks localStorage, and since `kasumi_use_mock` is
// not set to 'false', the store will use MockAdapter for all tests.

const resetState = () => {
  useExcelStore.setState({
    tables: [{ id: 1, name: 'Sheet1', databaseId: 1, order: 1 }],
    activeTableId: 1,
    sheet: {
      tableId: 1,
      tableName: 'Sheet1',
      viewId: 1,
      fields: Array.from({ length: 26 }, (_, i) => ({
        id: i + 1,
        name: '',
        type: 'text' as const,
        order: i + 1,
        primary: i === 0,
        readOnly: false,
      })),
      rows: Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        order: `${(i + 1).toFixed(5)}`,
        fields: {},
      })),
      totalCount: 100,
      isLoading: false,
      error: null,
    },
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
    allRows: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      order: `${(i + 1).toFixed(5)}`,
      fields: {},
    })),
    undoStack: [],
    redoStack: [],
    frozenColCount: 0,
    frozenRowCount: 0,
    colWidths: {},
    rowHeights: {},
    zoomLevel: 1.0,
    hiddenFieldIds: [],
    cutSelection: null,
  })
  useCellFormatStore.setState({ formats: {} })
  useConditionalFormatStore.setState({ rules: [] })
  useCommentStore.setState({ comments: [] })
  useCellChangeStore.setState({ changes: [] })
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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── 1. Initial state ───────────────────────────────────────────────────────

  it('has correct initial state', () => {
    const store = useExcelStore.getState()
    expect(store.activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(store.isEditing).toBe(false)
    expect(store.tables).toEqual([{ id: 1, name: 'Sheet1', databaseId: 1, order: 1 }])
    expect(store.sheet?.tableName).toBe('Sheet1')
    expect(store.sheet?.rows).toHaveLength(100)
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

  it('enterEdit seeds the formula session cursor at the end of the edit value', () => {
    useExcelStore.getState().enterEdit('=SUM(A1)')
    expect(useExcelStore.getState().formulaSelectionStart).toBe(8)
    expect(useExcelStore.getState().formulaSelectionEnd).toBe(8)
    expect(useExcelStore.getState().formulaEditor).toBeNull()
  })

  // ── 6. exitEdit ───────────────────────────────────────────────────────────

  it('exitEdit(false) sets isEditing to false without committing', () => {
    useExcelStore.setState({
      isEditing: true,
      editValue: 'pending',
      formulaSelectionStart: 3,
      formulaSelectionEnd: 5,
      formulaEditor: 'grid',
    })
    useExcelStore.getState().exitEdit(false)
    expect(useExcelStore.getState().isEditing).toBe(false)
    expect(useExcelStore.getState().formulaSelectionStart).toBe(0)
    expect(useExcelStore.getState().formulaSelectionEnd).toBe(0)
    expect(useExcelStore.getState().formulaEditor).toBeNull()
  })

  // ── 7. setEditValue ───────────────────────────────────────────────────────

  it('setEditValue updates editValue', () => {
    useExcelStore.getState().setEditValue('hello')
    expect(useExcelStore.getState().editValue).toBe('hello')
  })

  it('setFormulaSelection and setFormulaEditor update the shared formula session state', () => {
    useExcelStore.getState().setFormulaSelection(2, 4)
    useExcelStore.getState().setFormulaEditor('formula-bar')
    expect(useExcelStore.getState().formulaSelectionStart).toBe(2)
    expect(useExcelStore.getState().formulaSelectionEnd).toBe(4)
    expect(useExcelStore.getState().formulaEditor).toBe('formula-bar')
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

  it('stores column widths by field id and row heights by row id', () => {
    seedSheetFixture()

    useExcelStore.getState().setColWidth(3, 220)
    useExcelStore.getState().setRowHeight(102, 36)

    const store = useExcelStore.getState()
    expect(store.colWidths).toEqual({ 3: 220 })
    expect(store.rowHeights).toEqual({ 102: 36 })
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

  it('arrow navigation clamps to the grid edges', () => {
    expect(getArrowNavigationTarget(
      { rowIndex: 0, colIndex: 0 },
      'ArrowLeft',
      10,
      10,
    )).toEqual({ rowIndex: 0, colIndex: 0 })

    expect(getArrowNavigationTarget(
      { rowIndex: 9, colIndex: 9 },
      'ArrowDown',
      10,
      10,
    )).toEqual({ rowIndex: 9, colIndex: 9 })
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

  it('formula reference arrow movement can extend from the anchor cell', () => {
    expect(getFormulaReferenceSelectionTarget(
      { rowIndex: 1, colIndex: 1 },
      { startRow: 1, startCol: 1, endRow: 1, endCol: 1 },
      { rowIndex: 1, colIndex: 1 },
      'ArrowRight',
      true,
      10,
      10,
    )).toEqual({
      selection: { startRow: 1, startCol: 1, endRow: 1, endCol: 2 },
      activeCell: { rowIndex: 1, colIndex: 2 },
      anchorCell: { rowIndex: 1, colIndex: 1 },
    })
  })

  it('formula reference arrow movement resets to a single target without shift', () => {
    expect(getFormulaReferenceSelectionTarget(
      { rowIndex: 1, colIndex: 1 },
      { startRow: 1, startCol: 1, endRow: 2, endCol: 2 },
      { rowIndex: 1, colIndex: 1 },
      'ArrowDown',
      false,
      10,
      10,
    )).toEqual({
      selection: { startRow: 3, startCol: 2, endRow: 3, endCol: 2 },
      activeCell: { rowIndex: 3, colIndex: 2 },
      anchorCell: { rowIndex: 3, colIndex: 2 },
    })
  })

  it('pasteGrid expands the selection to the pasted range and keeps the top-left cell active', async () => {
    seedSheetFixture()

    await useExcelStore.getState().pasteGrid(0, 0, [
      ['One', 'Two'],
      ['Three', 'Four'],
    ])

    const store = useExcelStore.getState()
    expect(store.activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(store.anchorCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(store.selection).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 })
    expect(store.getCellDisplay(1, 0)).toBe('Three')
    expect(store.getCellRaw(1, 1)).toBe('Four')
  })

  it('newSheet resets the workbook to a single clean Sheet1 session', async () => {
    seedSheetFixture()
    useCellFormatStore.getState().setFormat('101:1', { bgColor: '#ff0000' })
    useConditionalFormatStore.getState().addRule({
      fieldId: 1,
      condition: 'contains',
      value: 'A',
      format: { bgColor: '#00ff00' },
      priority: 1,
    })
    useCommentStore.getState().addComment('101:1', 'stale comment')
    useCellChangeStore.getState().recordChange({
      cellRef: '101:1',
      fieldId: 1,
      rowId: 101,
      oldValue: '',
      newValue: 'Alpha',
      source: 'user_edit',
    })
    useExcelStore.setState({
      tables: [
        { id: 11, name: 'Legacy A', databaseId: 1, order: 1 },
        { id: 12, name: 'Legacy B', databaseId: 1, order: 2 },
      ],
      activeTableId: 12,
      activeCell: { rowIndex: 4, colIndex: 2 },
      selection: { startRow: 1, startCol: 1, endRow: 4, endCol: 2 },
      anchorCell: { rowIndex: 1, colIndex: 1 },
      isEditing: true,
      editValue: 'stale',
      formulaSelectionStart: 2,
      formulaSelectionEnd: 5,
      formulaEditor: 'formula-bar',
      searchText: 'alpha',
      sortConfig: { fieldIndex: 1, direction: 'desc' },
      columnFilters: { 1: { type: 'contains', value: 'x' } },
      frozenColCount: 1,
      frozenRowCount: 1,
      colWidths: { 1: 240 },
      rowHeights: { 101: 42 },
      hiddenFieldIds: [2],
      cutSelection: { startRow: 2, startCol: 2, endRow: 3, endCol: 3 },
      statusText: 'Busy',
    })

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    await useExcelStore.getState().newSheet()

    const store = useExcelStore.getState()
    expect(store.tables).toEqual([{ id: 1, name: 'Sheet1', databaseId: 1, order: 1 }])
    expect(store.activeTableId).toBe(1)
    expect(store.sheet?.tableId).toBe(1)
    expect(store.sheet?.tableName).toBe('Sheet1')
    expect(store.activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(store.selection).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    expect(store.anchorCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(store.isEditing).toBe(false)
    expect(store.editValue).toBe('')
    expect(store.formulaSelectionStart).toBe(0)
    expect(store.formulaSelectionEnd).toBe(0)
    expect(store.formulaEditor).toBeNull()
    expect(store.searchText).toBe('')
    expect(store.sortConfig).toBeNull()
    expect(store.columnFilters).toEqual({})
    expect(store.frozenColCount).toBe(0)
    expect(store.frozenRowCount).toBe(0)
    expect(store.colWidths).toEqual({})
    expect(store.rowHeights).toEqual({})
    expect(store.hiddenFieldIds).toEqual([])
    expect(store.cutSelection).toBeNull()
    expect(store.statusText).toBe('Ready')
    expect(store.sheet?.rows).toHaveLength(100)
    expect(useCellFormatStore.getState().formats).toEqual({})
    expect(useConditionalFormatStore.getState().rules).toEqual([])
    expect(useCommentStore.getState().comments).toEqual([])
    expect(useCellChangeStore.getState().changes).toEqual([])
  })

  it('importFromCsv hydrates a blank workbook with imported headers and rows', async () => {
    const csv = 'Name,Status\nAlpha,Todo\nBeta,Done\n'
    const file = new File([csv], 'fixture.csv', { type: 'text/csv' })

    await useExcelStore.getState().importFromCsv(file)

    const store = useExcelStore.getState()
    expect(store.sheet?.fields[0]?.name).toBe('Name')
    expect(store.sheet?.fields[1]?.name).toBe('Status')
    expect(store.sheet?.rows).toHaveLength(2)
    expect(store.allRows).toHaveLength(2)
    expect(store.sheet?.rows[0]?.fields[1]).toBe('Alpha')
    expect(store.sheet?.rows[0]?.fields[2]).toBe('Todo')
    expect(store.sheet?.rows[1]?.fields[1]).toBe('Beta')
    expect(store.sheet?.rows[1]?.fields[2]).toBe('Done')
  })

  it('importFromCsv supports alternate delimiters when specified', async () => {
    const csv = 'Name;Status\nAlpha;Todo\nBeta;Done\n'
    const file = new File([csv], 'fixture.csv', { type: 'text/csv' })

    await useExcelStore.getState().importFromCsv(file, { mode: 'delimiter', delimiter: ';' })

    const store = useExcelStore.getState()
    expect(store.sheet?.fields[0]?.name).toBe('Name')
    expect(store.sheet?.fields[1]?.name).toBe('Status')
    expect(store.sheet?.rows[0]?.fields[1]).toBe('Alpha')
    expect(store.sheet?.rows[0]?.fields[2]).toBe('Todo')
    expect(store.statusText).toContain('";"')
  })

  it('importFromCsv supports whitespace parsing when specified', async () => {
    const csv = 'Name Status\nAlpha Todo\nBeta Done\n'
    const file = new File([csv], 'fixture.csv', { type: 'text/csv' })

    await useExcelStore.getState().importFromCsv(file, { mode: 'whitespace' })

    const store = useExcelStore.getState()
    expect(store.sheet?.fields[0]?.name).toBe('Name')
    expect(store.sheet?.fields[1]?.name).toBe('Status')
    expect(store.sheet?.rows[1]?.fields[1]).toBe('Beta')
    expect(store.sheet?.rows[1]?.fields[2]).toBe('Done')
    expect(store.statusText).toContain('whitespace')
  })

  it('importFromXlsx hydrates a blank workbook with imported headers and rows', async () => {
    const XLSX = await import('xlsx')
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['City', 'Country'],
      ['Hyrule', 'Hyrule Kingdom'],
      ['Kakariko', 'Hyrule Kingdom'],
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Places')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const file = new File([buffer], 'places.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await useExcelStore.getState().importFromXlsx(file)

    const store = useExcelStore.getState()
    expect(store.sheet?.fields[0]?.name).toBe('City')
    expect(store.sheet?.fields[1]?.name).toBe('Country')
    expect(store.sheet?.rows).toHaveLength(2)
    expect(store.allRows).toHaveLength(2)
    expect(store.sheet?.rows[0]?.fields[1]).toBe('Hyrule')
    expect(store.sheet?.rows[0]?.fields[2]).toBe('Hyrule Kingdom')
    expect(store.sheet?.rows[1]?.fields[1]).toBe('Kakariko')
    expect(store.sheet?.rows[1]?.fields[2]).toBe('Hyrule Kingdom')
  })
})
