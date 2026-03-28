import type { GridCoord, SelectionRange } from '../types'

export function colLabelFromIndex(colIndex: number): string {
  let label = ''
  let n = colIndex
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

export function formatCellReference(cell: GridCoord): string {
  return `${colLabelFromIndex(cell.colIndex)}${cell.rowIndex + 1}`
}

export function formatSelectionReference(selection: SelectionRange | null): string {
  if (!selection) return ''
  const startRow = Math.min(selection.startRow, selection.endRow)
  const endRow = Math.max(selection.startRow, selection.endRow)
  const startCol = Math.min(selection.startCol, selection.endCol)
  const endCol = Math.max(selection.startCol, selection.endCol)
  const startRef = formatCellReference({ rowIndex: startRow, colIndex: startCol })
  const endRef = formatCellReference({ rowIndex: endRow, colIndex: endCol })
  return startRef === endRef ? startRef : `${startRef}:${endRef}`
}

export function isFormulaInputMode(value: string): boolean {
  return value.trimStart().startsWith('=')
}

export function syncFormulaReference(input: string, selectionRef: string): string {
  if (!selectionRef || !isFormulaInputMode(input)) return input

  const trailingRangePattern = /((?:'[^']+'|[A-Za-z_][A-Za-z0-9_]*)!)?\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?$/i
  if (trailingRangePattern.test(input)) {
    return input.replace(trailingRangePattern, selectionRef)
  }

  if (/[=(,+\-*/^&\s]$/.test(input)) {
    return `${input}${selectionRef}`
  }

  return `${input}${selectionRef}`
}
