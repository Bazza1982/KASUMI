import React, { useRef, useState } from 'react'
import { Copy, Clipboard, Scissors, Bold, Italic, Plus, Trash2, Download, FileSpreadsheet, Upload, Columns, Settings, HelpCircle, MessageSquare, AlignLeft, AlignCenter, AlignRight, Filter, Undo2, Redo2, SortAsc, SortDesc, FilePlus, Printer, Layers, Lock } from 'lucide-react'
import { getFieldByVisibleCol, getVisibleColIndexFromFieldIndex, useExcelStore } from '../stores/useExcelStore'
import { useAccessStore } from '../stores/useAccessStore'
import { useCellFormatStore } from '../stores/useCellFormatStore'
import { AccessModeSelector } from './AccessModeSelector'
import ConnectionPanel from './ConnectionPanel'
import type { CellFormat, NumberFormatType } from '../stores/useCellFormatStore'

interface RibbonProps {
  onHelp: () => void
  onToggleComments?: () => void
  showCommentPanel?: boolean
  onFormatSelection?: (fmt: Partial<CellFormat>) => void
  onConditionalFormat?: () => void
  activeTab?: string
  onPrint?: () => void
  onDeduplicate?: () => void
}

// Which group labels are shown for each Ribbon tab
const TAB_GROUPS: Record<string, string[]> = {
  File:          ['File'],
  Home:          ['Clipboard', 'Rows', 'Columns', 'Sort', 'Format', 'Colors', 'Comments'],
  Insert:        ['Rows', 'Columns'],
  'Page Layout': ['View'],
  Formulas:      [],
  Data:          ['Import', 'Export', 'Sort', 'Deduplicate'],
  Review:        ['Comments'],
  View:          ['View'],
  Help:          [],
}

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

const Ribbon: React.FC<RibbonProps> = ({ onHelp, onToggleComments, showCommentPanel, onFormatSelection, onConditionalFormat, activeTab = 'Home', onPrint, onDeduplicate }) => {
  const { addRow, deleteSelectedRows, exportToCsv, exportToXlsx, importFromCsv, importFromXlsx, searchText, setSearchText, frozenColCount, toggleFreezeFirstCol, frozenRowCount, toggleFreezeFirstRow, cutCells, clearCutAfterPaste, pasteGrid, undo, redo, newSheet, addColumn, deleteColumn, activeCell, sheet, hiddenFieldIds, toggleSort, sortConfig, zoomLevel, setZoomLevel } = useExcelStore()
  const { canAddRows, canDeleteRows, canImport, canExport } = useAccessStore()
  const { getFormat } = useCellFormatStore()

  // Derive current cell ref for format reading
  const activeCellRef = (() => {
    if (!activeCell || !sheet) return null
    const row = sheet.rows[activeCell.rowIndex]
    const field = getFieldByVisibleCol(sheet, hiddenFieldIds, activeCell.colIndex)
    return row && field ? `${row.id}:${field.id}` : null
  })()
  const activeCellFormat = activeCellRef ? getFormat(activeCellRef) : null
  const activeSortVisibleCol = sortConfig ? getVisibleColIndexFromFieldIndex(sheet, hiddenFieldIds, sortConfig.fieldIndex) : -1

  const fileInputRef = useRef<HTMLInputElement>(null)
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const [showSettings, setShowSettings] = useState(false)

  const handleImportCsv = () => fileInputRef.current?.click()
  const handleImportXlsx = () => xlsxInputRef.current?.click()

  const copyAction = () => {
    const { selection, getCellDisplay, sheet } = useExcelStore.getState()
    if (!selection || !sheet) return
    const minRow = Math.min(selection.startRow, selection.endRow)
    const maxRow = Math.max(selection.startRow, selection.endRow)
    const minCol = Math.min(selection.startCol, selection.endCol)
    const maxCol = Math.max(selection.startCol, selection.endCol)
    const lines: string[] = []
    for (let r = minRow; r <= maxRow; r++) {
      const cells: string[] = []
      for (let c = minCol; c <= maxCol; c++) cells.push(getCellDisplay(r, c))
      lines.push(cells.join('\t'))
    }
    navigator.clipboard.writeText(lines.join('\n'))
  }

  const pasteAction = async () => {
    const { selection } = useExcelStore.getState()
    const text = await navigator.clipboard.readText().catch(() => '')
    if (!text || !selection) return
    const rows = text.split('\n').map(line => line.split('\t'))
    const startRow = Math.min(selection.startRow, selection.endRow)
    const startCol = Math.min(selection.startCol, selection.endCol)
    await pasteGrid(startRow, startCol, rows)
    await clearCutAfterPaste()
  }

  const handleNewSheet = () => {
    if (window.confirm('Create a new sheet? All current data will be cleared.')) newSheet()
  }

  const handleDeleteColumn = () => {
    if (!activeCell || !sheet) return
    const field = getFieldByVisibleCol(sheet, hiddenFieldIds, activeCell.colIndex)
    if (!field) return
    if (window.confirm(`Delete column "${field.name}"?`)) deleteColumn(field.id)
  }

  const handleSortAsc = () => {
    if (!activeCell) return
    const { sortConfig: sc } = useExcelStore.getState()
    if (activeSortVisibleCol === activeCell.colIndex && sc?.direction === 'asc') return
    toggleSort(activeCell.colIndex)
    if (useExcelStore.getState().sortConfig?.direction === 'desc') toggleSort(activeCell.colIndex)
  }

  const handleSortDesc = () => {
    if (!activeCell) return
    const sc = useExcelStore.getState().sortConfig
    if (activeSortVisibleCol === activeCell.colIndex && sc?.direction === 'desc') return
    // toggleSort cycles: null → asc → desc → null; get to desc
    const cur = useExcelStore.getState().sortConfig
    if (!cur || activeSortVisibleCol !== activeCell.colIndex) {
      toggleSort(activeCell.colIndex) // → asc
      toggleSort(activeCell.colIndex) // → desc
    } else if (cur.direction === 'asc') {
      toggleSort(activeCell.colIndex) // → desc
    }
  }

  const currentSortDir = (activeCell && activeSortVisibleCol === activeCell.colIndex) ? sortConfig?.direction ?? null : null

  const groups = [
    {
      label: 'File',
      buttons: [
        { icon: <FilePlus size={16} />, label: 'New', action: handleNewSheet, disabled: false },
        { icon: <Upload size={16} />, label: 'Import CSV', action: handleImportCsv, disabled: !canImport },
        { icon: <FileSpreadsheet size={16} />, label: 'Import XLSX', action: handleImportXlsx, disabled: !canImport },
        { icon: <Download size={16} />, label: 'Export CSV', action: exportToCsv, disabled: !canExport },
        { icon: <FileSpreadsheet size={16} />, label: 'Export XLSX', action: exportToXlsx, disabled: !canExport },
        { icon: <Printer size={16} />, label: 'Print', action: () => onPrint?.(), disabled: false },
      ],
    },
    {
      label: 'Clipboard',
      buttons: [
        { icon: <Clipboard size={16} />, label: 'Paste', action: pasteAction, disabled: false },
        { icon: <Copy size={16} />, label: 'Copy', action: copyAction, disabled: false },
        { icon: <Scissors size={16} />, label: 'Cut', action: cutCells, disabled: false },
        { icon: <Undo2 size={16} />, label: 'Undo', action: undo, disabled: false },
        { icon: <Redo2 size={16} />, label: 'Redo', action: redo, disabled: false },
      ],
    },
    {
      label: 'Rows',
      buttons: [
        { icon: <Plus size={16} />, label: 'Add Row', action: addRow, disabled: !canAddRows },
        { icon: <Trash2 size={16} />, label: 'Del Row', action: deleteSelectedRows, disabled: !canDeleteRows },
      ],
    },
    {
      label: 'Columns',
      buttons: [
        { icon: <Columns size={16} />, label: 'Add Col', action: () => addColumn(), disabled: false },
        { icon: <Trash2 size={16} />, label: 'Del Col', action: handleDeleteColumn, disabled: false },
      ],
    },
    {
      label: 'Sort',
      buttons: [
        { icon: <SortAsc size={16} />, label: currentSortDir === 'asc' ? '▲ A→Z' : 'Sort A→Z', action: handleSortAsc, disabled: !activeCell },
        { icon: <SortDesc size={16} />, label: currentSortDir === 'desc' ? '▼ Z→A' : 'Sort Z→A', action: handleSortDesc, disabled: !activeCell },
      ],
    },
    {
      label: 'Format',
      buttons: [
        { icon: <Bold size={16} />, label: 'Bold', action: () => onFormatSelection?.({ bold: true }), disabled: false },
        { icon: <Italic size={16} />, label: 'Italic', action: () => onFormatSelection?.({ italic: true }), disabled: false },
        { icon: <AlignLeft size={16} />, label: 'Align L', action: () => onFormatSelection?.({ align: 'left' }), disabled: false },
        { icon: <AlignCenter size={16} />, label: 'Align C', action: () => onFormatSelection?.({ align: 'center' }), disabled: false },
        { icon: <AlignRight size={16} />, label: 'Align R', action: () => onFormatSelection?.({ align: 'right' }), disabled: false },
        { icon: <Filter size={16} />, label: 'Cond. Fmt', action: () => onConditionalFormat?.(), disabled: false },
      ],
    },
    {
      label: 'Export',
      buttons: [
        { icon: <Download size={16} />, label: 'Export CSV', action: exportToCsv, disabled: !canExport },
        { icon: <FileSpreadsheet size={16} />, label: 'Export XLSX', action: exportToXlsx, disabled: !canExport },
      ],
    },
    {
      label: 'Import',
      buttons: [
        { icon: <Upload size={16} />, label: 'Import CSV', action: handleImportCsv, disabled: !canImport },
        { icon: <FileSpreadsheet size={16} />, label: 'Import XLSX', action: handleImportXlsx, disabled: !canImport },
      ],
    },
    {
      label: 'Deduplicate',
      buttons: [
        { icon: <Layers size={16} />, label: 'Remove Dup', action: () => onDeduplicate?.(), disabled: false },
      ],
    },
    {
      label: 'View',
      buttons: [
        { icon: <Columns size={16} />, label: frozenColCount > 0 ? 'Unfreeze Col' : 'Freeze Col', action: toggleFreezeFirstCol, disabled: false },
        { icon: <Lock size={16} />, label: frozenRowCount > 0 ? 'Unfreeze Row' : 'Freeze Row', action: toggleFreezeFirstRow, disabled: false },
      ],
    },
    {
      label: 'Comments',
      buttons: [
        { icon: <MessageSquare size={16} />, label: showCommentPanel ? 'Hide Comments' : 'Comments', action: () => onToggleComments?.(), disabled: false },
      ],
    },
  ]

  const allowedGroups = TAB_GROUPS[activeTab] ?? TAB_GROUPS['Home']
  const showColors = allowedGroups.includes('Colors')
  const showNumberFormat = allowedGroups.includes('Format')
  const showZoom = activeTab === 'View'

  return (
    <>
    <div
      style={{
        backgroundColor: '#217346',
        padding: '4px 8px',
        display: 'flex',
        gap: '16px',
        alignItems: 'stretch',
        minHeight: '52px',
      }}
    >
      {activeTab === 'Formulas' && (
        <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '0 8px' }}>
          Formula functions are computed server-side via Baserow.
        </div>
      )}
      {activeTab === 'Help' && (
        <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '0 8px' }}>
          Press <kbd style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 3, padding: '1px 5px', margin: '0 4px' }}>Ctrl+/</kbd> for keyboard shortcuts.
        </div>
      )}
      {/* eslint-disable-next-line react-hooks/refs */}
      {groups.filter(g => allowedGroups.includes(g.label)).map(group => (
        <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', gap: 2, flex: 1, alignItems: 'center' }}>
            {group.buttons.map(btn => (
              <button
                key={btn.label}
                onClick={btn.action}
                disabled={btn.disabled}
                title={btn.label}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: btn.disabled ? 'rgba(255,255,255,0.4)' : 'white',
                  opacity: btn.disabled ? 0.4 : 1,
                  cursor: btn.disabled ? 'not-allowed' : 'pointer',
                  padding: '4px 8px',
                  borderRadius: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: '11px',
                  minWidth: 40,
                }}
                onMouseEnter={e => {
                  if (!btn.disabled)
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.15)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                }}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: 'rgba(255,255,255,0.6)',
              textAlign: 'center',
              paddingTop: 2,
              borderTop: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            {group.label}
          </div>
        </div>
      ))}

      {/* Color pickers group */}
      {showColors && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', flex: 1, gap: 8, alignItems: 'flex-start' }}>
            {/* Background colors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>Fill</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {[
                  { color: '#fef08a', label: 'Yellow Fill' },
                  { color: '#fca5a5', label: 'Pink Fill' },
                  { color: '#86efac', label: 'Green Fill' },
                  { color: '#93c5fd', label: 'Blue Fill' },
                  { color: undefined,  label: 'No Fill' },
                ].map(({ color, label }) => (
                  <button
                    key={label}
                    title={label}
                    onClick={() => onFormatSelection?.({ bgColor: color })}
                    style={{
                      width: 18, height: 18, flexShrink: 0,
                      backgroundColor: color ?? '#ffffff',
                      border: '1.5px solid rgba(255,255,255,0.5)',
                      borderRadius: 2, cursor: 'pointer', padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
            {/* Text colors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>Text</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {[
                  { color: '#dc2626', label: 'Red Text' },
                  { color: '#16a34a', label: 'Green Text' },
                  { color: '#2563eb', label: 'Blue Text' },
                  { color: '#000000', label: 'Black Text' },
                ].map(({ color, label }) => (
                  <button
                    key={label}
                    title={label}
                    onClick={() => onFormatSelection?.({ textColor: color })}
                    style={{
                      width: 18, height: 18, flexShrink: 0,
                      backgroundColor: color,
                      border: '1.5px solid rgba(255,255,255,0.5)',
                      borderRadius: 2, cursor: 'pointer', padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingTop: 2, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            Colors
          </div>
        </div>
      )}

      {/* Number format selector — shown on tabs with Format group */}
      {showNumberFormat && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
          <select
            title="Number Format"
            value={activeCellFormat?.numberFormat ?? 'general'}
            onChange={e => onFormatSelection?.({ numberFormat: e.target.value as NumberFormatType })}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 3,
              color: 'white',
              fontSize: '12px',
              padding: '2px 4px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="general" style={{ color: '#333', background: '#fff' }}>General</option>
            <option value="number" style={{ color: '#333', background: '#fff' }}>Number</option>
            <option value="currency" style={{ color: '#333', background: '#fff' }}>Currency</option>
            <option value="percentage" style={{ color: '#333', background: '#fff' }}>Percentage</option>
            <option value="date" style={{ color: '#333', background: '#fff' }}>Date</option>
            <option value="text" style={{ color: '#333', background: '#fff' }}>Text</option>
          </select>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingTop: 2, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            Format
          </div>
        </div>
      )}

      {/* Zoom control — shown on View tab */}
      {showZoom && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center', marginLeft: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setZoomLevel(ZOOM_LEVELS[Math.max(0, ZOOM_LEVELS.indexOf(zoomLevel) - 1)])}
              disabled={zoomLevel <= ZOOM_LEVELS[0]}
              title="Zoom out"
              style={{ backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'white', borderRadius: 3, width: 22, height: 22, cursor: zoomLevel <= ZOOM_LEVELS[0] ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1, opacity: zoomLevel <= ZOOM_LEVELS[0] ? 0.4 : 1 }}
            >−</button>
            <select
              value={zoomLevel}
              onChange={e => setZoomLevel(parseFloat(e.target.value))}
              title="Zoom level"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3, color: 'white', fontSize: '12px', padding: '2px 2px', cursor: 'pointer', outline: 'none', width: 54, textAlign: 'center' }}
            >
              {ZOOM_LEVELS.map(z => (
                <option key={z} value={z} style={{ color: '#333', background: '#fff' }}>{Math.round(z * 100)}%</option>
              ))}
            </select>
            <button
              onClick={() => setZoomLevel(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(zoomLevel) + 1)])}
              disabled={zoomLevel >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              title="Zoom in"
              style={{ backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'white', borderRadius: 3, width: 22, height: 22, cursor: zoomLevel >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1, opacity: zoomLevel >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ? 0.4 : 1 }}
            >+</button>
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingTop: 2, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            Zoom
          </div>
        </div>
      )}

      {/* Hidden file input for CSV import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) importFromCsv(file)
          e.target.value = ''
        }}
      />

      {/* Hidden file input for XLSX import */}
      <input
        ref={xlsxInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) importFromXlsx(file)
          e.target.value = ''
        }}
      />

      {/* Settings and Help buttons - far right before search */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <AccessModeSelector />
        <button
          onClick={() => setShowSettings(true)}
          title="Baserow Connection Settings"
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            fontSize: '11px',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.15)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
        >
          <Settings size={16} />
          <span>Connect</span>
        </button>
        <button
          onClick={onHelp}
          title="Keyboard Shortcuts (Ctrl+/)"
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            fontSize: '11px',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.15)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
        >
          <HelpCircle size={16} />
          <span>Help</span>
        </button>
      </div>

      {/* Search box - right side */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 4,
            border: '1.5px solid rgba(255,255,255,0.85)',
            backgroundColor: 'rgba(255,255,255,0.92)',
            color: '#1a1a1a',
            fontSize: '13px',
            outline: 'none',
            width: 180,
          }}
          onFocus={e => { e.currentTarget.style.backgroundColor = '#ffffff' }}
          onBlur={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.92)' }}
        />
      </div>
    </div>

    {showSettings && <ConnectionPanel onClose={() => setShowSettings(false)} />}
    </>
  )
}

export default Ribbon
