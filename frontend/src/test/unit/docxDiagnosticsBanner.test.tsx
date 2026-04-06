import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DocxDiagnosticsBanner } from '../../modules/wordo-shell/components/DocxDiagnosticsBanner'
import {
  createDefaultPageStyle,
  createDocumentWarning,
  createFingerprint,
  createProvenance,
  type KasumiDocument,
} from '../../modules/wordo-shell/types/document'

function makeDocument(): KasumiDocument {
  return {
    id: 'doc_diag',
    title: 'Imported document',
    metadata: { title: 'Imported document', importSource: 'docx' },
    styleRegistry: [],
    defaultPageStyle: createDefaultPageStyle({ id: 'page_default' }),
    sections: [
      {
        id: 'sec_1',
        pageStyle: createDefaultPageStyle({ id: 'page_sec_1' }),
        blocks: [],
        footnotes: [],
        fingerprint: createFingerprint('sec_1'),
        provenance: createProvenance('import'),
        warnings: [
          createDocumentWarning('docx.unsupported_object_retained', 'Unsupported object retained as placeholder'),
        ],
      },
    ],
    styles: [],
    numbering: [],
    assets: [],
    warnings: [],
    pagination: {
      pages: [],
      pageMap: [],
      objectRenderMap: [],
      selectionMap: [],
      renderWarnings: [],
    },
    fidelity: {
      overallScore: 0.92,
      grade: 'high',
      sourceBlockCount: 8,
      renderedObjectCount: 8,
      sourceTextBlockCount: 6,
      renderedTextBlockCount: 6,
      sourceTextLength: 120,
      renderedTextLength: 120,
      sourceImageCount: 1,
      renderedImageCount: 1,
      sourceTableCount: 1,
      renderedTableCount: 1,
      pageCount: 2,
      warningCount: 1,
      breakdown: {
        objectCoverage: 1,
        textCoverage: 1,
        textLengthCoverage: 1,
        imageCoverage: 1,
        tableCoverage: 1,
        sectionSupport: 0.9,
        warningPenalty: 0.95,
      },
    },
    fingerprint: createFingerprint('doc_diag'),
    provenance: createProvenance('import'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('DocxDiagnosticsBanner', () => {
  it('shows fidelity summary for imported docx documents', () => {
    render(<DocxDiagnosticsBanner document={makeDocument()} />)

    expect(screen.getByText('DOCX diagnostics:')).toBeInTheDocument()
    expect(screen.getByText('Fidelity 92% (high)')).toBeInTheDocument()
    expect(screen.getByText('8/8 objects mapped')).toBeInTheDocument()
    expect(screen.getByText('1/1 tables preserved')).toBeInTheDocument()
    expect(screen.getByText('1/1 images preserved')).toBeInTheDocument()
    expect(screen.getByText('120/120 text chars retained')).toBeInTheDocument()
  })

  it('expands warning details on demand', () => {
    render(<DocxDiagnosticsBanner document={makeDocument()} />)

    fireEvent.click(screen.getByText('Show warning details'))

    expect(screen.getByText(/docx\.unsupported_object_retained/)).toBeInTheDocument()
  })
})
