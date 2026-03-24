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

  const [zoom, setZoom] = React.useState(100)
  const [viewMode, setViewMode] = React.useState<'normal'|'layout'|'pagebreak'>('normal')

  return (
    <div style={{
      height: '24px',
      backgroundColor: '#217346',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 8px 0 12px',
      fontSize: '12px',
      userSelect: 'none',
      flexShrink: 0,
    }}>
      {/* Left — status + analytics */}
      <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span>{statusText}</span>
        {sheet && <span style={{ opacity: 0.8 }}>| {sheet.rows.length} rows</span>}
        {sortLabel && <span style={{ opacity: 0.8 }}>| &#8597; {sortLabel}</span>}
        {searchText && <span style={{ opacity: 0.8 }}>| Filtered</span>}
        {analytics?.sum !== undefined && <span style={{ opacity: 0.85 }}>| Sum: {analytics.sum.toFixed(2)}</span>}
        {analytics?.avg !== undefined && <span style={{ opacity: 0.85 }}>Avg: {analytics.avg.toFixed(2)}</span>}
        {analytics?.count !== undefined && selCount > 1 && <span style={{ opacity: 0.85 }}>Count: {analytics.count}</span>}
      </span>

      {/* Right — view switcher + zoom */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* View mode icons */}
        {([
          { key: 'normal',    label: '⊞', title: 'Normal View' },
          { key: 'layout',    label: '⊟', title: 'Page Layout' },
          { key: 'pagebreak', label: '⊠', title: 'Page Break Preview' },
        ] as const).map(v => (
          <button key={v.key} title={v.title} onClick={() => setViewMode(v.key)} style={{
            background: 'none', border: viewMode === v.key ? '1px solid rgba(255,255,255,0.6)' : 'none',
            borderRadius: 3, color: 'white', cursor: 'pointer',
            padding: '0 3px', fontSize: 13, lineHeight: '18px', opacity: viewMode === v.key ? 1 : 0.65,
          }}>{v.label}</button>
        ))}

        {/* Zoom slider */}
        <span style={{ opacity: 0.7, margin: '0 4px', fontSize: 11 }}>|</span>
        <input type="range" min={50} max={200} step={10} value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          style={{ width: 70, accentColor: '#fff', cursor: 'pointer' }}
        />
        <span style={{ minWidth: 36, textAlign: 'right', opacity: 0.9, fontSize: 11 }}>{zoom}%</span>
      </span>
    </div>
  )
}

export default StatusBar
