import React, { useEffect, useRef, useState } from 'react'
import { createLogger } from '../editor/logger'
import './docx-preview.css'

const log = createLogger('DocxPreviewSurface')

export const DOCX_PREVIEW_SECTION_ID = 'docx-preview-surface'

interface DocxPreviewSurfaceProps {
  file: Blob
  title?: string
  onSurfaceFocus?: (sectionId: string) => void
}

export const DocxPreviewSurface: React.FC<DocxPreviewSurfaceProps> = ({
  file,
  title = 'Word document',
  onSurfaceFocus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderState, setRenderState] = useState<'rendering' | 'ready' | 'error'>('rendering')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function renderPreview(): Promise<void> {
      const container = containerRef.current
      if (!container) return

      setRenderState('rendering')
      setErrorMessage(null)
      container.innerHTML = ''

      try {
        const { renderAsync } = await import('docx-preview')

        await renderAsync(file, container, undefined, {
          className: 'wordo-docx-preview',
          inWrapper: false,
          hideWrapperOnPrint: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderChanges: true,
          debug: process.env.NODE_ENV === 'development',
        })

        if (cancelled) return
        setRenderState('ready')
        log.info('docx-preview-rendered', { title, size: file.size })
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Unknown DOCX preview error'
        setRenderState('error')
        setErrorMessage(message)
        container.innerHTML = ''
        log.error('docx-preview-render-failed', { title, message })
      }
    }

    renderPreview()

    return () => {
      cancelled = true
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [file, title])

  return (
    <div
      className="wordo-docx-preview-shell"
      data-testid="wordo-docx-preview-shell"
      data-section-id={DOCX_PREVIEW_SECTION_ID}
      onMouseDown={() => onSurfaceFocus?.(DOCX_PREVIEW_SECTION_ID)}
    >
      {renderState === 'rendering' && (
        <div className="wordo-docx-preview-status">
          Rendering Word document: {title}
        </div>
      )}

      {renderState === 'error' && (
        <div className="wordo-docx-preview-error">
          <strong>DOCX preview failed.</strong>
          <div>{errorMessage ?? 'Unknown error'}</div>
        </div>
      )}

      <div ref={containerRef} className="wordo-docx-preview-host" data-testid="wordo-docx-preview-host" />
    </div>
  )
}
