import React from 'react'
import { useExcelStore } from '../stores/useExcelStore'

const FormulaBar = () => {
  const { activeCell, sheet, isEditing, editValue, setEditValue, enterEdit, exitEdit, getCellDisplay } = useExcelStore()

  const displayValue = isEditing
    ? editValue
    : activeCell
      ? getCellDisplay(activeCell.rowIndex, activeCell.colIndex)
      : ''

  const getColName = (colIndex: number) => {
    const field = sheet?.fields[colIndex]
    if (field) return field.name
    let name = '', c = colIndex
    while (c >= 0) { name = String.fromCharCode(65 + (c % 26)) + name; c = Math.floor(c / 26) - 1 }
    return name
  }

  const activeRef = activeCell ? `${getColName(activeCell.colIndex)} : ${activeCell.rowIndex + 1}` : ''

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
      <div style={{ width: '180px', borderRight: '1px solid #e1dfdd', padding: '0 8px', color: '#444', display: 'flex', alignItems: 'center', height: '100%', fontSize: '13px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {activeRef}
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
