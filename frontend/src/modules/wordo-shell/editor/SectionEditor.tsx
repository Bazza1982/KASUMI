import React, { useEffect, useRef, useState } from 'react'
import { EditorView } from 'prosemirror-view'
import { TableView } from 'prosemirror-tables'
import { NexcelEmbedView } from './NexcelEmbedView'
import { HeaderFooterEditor } from './HeaderFooterEditor'
import { WatermarkOverlay } from '../components/WatermarkOverlay'
import { useWordoStore } from '../stores/useWordoStore'
import type { LayoutOrchestrator } from './LayoutOrchestrator'
import type { HeaderFooter, PageStyle, SectionId, WatermarkConfig } from '../types/document'
import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-tables/style/tables.css'
import './wordo-editor.css'

interface SectionEditorProps {
  sectionId: SectionId
  orchestrator: LayoutOrchestrator
  pageStyle: PageStyle
  watermark?: WatermarkConfig
  header?: HeaderFooter
  footer?: HeaderFooter
  previousHeader?: HeaderFooter
  previousFooter?: HeaderFooter
  sectionIndex: number     // 0-based — used for page number calculation
  totalSections: number
  readOnly?: boolean
  autoFocus?: boolean
  onSurfaceFocus?: (sectionId: string) => void
}

const MM_TO_PX = 3.7795275591
const mmToPx = (mm: number) => Math.round(mm * MM_TO_PX)

export const SectionEditor: React.FC<SectionEditorProps> = ({
  sectionId, orchestrator, pageStyle, watermark, header, footer, previousHeader, previousFooter,
  sectionIndex, totalSections, readOnly = false, autoFocus = false, onSurfaceFocus,
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewRef  = useRef<EditorView | null>(null)
  const [focused, setFocused] = useState(false)

  const isLandscape = pageStyle.orientation === 'landscape'
  const pageW = mmToPx(isLandscape ? 297 : 210)
  const pageH = mmToPx(isLandscape ? 210 : 297)
  const ml = mmToPx(pageStyle.margins.left)
  const mr = mmToPx(pageStyle.margins.right)
  const mt = mmToPx(pageStyle.margins.top)
  const mb = mmToPx(pageStyle.margins.bottom)
  const headerH = mmToPx(pageStyle.margins.header)
  const footerH = mmToPx(pageStyle.margins.footer)

  // Estimated page number (simple: 1 section ≈ 1 page for now)
  const pageNum = sectionIndex + 1

  useEffect(() => {
    if (!mountRef.current) return
    const instance = orchestrator.getSection(sectionId)
    if (!instance) return

    const view = new EditorView(mountRef.current, {
      state: instance.state,
      editable: () => !readOnly,
      nodeViews: {
        table: (node) => new TableView(node, 100),
        nexcel_embed: (node, view) => new NexcelEmbedView(node, view),
      },
      dispatchTransaction(tr) {
        orchestrator.applyTransaction(sectionId, tr)
        const updated = orchestrator.getSection(sectionId)
        if (updated && !view.isDestroyed) view.updateState(updated.state)
      },
    })
    viewRef.current = view

    const onFocusIn  = () => {
      setFocused(true)
      orchestrator.setFocusedSection(sectionId)
      useWordoStore.getState().setFocusedSection(sectionId)
      onSurfaceFocus?.(sectionId)
    }
    const onFocusOut = (e: FocusEvent) => {
      // If focus moved to another element inside the editor section, ignore
      const relatedTarget = e.relatedTarget as Node | null
      if (relatedTarget && mountRef.current?.contains(relatedTarget)) return
      // If focus moved to a ProseMirror editor in another section, allow clear
      // Otherwise (focus moved to Ribbon/toolbar/button), keep focusedSectionId intact
      if (relatedTarget && (relatedTarget as HTMLElement).closest?.('.wordo-section-wrapper')) {
        setFocused(false)
        return
      }
      // Focus went to toolbar/ribbon — keep section focused so commands still work
      setFocused(false)
      // Do NOT clear focusedSectionId here
    }
    mountRef.current.addEventListener('focusin',  onFocusIn)
    mountRef.current.addEventListener('focusout', onFocusOut)

    return () => { view.destroy(); viewRef.current = null }
  }, [sectionId, orchestrator, readOnly, onSurfaceFocus])

  useEffect(() => {
    if (!autoFocus || readOnly) return
    const frame = window.requestAnimationFrame(() => {
      viewRef.current?.focus()
      onSurfaceFocus?.(sectionId)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus, readOnly, sectionId, onSurfaceFocus])

  return (
    <div
      className="wordo-section-wrapper"
      data-section-id={sectionId}
      data-testid={`wordo-section-${sectionId}`}
      style={{ marginTop: sectionIndex === 0 ? 32 : 0 }}
    >
      <div
        className={`wordo-page${focused ? ' focused' : ''}`}
        data-testid={`wordo-page-${sectionId}`}
        style={{
          width: pageW,
          minHeight: pageH,
          margin: '0 auto 32px',
          background: '#fff',
          boxShadow: focused
            ? '0 2px 20px rgba(79,142,247,0.22), 0 2px 12px rgba(0,0,0,0.15)'
            : '0 2px 12px rgba(0,0,0,0.18)',
          position: 'relative',
          transition: 'box-shadow 0.15s',
          overflow: 'hidden',
        }}
      >
        {/* Watermark — behind all content */}
        {watermark && (
          <WatermarkOverlay config={watermark} pageWidth={pageW} pageHeight={pageH} />
        )}

        {/* ── Header ── */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: mt, zIndex: 1 }}>
          <HeaderFooterEditor
            sectionId={sectionId}
            zone="header"
            value={header}
            inheritedValue={previousHeader}
            hasPreviousSection={sectionIndex > 0}
            differentFirstPage={pageStyle.differentFirstPage}
            differentOddEven={pageStyle.differentOddEven}
            pageNumber={pageNum}
            totalPages={totalSections}
            height={headerH}
            paddingH={ml}
            readOnly={readOnly}
          />
        </div>

        {/* ── Body text area ── */}
        <div
          ref={mountRef}
          className="wordo-editor-surface"
          data-testid={`wordo-editor-surface-${sectionId}`}
          style={{
            paddingTop: mt,
            paddingBottom: mb,
            paddingLeft: ml,
            paddingRight: mr,
            minHeight: pageH - mt - mb,
            outline: 'none',
            fontSize: 14,
            lineHeight: 1.7,
            fontFamily: '"Calibri", "Segoe UI", Arial, sans-serif',
            color: '#1a1a1a',
            cursor: 'text',
            position: 'relative',
            zIndex: 1,
          }}
        />

        {/* ── Footer ── */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: mb, zIndex: 1 }}>
          <HeaderFooterEditor
            sectionId={sectionId}
            zone="footer"
            value={footer}
            inheritedValue={previousFooter}
            hasPreviousSection={sectionIndex > 0}
            differentFirstPage={pageStyle.differentFirstPage}
            differentOddEven={pageStyle.differentOddEven}
            pageNumber={pageNum}
            totalPages={totalSections}
            height={footerH}
            paddingH={ml}
            readOnly={readOnly}
          />
        </div>

        {/* Section badge */}
        <div style={{
          position: 'absolute', bottom: mb + footerH + 4, right: 8,
          fontSize: 9, color: '#ccc', pointerEvents: 'none',
        }}>
          §{sectionIndex + 1}
        </div>
      </div>
    </div>
  )
}
