import React, { useState, useCallback, useRef, useEffect } from 'react'
import { WordoRibbon } from './components/WordoRibbon'
import { OutlinePanel } from './components/OutlinePanel'
import { FindReplacePanel } from './components/FindReplacePanel'
import { PageSettingsPanel } from './components/PageSettingsPanel'
import { InsertNexcelDialog } from './components/InsertNexcelDialog'
import { CommentPanel } from './components/CommentPanel'
import { DocxPreviewSurface } from './components/DocxPreviewSurface'
import { DocxDiagnosticsBanner } from './components/DocxDiagnosticsBanner'
import { SectionEditor } from './editor/SectionEditor'
import { useWordoStore } from './stores/useWordoStore'
import { useWordoAccessStore } from './stores/useWordoAccessStore'
import { useTrackChangeStore } from './stores/useTrackChangeStore'
import { useCommentStore } from './stores/useCommentStore'
import { printToPdf } from './services/PdfPrinter'
import { executeSemanticCommand } from './services/SemanticCommandService'
import { createCommandAuditExport, exportCommandAuditJson } from './services/CommandAuditExporter'
import { executeWordoMcpToolCall, getWordoMcpToolDefinitions } from './services/WordoMcpAdapter'
import { addCommentMark, getSelectedText, getSelectionBlockId } from './editor/commentCommands'
import { acceptInsert, acceptDelete, rejectInsert, rejectDelete } from './editor/trackChangePlugin'
import { createLogger } from './editor/logger'
import { onMenuNewDocument } from '../../platform/native/useNativeBridge'
import { undo as pmUndo, redo as pmRedo } from 'prosemirror-history'
import { useMcpEvents } from '../../platform/mcp/useMcpEvents'

const log = createLogger('WordoShellRoute')

export interface EmbedConfig {
  artefactId: string
  minatoApi: string
}

interface WordoShellRouteProps {
  autoFocusSectionId?: string | null
  onSurfaceActivity?: (sectionId: string) => void
  embedConfig?: EmbedConfig
}

// Simple inline comment prompt — no extra dependency
function promptComment(anchorText: string): string | null {
  return window.prompt(`Add comment to: "${anchorText.slice(0, 50)}${anchorText.length > 50 ? '…' : ''}"`)
}

export const WordoShellRoute: React.FC<WordoShellRouteProps> = ({
  autoFocusSectionId = null,
  onSurfaceActivity,
  embedConfig,
}) => {
  const {
    document: doc,
    orchestrator,
    insertNexcelEmbed,
    loadFromImport,
    saveNow,
    triggerAutoSave,
    focusedSectionId,
    resetDocument,
    setTitle,
    addSection,
    deleteSection,
    updateSectionPageStyle,
    updateSectionWatermark,
    updateSectionHeaderFooter,
    recordCommandAudit,
  } = useWordoStore()
  const minatoApiBase = embedConfig?.minatoApi?.replace(/\/$/, '') ?? ''
  const artefactId = embedConfig?.artefactId ?? ''
  const access = useWordoAccessStore()
  const trackChange = useTrackChangeStore()
  const commentStore = useCommentStore()
  const [docxPreviewFile, setDocxPreviewFile] = useState<File | null>(null)
  const [docxPreviewTitle, setDocxPreviewTitle] = useState<string | null>(null)

  const clearDocxPreview = useCallback(() => {
    setDocxPreviewFile(null)
    setDocxPreviewTitle(null)
  }, [])

  const isDocxPreviewMode = docxPreviewFile !== null

  // ── Real-time MCP event sync ──────────────────────────────────────────────
  // When an AI agent mutates wordoStore via MCP tools, broadcast events arrive
  // here and we reload the document from the API.
  useMcpEvents(useCallback((e) => {
    switch (e.event) {
      case 'wordo:block_updated':
      case 'wordo:block_inserted':
      case 'wordo:block_deleted':
      case 'wordo:content_updated':
      case 'wordo:document_replaced':
        // Reload document from api-server
        fetch('/api/wordo/document')
          .then(r => r.json())
          .then(body => {
            if (body?.data) {
              clearDocxPreview()
              loadFromImport({ title: body.data.title, sections: body.data.sections, assets: [], warnings: [] })
            }
          })
          .catch(() => {/* silent — connection may be unavailable */})
        break
      default:
        break
    }
  }, [clearDocxPreview, loadFromImport]))

  // ── Embed mode: load from Minato artefact on mount ───────────────────────
  useEffect(() => {
    if (!embedConfig || !artefactId || !minatoApiBase) return
    fetch(`${minatoApiBase}/api/artefacts/kasumi-wordo/${artefactId}`)
      .then(r => r.json())
      .then(body => {
        const rawContent: string | null = body?.data?.content ?? null
        if (!rawContent) return
        try {
          const envelope = JSON.parse(rawContent)
          const document = envelope?.document
          if (document && typeof document === 'object') {
            clearDocxPreview()
            loadFromImport({ title: document.title ?? 'Wordo', sections: document.sections ?? [], assets: [], warnings: [] })
          }
        } catch { /* malformed envelope — start fresh */ }
      })
      .catch(err => console.warn('[Wordo embed] Failed to load from Minato:', err))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Embed mode: save back to Minato artefact ────────────────────────────
  const handleEmbedSave = useCallback(async () => {
    if (!embedConfig || !artefactId || !minatoApiBase) return false
    try {
      // Read current envelope to preserve metadata
      const readRes = await fetch(`${minatoApiBase}/api/artefacts/kasumi-wordo/${artefactId}`)
      if (!readRes.ok) return false
      const readBody = await readRes.json()
      const rawContent: string | null = readBody?.data?.content ?? null
      const currentTitle: string = readBody?.data?.artefact?.title ?? doc.title ?? 'Wordo'
      let envelope: Record<string, unknown> = {}
      if (rawContent) { try { envelope = JSON.parse(rawContent) } catch { /* use empty */ } }
      const updatedEnvelope = {
        ...envelope,
        updated_at: new Date().toISOString(),
        document: { title: doc.title, sections: doc.sections },
      }
      const putRes = await fetch(`${minatoApiBase}/api/artefacts/kasumi-wordo/${artefactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: 'kasumi-embed',
          actor_type: 'human',
          correlation_id: `embed-${Date.now()}`,
          payload: {
            artefact_id: artefactId,
            title: currentTitle,
            content: JSON.stringify(updatedEnvelope),
          },
        }),
      })
      if (!putRes.ok) return false
      window.parent.postMessage({ type: 'kasumi:saved', artefact_id: artefactId }, '*')
      return true
    } catch { return false }
  }, [artefactId, minatoApiBase, doc])

  const [showPageSettings, setShowPageSettings] = useState(false)
  const [showNexcelDialog, setShowNexcelDialog] = useState(false)
  const [showCommentPanel, setShowCommentPanel] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [exporting, setExporting]              = useState(false)
  const [importing, setImporting]              = useState(false)
  const [importWarnings, setImportWarnings]    = useState<string[]>([])
  const [showImportWarningDetails, setShowImportWarningDetails] = useState(false)
  const [saveStatus, setSaveStatus]            = useState<'idle' | 'saved' | 'error'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const guardEditableDocMode = useCallback((action: string) => {
    if (!isDocxPreviewMode) return true
    alert(`${action} is disabled while this document is in high-fidelity DOCX preview mode. Click "Convert to editable Wordo format" first if you need editing or export.`)
    return false
  }, [isDocxPreviewMode])

  // ── Save ──────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!guardEditableDocMode('Save')) return
    if (embedConfig) {
      // Embed mode: persist to Minato artefact instead of localStorage
      handleEmbedSave().then(ok => {
        setSaveStatus(ok ? 'saved' : 'error')
        setTimeout(() => setSaveStatus('idle'), 2000)
        log.info('embed-save', { ok })
      })
      return
    }
    const ok = saveNow()
    setSaveStatus(ok ? 'saved' : 'error')
    setTimeout(() => setSaveStatus('idle'), 2000)
    log.info('manual-save', { ok })
  }, [embedConfig, guardEditableDocMode, handleEmbedSave, saveNow])

  // ── Undo / Redo ───────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (!guardEditableDocMode('Undo')) return
    if (!focusedSectionId) return
    const inst = orchestrator.getSection(focusedSectionId)
    if (!inst) return
    pmUndo(inst.state, (tr) => orchestrator.applyTransaction(focusedSectionId, tr))
  }, [focusedSectionId, guardEditableDocMode, orchestrator])

  const handleRedo = useCallback(() => {
    if (!guardEditableDocMode('Redo')) return
    if (!focusedSectionId) return
    const inst = orchestrator.getSection(focusedSectionId)
    if (!inst) return
    pmRedo(inst.state, (tr) => orchestrator.applyTransaction(focusedSectionId, tr))
  }, [focusedSectionId, guardEditableDocMode, orchestrator])

  // Native menu: New Document
  useEffect(() => onMenuNewDocument(() => {
    if (window.confirm('Start a new document? Unsaved changes will be lost.')) {
      clearDocxPreview()
      resetDocument()
    }
  }), [clearDocxPreview, resetDocument])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setShowFindReplace(v => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave, handleUndo, handleRedo])

  // ── Export .docx ──────────────────────────────────────────
  const handleExportDocx = useCallback(async () => {
    if (!guardEditableDocMode('Export .docx')) return
    setExporting(true)
    try {
      const { exportToDocx } = await import('./services/DocxExporter')
      await exportToDocx(doc, orchestrator)
    } catch (e) {
      console.error('DOCX export failed:', e)
      alert('Export failed — see console for details.')
    } finally {
      setExporting(false)
    }
  }, [doc, guardEditableDocMode, orchestrator])

  // ── Export PDF ────────────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    if (!guardEditableDocMode('Export PDF')) return
    printToPdf(doc, orchestrator)
  }, [doc, guardEditableDocMode, orchestrator])

  // ── Export Markdown ───────────────────────────────────────
  const handleExportMarkdown = useCallback(async () => {
    if (!guardEditableDocMode('Export Markdown')) return
    try {
      const res = await fetch('/api/wordo/export/markdown')
      const text = await res.text()
      const blob = new Blob([text], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${doc.title || 'document'}.md`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { console.error('Markdown export failed:', e) }
  }, [doc.title, guardEditableDocMode])

  const handleExportAuditJson = useCallback(async () => {
    if (!guardEditableDocMode('Export Audit JSON')) return
    try {
      await exportCommandAuditJson(useWordoStore.getState().document, useWordoStore.getState().commandAudit)
    } catch (e) {
      console.error('Command audit export failed:', e)
      alert('Audit export failed — see console for details.')
    }
  }, [guardEditableDocMode])

  // ── Import Markdown ───────────────────────────────────────
  const mdInputRef = useRef<HTMLInputElement>(null)
  const handleImportMarkdownClick = () => mdInputRef.current?.click()
  const handleMdFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    try {
      await fetch('/api/wordo/document/markdown', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text, title: file.name.replace(/\.md$/i, '') }),
      })
      // Reload by refreshing the page so the server-side document is re-loaded
      window.location.reload()
    } catch (e) { console.error('Markdown import failed:', e) }
  }, [])

  // ── Import .docx ──────────────────────────────────────────
  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportWarnings([])
    setShowImportWarningDetails(false)
    try {
      const title = file.name.replace(/\.docx$/i, '').replace(/[-_]/g, ' ')
      setTitle(title)
      setDocxPreviewFile(file)
      setDocxPreviewTitle(title)
      log.info('docx-preview-mode-enabled', { title, size: file.size })
    } catch (err) {
      console.error('DOCX import failed:', err)
      alert('Import failed — the file may be corrupted or unsupported.')
    } finally {
      setImporting(false)
    }
  }, [setTitle])

  const handleConvertPreviewToEditable = useCallback(async () => {
    if (!docxPreviewFile) return
    setImporting(true)
    setImportWarnings([])
    setShowImportWarningDetails(false)
    try {
      const { importDocx } = await import('./services/DocxImporter')
      const result = await importDocx(docxPreviewFile)
      clearDocxPreview()
      loadFromImport(result)
      if (result.warnings.length) {
        setImportWarnings(result.warnings)
        log.warn('docx-import-warnings', { count: result.warnings.length, warnings: result.warnings })
      }
    } catch (err) {
      console.error('DOCX conversion failed:', err)
      alert('Conversion to editable Wordo format failed — the document is still available in preview mode.')
    } finally {
      setImporting(false)
    }
  }, [clearDocxPreview, docxPreviewFile, loadFromImport])

  // ── Add Comment ───────────────────────────────────────────
  const handleAddComment = useCallback(() => {
    if (!guardEditableDocMode('Comments')) return
    if (!focusedSectionId) {
      alert('Click inside the document first, then select text to comment on.')
      return
    }
    const inst = orchestrator.getSection(focusedSectionId)
    if (!inst) return

    const selectedText = getSelectedText(inst.state)
    if (!selectedText.trim()) {
      alert('Select some text first, then click Comment.')
      return
    }

    const commentText = promptComment(selectedText)
    if (!commentText?.trim()) return

    const blockId = getSelectionBlockId(inst.state) ?? ''
    const commentId = commentStore.addComment({
      sectionId: focusedSectionId,
      anchorBlockId: blockId,
      anchorText: selectedText,
      author: 'user',
      text: commentText.trim(),
    })

    const tr = addCommentMark(inst.state, commentId)
    if (tr) orchestrator.applyTransaction(focusedSectionId, tr)

    setShowCommentPanel(true)
    log.info('comment-added-via-ui', { commentId, sectionId: focusedSectionId })
  }, [commentStore, focusedSectionId, guardEditableDocMode, orchestrator])

  // ── Accept / Reject all track changes ────────────────────
  const handleAcceptAll = useCallback(() => {
    if (!guardEditableDocMode('Accept all changes')) return
    const changes = trackChange.getAllChanges()
    if (changes.length === 0) return
    changes.forEach(change => {
      const inst = orchestrator.getSection(change.sectionId || (doc.sections[0]?.id ?? ''))
      if (!inst) return
      const tr = change.type === 'insert'
        ? acceptInsert(inst.state, change.changeId)
        : acceptDelete(inst.state, change.changeId)
      if (tr) {
        orchestrator.applyTransaction(inst.sectionId, tr)
        trackChange.removeChange(change.changeId)
      }
    })
    log.info('accept-all', { count: changes.length })
  }, [doc.sections, guardEditableDocMode, orchestrator, trackChange])

  const handleRejectAll = useCallback(() => {
    if (!guardEditableDocMode('Reject all changes')) return
    const changes = trackChange.getAllChanges()
    if (changes.length === 0) return
    changes.forEach(change => {
      const inst = orchestrator.getSection(change.sectionId || (doc.sections[0]?.id ?? ''))
      if (!inst) return
      const tr = change.type === 'insert'
        ? rejectInsert(inst.state, change.changeId)
        : rejectDelete(inst.state, change.changeId)
      if (tr) {
        orchestrator.applyTransaction(inst.sectionId, tr)
        trackChange.removeChange(change.changeId)
      }
    })
    log.info('reject-all', { count: changes.length })
  }, [doc.sections, guardEditableDocMode, orchestrator, trackChange])

  // ── Register command bus ──────────────────────────────────
  useEffect(() => {
    import('../../platform/command-bus').then(({ commandBus: bus }) => {
      bus.register('wordo', async (cmd) => {
        log.info('command-bus-received', { type: cmd.type })
        return executeSemanticCommand(cmd as any, {
          orchestrator,
          getDocument: () => useWordoStore.getState().document,
          actions: {
            addSection,
            deleteSection,
            updateSectionPageStyle,
            updateSectionWatermark,
            updateSectionHeaderFooter,
            recordCommandAudit,
          },
        })
      })
      log.info('command-bus-registered', {})
    }).catch(e => log.warn('command-bus-import-failed', { error: (e as Error).message }))
    return () => {
      import('../../platform/command-bus').then(({ commandBus: bus }) => bus.unregister('wordo'))
    }
  }, [addSection, deleteSection, orchestrator, recordCommandAudit, updateSectionHeaderFooter, updateSectionPageStyle, updateSectionWatermark])

  // ── Auto-save on doc changes ──────────────────────────────
  useEffect(() => {
    return orchestrator.subscribe(() => {
      triggerAutoSave()
    })
  }, [orchestrator, triggerAutoSave])

  // ── Test hook: stable mutation path for Playwright DOCX round-trip smoke ──
  useEffect(() => {
    const testApi = {
      appendParagraph(text: string) {
        const targetSectionId = focusedSectionId ?? doc.sections[0]?.id
        if (!targetSectionId || !text.trim()) return false
        const instance = orchestrator.getSection(targetSectionId)
        if (!instance) return false
        const paragraph = instance.state.schema.nodes.paragraph.create(
          null,
          instance.state.schema.text(text),
        )
        const tr = instance.state.tr.insert(instance.state.doc.content.size, paragraph)
        orchestrator.applyTransaction(targetSectionId, tr)
        return true
      },
      getCommandSurface() {
        return getWordoMcpToolDefinitions()
      },
      executeMcpTool(toolName: string, args: Record<string, unknown>) {
        return executeWordoMcpToolCall(toolName, args, {
          orchestrator,
          getDocument: () => useWordoStore.getState().document,
          actions: {
            addSection,
            deleteSection,
            updateSectionPageStyle,
            updateSectionWatermark,
            updateSectionHeaderFooter,
            recordCommandAudit,
          },
        })
      },
      exportCommandAudit() {
        const state = useWordoStore.getState()
        return createCommandAuditExport(state.document, state.commandAudit)
      },
    }

    ;(window as any).__kasumiWordoTest = testApi
    return () => {
      delete (window as any).__kasumiWordoTest
    }
  }, [addSection, deleteSection, doc.sections, focusedSectionId, orchestrator, recordCommandAudit, updateSectionHeaderFooter, updateSectionPageStyle, updateSectionWatermark])

  // ── Derived counts ────────────────────────────────────────
  const openCommentCount = commentStore.getAllComments().filter(c => c.status === 'open').length
  const pendingChangeCount = trackChange.getAllChanges().length

  // ── Word count ────────────────────────────────────────────
  const wordCount = (() => {
    const text = doc.sections
      .map(s => orchestrator.getSection(s.id)?.state.doc.textContent ?? '')
      .join(' ')
    return text.trim() ? text.trim().split(/\s+/).length : 0
  })()

  const WORDO_MENUS = ['File', 'Home', 'Insert', 'Layout', 'Review', 'View']
  const [activeWordoMenu, setActiveWordoMenu] = useState('Home')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Classic menu bar — matches NEXCEL */}
      <div className="wordo-no-print" style={{
        display: 'flex', alignItems: 'center',
        background: '#fff', borderBottom: '1px solid #e1dfdd',
        padding: '0 8px', height: 28, flexShrink: 0, userSelect: 'none',
      }}>
        {WORDO_MENUS.map(m => (
          <button
            key={m}
            onClick={() => setActiveWordoMenu(m)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 10px', height: '100%', fontSize: 13,
              color: activeWordoMenu === m ? '#7c3aed' : '#333',
              fontWeight: activeWordoMenu === m ? 600 : 400,
              borderBottom: activeWordoMenu === m ? '2px solid #7c3aed' : '2px solid transparent',
            }}
          >{m}</button>
        ))}
      </div>
      <div className="wordo-no-print">
        <WordoRibbon
          onNewDocument={() => { if (window.confirm('Start a new document? Unsaved changes will be lost.')) resetDocument() }}
          onPageSettings={() => setShowPageSettings(v => !v)}
          onInsertNexcel={() => setShowNexcelDialog(true)}
          onExportDocx={handleExportDocx}
          onExportPdf={handleExportPdf}
          onExportMarkdown={handleExportMarkdown}
          onExportAuditJson={handleExportAuditJson}
          onImportDocx={handleImportClick}
          onImportMarkdown={handleImportMarkdownClick}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onAddComment={handleAddComment}
          onToggleCommentPanel={() => setShowCommentPanel(v => !v)}
          onAcceptAllChanges={handleAcceptAll}
          onRejectAllChanges={handleRejectAll}
          onSave={handleSave}
          onFindReplace={() => setShowFindReplace(v => !v)}
          showCommentPanel={showCommentPanel}
          openCommentCount={openCommentCount}
          pendingChangeCount={pendingChangeCount}
          wordCount={wordCount}
          activeTab={activeWordoMenu}
        />
      </div>

      {/* Hidden file input for .docx */}
      <input
        ref={fileInputRef}
        data-testid="wordo-docx-file-input"
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Hidden file input for .md */}
      <input
        ref={mdInputRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        style={{ display: 'none' }}
        onChange={handleMdFileChange}
      />

      {/* Import warnings */}
      {importWarnings.length > 0 && (
        <div style={{
          background: '#fffbeb', borderBottom: '1px solid #f59e0b',
          padding: '6px 12px', fontSize: 11, color: '#92400e',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span>⚠ Import warnings ({importWarnings.length}):</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
              {importWarnings[0]}
            </div>
            {importWarnings.length > 1 && (
              <button
                onClick={() => setShowImportWarningDetails(v => !v)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#92400e',
                  fontSize: 11,
                  padding: 0,
                  marginTop: 4,
                  textDecoration: 'underline',
                }}
              >
                {showImportWarningDetails ? 'Hide full warning list' : `Show all warnings (${importWarnings.length})`}
              </button>
            )}
            {showImportWarningDetails && (
              <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {importWarnings.map((warning, idx) => (
                  <li key={`${idx}-${warning}`} style={{ marginBottom: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {warning}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <button
            onClick={() => {
              setImportWarnings([])
              setShowImportWarningDetails(false)
            }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#b45309', fontSize: 12 }}
          >✕</button>
        </div>
      )}

      {isDocxPreviewMode && (
        <div style={{
          background: '#eff6ff',
          borderBottom: '1px solid #93c5fd',
          padding: '8px 12px',
          fontSize: 12,
          color: '#1d4ed8',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <strong>DOCX fidelity mode:</strong>
          <span>
            This document is being rendered directly from the original Word file for maximum visual accuracy.
          </span>
          <button
            onClick={handleConvertPreviewToEditable}
            disabled={importing}
            style={{
              border: '1px solid #60a5fa',
              background: '#ffffff',
              color: '#1d4ed8',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: importing ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {importing ? 'Converting...' : 'Convert to editable Wordo format'}
          </button>
          <button
            onClick={clearDocxPreview}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#1d4ed8',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: 12,
              padding: 0,
            }}
          >
            Close preview
          </button>
        </div>
      )}

      {!isDocxPreviewMode && (
        <DocxDiagnosticsBanner document={doc} />
      )}

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {!isDocxPreviewMode && <OutlinePanel />}

        <div
          className="wordo-canvas"
          style={{ flex: 1, overflowY: 'auto', background: '#e2e2e2', padding: '0 0 60px' }}
        >
          {isDocxPreviewMode && docxPreviewFile ? (
            <DocxPreviewSurface
              file={docxPreviewFile}
              title={docxPreviewTitle ?? doc.title}
              onSurfaceFocus={(sectionId) => onSurfaceActivity?.(sectionId)}
            />
          ) : (
            doc.sections.map((section, idx) => (
              <SectionEditor
                key={section.id}
                sectionId={section.id}
                orchestrator={orchestrator}
                pageStyle={section.pageStyle}
                watermark={section.watermark}
                header={section.header}
                footer={section.footer}
                previousHeader={doc.sections[idx - 1]?.header}
                previousFooter={doc.sections[idx - 1]?.footer}
                sectionIndex={idx}
                totalSections={doc.sections.length}
                readOnly={!access.canEditBody}
                autoFocus={section.id === (autoFocusSectionId ?? doc.sections[0]?.id ?? null)}
                onSurfaceFocus={(sectionId) => onSurfaceActivity?.(sectionId)}
              />
            ))
          )}
        </div>

        {/* Comment panel — slides in on the right */}
        {showCommentPanel && !isDocxPreviewMode && (
          <CommentPanel currentUser="user" />
        )}
      </div>

      {/* Status bar */}
      <div className="wordo-no-print" style={{
        height: 24, background: '#f0f0f0', color: '#444',
        borderTop: '1px solid #d0d0d0',
        display: 'flex', alignItems: 'center', padding: '0 10px',
        fontSize: 12, flexShrink: 0, userSelect: 'none',
      }}>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
          {isDocxPreviewMode ? (
            <>
              <span>Previewing original `.docx` layout</span>
              <span style={{ color: '#aaa' }}>|</span>
              <span>High-fidelity mode</span>
              <span style={{ color: '#aaa' }}>|</span>
              <span>{docxPreviewTitle ?? doc.title}</span>
            </>
          ) : (
            <>
              <span>Page <strong>1</strong> of {doc.sections.length}</span>
              <span style={{ color: '#aaa' }}>|</span>
              <span>{doc.sections.length} section{doc.sections.length !== 1 ? 's' : ''}</span>
              <span style={{ color: '#aaa' }}>|</span>
              <span>{doc.sections[0]?.pageStyle.size ?? 'A4'} · {doc.sections[0]?.pageStyle.orientation === 'landscape' ? 'Landscape' : 'Portrait'}</span>
            </>
          )}
          <span style={{ color: '#aaa' }}>|</span>
          <span>English (AU)</span>

          {/* Track change indicator */}
          {trackChange.enabled && (
            <><span style={{ color: '#aaa' }}>|</span>
            <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 11 }}>
              🔴 Tracking {pendingChangeCount > 0 ? `· ${pendingChangeCount} pending` : ''}
            </span></>
          )}

          {/* Comment indicator */}
          {openCommentCount > 0 && (
            <><span style={{ color: '#aaa' }}>|</span>
            <span
              style={{ color: '#d97706', cursor: 'pointer', fontSize: 11 }}
              onClick={() => setShowCommentPanel(v => !v)}
            >
              💬 {openCommentCount} comment{openCommentCount !== 1 ? 's' : ''}
            </span></>
          )}

          {/* Save status */}
          {saveStatus === 'saved' && (
            <><span style={{ color: '#aaa' }}>|</span>
            <span style={{ color: '#15803d', fontSize: 11 }}>✓ Saved</span></>
          )}
          {saveStatus === 'error' && (
            <><span style={{ color: '#aaa' }}>|</span>
            <span style={{ color: '#dc2626', fontSize: 11 }}>✕ Save failed</span></>
          )}

          {importing && <><span style={{ color: '#aaa' }}>|</span><span style={{ color: '#0891b2' }}>Importing…</span></>}
          {exporting && <><span style={{ color: '#aaa' }}>|</span><span style={{ color: '#f59e0b' }}>Exporting…</span></>}
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {([
            { key: 'read',  label: '📖', title: 'Read Mode' },
            { key: 'print', label: '⊟',  title: 'Print Layout' },
            { key: 'web',   label: '🌐', title: 'Web Layout' },
          ] as const).map(v => (
            <button key={v.key} title={v.title} style={{
              background: v.key === 'print' ? '#e0e0e0' : 'none',
              border: v.key === 'print' ? '1px solid #bbb' : 'none',
              borderRadius: 3, cursor: 'pointer',
              padding: '0 4px', fontSize: 12, lineHeight: '18px', color: '#555',
            }}>{v.label}</button>
          ))}
          <span style={{ color: '#bbb', margin: '0 4px', fontSize: 11 }}>|</span>
          <input type="range" min={50} max={200} step={10} defaultValue={100}
            style={{ width: 70, accentColor: '#7c3aed', cursor: 'pointer' }}
          />
          <span style={{ minWidth: 36, fontSize: 11, color: '#555' }}>100%</span>
        </span>
      </div>

      {showPageSettings && <PageSettingsPanel onClose={() => setShowPageSettings(false)} />}
      {showFindReplace && <FindReplacePanel onClose={() => setShowFindReplace(false)} />}

      {showNexcelDialog && (
        <InsertNexcelDialog
          onInsert={(objectId, mode, caption) => insertNexcelEmbed(objectId, mode, caption)}
          onClose={() => setShowNexcelDialog(false)}
        />
      )}
    </div>
  )
}

export default WordoShellRoute
