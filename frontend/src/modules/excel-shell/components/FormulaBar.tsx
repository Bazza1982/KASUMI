import React from 'react'
import { useExcelStore } from '../stores/useExcelStore'

const FormulaBar = () => {
  const { activeCell, sheet, isEditing, editValue, setEditValue, enterEdit, exitEdit, getCellDisplay } = useExcelStore()

  const displayValue = isEditing
    ? editValue
    : activeCell
      ? getCellDisplay(activeCell.rowIndex, activeCell.colIndex)
      : ''

  const colLetter = (colIndex: number): string => {
    let label = '', n = colIndex
    while (n >= 0) { label = String.fromCharCode(65 + (n % 26)) + label; n = Math.floor(n / 26) - 1 }
    return label
  }

  const activeRef = activeCell
    ? `${colLetter(activeCell.colIndex)}${activeCell.rowIndex + 1}`
    : ''

  const activeFieldName = activeCell ? (sheet?.fields[activeCell.colIndex]?.name ?? '') : ''

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      exitEdit(true)
    } else if (e.key === 'Escape') {
      exitEdit(false)
    }
  }

  const handleFocus = () => {
    if (!isEditing) enterEdit()
  }

  return (
    <div style={{ height: '32px', backgroundColor: 'white', borderBottom: '1px solid #e1dfdd', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '14px' }}>
      <div style={{ width: '180px', borderRight: '1px solid #e1dfdd', padding: '0 8px', color: '#444', display: 'flex', alignItems: 'center', height: '100%', overflow: 'hidden', whiteSpace: 'nowrap', gap: 6 }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#217346', flexShrink: 0 }}>{activeRef}</span>
        {activeFieldName && <span style={{ fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {activeFieldName}</span>}
      </div>
      <div style={{ padding: '0 8px', color: '#ccc', fontSize: '13px' }}>fx</div>
      <input
        style={{ flex: 1, border: 'none', outline: 'none', padding: '0 8px', fontFamily: 'inherit', fontSize: '13px', color: isEditing ? '#000' : '#444' }}
        value={displayValue}
        onChange={e => { if (isEditing) setEditValue(e.target.value) }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      />
    </div>
  )
}

export default FormulaBar
