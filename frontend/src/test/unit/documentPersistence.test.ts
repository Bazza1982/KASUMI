import { beforeEach, describe, expect, it } from 'vitest'
import { createOrchestrator } from '../../modules/wordo-shell/editor/LayoutOrchestrator'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'
import { loadDocument, saveDocument } from '../../modules/wordo-shell/services/DocumentPersistence'
import {
  createDefaultPageStyle,
  createFingerprint,
  createProvenance,
  type HeaderFooter,
  type KasumiDocument,
} from '../../modules/wordo-shell/types/document'

function makeHeaderFooter(text: string): HeaderFooter {
  const pmDocJson = wordoSchema.nodes.doc.create(null, [
    wordoSchema.nodes.paragraph.create(null, wordoSchema.text(text)),
  ]).toJSON()
  const firstPageJson = wordoSchema.nodes.doc.create(null, [
    wordoSchema.nodes.paragraph.create(null, wordoSchema.text(`${text} First`)),
  ]).toJSON()

  return {
    id: createFingerprint(`hf-id:${text}`),
    default: [],
    pmDocJson,
    previewText: text,
    variantDocs: {
      default: pmDocJson,
      first: firstPageJson,
    },
    variantPreviewText: {
      default: text,
      first: `${text} First`,
    },
    linkToPrevious: {
      default: false,
      first: false,
      even: true,
    },
    fingerprint: createFingerprint(text),
    provenance: createProvenance('user'),
  }
}

function makeDocument(sectionId: string): KasumiDocument {
  const now = new Date().toISOString()
  return {
    id: 'doc_persist_test',
    title: 'Persistence Regression',
    metadata: { title: 'Persistence Regression', importSource: 'manual' },
    styleRegistry: [],
    defaultPageStyle: createDefaultPageStyle({ id: 'page_default' }),
    sections: [
      {
        id: sectionId,
        pageStyle: createDefaultPageStyle({ id: 'page_section' }),
        header: makeHeaderFooter('Confidential Memo'),
        footer: makeHeaderFooter('Prepared by Renee'),
        blocks: [],
        footnotes: [],
        blockIds: [],
        fingerprint: createFingerprint(sectionId),
        provenance: createProvenance('system'),
        warnings: [],
      },
    ],
    styles: [],
    numbering: [],
    assets: [],
    warnings: [],
    fingerprint: createFingerprint('doc_persist_test'),
    provenance: createProvenance('system'),
    createdAt: now,
    updatedAt: now,
  }
}

describe('DocumentPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and loads header/footer content with the section payload', () => {
    const orchestrator = createOrchestrator()
    const sectionId = 'sec_persist'
    const pmDoc = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create(null, wordoSchema.text('Body content')),
    ])
    orchestrator.createSection(sectionId, pmDoc)

    const ok = saveDocument({
      orchestrator,
      document: makeDocument(sectionId),
      comments: [],
      trackChanges: [],
    })

    expect(ok).toBe(true)

    const loaded = loadDocument('doc_persist_test')
    expect(loaded).not.toBeNull()
    expect(loaded?.sections[0].header?.previewText).toBe('Confidential Memo')
    expect(loaded?.sections[0].footer?.previewText).toBe('Prepared by Renee')
    expect(wordoSchema.nodeFromJSON(loaded?.sections[0].header?.pmDocJson as object).textContent).toContain('Confidential Memo')
    expect(loaded?.sections[0].header?.variantPreviewText?.first).toBe('Confidential Memo First')
    expect(loaded?.sections[0].header?.linkToPrevious?.even).toBe(true)
  })
})
