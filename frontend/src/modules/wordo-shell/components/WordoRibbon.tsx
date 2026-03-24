import React, { useCallback } from 'react'
import { useWordoStore } from '../stores/useWordoStore'
import { useWordoAccessStore } from '../stores/useWordoAccessStore'
import { setBlockType, wrapIn, toggleMark } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import { wordoSchema } from '../editor/schema'
import type { EditorState } from 'prosemirror-state'
import type { Transaction } from 'prosemirror-state'
import type { AccessMode } from '../../../platform/types'

type PmCommand = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean

const MODE_COLORS: Record<AccessMode, { bg: string; border: string; color: string; label: string }> = {
  'data-entry': { bg: '#f0fdf4', border: '#4caf50', color: '#15803d', label: '✏ Data Entry' },
  'analyst':    { bg: '#eff6ff', border: '#4f8ef7', color: '#1d4ed8', label: '📊 Analyst'   },
  'admin':      { bg: '#fef3c7', border: '#f59e0b', color: '#92400e', label: '⚙ Admin'      },
}

// ── Ribbon style helpers ──────────────────────────────────────────────────
const S = {
  bar: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 2,
    padding: '4px 10px',
    background: 'var(--surface-alt, #f8fafc)',
    borderBottom: '1px solid var(--border, #e2e8f0)',
    fontSize: 12, userSelect: 'none' as const, minHeight: 34,
  },
  sep: { width: 1, height: 20, background: 'var(--border, #e2e8f0)', margin: '0 4px', flexShrink: 0 as const },
  btn: (disabled = false): React.CSSProperties => ({
    padding: '2px 8px',
    border: `1px solid ${disabled ? '#e9ecef' : '#d0d7de'}`,
    borderRadius: 4,
    background: disabled ? '#f6f8fa' : '#ffffff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    color: disabled ? '#adb5bd' : 'var(--text-primary, #0f172a)',
    lineHeight: '18px', whiteSpace: 'nowrap' as const,
    opacity: disabled ? 0.55 : 1,
    transition: 'background 0.1s, border-color 0.1s',
  }),
  // Action button — colored when enabled
  actionBtn: (disabled: boolean, color: string, bg: string, border: string): React.CSSProperties => ({
    padding: '2px 9px',
    border: `1px solid ${disabled ? '#e9ecef' : border}`,
    borderRadius: 4,
    background: disabled ? '#f6f8fa' : bg,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    color: disabled ? '#adb5bd' : color,
    fontWeight: 500,
    lineHeight: '18px', whiteSpace: 'nowrap' as const,
    opacity: disabled ? 0.55 : 1,
    transition: 'background 0.1s, border-color 0.1s',
  }),
  select: {
    border: '1px solid #d0d7de', borderRadius: 4, background: '#fff',
    fontSize: 12, padding: '1px 4px', cursor: 'pointer',
    color: 'var(--text-primary, #0f172a)',
  } as React.CSSProperties,
}

interface WordoRibbonProps {
  onPageSettings?: () => void
  onInsertNexcel?: () => void
  onExportDocx?: () => void
  onExportPdf?: () => void
  onImportDocx?: () => void
}

export const WordoRibbon: React.FC<WordoRibbonProps> = ({
  onPageSettings, onInsertNexcel, onExportDocx, onExportPdf, onImportDocx,
}) => {
  const { document: doc, setTitle, addSection, orchestrator, focusedSectionId } = useWordoStore()
  const access = useWordoAccessStore()
  const mc = MODE_COLORS[access.mode]

  const applyCmd = useCallback((cmd: PmCommand) => {
    if (!focusedSectionId || !access.canEditBody) return
    const instance = orchestrator.getSection(focusedSectionId)
    if (!instance) return
    cmd(instance.state, (tr) => orchestrator.applyTransaction(focusedSectionId, tr))
    const el = document.querySelector(`[data-section-id="${focusedSectionId}"] .ProseMirror`) as HTMLElement | null
    el?.focus()
  }, [focusedSectionId, orchestrator, access.canEditBody])

  const setHeading   = (level: number) => applyCmd(setBlockType(wordoSchema.nodes.heading, { level }))
  const setParagraph = () => applyCmd(setBlockType(wordoSchema.nodes.paragraph))
  const setBulletList  = () => applyCmd(wrapInList(wordoSchema.nodes.bullet_list))
  const setOrderedList = () => applyCmd(wrapInList(wordoSchema.nodes.ordered_list))
  const setBlockquote  = () => applyCmd(wrapIn(wordoSchema.nodes.blockquote))
  const toggleBold     = () => applyCmd(toggleMark(wordoSchema.marks.strong))
  const toggleItalic   = () => applyCmd(toggleMark(wordoSchema.marks.em))
  const toggleCode     = () => applyCmd(toggleMark(wordoSchema.marks.code))

  const insertTable = () => {
    if (!focusedSectionId || !access.canInsertBlocks) return
    const instance = orchestrator.getSection(focusedSectionId)
    if (!instance) return
    const { state } = instance
    const s = state.schema
    const rows = Array.from({ length: 3 }, (_, r) =>
      s.nodes.table_row.create(null,
        Array.from({ length: 3 }, () =>
          (r === 0 ? s.nodes.table_header : s.nodes.table_cell).create(null, s.nodes.paragraph.create())
        )
      )
    )
    orchestrator.applyTransaction(focusedSectionId, state.tr.replaceSelectionWith(s.nodes.table.create(null, rows)))
    const el = document.querySelector(`[data-section-id="${focusedSectionId}"] .ProseMirror`) as HTMLElement | null
    el?.focus()
  }

  const noEdit = !access.canEditBody

  return (
    <div>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px 5px 210px',
        background: 'var(--surface, #fff)',
        borderBottom: '1px solid var(--border, #e2e8f0)',
      }}>
        {/* Document title */}
        <span style={{ fontSize: 13, color: 'var(--wordo-primary, #7c3aed)' }}>◈</span>
        <input
          value={doc.title}
          onChange={e => setTitle(e.target.value)}
          disabled={!access.canEditBody}
          style={{
            border: 'none', background: 'transparent',
            fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary, #0f172a)',
            outline: 'none', width: 280,
            cursor: noEdit ? 'default' : 'text',
          }}
          placeholder="Untitled Document"
        />
        <div style={{ flex: 1 }} />

        {/* Access mode selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', marginRight: 2, letterSpacing: 0.5 }}>MODE</span>
          {(['data-entry', 'analyst', 'admin'] as AccessMode[]).map(m => {
            const c = MODE_COLORS[m]
            const active = access.mode === m
            return (
              <button
                key={m}
                onClick={() => access.setMode(m)}
                style={{
                  padding: '2px 9px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  border: `1px solid ${active ? c.border : '#e2e8f0'}`,
                  background: active ? c.bg : 'var(--surface-alt, #f8fafc)',
                  color: active ? c.color : 'var(--text-muted, #94a3b8)',
                  cursor: 'pointer', transition: 'all 0.12s',
                  letterSpacing: 0.3,
                }}
              >
                {c.label}
              </button>
            )
          })}
        </div>

        <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 10, marginLeft: 6, whiteSpace: 'nowrap' }}>
          {doc.sections.length} section{doc.sections.length !== 1 ? 's' : ''}
          {focusedSectionId ? ' · editing' : ' · click page to edit'}
        </span>
      </div>

      {/* Format toolbar — dims when read-only */}
      <div style={{ ...S.bar, opacity: noEdit ? 0.6 : 1 }}>
        <select
          style={S.select}
          disabled={noEdit}
          onChange={e => {
            const v = e.target.value
            if (v === 'p') setParagraph()
            else setHeading(Number(v[1]))
          }}
          defaultValue="p"
        >
          <option value="p">Normal Text</option>
          {[1,2,3,4,5,6].map(n => <option key={n} value={`h${n}`}>Heading {n}</option>)}
        </select>

        <div style={S.sep} />

        <select style={S.select} disabled={noEdit} defaultValue="14">
          {[10,11,12,13,14,16,18,20,24,28,32].map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div style={S.sep} />

        <button style={{ ...S.btn(noEdit), fontWeight: 700 }} disabled={noEdit} onMouseDown={e => { e.preventDefault(); toggleBold() }}>B</button>
        <button style={{ ...S.btn(noEdit), fontStyle: 'italic' }} disabled={noEdit} onMouseDown={e => { e.preventDefault(); toggleItalic() }}>I</button>
        <button style={{ ...S.btn(noEdit), fontFamily: 'monospace', fontSize: 11 }} disabled={noEdit} onMouseDown={e => { e.preventDefault(); toggleCode() }}>{`</>`}</button>

        <div style={S.sep} />

        <button style={S.btn(noEdit)} disabled={noEdit} onMouseDown={e => { e.preventDefault(); setBulletList() }}>• List</button>
        <button style={S.btn(noEdit)} disabled={noEdit} onMouseDown={e => { e.preventDefault(); setOrderedList() }}>1. List</button>
        <button style={S.btn(noEdit)} disabled={noEdit} onMouseDown={e => { e.preventDefault(); setBlockquote() }}>" Quote</button>

        <div style={S.sep} />

        <button style={S.btn(!access.canInsertBlocks)} disabled={!access.canInsertBlocks} onMouseDown={e => { e.preventDefault(); insertTable() }}>⊞ Table</button>

        <div style={S.sep} />

        {/* Section Break — Nexcel blue */}
        <button
          style={S.actionBtn(!access.canInsertSections, '#1d4ed8', '#eff6ff', '#93c5fd')}
          disabled={!access.canInsertSections}
          onClick={addSection}
        >
          ⊞ Section Break
        </button>

        <div style={S.sep} />

        {/* Page Settings — neutral */}
        <button
          style={S.btn(!access.canSetPageStyle)}
          disabled={!access.canSetPageStyle}
          onClick={onPageSettings}
        >
          ⚙ Page
        </button>

        <div style={S.sep} />

        {/* Nexcel Table — green (NEXCEL brand) */}
        <button
          style={S.actionBtn(!access.canInsertBlocks, '#15803d', '#f0fdf4', '#86efac')}
          disabled={!access.canInsertBlocks}
          onClick={onInsertNexcel}
        >
          📊 Nexcel Table
        </button>

        <div style={S.sep} />

        {/* Import — teal */}
        <button
          style={S.actionBtn(!access.canImport, '#0e7490', '#ecfeff', '#67e8f9')}
          disabled={!access.canImport}
          onClick={onImportDocx}
        >
          ↑ Import .docx
        </button>

        <div style={S.sep} />

        {/* Export — WORDO purple (both buttons same family) */}
        <button
          style={S.actionBtn(!access.canExport, '#5b21b6', '#f5f3ff', '#c4b5fd')}
          disabled={!access.canExport}
          onClick={onExportDocx}
        >
          ↓ .docx
        </button>
        <button
          style={S.actionBtn(!access.canExport, '#5b21b6', '#f5f3ff', '#c4b5fd')}
          disabled={!access.canExport}
          onClick={onExportPdf}
        >
          🖨 PDF
        </button>
      </div>
    </div>
  )
}
