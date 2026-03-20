import React, { useMemo } from 'react'
import { useExcelStore } from '../stores/useExcelStore'

const StatusBar = () => {
  const statusText = useExcelStore(s => s.statusText)
  const selection = useExcelStore(s => s.selection)
  const sheet = useExcelStore(s => s.sheet)
  const searchText = useExcelStore(s => s.searchText)
  const sortConfig = useExcelStore(s => s.sortConfig)

  const analytics = useMemo(() => {
    if (!selection || !sheet) return null
    const minRow = Math.min(selection.startRow, selection.endRow)
    const maxRow = Math.max(selection.startRow, selection.endRow)
    const minCol = Math.min(selection.startCol, selection.endCol)
    const maxCol = Math.max(selection.startCol, selection.endCol)

    const totalCells = (maxRow - minRow + 1) * (maxCol - minCol + 1)
    if (totalCells === 1) return null  // No analytics for single cell

    const nums: number[] = []
    for (let r = minRow; r <= maxRow; r++) {
      const row = sheet.rows[r]
      if (!row) continue
      for (let c = minCol; c <= maxCol; c++) {
        const field = sheet.fields[c]
        if (!field || field.type !== 'number') continue
        const val = row.fields[field.id]
        const n = parseFloat(String(val))
        if (!isNaN(n)) nums.push(n)
      }
    }

    if (nums.length === 0) return { count: totalCells }

    const sum = nums.reduce((a, b) => a + b, 0)
    const avg = sum / nums.length
    const min = Math.min(...nums)
    const max = Math.max(...nums)

    return { count: totalCells, sum, avg, min, max, numCount: nums.length }
  }, [selection, sheet])

  const selCount = selection
    ? (Math.abs(selection.endRow - selection.startRow) + 1) * (Math.abs(selection.endCol - selection.startCol) + 1)
    : 0

  const sortLabel = sortConfig && sheet
    ? `${sheet.fields[sortConfig.fieldIndex]?.name ?? ''} ${sortConfig.direction === 'asc' ? '▲' : '▼'}`
    : ''

  return (
    <div style={{
      height: '24px',
      backgroundColor: '#217346',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      fontSize: '12px',
      userSelect: 'none',
      gap: 16,
    }}>
      <span>{statusText}</span>
      <span style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: 0.9 }}>
        {analytics?.sum !== undefined && <span>Sum: {analytics.sum.toFixed(2)}</span>}
        {analytics?.avg !== undefined && <span>Avg: {analytics.avg.toFixed(2)}</span>}
        {analytics?.min !== undefined && <span>Min: {analytics.min}</span>}
        {analytics?.max !== undefined && <span>Max: {analytics.max}</span>}
        {analytics?.count !== undefined && selCount > 1 && <span>Count: {analytics.count}</span>}
        {sortLabel && <span>&#8597; {sortLabel}</span>}
        {searchText && <span>Filtered</span>}
        {sheet && <span>{sheet.rows.length} rows</span>}
      </span>
    </div>
  )
}

export default StatusBar
