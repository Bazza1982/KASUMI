import React, { useEffect, useRef } from 'react'
import {
  getEnterNavigationTarget,
  getFieldByVisibleCol,
  getTabNavigationTarget,
  getVisibleFields,
  useExcelStore,
} from '../stores/useExcelStore'
import {
  formatCellReference,
  formatSelectionReference,
  isFormulaInputMode,
  syncFormulaReference,
} from '../utils/cellReferences'

interface FormulaBarProps {
  autoFocus?: boolean
  onSurfaceFocus?: () => void
  onNavigateToGrid?: () => void
}

const FormulaBar = ({ autoFocus = false, onSurfaceFocus, onNavigateToGrid }: FormulaBarProps) => {
  const {
    activeCell,
    selection,
    sheet,
    hiddenFieldIds,
    isEditing,
    editValue,
    setActiveCell,
    setEditValue,
    enterEdit,
    exitEdit,
    getCellDisplay,
  } = useExcelStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const syncedFormulaRef = useRef<string | null>(null)

  const displayValue = isEditing
    ? editValue
    : activeCell
      ? getCellDisplay(activeCell.rowIndex, activeCell.colIndex)
      : ''

  const selectionRef = formatSelectionReference(selection)
  const isRangeSelection = Boolean(
    selection
    && (selection.startRow !== selection.endRow || selection.startCol !== selection.endCol),
  )
  const activeRef = isRangeSelection
    ? selectionRef
    : activeCell
      ? formatCellReference(activeCell)
      : ''

  const activeFieldName = activeCell
    ? (getFieldByVisibleCol(sheet, hiddenFieldIds, activeCell.colIndex)?.name ?? '')
    : ''

  const rowCount = sheet?.rows.length ?? 0
  const colCount = getVisibleFields(sheet, hiddenFieldIds).length

  const moveSelection = (key: 'Enter' | 'Tab', backwards: boolean) => {
    if (!activeCell || rowCount <= 0 || colCount <= 0) {
      onNavigateToGrid?.()
      return
    }

    const next = key === 'Tab'
      ? getTabNavigationTarget(activeCell, backwards, selection, rowCount, colCount)
      : getEnterNavigationTarget(activeCell, backwards, selection, rowCount)

    setActiveCell(next.rowIndex, next.colIndex)
    onNavigateToGrid?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      exitEdit(true)
      moveSelection(e.key, e.shiftKey)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      exitEdit(false)
      onNavigateToGrid?.()
    }
  }

  const handleFocus = () => {
    onSurfaceFocus?.()
  }

  const handleChange = (nextValue: string) => {
    syncedFormulaRef.current = null
    if (!isEditing) {
      enterEdit(nextValue)
      return
    }
    setEditValue(nextValue)
  }

  useEffect(() => {
    if (!autoFocus) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus])

  useEffect(() => {
    if (!isEditing || !isFormulaInputMode(editValue) || !selectionRef) {
      syncedFormulaRef.current = null
      return
    }

    if (syncedFormulaRef.current === selectionRef) return

    const nextValue = syncFormulaReference(editValue, selectionRef)
    syncedFormulaRef.current = selectionRef
    if (nextValue !== editValue) {
      setEditValue(nextValue)
    }
  }, [editValue, isEditing, selectionRef, setEditValue])

  const selectionSummary = selection
    ? `${Math.abs(selection.endRow - selection.startRow) + 1}R x ${Math.abs(selection.endCol - selection.startCol) + 1}C`
    : ''

  return (
    <div style={{ height: '32px', backgroundColor: 'white', borderBottom: '1px solid #e1dfdd', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '14px' }}>
      <div style={{ width: '180px', borderRight: '1px solid #e1dfdd', padding: '0 8px', color: '#444', display: 'flex', alignItems: 'center', height: '100%', overflow: 'hidden', whiteSpace: 'nowrap', gap: 6 }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#217346', flexShrink: 0 }}>{activeRef}</span>
        {isRangeSelection ? (
          <span style={{ fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {selectionSummary}</span>
        ) : (
          activeFieldName && <span style={{ fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {activeFieldName}</span>
        )}
      </div>
      <div style={{ padding: '0 8px', color: '#ccc', fontSize: '13px' }}>fx</div>
      <input
        ref={inputRef}
        style={{ flex: 1, border: 'none', outline: 'none', padding: '0 8px', fontFamily: 'inherit', fontSize: '13px', color: isEditing ? '#000' : '#444' }}
        value={displayValue}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      />
    </div>
  )
}

export default FormulaBar
