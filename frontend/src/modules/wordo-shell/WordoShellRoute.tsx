import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { WordoRibbon } from './components/WordoRibbon'
import { OutlinePanel } from './components/OutlinePanel'
import { PageSettingsPanel } from './components/PageSettingsPanel'
import { InsertNexcelDialog } from './components/InsertNexcelDialog'
import { CommentPanel } from './components/CommentPanel'
import { SectionEditor } from './editor/SectionEditor'
import { useWordoStore } from './stores/useWordoStore'
import { useWordoAccessStore } from './stores/useWordoAccessStore'
import { useTrackChangeStore } from './stores/useTrackChangeStore'
import { printToPdf } from './services/PdfPrinter'
import { executeCommand } from './services/CommandExecutor'
import { createLogger } from './editor/logger'

const log = createLogger('WordoShellRoute')

export const WordoShellRoute: React.FC = () => {
  const { document: doc, orchestrator, insertNexcelEmbed, loadFromImport, saveNow, triggerAutoSave } = useWordoStore()
  const access = useWordoAccessStore()
  const [showPageSettings, setShowPageSettings]   = useState(false)
  const [showNexcelDialog, setShowNexcelDialog]   = useState(false)
  const [exporting, setExporting]                 = useState(false)
  const [importing, setImporting]                 = useState(false)
  const [importWarnings, setImportWarnings]        = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Export .docx ──────────────────────────────────────────
  const handleExportDocx = useCallback(async () => {
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
  }, [doc, orchestrator])

  // ── Export PDF ────────────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    printToPdf(doc, orchestrator)
  }, [doc, orchestrator])

  // ── Import .docx ──────────────────────────────────────────
  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // allow re-selecting same file

    setImporting(true)
    setImportWarnings([])
    try {
      const { importDocx } = await import('./services/DocxImporter')
      const result = await importDocx(file)
      loadFromImport(result)
      if (result.warnings.length) setImportWarnings(result.warnings.slice(0, 3))
    } catch (err) {
      console.error('DOCX import failed:', err)
      alert('Import failed — the file may be corrupted or unsupported.')
    } finally {
      setImporting(false)
    }
  }, [loadFromImport])

  const trackChangeStore = useTrackChangeStore()
  const [showCommentPanel, setShowCommentPanel] = useState(false)

  // ── Register command bus handler ──────────────────────────
  useEffect(() => {
    import('../../platform/command-bus').then(({ commandBus: bus }) => {
      bus.register('wordo', async (cmd) => {
        log.info('command-bus-received', { type: cmd.type })
        return executeCommand(cmd as any, orchestrator)
      })
      log.info('command-bus-registered', {})
    }).catch(e => log.warn('command-bus-import-failed', { error: (e as Error).message }))
    return () => {
      import('../../platform/command-bus').then(({ commandBus: bus }) => bus.unregister('wordo'))
    }
  }, [orchestrator])

  // ── Auto-save: trigger on orchestrator changes ────────────
  useEffect(() => {
    return orchestrator.subscribe(() => {
      triggerAutoSave()
    })
  }, [orchestrator, triggerAutoSave])

  const WORDO_MENUS = ['File', 'Home', 'Insert', 'Draw', 'Design', 'Layout', 'References', 'Mailings', 'Review', 'View', 'Help']
  const [activeMenu, setActiveMenu] = useState('Home')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Classic menu bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '0 8px', height: 28, flexShrink: 0, userSelect: 'none',
      }}>
        {WORDO_MENUS.map(m => (
          <button
            key={m}
            onClick={() => setActiveMenu(m)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 10px', height: '100%', fontSize: 13,
              color: activeMenu === m ? '#7c3aed' : '#333',
              fontWeight: activeMenu === m ? 600 : 400,
              borderBottom: activeMenu === m ? '2px solid #7c3aed' : '2px solid transparent',
            }}
          >{m}</button>
        ))}
      </div>
      <WordoRibbon
        onPageSettings={() => setShowPageSettings(v => !v)}
        onInsertNexcel={() => setShowNexcelDialog(true)}
        onExportDocx={handleExportDocx}
        onExportPdf={handleExportPdf}
        onImportDocx={handleImportClick}
      />

      {/* Hidden file input for .docx import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Import warnings toast */}
      {importWarnings.length > 0 && (
        <div style={{
          background: '#fffbeb', borderBottom: '1px solid #f59e0b',
          padding: '6px 12px', fontSize: 11, color: '#92400e',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠ Import warnings ({importWarnings.length}):</span>
          <span style={{ flex: 1 }}>{importWarnings[0]}{importWarnings.length > 1 ? ` … +${importWarnings.length - 1} more` : ''}</span>
          <button
            onClick={() => setImportWarnings([])}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#b45309', fontSize: 12 }}
          >✕</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <OutlinePanel />

        <div
          className="wordo-canvas"
          style={{ flex: 1, overflowY: 'auto', background: '#e2e2e2', padding: '0 0 60px' }}
        >
          {doc.sections.map((section, idx) => (
            <SectionEditor
              key={section.id}
              sectionId={section.id}
              orchestrator={orchestrator}
              pageStyle={section.pageStyle}
              watermark={section.watermark}
              sectionIndex={idx}
              totalSections={doc.sections.length}
              readOnly={!access.canEditBody}
            />
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        height: 24, background: '#f0f0f0', color: '#444',
        borderTop: '1px solid #d0d0d0',
        display: 'flex', alignItems: 'center', padding: '0 10px',
        fontSize: 12, flexShrink: 0, userSelect: 'none',
      }}>
        {/* Left — document info */}
        <span style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
          <span>Page <strong>1</strong> of {doc.sections.length}</span>
          <span style={{ color: '#aaa' }}>|</span>
          <span>{doc.sections.length} section{doc.sections.length !== 1 ? 's' : ''}</span>
          <span style={{ color: '#aaa' }}>|</span>
          <span>{doc.sections[0]?.pageStyle.size ?? 'A4'} · {doc.sections[0]?.pageStyle.orientation === 'landscape' ? 'Landscape' : 'Portrait'}</span>
          <span style={{ color: '#aaa' }}>|</span>
          <span>English (AU)</span>
          <span style={{ color: '#aaa' }}>|</span>
          <span style={{
            padding: '0px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700,
            background: access.mode === 'admin' ? '#fef3c7' : access.mode === 'analyst' ? '#dbeafe' : '#dcfce7',
            color:      access.mode === 'admin' ? '#92400e' : access.mode === 'analyst' ? '#1e40af' : '#15803d',
          }}>{access.mode.toUpperCase()}</span>
          {importing && <><span style={{ color: '#aaa' }}>|</span><span style={{ color: '#0891b2' }}>Importing…</span></>}
          {exporting && <><span style={{ color: '#aaa' }}>|</span><span style={{ color: '#f59e0b' }}>Exporting…</span></>}
        </span>

        {/* Right — view icons + zoom */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {([
            { key: 'read',   label: '📖', title: 'Read Mode' },
            { key: 'print',  label: '⊟',  title: 'Print Layout' },
            { key: 'web',    label: '🌐', title: 'Web Layout' },
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
