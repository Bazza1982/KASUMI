import { describe, expect, it } from 'vitest'
import {
  formatCellReference,
  formatSelectionReference,
  isFormulaInputMode,
  syncFormulaReference,
} from '../../modules/excel-shell/utils/cellReferences'

describe('cellReferences', () => {
  it('formats single cells and rectangular ranges with spreadsheet refs', () => {
    expect(formatCellReference({ rowIndex: 0, colIndex: 0 })).toBe('A1')
    expect(formatCellReference({ rowIndex: 3, colIndex: 27 })).toBe('AB4')
    expect(formatSelectionReference({ startRow: 1, startCol: 1, endRow: 0, endCol: 0 })).toBe('A1:B2')
  })

  it('detects formula-input mode after leading whitespace', () => {
    expect(isFormulaInputMode('=A1')).toBe(true)
    expect(isFormulaInputMode('  =SUM(')).toBe(true)
    expect(isFormulaInputMode('Alpha')).toBe(false)
  })

  it('appends or replaces the trailing range token in a formula draft', () => {
    expect(syncFormulaReference('=SUM(', 'A1:B2')).toBe('=SUM(A1:B2')
    expect(syncFormulaReference('=SUM(A1', 'B2:C3')).toBe('=SUM(B2:C3')
    expect(syncFormulaReference('=A1+B1', 'C1')).toBe('=A1+C1')
  })
})
