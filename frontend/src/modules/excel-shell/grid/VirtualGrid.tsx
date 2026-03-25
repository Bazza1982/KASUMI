import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useExcelStore } from '../stores/useExcelStore'
import { useCellFormatStore } from '../stores/useCellFormatStore'
import { useConditionalFormatStore } from '../stores/useConditionalFormatStore'
import { useCommentStore } from '../stores/useCommentStore'
import { renderCellValue, getSelectOptionStyle } from './renderers'
import type { FieldMeta, GridCoord, SelectOption } from '../types'
import { NexcelLogger } from '../services/logger'
import CellHistoryPanel from '../components/CellHistoryPanel'

// ── Duration helper ───────────────────────────────────────────────────────────

function parseDuration(input: string): number {
  const s = input.trim().toLowerCase()
  // "1:30:00" or "30:00" or "90:00"
  if (/^\d+:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(':').map(Number)
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)
    return (parts[0] || 0) * 60 + (parts[1] || 0)
  }
  // "2h30m", "90m", "45s", "1h", "2h 30m 10s"
  let total = 0
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/)
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*m/)
  const sMatch = s.match(/(\d+(?:\.\d+)?)\s*s/)
  if (hMatch) total += parseFloat(hMatch[1]) * 3600
  if (mMatch) total += parseFloat(mMatch[1]) * 60
  if (sMatch) total += parseFloat(sMatch[1])
  if (total > 0) return Math.round(total)
  // Fallback: plain number is seconds
  const n = parseFloat(s)
  return isNaN(n) ? 0 : Math.round(n)
}

const ROW_HEADER_WIDTH = 50
const COL_HEADER_HEIGHT = 44
const DEFAULT_COL_WIDTH = 110

// Convert 0-based column index to Excel-style letter(s): 0→A, 25→Z, 26→AA …
function colLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}
const DEFAULT_ROW_HEIGHT = 24

// ── SelectChip ────────────────────────────────────────────────────────────────

function SelectChip({ value }: { value: unknown }) {
  if (!value) return null
  const sel = value as { value?: string; color?: string }
  if (!sel.value) return null
  return (
    <span style={getSelectOptionStyle(sel.color || 'gray')}>
      {sel.value}
    </span>
  )
}

// ── SelectDropdown ────────────────────────────────────────────────────────────

function SelectDropdown({
  rowIndex,
  field,
  pos,
  onClose,
}: {
  rowIndex: number
  field: FieldMeta
  pos: { top: number; left: number }
  onClose: () => void
}) {
  const { commitCellByField } = useExcelStore()
  const options = field.selectOptions ?? []

  return (
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 1000,
        backgroundColor: 'white',
        border: '1px solid #e1dfdd',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        minWidth: 120,
        maxHeight: 200,
        overflowY: 'auto',
      }}
    >
      <div
        style={{ padding: '6px 12px', cursor: 'pointer', color: '#999', fontSize: '13px' }}
        onMouseDown={() => { commitCellByField(rowIndex, field.id, null); onClose() }}
      >
        (clear)
      </div>
      {options.map(opt => (
        <div
          key={opt.id}
          style={{
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onMouseDown={() => {
            commitCellByField(rowIndex, field.id, { id: opt.id, value: opt.value, color: opt.color })
            onClose()
          }}
        >
          <span style={{ ...getSelectOptionStyle(opt.color), flexShrink: 0 }}>{opt.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── MultiSelectDropdown ───────────────────────────────────────────────────────

function MultiSelectDropdown({
  rowIndex,
  field,
  pos,
  onClose,
}: {
  rowIndex: number
  field: FieldMeta
  pos: { top: number; left: number }
  onClose: () => void
}) {
  const { commitCellByField, sheet } = useExcelStore()
  const options = field.selectOptions ?? []
  const rawValue = sheet?.rows[rowIndex]?.fields[field.id]
  const current = Array.isArray(rawValue) ? rawValue as Array<{ id: number; value: string; color: string }> : []
  const selectedIds = new Set(current.map(s => s.id))

  const toggle = (opt: SelectOption) => {
    const newSelected = selectedIds.has(opt.id)
      ? current.filter(s => s.id !== opt.id)
      : [...current, opt]
    commitCellByField(rowIndex, field.id, newSelected)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 1000,
        backgroundColor: 'white',
        border: '1px solid #e1dfdd',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        minWidth: 120,
        maxHeight: 200,
        overflowY: 'auto',
      }}
    >
      {options.map(opt => (
        <div
          key={opt.id}
          onMouseDown={() => toggle(opt)}
          style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '13px' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f2f1')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span style={{
            width: 14, height: 14, borderRadius: 2,
            backgroundColor: selectedIds.has(opt.id) ? '#217346' : 'transparent',
            border: '2px solid #217346',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', color: 'white', flexShrink: 0,
          }}>
            {selectedIds.has(opt.id) ? '✓' : ''}
          </span>
          <span style={getSelectOptionStyle(opt.color)}>{opt.value}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #e1dfdd', margin: '4px 0' }} />
      <div
        onMouseDown={() => { commitCellByField(rowIndex, field.id, []); onClose() }}
        style={{ padding: '6px 12px', cursor: 'pointer', color: '#999', fontSize: '12px' }}
      >
        Clear all
      </div>
    </div>
  )
}

// ── CellContent ───────────────────────────────────────────────────────────────

function CellContent({
  rowIndex,
  field,
  isSelectEditing: _isSelectEditing,
}: {
  rowIndex: number
  field: FieldMeta | null
  isSelectEditing: boolean
}) {
  const { sheet, isEditing, activeCell, editValue, setEditValue, commitCellByField: _commitCellByField } = useExcelStore()
  const isActive = activeCell?.rowIndex === rowIndex && activeCell?.colIndex !== undefined

  // We need the colIndex match — passed in via field comparison with activeCell
  // activeCell.colIndex is the visible col index; we check by field identity
  const isActiveCell = isActive && field !== null && activeCell?.colIndex !== undefined

  // For "isActive" in editing context, rely on the parent passing correct field
  if (isActiveCell && isEditing) {
    if (field?.type === 'single_select') {
      const raw = sheet?.rows[rowIndex]?.fields[field.id]
      return (
        <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}>
          <SelectChip value={raw} />
        </div>
      )
    }
    if (field?.type === 'multiple_select') {
      const raw = sheet?.rows[rowIndex]?.fields[field.id]
      const current = Array.isArray(raw) ? raw as Array<{ id: number; value: string; color: string }> : []
      return (
        <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {current.map(sel => <SelectChip key={sel.id} value={sel} />)}
        </div>
      )
    }
    if (field?.type === 'date') {
      return (
        <input
          type="date"
          autoFocus
          style={{ width: '100%', height: '100%', border: 'none', outline: 'none', padding: '0 4px', fontFamily: 'inherit', fontSize: '13px' }}
          value={editValue.substring(0, 10)}
          onChange={e => setEditValue(e.target.value)}
          onPointerDown={e => e.stopPropagation()}
        />
      )
    }
    if (field?.type === 'number') {
      return (
        <input
          type="number"
          autoFocus
          style={{ width: '100%', height: '100%', border: 'none', outline: 'none', padding: '0 4px', fontFamily: 'inherit', fontSize: '13px', textAlign: 'right' }}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          step={field.numberDecimalPlaces ? `0.${'0'.repeat(field.numberDecimalPlaces - 1)}1` : '1'}
          onPointerDown={e => e.stopPropagation()}
        />
      )
    }
    if (field?.type === 'duration') {
      return (
        <input
          autoFocus
          placeholder="e.g. 2h30m or 1:30:00"
          style={{ width: '100%', height: '100%', border: 'none', outline: 'none', padding: '0 4px', fontFamily: 'inherit', fontSize: '13px' }}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => {
            // Parse duration on blur and commit
            const seconds = parseDuration(editValue)
            const { activeCell: ac } = useExcelStore.getState()
            if (ac && field) {
              useExcelStore.getState().commitCellByField(ac.rowIndex, field.id, seconds)
            }
          }}
          onPointerDown={e => e.stopPropagation()}
        />
      )
    }
    if (field?.type === 'rating') {
      const rawRating = sheet?.rows[rowIndex]?.fields[field.id]
      const currentRating = typeof rawRating === 'number' ? rawRating : parseInt(String(rawRating ?? 0), 10)
      return (
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', gap: 2 }}>
          {[1, 2, 3, 4, 5].map(star => (
            <span
              key={star}
              style={{ fontSize: '16px', cursor: 'pointer', color: star <= currentRating ? '#f59e0b' : '#ddd', lineHeight: 1, userSelect: 'none' }}
              onMouseDown={e => {
                e.preventDefault()
                e.stopPropagation()
                useExcelStore.getState().commitCellByField(rowIndex, field.id, star)
              }}
            >
              {star <= currentRating ? '★' : '☆'}
            </span>
          ))}
        </div>
      )
    }
    return (
      <input
        autoFocus
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          outline: 'none',
          padding: '0 4px',
          fontFamily: 'inherit',
          fontSize: '13px',
          backgroundColor: 'transparent',
        }}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onPointerDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
      />
    )
  }

  if (!field || !sheet) {
    const raw = field && sheet ? sheet.rows[rowIndex]?.fields[field.id] : undefined
    const display = raw !== undefined && field ? renderCellValue(raw, field) : ''
    return <span style={{ padding: '0 4px', fontSize: '13px' }}>{display}</span>
  }

  const raw = sheet.rows[rowIndex]?.fields[field.id]
  const display = renderCellValue(raw, field)

  if (field.type === 'single_select') {
    return (
      <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}>
        <SelectChip value={raw} />
      </div>
    )
  }

  if (field.type === 'multiple_select') {
    const current = Array.isArray(raw) ? raw as Array<{ id: number; value: string; color: string }> : []
    return (
      <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', overflow: 'hidden' }}>
        {current.map(sel => <SelectChip key={sel.id} value={sel} />)}
      </div>
    )
  }

  if (field.type === 'boolean') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <span style={{ fontSize: '16px', color: raw ? '#217346' : '#ccc' }}>{raw ? '☑' : '☐'}</span>
      </div>
    )
  }

  if (field.type === 'link_row') {
    const links = Array.isArray(raw) ? raw as Array<{ id?: number; value?: string }> : []
    if (!links.length) return <span style={{ padding: '0 4px', fontSize: '13px' }} />
    return (
      <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
        {links.map((l, i) => (
          <span
            key={l.id ?? i}
            style={{
              backgroundColor: '#e8eaf6',
              borderRadius: 10,
              padding: '1px 7px',
              fontSize: '11px',
              color: '#3949ab',
              whiteSpace: 'nowrap',
              maxWidth: 80,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flexShrink: 0,
            }}
          >
            {l.value || String(l.id || '')}
          </span>
        ))}
      </div>
    )
  }

  if (field.type === 'rating') {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? 0), 10)
    const clamped = Math.max(0, Math.min(5, isNaN(n) ? 0 : Math.round(n)))
    return (
      <span style={{ padding: '0 4px', fontSize: '14px', letterSpacing: '1px', color: '#f59e0b' }}>
        {'★'.repeat(clamped)}
        <span style={{ color: '#ddd' }}>{'☆'.repeat(5 - clamped)}</span>
      </span>
    )
  }

  return (
    <span
      style={{
        padding: '0 4px',
        fontSize: '13px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%',
        color: field.type === 'number' ? '#1a1a2e' : undefined,
        textAlign: field.type === 'number' ? 'right' : 'left',
      }}
    >
      {display}
    </span>
  )
}

// ── VirtualGrid ───────────────────────────────────────────────────────────────

const VirtualGrid = () => {
  const parentRef = useRef<HTMLDivElement>(null)
  const colHeadersInnerRef = useRef<HTMLDivElement>(null)
  const rowHeadersRef = useRef<HTMLDivElement>(null)
  const cornerRef = useRef<HTMLDivElement>(null)

  // Column widths state + ref for non-stale access in callbacks
  const [colWidths, setColWidths] = useState<Record<number, number>>({})
  const colWidthsRef = useRef<Record<number, number>>({})

  // Resize drag state
  const resizingRef = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null)
  // Track whether a resize just happened so header click doesn't trigger sort
  const isResizingActiveRef = useRef(false)

  // Dropdown for single_select / multiple_select editing
  const [dropdownTarget, setDropdownTarget] = useState<{
    rowIndex: number
    field: FieldMeta
    fieldType: 'single_select' | 'multiple_select'
    pos: { top: number; left: number }
  } | null>(null)

  // Fill handle drag state
  const [fillDrag, setFillDrag] = useState<{
    srcStartRow: number; srcStartCol: number; srcEndRow: number; srcEndCol: number
    dstEndRow: number; dstEndCol: number
    active: boolean
  } | null>(null)

  // Cell context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    rowIndex: number
    colIndex: number
  } | null>(null)

  // Cell history panel
  const [historyCellRef, setHistoryCellRef] = useState<string | null>(null)

  // Column header context menu
  const [colHeaderCtxMenu, setColHeaderCtxMenu] = useState<{
    fieldIndex: number
    x: number
    y: number
  } | null>(null)

  const {
    sheet,
    activeCell,
    selection,
    anchorCell,
    isEditing,
    editValue,
    searchText,
    sortConfig,
    frozenColCount,
    hiddenFieldIds,
    setActiveCell,
    setSelection,
    setAnchor,
    enterEdit,
    exitEdit,
    clearCells,
    pasteGrid,
    loadTables,
    deleteSelectedRows,
    insertRowAt,
    toggleSort,
    undo,
    redo,
    fillRange,
    toggleFreezeFirstCol,
    toggleHideColumn,
    showAllColumns,
    commitCellByField,
    cutSelection,
  } = useExcelStore()

  const { getFormat } = useCellFormatStore()
  const { evaluateCell: evaluateConditionalFormat } = useConditionalFormatStore()
  const { hasCellComment } = useCommentStore()

  NexcelLogger.grid('debug', 'render', { rows: sheet?.rows.length ?? 0 })

  // Initial data load
  useEffect(() => { loadTables() }, [])

  // Compute visible fields (excluding hidden)
  const visibleFields = useMemo(() => {
    if (!sheet) return []
    if (hiddenFieldIds.length === 0) return sheet.fields
    return sheet.fields.filter(f => !hiddenFieldIds.includes(f.id))
  }, [sheet, hiddenFieldIds])

  // Filtered row indices - maps virtualizer index -> actual sheet.rows index
  const filteredIndices = useMemo(() => {
    if (!sheet) return []

    // Step 1: filter
    let indices = sheet.rows.map((_, i) => i)
    if (searchText.trim()) {
      const q = searchText.toLowerCase()
      indices = indices.filter(i =>
        sheet.fields.some(field => {
          const val = renderCellValue(sheet.rows[i].fields[field.id] ?? '', field)
          return val.toLowerCase().includes(q)
        })
      )
    }

    // Step 2: sort (use original field index for sort config)
    if (sortConfig !== null) {
      const field = sheet.fields[sortConfig.fieldIndex]
      if (field) {
        indices = [...indices].sort((a, b) => {
          const va = renderCellValue(sheet.rows[a].fields[field.id] ?? '', field)
          const vb = renderCellValue(sheet.rows[b].fields[field.id] ?? '', field)
          const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' })
          return sortConfig.direction === 'asc' ? cmp : -cmp
        })
      }
    }

    return indices
  }, [sheet, searchText, sortConfig])

  const rowCount = filteredIndices.length
  const colCount = visibleFields.length

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => DEFAULT_ROW_HEIGHT,
    overscan: 10,
  })

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: colCount,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((i: number) => colWidthsRef.current[i] ?? DEFAULT_COL_WIDTH, []),
    overscan: 5,
  })

  const scrollTo = useCallback((rowIndex: number, colIndex: number) => {
    if (rowIndex >= 0) rowVirtualizer.scrollToIndex(rowIndex, { align: 'auto' })
    if (colIndex >= 0) columnVirtualizer.scrollToIndex(colIndex, { align: 'auto' })
  }, [rowVirtualizer, columnVirtualizer])

  // Compute the left offset for frozen columns (sum of widths before index)
  const getFrozenLeft = useCallback((visibleColIndex: number) => {
    let left = ROW_HEADER_WIDTH
    for (let i = 0; i < visibleColIndex; i++) {
      left += colWidthsRef.current[i] ?? DEFAULT_COL_WIDTH
    }
    return left
  }, [])

  // ── Horizontal scroll sync ─────────────────────────────────────────────────

  const handleBodyScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    if (colHeadersInnerRef.current) {
      colHeadersInnerRef.current.style.left = `${-el.scrollLeft}px`
    }
    if (rowHeadersRef.current) {
      rowHeadersRef.current.style.left = `${el.scrollLeft}px`
    }
  }, [])

  // ── Column resize ─────────────────────────────────────────────────────────

  const startResize = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startWidth = colWidthsRef.current[colIndex] ?? DEFAULT_COL_WIDTH
    resizingRef.current = { colIndex, startX: e.clientX, startWidth }
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      isResizingActiveRef.current = true
      const newWidth = Math.max(40, r.startWidth + e.clientX - r.startX)
      colWidthsRef.current = { ...colWidthsRef.current, [r.colIndex]: newWidth }
      setColWidths({ ...colWidthsRef.current })
      columnVirtualizer.measure()
    }
    const onMouseUp = () => {
      resizingRef.current = null
      // Reset after a tick so the click event (fired after mouseup) sees the flag
      setTimeout(() => { isResizingActiveRef.current = false }, 0)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [columnVirtualizer])

  // ── Auto-fit column width ─────────────────────────────────────────────────

  const autoFitColumn = useCallback((fieldIndex: number) => {
    if (!sheet) return
    const field = visibleFields[fieldIndex]
    if (!field) return

    const headerLen = field.name.length
    const maxContentLen = Math.min(
      50,
      Math.max(
        0,
        ...sheet.rows.slice(0, 100).map(row => {
          const val = renderCellValue(row.fields[field.id], field)
          return val.length
        })
      )
    )
    const maxLen = Math.max(headerLen, maxContentLen)
    const newWidth = Math.max(60, Math.min(300, maxLen * 8 + 16))

    colWidthsRef.current = { ...colWidthsRef.current, [fieldIndex]: newWidth }
    setColWidths({ ...colWidthsRef.current })
    columnVirtualizer.measure()
  }, [sheet, visibleFields, columnVirtualizer])

  // ── Copy selection ────────────────────────────────────────────────────────

  const copySelection = useCallback(() => {
    const { selection: sel, sheet: s } = useExcelStore.getState()
    if (!sel || !s) return
    const minRow = Math.min(sel.startRow, sel.endRow)
    const maxRow = Math.max(sel.startRow, sel.endRow)
    const minCol = Math.min(sel.startCol, sel.endCol)
    const maxCol = Math.max(sel.startCol, sel.endCol)

    const lines: string[] = []
    for (let r = minRow; r <= maxRow; r++) {
      const cells: string[] = []
      for (let c = minCol; c <= maxCol; c++) {
        const field = visibleFields[c]
        if (!field) { cells.push(''); continue }
        const row = s.rows[r]
        cells.push(row ? renderCellValue(row.fields[field.id], field) : '')
      }
      lines.push(cells.join('\t'))
    }
    navigator.clipboard.writeText(lines.join('\n'))
  }, [visibleFields])

  // ── Context menu ──────────────────────────────────────────────────────────

  useEffect(() => {
    const close = () => {
      setContextMenu(null)
      setColHeaderCtxMenu(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const handleContextMenu = useCallback((rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    setActiveCell(rowIndex, colIndex)
    setContextMenu({ x: e.clientX, y: e.clientY, rowIndex, colIndex })
  }, [setActiveCell])

  const handleColHeaderContextMenu = useCallback((fieldIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setColHeaderCtxMenu({ fieldIndex, x: e.clientX, y: e.clientY })
  }, [])

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isEditing) return
      const text = e.clipboardData?.getData('text')
      if (!text || !activeCell) return
      e.preventDefault()
      const rows = text.split(/\r?\n/).filter(r => r.length > 0).map(r => r.split('\t'))
      pasteGrid(activeCell.rowIndex, activeCell.colIndex, rows)
      useExcelStore.getState().clearCutAfterPaste()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing) {
        if (e.key === 'Enter') {
          e.preventDefault()
          exitEdit(true)
          if (activeCell) {
            const next = Math.min(rowCount - 1, activeCell.rowIndex + 1)
            setActiveCell(next, activeCell.colIndex)
            scrollTo(next, activeCell.colIndex)
          }
        } else if (e.key === 'Tab') {
          e.preventDefault()
          exitEdit(true)
          if (activeCell) {
            const next = e.shiftKey
              ? Math.max(0, activeCell.colIndex - 1)
              : Math.min(colCount - 1, activeCell.colIndex + 1)
            setActiveCell(activeCell.rowIndex, next)
            scrollTo(activeCell.rowIndex, next)
          }
        } else if (e.key === 'Escape') {
          exitEdit(false)
          setDropdownTarget(null)
        }
        return
      }

      if (!activeCell) return
      let { rowIndex, colIndex } = activeCell
      const isShift = e.shiftKey

      switch (e.key) {
        case 'ArrowUp':    rowIndex = Math.max(0, rowIndex - 1); e.preventDefault(); break
        case 'ArrowDown':  rowIndex = Math.min(rowCount - 1, rowIndex + 1); e.preventDefault(); break
        case 'ArrowLeft':  colIndex = Math.max(0, colIndex - 1); e.preventDefault(); break
        case 'ArrowRight': colIndex = Math.min(colCount - 1, colIndex + 1); e.preventDefault(); break
        case 'Tab':
          e.preventDefault()
          colIndex = e.shiftKey ? Math.max(0, colIndex - 1) : Math.min(colCount - 1, colIndex + 1)
          setActiveCell(rowIndex, colIndex)
          scrollTo(rowIndex, colIndex)
          return
        case 'Enter':
          e.preventDefault()
          enterEdit()
          return
        case 'F2':
          e.preventDefault()
          enterEdit()
          return
        case 'Delete':
        case 'Backspace': {
          e.preventDefault()
          const { selection: sel } = useExcelStore.getState()
          if (sel) {
            const minRow = Math.min(sel.startRow, sel.endRow)
            const maxRow = Math.max(sel.startRow, sel.endRow)
            const minCol = Math.min(sel.startCol, sel.endCol)
            const maxCol = Math.max(sel.startCol, sel.endCol)
            const coords: GridCoord[] = []
            for (let r = minRow; r <= maxRow; r++) {
              for (let c = minCol; c <= maxCol; c++) {
                coords.push({ rowIndex: r, colIndex: c })
              }
            }
            clearCells(coords)
          }
          return
        }
        case 'Home':
          if (e.ctrlKey) {
            e.preventDefault()
            setActiveCell(0, 0)
            scrollTo(0, 0)
          } else {
            e.preventDefault()
            setActiveCell(activeCell.rowIndex, 0)
            scrollTo(activeCell.rowIndex, 0)
          }
          return
        case 'End':
          if (e.ctrlKey) {
            e.preventDefault()
            setActiveCell(rowCount - 1, colCount - 1)
            scrollTo(rowCount - 1, colCount - 1)
          } else {
            e.preventDefault()
            setActiveCell(activeCell.rowIndex, colCount - 1)
            scrollTo(activeCell.rowIndex, colCount - 1)
          }
          return
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (e.shiftKey) {
              redo()
            } else {
              undo()
            }
            return
          }
          break
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            redo()
            return
          }
          break
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            setAnchor(0, 0)
            setSelection(0, 0, rowCount - 1, colCount - 1)
            return
          }
          break
        case 'c':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            copySelection()
            return
          }
          break
        case 'x':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            useExcelStore.getState().cutCells()
            return
          }
          break
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            enterEdit(e.key)
          }
          return
      }

      if (isShift && anchorCell) {
        setSelection(anchorCell.rowIndex, anchorCell.colIndex, rowIndex, colIndex)
      } else {
        setActiveCell(rowIndex, colIndex)
      }
      scrollTo(rowIndex, colIndex)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('paste', handlePaste)
    }
  }, [activeCell, anchorCell, selection, isEditing, editValue, rowCount, colCount,
    setActiveCell, setSelection, setAnchor, enterEdit, exitEdit, clearCells, pasteGrid, scrollTo, copySelection, undo, redo])

  // ── Mouse ─────────────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((rowIndex: number, colIndex: number, field: FieldMeta | null, e: React.PointerEvent, _cellEl: HTMLElement | null) => {
    if (e.button !== 0) return
    if (isEditing) exitEdit(true)

    if (e.shiftKey && anchorCell) {
      setSelection(anchorCell.rowIndex, anchorCell.colIndex, rowIndex, colIndex)
    } else {
      setAnchor(rowIndex, colIndex)
      setActiveCell(rowIndex, colIndex)
    }

    // Boolean toggle on single click
    if (field?.type === 'boolean' && sheet) {
      const raw = sheet.rows[rowIndex]?.fields[field.id]
      commitCellByField(rowIndex, field.id, !raw)
      return
    }
  }, [isEditing, anchorCell, exitEdit, setSelection, setAnchor, setActiveCell, sheet, commitCellByField])

  const handlePointerEnter = useCallback((rowIndex: number, colIndex: number, e: React.PointerEvent) => {
    if (e.buttons === 1 && anchorCell) {
      setSelection(anchorCell.rowIndex, anchorCell.colIndex, rowIndex, colIndex)
    }
  }, [anchorCell, setSelection])

  const handleDoubleClick = useCallback((rowIndex: number, colIndex: number, field: FieldMeta | null, cellEl: HTMLElement | null) => {
    setActiveCell(rowIndex, colIndex)
    if (field?.type === 'single_select' || field?.type === 'multiple_select') {
      const rect = cellEl?.getBoundingClientRect()
      if (rect && field) {
        setDropdownTarget({ rowIndex, field, fieldType: field.type, pos: { top: rect.bottom, left: rect.left } })
      }
      enterEdit()
      return
    }
    enterEdit()
  }, [setActiveCell, enterEdit])

  const isSelected = (rowIndex: number, colIndex: number) => {
    if (!selection) return false
    const { startRow, endRow, startCol, endCol } = selection
    const minRow = Math.min(startRow, endRow), maxRow = Math.max(startRow, endRow)
    const minCol = Math.min(startCol, endCol), maxCol = Math.max(startCol, endCol)
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol
  }

  const isActiveCell = (r: number, c: number) => activeCell?.rowIndex === r && activeCell?.colIndex === c

  const closeDropdown = useCallback(() => {
    setDropdownTarget(null)
    exitEdit(false)
  }, [exitEdit])

  // ── Fill handle ────────────────────────────────────────────────────────────

  const getFillHandlePos = () => {
    if (!selection || isEditing) return null
    const endRow = Math.max(selection.startRow, selection.endRow)
    const endCol = Math.max(selection.startCol, selection.endCol)

    const vRow = rowVirtualizer.getVirtualItems().find(vr => filteredIndices[vr.index] === endRow)
    const vCol = columnVirtualizer.getVirtualItems().find(vc => vc.index === endCol)

    if (!vRow || !vCol) return null

    const colW = colWidths[endCol] ?? DEFAULT_COL_WIDTH
    return {
      top: vRow.start + vRow.size - 4,
      left: vCol.start + ROW_HEADER_WIDTH + colW - 4,
    }
  }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!fillDrag?.active) return
      const scrollEl = parentRef.current
      if (!scrollEl) return
      const rect = scrollEl.getBoundingClientRect()
      const x = e.clientX - rect.left + scrollEl.scrollLeft - ROW_HEADER_WIDTH
      const y = e.clientY - rect.top + scrollEl.scrollTop

      const colItem = columnVirtualizer.getVirtualItems().find(vc => {
        const w = colWidths[vc.index] ?? DEFAULT_COL_WIDTH
        return x >= vc.start && x < vc.start + w
      })
      const rowItem = rowVirtualizer.getVirtualItems().find(vr => y >= vr.start && y < vr.start + vr.size)

      if (colItem && rowItem) {
        const actualRow = filteredIndices[rowItem.index]
        const actualCol = colItem.index
        setFillDrag(prev => {
          if (!prev) return null
          const rowExt = actualRow - prev.srcEndRow
          const colExt = actualCol - prev.srcEndCol
          if (rowExt > 0 && rowExt >= colExt) {
            return { ...prev, dstEndRow: actualRow, dstEndCol: prev.srcEndCol }
          } else if (colExt > 0) {
            return { ...prev, dstEndRow: prev.srcEndRow, dstEndCol: actualCol }
          }
          return { ...prev, dstEndRow: prev.srcEndRow, dstEndCol: prev.srcEndCol }
        })
      }
    }

    const onMouseUp = async () => {
      if (!fillDrag?.active) return
      const { srcStartRow, srcStartCol, srcEndRow, srcEndCol, dstEndRow, dstEndCol } = fillDrag
      setFillDrag(null)
      if (dstEndRow > srcEndRow || dstEndCol > srcEndCol) {
        await fillRange(srcStartRow, srcStartCol, srcEndRow, srcEndCol, srcStartRow, srcStartCol, dstEndRow, dstEndCol)
        setSelection(srcStartRow, srcStartCol, dstEndRow, dstEndCol)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [fillDrag, filteredIndices, rowVirtualizer, columnVirtualizer, colWidths, fillRange, setSelection])

  if (!sheet || sheet.isLoading) {
    return (
      <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Skeleton header */}
        <div style={{ height: 24, display: 'flex', borderBottom: '2px solid #e1dfdd' }}>
          <div style={{ width: 50, flexShrink: 0, backgroundColor: '#f3f2f1' }} />
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{ width: 110, height: 24, backgroundColor: '#f3f2f1', borderRight: '1px solid #e1dfdd', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        {/* Skeleton rows */}
        {Array.from({ length: 15 }, (_, r) => (
          <div key={r} style={{ height: 24, display: 'flex', borderBottom: '1px solid #f3f2f1' }}>
            <div style={{ width: 50, flexShrink: 0, backgroundColor: '#f9f9f9', borderRight: '1px solid #e1dfdd' }} />
            {Array.from({ length: 8 }, (_, c) => (
              <div key={c} style={{
                width: 110, height: 24,
                borderRight: '1px solid #f3f2f1',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: 10, margin: '7px 8px',
                  backgroundColor: '#eeeeee',
                  borderRadius: 3,
                  width: r === 0 ? '70%' : `${40 + ((r * 7 + c * 13) % 45)}%`,
                  opacity: 0.7,
                }} />
              </div>
            ))}
          </div>
        ))}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#217346', fontSize: 14 }}>
          {sheet?.isLoading ? 'Loading data...' : 'No table selected'}
        </div>
      </div>
    )
  }

  if (sheet.error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#c00', fontSize: '14px' }}>
        Error: {sheet.error}
      </div>
    )
  }

  const totalColWidth = columnVirtualizer.getTotalSize()
  const totalRowHeight = rowVirtualizer.getTotalSize()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Column header bar - fixed, outside scroll container */}
      <div style={{
        display: 'flex',
        height: COL_HEADER_HEIGHT,
        flexShrink: 0,
        zIndex: 5,
        backgroundColor: '#f3f2f1',
        borderBottom: '2px solid #c8c6c4',
      }}>
        {/* Corner */}
        <div
          ref={cornerRef}
          style={{
            width: ROW_HEADER_WIDTH,
            flexShrink: 0,
            backgroundColor: '#f3f2f1',
            borderRight: '1px solid #e1dfdd',
          }}
        />
        {/* Column headers scroll container */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: COL_HEADER_HEIGHT }}>
          <div
            ref={colHeadersInnerRef}
            style={{ position: 'absolute', top: 0, left: 0, width: totalColWidth, height: COL_HEADER_HEIGHT }}
          >
            {columnVirtualizer.getVirtualItems().map(vc => {
              const field = visibleFields[vc.index]
              const isColActive = activeCell?.colIndex === vc.index
              const colW = colWidths[vc.index] ?? DEFAULT_COL_WIDTH
              const isFrozen = vc.index < frozenColCount
              // Frozen column headers are covered by the overlay; render non-frozen only
              if (isFrozen) return null
              return (
                <div
                  key={`ch-${vc.index}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: vc.start,
                    width: colW,
                    height: COL_HEADER_HEIGHT,
                    backgroundColor: isColActive ? '#e8f0e8' : '#f3f2f1',
                    borderRight: '1px solid #e1dfdd',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px 4px',
                    userSelect: 'none',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    gap: 1,
                  }}
                  onClick={() => { if (!isResizingActiveRef.current) toggleSort(vc.index) }}
                  onContextMenu={e => handleColHeaderContextMenu(vc.index, e)}
                >
                  <span style={{ fontSize: '11px', color: '#999', lineHeight: 1, letterSpacing: '0.5px', fontWeight: 500 }}>
                    {colLabel(vc.index)}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#222', lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center' }}>
                    {field?.name ?? ''}
                    {field?.readOnly && <span style={{ fontSize: '10px', marginLeft: 2, opacity: 0.6 }}>🔒</span>}
                    {sortConfig?.fieldIndex === vc.index && (
                      <span style={{ marginLeft: 3, fontSize: '10px', color: '#217346' }}>
                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </span>
                  {/* Resize handle */}
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      cursor: 'col-resize',
                      zIndex: 10,
                    }}
                    onMouseDown={e => startResize(vc.index, e)}
                  />
                </div>
              )
            })}
          </div>

          {/* Frozen column header overlay — always visible, covers frozen cols */}
          {frozenColCount > 0 && visibleFields.slice(0, frozenColCount).map((field, idx) => {
            const colW = colWidths[idx] ?? DEFAULT_COL_WIDTH
            const leftOffset = visibleFields.slice(0, idx).reduce((sum, _, i) => sum + (colWidths[i] ?? DEFAULT_COL_WIDTH), 0)
            const isColActive = activeCell?.colIndex === idx
            return (
              <div
                key={`fch-${idx}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: leftOffset,
                  width: colW,
                  height: COL_HEADER_HEIGHT,
                  backgroundColor: isColActive ? '#d0ecd0' : '#eaf4ea',
                  borderRight: idx === frozenColCount - 1 ? '2px solid #217346' : '1px solid #e1dfdd',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px 4px',
                  userSelect: 'none',
                  zIndex: 6,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  gap: 1,
                }}
                onClick={() => { if (!isResizingActiveRef.current) toggleSort(idx) }}
                onContextMenu={e => handleColHeaderContextMenu(idx, e)}
              >
                <span style={{ fontSize: '11px', color: '#5a8a5a', lineHeight: 1, letterSpacing: '0.5px', fontWeight: 500 }}>
                  {colLabel(idx)}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a4a1a', lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center' }}>
                  {field.name}
                  {field.readOnly && <span style={{ fontSize: '10px', marginLeft: 2, opacity: 0.6 }}>🔒</span>}
                  {sortConfig?.fieldIndex === idx && (
                    <span style={{ marginLeft: 3, fontSize: '10px', color: '#217346' }}>
                      {sortConfig.direction === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </span>
                {/* Resize handle */}
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    cursor: 'col-resize',
                    zIndex: 10,
                  }}
                  onMouseDown={e => startResize(idx, e)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Scrollable body */}
      <div
        ref={parentRef}
        style={{ flex: 1, overflow: 'auto', outline: 'none', backgroundColor: 'white', position: 'relative' }}
        tabIndex={0}
        onScroll={handleBodyScroll}
      >
        <div style={{
          height: totalRowHeight,
          width: totalColWidth + ROW_HEADER_WIDTH,
          position: 'relative',
        }}>

          {/* Row headers - stick to left via scroll offset */}
          <div
            ref={rowHeadersRef}
            style={{ position: 'absolute', top: 0, left: 0, width: ROW_HEADER_WIDTH, zIndex: 2 }}
          >
            {rowVirtualizer.getVirtualItems().map(vr => {
              const actualRowIndex = filteredIndices[vr.index]
              return (
                <div
                  key={`rh-${vr.index}`}
                  style={{
                    position: 'absolute',
                    top: vr.start,
                    left: 0,
                    width: ROW_HEADER_WIDTH,
                    height: vr.size,
                    backgroundColor: activeCell?.rowIndex === actualRowIndex ? '#e8f0e8' : '#f3f2f1',
                    borderRight: '1px solid #e1dfdd',
                    borderBottom: '1px solid #e1dfdd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: '#666',
                    userSelect: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  {actualRowIndex + 1}
                </div>
              )
            })}
          </div>

          {/* Cells */}
          {rowVirtualizer.getVirtualItems().map(vr => {
            const actualRowIndex = filteredIndices[vr.index]
            return columnVirtualizer.getVirtualItems().map(vc => {
              const field = visibleFields[vc.index] ?? null
              const active = isActiveCell(actualRowIndex, vc.index)
              const selected = isSelected(actualRowIndex, vc.index)
              const colW = colWidths[vc.index] ?? DEFAULT_COL_WIDTH
              const isSelectEditing = active && isEditing && (field?.type === 'single_select' || field?.type === 'multiple_select')
              const isFrozen = vc.index < frozenColCount

              const leftPos = isFrozen
                ? getFrozenLeft(vc.index)
                : vc.start + ROW_HEADER_WIDTH

              // Format and comment indicator
              const row = sheet?.rows[actualRowIndex]
              const cellRef = row && field ? `${row.id}:${field.id}` : null
              const manualFmt = cellRef ? getFormat(cellRef) : null
              const cellRawValue = row && field ? row.fields[field.id] : undefined
              const conditionalFmt = field ? evaluateConditionalFormat(field.id, cellRawValue) : null
              // Conditional format is the base; manual format overrides it
              const fmt = (conditionalFmt || manualFmt)
                ? { ...conditionalFmt, ...manualFmt } as import('../stores/useCellFormatStore').CellFormat
                : null
              const hasComment = cellRef ? hasCellComment(cellRef) : false

              // Check if cell is in cut selection (for dashed border visual)
              const isCut = cutSelection !== null && (() => {
                const minCutRow = Math.min(cutSelection.startRow, cutSelection.endRow)
                const maxCutRow = Math.max(cutSelection.startRow, cutSelection.endRow)
                const minCutCol = Math.min(cutSelection.startCol, cutSelection.endCol)
                const maxCutCol = Math.max(cutSelection.startCol, cutSelection.endCol)
                return actualRowIndex >= minCutRow && actualRowIndex <= maxCutRow &&
                  vc.index >= minCutCol && vc.index <= maxCutCol
              })()

              return (
                <div
                  key={`c-${vr.index}-${vc.index}`}
                  style={{
                    position: isFrozen ? 'sticky' : 'absolute',
                    top: vr.start,
                    left: leftPos,
                    width: colW,
                    height: vr.size,
                    borderRight: isFrozen && vc.index === frozenColCount - 1
                      ? '2px solid #217346'
                      : '1px solid #e1dfdd',
                    borderBottom: '1px solid #e1dfdd',
                    backgroundColor: fmt?.bgColor ?? (selected && !active
                      ? (isFrozen ? '#c8dbc8' : '#d9e8d9')
                      : (isFrozen ? '#f9fef9' : (field?.readOnly ? '#f8f8f8' : 'white'))),
                    color: fmt?.textColor ?? undefined,
                    fontWeight: fmt?.bold ? 'bold' : undefined,
                    fontStyle: fmt?.italic ? 'italic' : undefined,
                    textAlign: fmt?.align ?? undefined,
                    outline: active ? '2px solid #217346' : isCut ? '2px dashed #f59e0b' : 'none',
                    outlineOffset: '-2px',
                    zIndex: active ? 4 : isFrozen ? 3 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    userSelect: 'none',
                    cursor: 'default',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                  onPointerDown={e => handlePointerDown(actualRowIndex, vc.index, field, e, e.currentTarget as HTMLElement)}
                  onPointerEnter={e => handlePointerEnter(actualRowIndex, vc.index, e)}
                  onDoubleClick={e => handleDoubleClick(actualRowIndex, vc.index, field, e.currentTarget as HTMLElement)}
                  onContextMenu={e => handleContextMenu(actualRowIndex, vc.index, e)}
                >
                  <CellContent
                    rowIndex={actualRowIndex}
                    field={field}
                    isSelectEditing={isSelectEditing}
                  />
                  {hasComment && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: 0,
                        height: 0,
                        borderStyle: 'solid',
                        borderWidth: '0 8px 8px 0',
                        borderColor: 'transparent #f59e0b transparent transparent',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
              )
            })
          })}

          {/* Fill handle */}
          {(() => {
            const pos = getFillHandlePos()
            if (!pos) return null
            return (
              <div
                style={{
                  position: 'absolute',
                  top: pos.top,
                  left: pos.left,
                  width: 6,
                  height: 6,
                  backgroundColor: '#217346',
                  border: '1px solid white',
                  cursor: 'crosshair',
                  zIndex: 10,
                }}
                onMouseDown={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!selection) return
                  setFillDrag({
                    srcStartRow: Math.min(selection.startRow, selection.endRow),
                    srcStartCol: Math.min(selection.startCol, selection.endCol),
                    srcEndRow: Math.max(selection.startRow, selection.endRow),
                    srcEndCol: Math.max(selection.startCol, selection.endCol),
                    dstEndRow: Math.max(selection.startRow, selection.endRow),
                    dstEndCol: Math.max(selection.startCol, selection.endCol),
                    active: true,
                  })
                }}
              />
            )
          })()}

          {/* Fill drag preview overlay */}
          {fillDrag?.active && (() => {
            const dstEndRow = fillDrag.dstEndRow
            const dstEndCol = fillDrag.dstEndCol
            const startRow = fillDrag.srcEndRow + 1
            const startCol = fillDrag.srcEndCol + 1

            if (dstEndRow <= fillDrag.srcEndRow && dstEndCol <= fillDrag.srcEndCol) return null

            const fillingDown = dstEndRow > fillDrag.srcEndRow
            const fillingRight = dstEndCol > fillDrag.srcEndCol

            const previewStartRow = fillingDown ? startRow : fillDrag.srcStartRow
            const previewStartCol = fillingRight ? startCol : fillDrag.srcStartCol

            const vRowStart = rowVirtualizer.getVirtualItems().find(vr => filteredIndices[vr.index] === previewStartRow)
            const vRowEnd = rowVirtualizer.getVirtualItems().find(vr => filteredIndices[vr.index] === dstEndRow)
            const vColStart = columnVirtualizer.getVirtualItems().find(vc => vc.index === previewStartCol)
            const vColEnd = columnVirtualizer.getVirtualItems().find(vc => vc.index === dstEndCol)

            if (!vRowStart || !vRowEnd || !vColStart || !vColEnd) return null

            const colW = colWidths[dstEndCol] ?? DEFAULT_COL_WIDTH

            return (
              <div style={{
                position: 'absolute',
                top: vRowStart.start,
                left: vColStart.start + ROW_HEADER_WIDTH,
                width: vColEnd.start + colW - vColStart.start,
                height: vRowEnd.start + vRowEnd.size - vRowStart.start,
                backgroundColor: 'rgba(33,115,70,0.08)',
                border: '2px dashed #217346',
                pointerEvents: 'none',
                zIndex: 5,
              }} />
            )
          })()}
        </div>
      </div>

      {/* Single-select / Multi-select dropdown portal */}
      {dropdownTarget && (() => {
        if (dropdownTarget.fieldType === 'multiple_select') {
          return (
            <MultiSelectDropdown
              rowIndex={dropdownTarget.rowIndex}
              field={dropdownTarget.field}
              pos={dropdownTarget.pos}
              onClose={closeDropdown}
            />
          )
        }
        return (
          <SelectDropdown
            rowIndex={dropdownTarget.rowIndex}
            field={dropdownTarget.field}
            pos={dropdownTarget.pos}
            onClose={closeDropdown}
          />
        )
      })()}

      {/* Cell context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: 'white',
            border: '1px solid #e1dfdd',
            borderRadius: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 2000,
            minWidth: 180,
            padding: '4px 0',
          }}
          onClick={e => e.stopPropagation()}
        >
          {([
            { label: 'Copy', shortcut: 'Ctrl+C', action: () => { copySelection(); setContextMenu(null) } },
            { label: 'separator' },
            { label: 'Insert Row Above', action: () => { insertRowAt(contextMenu.rowIndex); setContextMenu(null) } },
            { label: 'Insert Row Below', action: () => { insertRowAt(contextMenu.rowIndex + 1); setContextMenu(null) } },
            { label: 'Delete Row(s)', action: () => { deleteSelectedRows(); setContextMenu(null) } },
            { label: 'separator' },
            {
              label: 'View Cell History',
              action: () => {
                const row = sheet?.rows[contextMenu.rowIndex]
                const field = visibleFields[contextMenu.colIndex]
                if (row && field) {
                  setHistoryCellRef(`${row.id}:${field.id}`)
                }
                setContextMenu(null)
              },
            },
            { label: 'separator' },
            { label: 'Clear Cell(s)', action: () => {
              const { selection: sel } = useExcelStore.getState()
              if (sel) {
                const minRow = Math.min(sel.startRow, sel.endRow)
                const maxRow = Math.max(sel.startRow, sel.endRow)
                const minCol = Math.min(sel.startCol, sel.endCol)
                const maxCol = Math.max(sel.startCol, sel.endCol)
                const coords: GridCoord[] = []
                for (let r = minRow; r <= maxRow; r++)
                  for (let c = minCol; c <= maxCol; c++)
                    coords.push({ rowIndex: r, colIndex: c })
                clearCells(coords)
              }
              setContextMenu(null)
            }},
          ] as Array<{ label: string; shortcut?: string; action?: () => void }>).map((item, i) =>
            item.label === 'separator'
              ? <div key={i} style={{ height: 1, backgroundColor: '#e1dfdd', margin: '2px 0' }} />
              : (
                <div
                  key={i}
                  onClick={item.action}
                  style={{
                    padding: '6px 16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 24,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f2f1')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span>{item.label}</span>
                  {item.shortcut && <span style={{ color: '#999', fontSize: '11px' }}>{item.shortcut}</span>}
                </div>
              )
          )}
        </div>
      )}

      {/* Cell History Panel */}
      {historyCellRef && (
        <CellHistoryPanel
          cellRef={historyCellRef}
          onClose={() => setHistoryCellRef(null)}
        />
      )}

      {/* Column header context menu */}
      {colHeaderCtxMenu && (() => {
        const fi = colHeaderCtxMenu.fieldIndex
        const field = visibleFields[fi]
        const isThisColFrozen = fi < frozenColCount
        const hasHidden = hiddenFieldIds.length > 0
        const items: Array<{ label: string; action?: () => void; shortcut?: string }> = [
          {
            label: 'Sort A \u2192 Z',
            action: () => {
              if (sortConfig?.fieldIndex === fi && sortConfig.direction === 'asc') return
              useExcelStore.getState().toggleSort(fi)
              setColHeaderCtxMenu(null)
            },
          },
          {
            label: 'Sort Z \u2192 A',
            action: () => {
              const state = useExcelStore.getState()
              // Force descending: toggle twice if needed
              if (state.sortConfig?.fieldIndex === fi && state.sortConfig.direction === 'desc') {
                setColHeaderCtxMenu(null)
                return
              }
              if (state.sortConfig?.fieldIndex !== fi) state.toggleSort(fi)
              if (useExcelStore.getState().sortConfig?.direction === 'asc') state.toggleSort(fi)
              setColHeaderCtxMenu(null)
            },
          },
          { label: 'separator' },
          {
            label: 'Auto-fit Width',
            action: () => { autoFitColumn(fi); setColHeaderCtxMenu(null) },
          },
          {
            label: isThisColFrozen ? 'Unfreeze Column' : 'Freeze Column',
            action: () => { toggleFreezeFirstCol(); setColHeaderCtxMenu(null) },
          },
          { label: 'separator' },
          {
            label: field && hiddenFieldIds.includes(field.id) ? 'Show Column' : 'Hide Column',
            action: () => {
              if (field) { toggleHideColumn(field.id); setColHeaderCtxMenu(null) }
            },
          },
          ...(hasHidden ? [{
            label: 'Show All Columns',
            action: () => { showAllColumns(); setColHeaderCtxMenu(null) },
          }] : []),
        ]
        return (
          <div
            style={{
              position: 'fixed',
              top: colHeaderCtxMenu.y,
              left: colHeaderCtxMenu.x,
              backgroundColor: 'white',
              border: '1px solid #e1dfdd',
              borderRadius: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              zIndex: 2000,
              minWidth: 180,
              padding: '4px 0',
            }}
            onClick={e => e.stopPropagation()}
          >
            {items.map((item, i) =>
              item.label === 'separator'
                ? <div key={i} style={{ height: 1, backgroundColor: '#e1dfdd', margin: '2px 0' }} />
                : (
                  <div
                    key={i}
                    onClick={item.action}
                    style={{
                      padding: '6px 16px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 24,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f2f1')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span style={{ color: '#999', fontSize: '11px' }}>{item.shortcut}</span>}
                  </div>
                )
            )}
          </div>
        )
      })()}
    </div>
  )
}

export default VirtualGrid
