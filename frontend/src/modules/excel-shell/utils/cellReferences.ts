import type { GridCoord, SelectionRange } from '../types'

const createFormulaReferencePattern = () => /((?:'[^']+'|[A-Za-z_][A-Za-z0-9_]*)!)?\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/gi

export interface FormulaReferenceSyncResult {
  value: string
  selectionStart: number
  selectionEnd: number
}

export interface FormulaArgumentSlot {
  argumentIndex: number
  start: number
  end: number
}

export interface FormulaFunctionHint {
  functionName: string
  argumentIndex: number
  arguments: string[]
}

interface FormulaContext {
  openIndex: number
  commas: number[]
  closeIndex: number
  functionName: string | null
}

const KNOWN_FORMULA_SIGNATURES: Record<string, string[]> = {
  SUM: ['number1', '[number2]'],
  AVERAGE: ['number1', '[number2]'],
  COUNT: ['value1', '[value2]'],
  MAX: ['number1', '[number2]'],
  MIN: ['number1', '[number2]'],
  ROUND: ['number', 'num_digits'],
  IF: ['logical_test', 'value_if_true', 'value_if_false'],
  IFS: ['logical_test1', 'value_if_true1', '[logical_test2]', '[value_if_true2]'],
  AND: ['logical1', '[logical2]'],
  OR: ['logical1', '[logical2]'],
  NOT: ['logical'],
  IFERROR: ['value', 'value_if_error'],
  SUMIF: ['range', 'criteria', '[sum_range]'],
  SUMIFS: ['sum_range', 'criteria_range1', 'criteria1', '[criteria_range2]', '[criteria2]'],
  COUNTIF: ['range', 'criteria'],
  COUNTIFS: ['criteria_range1', 'criteria1', '[criteria_range2]', '[criteria2]'],
  VLOOKUP: ['lookup_value', 'table_array', 'col_index_num', '[range_lookup]'],
  XLOOKUP: ['lookup_value', 'lookup_array', 'return_array', '[if_not_found]', '[match_mode]', '[search_mode]'],
  INDEX: ['array', 'row_num', '[column_num]'],
  MATCH: ['lookup_value', 'lookup_array', '[match_type]'],
  CONCAT: ['text1', '[text2]'],
  TEXTJOIN: ['delimiter', 'ignore_empty', 'text1', '[text2]'],
}

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

const isFormulaInsertionBoundary = (value: string): boolean => value.length === 0 || /[=(,+\-*/^&\s]/.test(value)

const getFormulaContexts = (input: string): FormulaContext[] => {
  const contexts: FormulaContext[] = []
  const stack: Array<{ openIndex: number; commas: number[]; functionName: string | null }> = []
  let inString = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char === '"') {
      if (inString && input[index + 1] === '"') {
        index += 1
        continue
      }
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '(') {
      const fnMatch = input.slice(0, index).match(/([A-Za-z_][A-Za-z0-9_.]*)\s*$/)
      stack.push({
        openIndex: index,
        commas: [],
        functionName: fnMatch?.[1]?.toUpperCase() ?? null,
      })
      continue
    }
    if (char === ',' && stack.length > 0) {
      stack[stack.length - 1].commas.push(index)
      continue
    }
    if (char === ')' && stack.length > 0) {
      const context = stack.pop()
      if (context) {
        contexts.push({ ...context, closeIndex: index })
      }
    }
  }

  while (stack.length > 0) {
    const context = stack.pop()
    if (context) {
      contexts.push({ ...context, closeIndex: input.length })
    }
  }

  return contexts
}

const getActiveFormulaContext = (input: string, cursorIndex: number): FormulaContext | null => {
  const clampedCursor = Math.max(0, Math.min(cursorIndex, input.length))
  return getFormulaContexts(input)
    .filter(context => clampedCursor > context.openIndex && clampedCursor <= context.closeIndex)
    .sort((left, right) => left.openIndex - right.openIndex)
    .slice(-1)[0] ?? null
}

export function hasFormulaReferenceToken(input: string, reference: string): boolean {
  if (!reference) return false
  return Array.from(input.matchAll(createFormulaReferencePattern())).some(match => match[0] === reference)
}

export function getFormulaArgumentSlotAtCursor(
  input: string,
  cursorIndex = input.length,
): FormulaArgumentSlot | null {
  if (!isFormulaInputMode(input)) return null

  const clampedCursor = Math.max(0, Math.min(cursorIndex, input.length))
  const activeContext = getActiveFormulaContext(input, clampedCursor)

  if (!activeContext) return null

  const boundaries = [activeContext.openIndex, ...activeContext.commas, activeContext.closeIndex]
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index] + 1
    const end = boundaries[index + 1]
    if (clampedCursor >= start && clampedCursor <= end) {
      return {
        argumentIndex: index + 1,
        start,
        end,
      }
    }
  }

  return null
}

export function getFormulaFunctionHintAtCursor(
  input: string,
  cursorIndex = input.length,
): FormulaFunctionHint | null {
  const activeContext = getActiveFormulaContext(input, cursorIndex)
  if (!activeContext?.functionName) return null

  const slot = getFormulaArgumentSlotAtCursor(input, cursorIndex)
  const argumentIndex = slot?.argumentIndex ?? Math.max(1, activeContext.commas.length + 1)
  const args = KNOWN_FORMULA_SIGNATURES[activeContext.functionName]
    ?? Array.from({ length: Math.max(argumentIndex, activeContext.commas.length + 1) }, (_, index) => `arg${index + 1}`)

  return {
    functionName: activeContext.functionName,
    argumentIndex,
    arguments: args,
  }
}

const findFormulaReferenceAtCursor = (input: string, cursorIndex: number) => {
  const matches = Array.from(input.matchAll(createFormulaReferencePattern()))
  const clampedCursor = Math.max(0, Math.min(cursorIndex, input.length))

  for (const match of matches) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (clampedCursor >= start && clampedCursor <= end) {
      return { start, end }
    }
  }

  let previousMatch: { start: number; end: number } | null = null
  for (const match of matches) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (end > clampedCursor) break
    previousMatch = { start, end }
  }

  if (previousMatch && input.slice(previousMatch.end, clampedCursor).trim().length === 0) {
    return previousMatch
  }

  return null
}

export function syncFormulaReferenceAtCursor(
  input: string,
  selectionRef: string,
  cursorIndex = input.length,
): FormulaReferenceSyncResult {
  if (!selectionRef || !isFormulaInputMode(input)) {
    return {
      value: input,
      selectionStart: cursorIndex,
      selectionEnd: cursorIndex,
    }
  }

  const argumentSlot = getFormulaArgumentSlotAtCursor(input, cursorIndex)
  const referenceRange = findFormulaReferenceAtCursor(input, cursorIndex)
  if (referenceRange) {
    const value = `${input.slice(0, referenceRange.start)}${selectionRef}${input.slice(referenceRange.end)}`
    const nextCursor = referenceRange.start + selectionRef.length
    return {
      value,
      selectionStart: nextCursor,
      selectionEnd: nextCursor,
    }
  }

  if (argumentSlot) {
    const slotValue = input.slice(argumentSlot.start, argumentSlot.end)
    if (slotValue.trim().length === 0) {
      const value = `${input.slice(0, argumentSlot.start)}${selectionRef}${input.slice(argumentSlot.end)}`
      const nextCursor = argumentSlot.start + selectionRef.length
      return {
        value,
        selectionStart: nextCursor,
        selectionEnd: nextCursor,
      }
    }
  }

  const clampedCursor = Math.max(0, Math.min(cursorIndex, input.length))
  const prefix = input.slice(0, clampedCursor)
  const suffix = input.slice(clampedCursor)
  const prevChar = prefix.slice(-1)
  if (isFormulaInsertionBoundary(prevChar)) {
    const value = `${prefix}${selectionRef}${suffix}`
    const nextCursor = prefix.length + selectionRef.length
    return {
      value,
      selectionStart: nextCursor,
      selectionEnd: nextCursor,
    }
  }

  const value = `${input}${selectionRef}`
  return {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
  }
}

export function syncFormulaReference(input: string, selectionRef: string): string {
  return syncFormulaReferenceAtCursor(input, selectionRef).value
}
