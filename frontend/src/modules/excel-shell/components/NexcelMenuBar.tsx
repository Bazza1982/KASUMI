/**
 * NexcelMenuBar — classic Word-style menu bar for the Nexcel shell.
 * Replaces the placeholder button row in ExcelShellRoute.
 */
import React, { useState, useRef, useCallback } from 'react'
import DropdownMenu from '../../../shared/DropdownMenu'
import { buildNexcelMenus } from '../menus/nexcelMenus'
import { getFieldByVisibleCol, useExcelStore } from '../stores/useExcelStore'

interface NexcelMenuBarProps {
  onHelp: () => void
  onToggleComments: () => void
  onConditionalFormat: () => void
  onPrint: () => void
}

const ACCENT = '#217346'

const NexcelMenuBar: React.FC<NexcelMenuBarProps> = ({
  onHelp,
  onToggleComments,
  onConditionalFormat,
  onPrint,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const {
    newSheet, undo, redo,
    addRow, deleteSelectedRows,
    addColumn, deleteColumn,
    cutCells,
    exportToCsv, exportToXlsx,
    importFromCsv, importFromXlsx,
    toggleSort, deduplicateRows,
    toggleFreezeFirstRow, toggleFreezeFirstCol,
    setZoomLevel,
    zoomLevel, frozenRowCount, frozenColCount,
    activeCell, sheet, hiddenFieldIds,
  } = useExcelStore()

  // File input refs for import dialogs
  const csvInputRef = useRef<HTMLInputElement>(null)
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const csvImportModeRef = useRef<'csv' | 'xlsx'>('csv')

  const handleImportCsv = useCallback(() => {
    csvImportModeRef.current = 'csv'
    csvInputRef.current?.click()
  }, [])

  const handleImportXlsx = useCallback(() => {
    csvImportModeRef.current = 'xlsx'
    xlsxInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (csvImportModeRef.current === 'csv') {
      importFromCsv(file)
    } else {
      importFromXlsx(file)
    }
    e.target.value = ''
  }, [importFromCsv, importFromXlsx])

  const handleSortAsc = useCallback(() => {
    if (!activeCell) return
    const { sortConfig } = useExcelStore.getState()
    // If already sorted asc on this col, no-op; else sort asc
    if (sortConfig?.fieldIndex === activeCell.colIndex && sortConfig.direction === 'asc') return
    toggleSort(activeCell.colIndex)
    // toggleSort cycles asc→desc→none; ensure we end at asc
    const newConfig = useExcelStore.getState().sortConfig
    if (newConfig?.direction === 'desc') toggleSort(activeCell.colIndex)
  }, [activeCell, toggleSort])

  const handleSortDesc = useCallback(() => {
    if (!activeCell) return
    const { sortConfig } = useExcelStore.getState()
    if (sortConfig?.fieldIndex === activeCell.colIndex && sortConfig.direction === 'desc') return
    // Need to get to desc: toggle once to asc, once more to desc
    const current = useExcelStore.getState().sortConfig
    if (!current || current.fieldIndex !== activeCell.colIndex) {
      toggleSort(activeCell.colIndex) // → asc
    }
    toggleSort(activeCell.colIndex)   // → desc
  }, [activeCell, toggleSort])

  const copySelection = useCallback(() => {
    document.execCommand('copy')
  }, [])

  const pasteSelection = useCallback(() => {
    document.execCommand('paste')
  }, [])

  const menus = buildNexcelMenus({
    newSheet,
    undo, redo,
    addRow,
    deleteSelectedRows,
    addColumn,
    deleteColumn: () => {
      if (!activeCell || !sheet) return
      const field = getFieldByVisibleCol(sheet, hiddenFieldIds, activeCell.colIndex)
      if (field) deleteColumn(field.id)
    },
    cutCells,
    exportToCsv,
    exportToXlsx,
    importFromCsv: handleImportCsv,
    importFromXlsx: handleImportXlsx,
    toggleSort: (direction) => {
      if (direction === 'asc') handleSortAsc()
      else handleSortDesc()
    },
    deduplicateRows,
    toggleFreezeFirstRow,
    toggleFreezeFirstCol,
    setZoomLevel,
    zoomLevel,
    frozenRowCount,
    frozenColCount,
    onHelp,
    onPrint,
    onToggleComments,
    onConditionalFormat,
    copySelection,
    pasteSelection,
  })

  const menuKeys = Object.keys(menus)

  return (
    <>
      {/* Hidden file inputs for import */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,.txt"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={xlsxInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#fff',
          borderBottom: '1px solid #e1dfdd',
          padding: '0 4px',
          height: 28,
          flexShrink: 0,
          userSelect: 'none',
        }}
        // When clicking outside all menus, close
        onMouseLeave={() => {/* keep open — user may move to the panel */}}
      >
        {menuKeys.map((key) => (
          <DropdownMenu
            key={key}
            label={key}
            items={menus[key]}
            accentColor={ACCENT}
            isOpen={openMenu === key}
            onOpen={() => setOpenMenu(key)}
            onClose={() => setOpenMenu(null)}
          />
        ))}
      </div>
    </>
  )
}

export default NexcelMenuBar
