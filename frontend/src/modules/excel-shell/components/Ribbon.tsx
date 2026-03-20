import React, { useRef, useState } from 'react'
import { Copy, Clipboard, Scissors, Bold, Italic, Plus, Trash2, Download, FileSpreadsheet, Upload, Columns, Settings, HelpCircle } from 'lucide-react'
import { useExcelStore } from '../stores/useExcelStore'
import { useAccessStore } from '../stores/useAccessStore'
import { AccessModeSelector } from './AccessModeSelector'
import ConnectionPanel from './ConnectionPanel'

interface RibbonProps {
  onHelp: () => void
}

const Ribbon: React.FC<RibbonProps> = ({ onHelp }) => {
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
        { icon: <Bold size={16} />, label: 'Bold', action: () => {}, disabled: true },
        { icon: <Italic size={16} />, label: 'Italic', action: () => {}, disabled: true },
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
            border: '1px solid rgba(255,255,255,0.4)',
            backgroundColor: 'rgba(255,255,255,0.15)',
            color: 'white',
            fontSize: '13px',
            outline: 'none',
            width: 180,
          }}
          onFocus={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)' }}
          onBlur={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)' }}
        />
      </div>
    </div>

    {showSettings && <ConnectionPanel onClose={() => setShowSettings(false)} />}
    </>
  )
}

export default Ribbon
