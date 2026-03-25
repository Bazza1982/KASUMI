import React, { useState, useEffect } from 'react'
import Ribbon from './components/Ribbon'
import CommentPanel from './components/CommentPanel'
import ConditionalFormatDialog from './components/ConditionalFormatDialog'
import { useRealtime } from './services/useRealtime'
import FormulaBar from './components/FormulaBar'
import SheetTabs from './components/SheetTabs'
import StatusBar from './components/StatusBar'
import VirtualGrid from './grid/VirtualGrid'
import ShortcutsHelp from './components/ShortcutsHelp'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useCommentStore } from './stores/useCommentStore'
import { useCellFormatStore } from './stores/useCellFormatStore'
import { useExcelStore } from './stores/useExcelStore'
import { useCellChangeStore } from './stores/useCellChangeStore'
import { useConditionalFormatStore } from './stores/useConditionalFormatStore'
import { nexcelAIContext } from './services/AIContextSerializer'

const ExcelShellRoute = () => {
  const [showHelp, setShowHelp] = useState(false)
  const [showCommentPanel, setShowCommentPanel] = useState(false)
  const [showConditionalFormat, setShowConditionalFormat] = useState(false)

  const { load: loadComments } = useCommentStore()
  const { load: loadFormats, setFormatRange } = useCellFormatStore()
  const { load: loadChanges } = useCellChangeStore()
  const { load: loadConditionalFormats } = useConditionalFormatStore()
  const { sheet, selection, activeCell } = useExcelStore()

  // Load persisted data on mount
  useEffect(() => {
    loadComments()
    loadFormats()
    loadChanges()
    loadConditionalFormats()
  }, [])

  // Helper: convert current selection to cellRef strings
  const getSelectedCellRefs = (): string[] => {
    if (!sheet || !selection) return []
    const refs: string[] = []
    const minRow = Math.min(selection.startRow, selection.endRow)
    const maxRow = Math.max(selection.startRow, selection.endRow)
    const minCol = Math.min(selection.startCol, selection.endCol)
    const maxCol = Math.max(selection.startCol, selection.endCol)
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const row = sheet.rows[r]
        const field = sheet.fields[c]
        if (row && field) refs.push(`${row.id}:${field.id}`)
      }
    }
    return refs
  }

  // Read localStorage settings for realtime
  const useMock = localStorage.getItem('kasumi_use_mock') !== 'false'
  const baseUrl = localStorage.getItem('kasumi_baserow_url') || 'http://localhost:8000'
  const token = localStorage.getItem('kasumi_baserow_token') || ''

  useRealtime({
    baseUrl,
    token,
    enabled: !useMock && !!token,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setShowHelp(h => !h)
      }
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false)
      }
      // Dev utility: Ctrl+Shift+D exports AI context to console
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        if (process.env.NODE_ENV !== 'production') {
          console.log('[NEXCEL:AIContext] exportForAI:', nexcelAIContext.exportForAI())
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showHelp])

  const NEXCEL_MENUS = ['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View', 'Help']
  const [activeMenu, setActiveMenu] = useState('Home')

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f3f2f1' }}>
        {/* Classic menu bar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#fff', borderBottom: '1px solid #e1dfdd',
          padding: '0 8px', height: 28, flexShrink: 0, userSelect: 'none',
        }}>
          {NEXCEL_MENUS.map(m => (
            <button
              key={m}
              onClick={() => setActiveMenu(m)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0 10px', height: '100%', fontSize: 13,
                color: activeMenu === m ? '#217346' : '#333',
                fontWeight: activeMenu === m ? 600 : 400,
                borderBottom: activeMenu === m ? '2px solid #217346' : '2px solid transparent',
              }}
            >{m}</button>
          ))}
        </div>
        <Ribbon
          onHelp={() => setShowHelp(true)}
          onToggleComments={() => setShowCommentPanel(p => !p)}
          showCommentPanel={showCommentPanel}
          onFormatSelection={(fmt) => setFormatRange(getSelectedCellRefs(), fmt)}
          onConditionalFormat={() => setShowConditionalFormat(true)}
        />
        <FormulaBar />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <VirtualGrid />
        </div>
        <SheetTabs />
        <StatusBar />
        {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
        <CommentPanel isOpen={showCommentPanel} onClose={() => setShowCommentPanel(false)} />
        {(() => {
          const colIndex = activeCell?.colIndex ?? 0
          const field = sheet?.fields[colIndex] ?? null
          return (
            <ConditionalFormatDialog
              fieldId={field?.id ?? 0}
              fieldName={field?.name ?? 'Column'}
              isOpen={showConditionalFormat}
              onClose={() => setShowConditionalFormat(false)}
            />
          )
        })()}
      </div>
    </ErrorBoundary>
  )
}

export default ExcelShellRoute
