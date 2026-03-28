/**
 * A1 notation utilities for NEXCEL MCP tools.
 *
 * NEXCEL uses:
 *   - column indices 1..26 mapped to fieldIds 1..26 (A=1, B=2 ... Z=26)
 *   - row indices starting at 1, mapped to row array position (row.id = index + 1 for a fresh sheet)
 *
 * A1 notation:
 *   "A1"    → col 1, row 1
 *   "C5"    → col 3, row 5
 *   "A1:C3" → cols 1-3, rows 1-3
 */

export function colLetterToIndex(letter: string): number {
  const upper = letter.toUpperCase()
  let result = 0
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64)
  }
  return result   // 1-based: A=1, Z=26
}

export function indexToColLetter(index: number): string {
  let result = ''
  let n = index
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

export interface CellCoord {
  col: number   // 1-based field index
  row: number   // 1-based row number
}

/** Parse "A1" → { col: 1, row: 1 } */
export function parseA1(ref: string): CellCoord | null {
  const m = ref.toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!m) return null
  return { col: colLetterToIndex(m[1]), row: parseInt(m[2], 10) }
}

export interface CellRange {
  startCol: number
  startRow: number
  endCol: number
  endRow: number
}

/** Parse "A1:C3" or "A1" → CellRange */
export function parseRange(range: string): CellRange | null {
  const parts = range.toUpperCase().split(':')
  if (parts.length === 1) {
    const c = parseA1(parts[0])
    if (!c) return null
    return { startCol: c.col, startRow: c.row, endCol: c.col, endRow: c.row }
  }
  if (parts.length === 2) {
    const s = parseA1(parts[0])
    const e = parseA1(parts[1])
    if (!s || !e) return null
    return {
      startCol: Math.min(s.col, e.col),
      startRow: Math.min(s.row, e.row),
      endCol:   Math.max(s.col, e.col),
      endRow:   Math.max(s.row, e.row),
    }
  }
  return null
}
