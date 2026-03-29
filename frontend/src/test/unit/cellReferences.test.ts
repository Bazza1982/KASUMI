import { describe, expect, it } from 'vitest'
import {
  formatCellReference,
  formatSelectionReference,
  getFormulaArgumentSlotAtCursor,
  getFormulaFunctionHintAtCursor,
  hasFormulaReferenceToken,
  isFormulaInputMode,
  syncFormulaReference,
  syncFormulaReferenceAtCursor,
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

  it('detects existing reference tokens in a formula draft', () => {
    expect(hasFormulaReferenceToken('=SUM(A1,B2)', 'A1')).toBe(true)
    expect(hasFormulaReferenceToken('=SUM(A1,B2)', 'C3')).toBe(false)
  })

  it('appends or replaces the trailing range token in a formula draft', () => {
    expect(syncFormulaReference('=SUM(', 'A1:B2')).toBe('=SUM(A1:B2')
    expect(syncFormulaReference('=SUM(A1', 'B2:C3')).toBe('=SUM(B2:C3')
    expect(syncFormulaReference('=A1+B1', 'C1')).toBe('=A1+C1')
  })

  it('replaces the reference under the current formula cursor instead of always touching the tail', () => {
    expect(syncFormulaReferenceAtCursor('=SUM(A1,B2)', 'C3', 6)).toEqual({
      value: '=SUM(C3,B2)',
      selectionStart: 7,
      selectionEnd: 7,
    })
  })

  it('inserts a new reference at the current argument slot when the cursor is after a comma', () => {
    expect(syncFormulaReferenceAtCursor('=SUM(A1,)', 'B2', 8)).toEqual({
      value: '=SUM(A1,B2)',
      selectionStart: 10,
      selectionEnd: 10,
    })
  })

  it('detects the current argument slot inside nested formulas', () => {
    expect(getFormulaArgumentSlotAtCursor('=IF(A1>0,SUM(B1,C1),D1)', 16)).toEqual({
      argumentIndex: 2,
      start: 16,
      end: 18,
    })
  })

  it('replaces an empty argument slot inside a formula instead of appending to the end', () => {
    expect(syncFormulaReferenceAtCursor('=IF(A1,,C1)', 'B2', 7)).toEqual({
      value: '=IF(A1,B2,C1)',
      selectionStart: 9,
      selectionEnd: 9,
    })
  })

  it('returns the active function signature and argument index at the cursor', () => {
    expect(getFormulaFunctionHintAtCursor('=SUM(A1,B2)', 9)).toEqual({
      functionName: 'SUM',
      argumentIndex: 2,
      arguments: ['number1', '[number2]'],
    })
  })

  it('keeps the deepest nested function context when formulas are nested', () => {
    expect(getFormulaFunctionHintAtCursor('=IF(A1>0,SUM(B1,C1),D1)', 16)).toEqual({
      functionName: 'SUM',
      argumentIndex: 2,
      arguments: ['number1', '[number2]'],
    })
  })

  it('ignores commas inside string literals when resolving the active argument slot', () => {
    expect(getFormulaArgumentSlotAtCursor('=IF(A1="x,y",B1,C1)', 14)).toEqual({
      argumentIndex: 2,
      start: 13,
      end: 15,
    })
  })

  it('handles escaped quotes inside strings without breaking function hint parsing', () => {
    expect(getFormulaFunctionHintAtCursor('=IF(A1="He said ""Hi""",B1,C1)', 25)).toEqual({
      functionName: 'IF',
      argumentIndex: 2,
      arguments: ['logical_test', 'value_if_true', 'value_if_false'],
    })
  })

  it('returns richer signatures for common multi-argument functions', () => {
    expect(getFormulaFunctionHintAtCursor('=XLOOKUP(A1,', 12)).toEqual({
      functionName: 'XLOOKUP',
      argumentIndex: 2,
      arguments: ['lookup_value', 'lookup_array', 'return_array', '[if_not_found]', '[match_mode]', '[search_mode]'],
    })
  })
})
