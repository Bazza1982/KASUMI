import React, { useMemo, useState } from 'react'
import type { DocumentWarning, KasumiDocument } from '../types/document'

function warningKey(warning: DocumentWarning): string {
  return [
    warning.id,
    warning.code,
    warning.objectId ?? '',
    warning.sourceLocation?.path ?? '',
  ].join('|')
}

function collectWarnings(document: KasumiDocument): DocumentWarning[] {
  const warnings = [
    ...(document.warnings ?? []),
    ...document.sections.flatMap(section => section.warnings ?? []),
    ...(document.pagination?.renderWarnings ?? []),
  ]
  const deduped = new Map<string, DocumentWarning>()
  warnings.forEach(warning => {
    deduped.set(warningKey(warning), warning)
  })
  return [...deduped.values()]
}

function formatPercent(score: number | undefined): string {
  return `${Math.round((score ?? 0) * 100)}%`
}

export const DocxDiagnosticsBanner: React.FC<{ document: KasumiDocument }> = ({ document }) => {
  const [showDetails, setShowDetails] = useState(false)
  const warnings = useMemo(() => collectWarnings(document), [document])
  const fidelity = document.fidelity

  if (document.metadata?.importSource !== 'docx' || (!fidelity && warnings.length === 0)) {
    return null
  }

  return (
    <div style={{
      background: '#f8fafc',
      borderBottom: '1px solid #cbd5e1',
      padding: '8px 12px',
      fontSize: 12,
      color: '#334155',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      flexWrap: 'wrap',
    }}
    data-testid="wordo-docx-diagnostics-banner"
    >
      <strong>DOCX diagnostics:</strong>
      {fidelity && (
        <>
          <span>Fidelity {formatPercent(fidelity.overallScore)} ({fidelity.grade})</span>
          <span>{fidelity.pageCount} pages</span>
          <span>{fidelity.renderedObjectCount}/{fidelity.sourceBlockCount} objects mapped</span>
          <span>{fidelity.renderedTableCount}/{fidelity.sourceTableCount} tables preserved</span>
          <span>{fidelity.renderedImageCount}/{fidelity.sourceImageCount} images preserved</span>
          <span>{fidelity.renderedTextLength}/{fidelity.sourceTextLength} text chars retained</span>
        </>
      )}
      <span>{warnings.length} warnings</span>
      {warnings.length > 0 && (
        <>
          <button
            onClick={() => setShowDetails(value => !value)}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#0f172a',
              padding: 0,
              textDecoration: 'underline',
              fontSize: 12,
            }}
          >
            {showDetails ? 'Hide warning details' : 'Show warning details'}
          </button>
          {showDetails && (
            <ol style={{ margin: '4px 0 0 16px', padding: 0, width: '100%' }}>
              {warnings.map(warning => (
                <li key={warningKey(warning)} style={{ marginBottom: 4 }}>
                  {warning.code}: {warning.message}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
