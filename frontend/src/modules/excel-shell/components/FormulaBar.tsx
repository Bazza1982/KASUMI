import React, { useEffect, useRef } from 'react'
import {
  getFormulaReferenceSelectionTarget,
  getEnterNavigationTarget,
  getFieldByVisibleCol,
  getTabNavigationTarget,
  getVisibleFields,
  useExcelStore,
} from '../stores/useExcelStore'
import {
  formatCellReference,
  getFormulaFunctionHintAtCursor,
  formatSelectionReference,
  hasFormulaReferenceToken,
  isFormulaInputMode,
  syncFormulaReferenceAtCursor,
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
    setSelectionState,
    setEditValue,
    setFormulaEditor,
    setFormulaSelection,
    enterEdit,
    exitEdit,
    getCellDisplay,
    anchorCell,
    formulaEditor,
    formulaSelectionEnd,
  } = useExcelStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const syncedFormulaRef = useRef<string | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)

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
  const formulaCursorIndex = formulaEditor ? formulaSelectionEnd : editValue.length
  const formulaHint = isEditing && isFormulaInputMode(editValue)
    ? getFormulaFunctionHintAtCursor(editValue, formulaCursorIndex)
    : null
  const formulaArgumentLabel = formulaHint ? `Arg ${formulaHint.argumentIndex}` : ''

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
    if (
      isEditing
      && isFormulaInputMode(editValue)
      && activeCell
      && rowCount > 0
      && colCount > 0
      && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    ) {
      e.preventDefault()
      const next = getFormulaReferenceSelectionTarget(
        activeCell,
        selection,
        anchorCell,
        e.key,
        e.shiftKey,
        rowCount,
        colCount,
      )
      setSelectionState(next.selection, next.activeCell, next.anchorCell)
      return
    }

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
    setFormulaEditor('formula-bar')
    rememberCursor()
    onSurfaceFocus?.()
  }

  const handleChange = (nextValue: string, selectionStart: number | null, selectionEnd: number | null) => {
    syncedFormulaRef.current = null
    if (!isEditing) {
      enterEdit(nextValue)
      const nextCursor = selectionEnd ?? nextValue.length
      setFormulaSelection(selectionStart ?? nextCursor, nextCursor)
      return
    }
    setEditValue(nextValue)
    setFormulaSelection(selectionStart ?? nextValue.length, selectionEnd ?? nextValue.length)
  }

  const rememberCursor = () => {
    const input = inputRef.current
    if (!input) return
    setFormulaSelection(input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length)
  }

  useEffect(() => {
    if (!autoFocus) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus])

  useEffect(() => {
    if (!pendingSelectionRef.current) return
    const nextSelection = pendingSelectionRef.current
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(nextSelection.start, nextSelection.end)
      setFormulaSelection(nextSelection.start, nextSelection.end)
    })
    pendingSelectionRef.current = null
    return () => window.cancelAnimationFrame(frame)
  }, [editValue])

  useEffect(() => {
    if (!isEditing || !isFormulaInputMode(editValue) || !selectionRef) {
      syncedFormulaRef.current = null
      return
    }

    if (syncedFormulaRef.current === selectionRef) return
    if (syncedFormulaRef.current === null && hasFormulaReferenceToken(editValue, selectionRef)) {
      syncedFormulaRef.current = selectionRef
      return
    }

    const cursorIndex = formulaEditor ? formulaSelectionEnd : editValue.length
    const nextValue = syncFormulaReferenceAtCursor(editValue, selectionRef, cursorIndex)
    syncedFormulaRef.current = selectionRef
    if (nextValue.value !== editValue) {
      pendingSelectionRef.current = {
        start: nextValue.selectionStart,
        end: nextValue.selectionEnd,
      }
      setFormulaSelection(nextValue.selectionStart, nextValue.selectionEnd)
      setEditValue(nextValue.value)
    }
  }, [editValue, formulaEditor, formulaSelectionEnd, isEditing, selectionRef, setEditValue, setFormulaSelection])

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
      <div style={{ padding: '0 8px', color: '#ccc', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>fx</span>
        {formulaArgumentLabel ? (
          <span style={{ color: '#217346', backgroundColor: '#eaf4ec', borderRadius: 999, padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>
            {formulaArgumentLabel}
          </span>
        ) : null}
        {formulaHint ? (
          <span style={{ color: '#555', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
            {formulaHint.functionName}
            {'('}
            {formulaHint.arguments.map((argument, index) => (
              <span key={`${formulaHint.functionName}-${argument}-${index}`} style={index + 1 === formulaHint.argumentIndex ? { color: '#217346', fontWeight: 700 } : undefined}>
                {index > 0 ? ', ' : ''}
                {argument}
              </span>
            ))}
            {')'}
          </span>
        ) : null}
      </div>
      <input
        ref={inputRef}
        data-testid="formula-bar-input"
        style={{ flex: 1, border: 'none', outline: 'none', padding: '0 8px', fontFamily: 'inherit', fontSize: '13px', color: isEditing ? '#000' : '#444' }}
        value={displayValue}
        onChange={e => handleChange(e.target.value, e.target.selectionStart, e.target.selectionEnd)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onClick={() => {
          rememberCursor()
        }}
        onKeyUp={() => {
          rememberCursor()
        }}
        onSelect={() => {
          rememberCursor()
        }}
      />
    </div>
  )
}

export default FormulaBar
