import React, { useRef, useState } from 'react'
import { Copy, Clipboard, Scissors, Bold, Italic, Plus, Trash2, Download, FileSpreadsheet, Upload, Columns, Settings, HelpCircle, MessageSquare, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { useExcelStore } from '../stores/useExcelStore'
import { useAccessStore } from '../stores/useAccessStore'
import { AccessModeSelector } from './AccessModeSelector'
import ConnectionPanel from './ConnectionPanel'
import type { CellFormat } from '../stores/useCellFormatStore'

interface RibbonProps {
  onHelp: () => void
  onToggleComments?: () => void
  showCommentPanel?: boolean
  onFormatSelection?: (fmt: Partial<CellFormat>) => void
}

const Ribbon: React.FC<RibbonProps> = ({ onHelp, onToggleComments, showCommentPanel, onFormatSelection }) => {
  const { addRow, deleteSelectedRows, exportToCsv, exportToXlsx, importFromCsv, importFromXlsx, searchText, setSearchText, frozenColCount, toggleFreezeFirstCol } = useExcelStore()
  const { canAddRows, canDeleteRows, canImport, canExport } = useAccessStore()
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

  const groups = [
    {
      label: 'Clipboard',
      buttons: [
        { icon: <Clipboard size={16} />, label: 'Paste', action: () => {}, disabled: false },
        { icon: <Copy size={16} />, label: 'Copy', action: copyAction, disabled: false },
        { icon: <Scissors size={16} />, label: 'Cut', action: () => {}, disabled: false },
      ],
    },
    {
      label: 'Rows',
      buttons: [
        { icon: <Plus size={16} />, label: 'Add Row', action: addRow, disabled: !canAddRows },
        { icon: <Trash2 size={16} />, label: 'Delete', action: deleteSelectedRows, disabled: !canDeleteRows },
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
      label: 'View',
      buttons: [
        { icon: <Columns size={16} />, label: frozenColCount > 0 ? 'Unfreeze Col' : 'Freeze Col', action: toggleFreezeFirstCol, disabled: false },
      ],
    },
  ]

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
      {/* eslint-disable-next-line react-hooks/refs */}
      {groups.map(group => (
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 2, flex: 1, alignItems: 'center', flexWrap: 'wrap', maxWidth: 120 }}>
          {/* Background colors */}
          {[
            { color: '#fef08a', label: 'Yellow BG' },
            { color: '#fca5a5', label: 'Red BG' },
            { color: '#86efac', label: 'Green BG' },
            { color: '#93c5fd', label: 'Blue BG' },
            { color: undefined, label: 'No BG' },
          ].map(({ color, label }) => (
            <button
              key={label}
              title={label}
              onClick={() => onFormatSelection?.({ bgColor: color })}
              style={{
                width: 18, height: 18,
                backgroundColor: color ?? 'white',
                border: '1.5px solid rgba(255,255,255,0.5)',
                borderRadius: 2,
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            />
          ))}
          {/* Text colors */}
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
                width: 18, height: 18,
                backgroundColor: color,
                border: '1.5px solid rgba(255,255,255,0.5)',
                borderRadius: 2,
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingTop: 2, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          Colors
        </div>
      </div>

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
        <button
          onClick={onToggleComments}
          title="Toggle Comments Panel"
          style={{
            backgroundColor: showCommentPanel ? 'rgba(255,255,255,0.25)' : 'transparent',
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
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = showCommentPanel ? 'rgba(255,255,255,0.25)' : 'transparent' }}
        >
          <MessageSquare size={16} />
          <span>Comments</span>
        </button>
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
