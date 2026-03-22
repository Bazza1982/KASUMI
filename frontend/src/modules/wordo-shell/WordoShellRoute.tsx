import React, { useState, useCallback, useRef } from 'react'
import { WordoRibbon } from './components/WordoRibbon'
import { OutlinePanel } from './components/OutlinePanel'
import { PageSettingsPanel } from './components/PageSettingsPanel'
import { InsertNexcelDialog } from './components/InsertNexcelDialog'
import { SectionEditor } from './editor/SectionEditor'
import { useWordoStore } from './stores/useWordoStore'
import { useWordoAccessStore } from './stores/useWordoAccessStore'
import { printToPdf } from './services/PdfPrinter'

export const WordoShellRoute: React.FC = () => {
  const { document: doc, orchestrator, insertNexcelEmbed, loadFromImport } = useWordoStore()
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
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
        height: 22, background: '#1e1e2e', color: '#9999bb',
        display: 'flex', alignItems: 'center', padding: '0 12px',
        fontSize: 11, gap: 16, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, color: '#4f8ef7' }}>KASUMI WORDO</span>
        <span>{doc.sections.length} section{doc.sections.length !== 1 ? 's' : ''}</span>
        <span>{doc.sections[0]?.pageStyle.size} · {doc.sections[0]?.pageStyle.orientation === 'portrait' ? 'Portrait' : 'Landscape'}</span>
        <span style={{
          padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
          background: access.mode === 'admin' ? '#fef3c7' : access.mode === 'analyst' ? '#dbeafe' : '#dcfce7',
          color:      access.mode === 'admin' ? '#92400e' : access.mode === 'analyst' ? '#1e40af' : '#15803d',
        }}>
          {access.mode.toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
        {importing && <span style={{ color: '#0891b2' }}>⏳ Importing…</span>}
        {exporting && <span style={{ color: '#f59e0b' }}>⏳ Exporting…</span>}
        <span style={{ color: '#4caf50' }}>● Ready</span>
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
