import React, { useState, useEffect, useCallback } from 'react'
import NexcelMenuBar from './components/NexcelMenuBar'
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
import { getFieldByVisibleCol, useExcelStore } from './stores/useExcelStore'
import { useCellChangeStore } from './stores/useCellChangeStore'
import { useConditionalFormatStore } from './stores/useConditionalFormatStore'
import { nexcelAIContext } from './services/AIContextSerializer'
import { useMcpEvents } from '../../platform/mcp/useMcpEvents'
import { MinatoNexcelAdapter } from './adapters/minato/MinatoNexcelAdapter'

export interface EmbedConfig {
  artefactId: string
  minatoApi: string
}

interface ExcelShellRouteProps {
  autoFocusTarget?: 'grid' | 'formula-bar'
  onSurfaceActivity?: (target: 'grid' | 'formula-bar') => void
  embedConfig?: EmbedConfig
}

const ExcelShellRoute = ({ autoFocusTarget = 'grid', onSurfaceActivity, embedConfig }: ExcelShellRouteProps) => {
  const [showHelp, setShowHelp] = useState(false)
  const [showCommentPanel, setShowCommentPanel] = useState(false)
  const [showConditionalFormat, setShowConditionalFormat] = useState(false)
  const [gridFocusSignal, setGridFocusSignal] = useState(0)
  const isEmbeddedNexcel = new URLSearchParams(window.location.search).get('mode') === 'embed'
    && new URLSearchParams(window.location.search).get('type') === 'nexcel'

  const { load: loadComments, reset: resetComments } = useCommentStore()
  const { load: loadFormats, setFormatRange, reset: resetFormats } = useCellFormatStore()
  const { load: loadChanges, reset: resetChanges } = useCellChangeStore()
  const { load: loadConditionalFormats, reset: resetConditionalFormats } = useConditionalFormatStore()
  const { sheet, hiddenFieldIds, selection, activeCell, undo, redo, deduplicateRows, loadSheet, loadTables } = useExcelStore()

  const handlePrint = () => window.print()

  // Load persisted data on mount
  useEffect(() => {
    if (isEmbeddedNexcel) {
      loadComments()
      loadFormats()
      loadChanges()
      loadConditionalFormats()
      return
    }

    // Default startup should behave like a brand-new workbook, not a rehydrated prior session.
    resetComments()
    resetFormats()
    resetChanges()
    resetConditionalFormats()
  }, [isEmbeddedNexcel, loadComments, loadFormats, loadChanges, loadConditionalFormats, resetComments, resetFormats, resetChanges, resetConditionalFormats])

  useEffect(() => {
    if (isEmbeddedNexcel) {
      loadTables()
    }
  }, [isEmbeddedNexcel, loadTables])

  // ── Real-time MCP event sync ──────────────────────────────────────────────
  // When an AI agent mutates nexcelStore via MCP write tools, the server
  // broadcasts a WebSocket event. We reload the sheet from the API so the
  // grid reflects the change immediately.
  useMcpEvents(useCallback((e) => {
    switch (e.event) {
      case 'nexcel:cells_updated':
      case 'nexcel:rows_inserted':
      case 'nexcel:rows_deleted':
      case 'nexcel:sheet_sorted':
      case 'nexcel:format_updated':
      case 'nexcel:column_width_changed':
        // Reload current sheet from api-server (single source of truth)
        if (sheet?.tableId) loadSheet(sheet.tableId)
        break
      case 'nexcel:sheet_reset':
        // Full reload including tables
        loadTables()
        break
      default:
        break
    }
  }, [sheet?.tableId, loadSheet, loadTables]))

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
        const field = getFieldByVisibleCol(sheet, hiddenFieldIds, c)
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
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

  return (
    <ErrorBoundary>
      <div data-testid="excel-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f3f2f1' }}>
        {/* Classic menu bar — functional dropdowns */}
        <div className="nexcel-no-print">
          <NexcelMenuBar
            onHelp={() => setShowHelp(true)}
            onToggleComments={() => setShowCommentPanel(p => !p)}
            onConditionalFormat={() => setShowConditionalFormat(true)}
            onPrint={handlePrint}
          />
        </div>
        <Ribbon
          onHelp={() => setShowHelp(true)}
          onToggleComments={() => setShowCommentPanel(p => !p)}
          showCommentPanel={showCommentPanel}
          onFormatSelection={(fmt) => setFormatRange(getSelectedCellRefs(), fmt)}
          onConditionalFormat={() => setShowConditionalFormat(true)}
          activeTab="Home"
          onPrint={handlePrint}
          onDeduplicate={deduplicateRows}
        />
        <div className="nexcel-no-print">
          <FormulaBar
            autoFocus={autoFocusTarget === 'formula-bar'}
            onSurfaceFocus={() => onSurfaceActivity?.('formula-bar')}
            onNavigateToGrid={() => {
              onSurfaceActivity?.('grid')
              setGridFocusSignal(signal => signal + 1)
            }}
          />
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <VirtualGrid
            autoFocus={autoFocusTarget === 'grid'}
            focusSignal={gridFocusSignal}
            onSurfaceFocus={() => onSurfaceActivity?.('grid')}
          />
        </div>
        <div className="nexcel-no-print"><SheetTabs /></div>
        <div className="nexcel-no-print"><StatusBar /></div>
        {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
        <CommentPanel isOpen={showCommentPanel} onClose={() => setShowCommentPanel(false)} />
        {(() => {
          const colIndex = activeCell?.colIndex ?? 0
          const field = getFieldByVisibleCol(sheet, hiddenFieldIds, colIndex)
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
