import { describe, expect, it } from 'vitest'
import { createOrchestrator } from '../../modules/wordo-shell/editor/LayoutOrchestrator'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'
import { buildPaginationSnapshot } from '../../modules/wordo-shell/services/PaginationSnapshotBuilder'
import {
  createDefaultPageStyle,
  createFingerprint,
  createProvenance,
  type KasumiDocument,
} from '../../modules/wordo-shell/types/document'

function makeDoc(sectionId: string, pmDoc: ReturnType<typeof wordoSchema.nodes.doc.create>): {
  document: KasumiDocument
  orchestrator: ReturnType<typeof createOrchestrator>
} {
  const orchestrator = createOrchestrator()
  orchestrator.createSection(sectionId, pmDoc)

  return {
    orchestrator,
    document: {
      id: 'doc_test',
      title: 'Pagination Test',
      metadata: { title: 'Pagination Test', importSource: 'manual' },
      styleRegistry: [],
      defaultPageStyle: createDefaultPageStyle({ id: 'page_default' }),
      sections: [
        {
          id: sectionId,
          pageStyle: createDefaultPageStyle({ id: 'page_sec' }),
          blocks: [],
          footnotes: [],
          fingerprint: createFingerprint(sectionId),
          provenance: createProvenance('system'),
          warnings: [],
        },
      ],
      styles: [],
      numbering: [],
      assets: [],
      warnings: [],
      fingerprint: createFingerprint('doc_test'),
      provenance: createProvenance('system'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }
}

describe('buildPaginationSnapshot', () => {
  it('builds page, fragment, and selection mappings for section content', () => {
    const pmDoc = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.heading.create({ id: 'heading_1', level: 1 }, wordoSchema.text('Phase 2')),
      wordoSchema.nodes.paragraph.create({ id: 'para_1' }, wordoSchema.text('Hello pagination mapping')),
    ])
    const { document, orchestrator } = makeDoc('sec_1', pmDoc)

    const snapshot = buildPaginationSnapshot(document, orchestrator)

    expect(snapshot.pages).toHaveLength(1)
    expect(snapshot.pageMap[0].objectIds).toEqual(['heading_1', 'para_1'])
    expect(snapshot.objectRenderMap.map(fragment => fragment.objectId)).toEqual(['heading_1', 'para_1'])
    expect(snapshot.selectionMap.some(entry => entry.anchorId === 'text:para_1:start')).toBe(true)
    expect(snapshot.selectionMap.some(entry => entry.anchorId === 'range:para_1:full')).toBe(true)
  })

  it('starts a new page when content exceeds the current body height', () => {
    const paragraphs = Array.from({ length: 40 }, (_, index) =>
      wordoSchema.nodes.paragraph.create(
        { id: `para_${index}` },
        wordoSchema.text(`Paragraph ${index} `.repeat(30)),
      ),
    )
    const pmDoc = wordoSchema.nodes.doc.create(null, paragraphs)
    const { document, orchestrator } = makeDoc('sec_2', pmDoc)

    const snapshot = buildPaginationSnapshot(document, orchestrator)

    expect(snapshot.pages.length).toBeGreaterThan(1)
    expect(snapshot.pageMap[0].objectIds).toContain('para_0')
    expect(snapshot.pageMap[snapshot.pageMap.length - 1].objectIds).toContain('para_39')
  })

  it('emits a warning when block ids are missing and synthetic ids are required', () => {
    const pmDoc = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create(null, wordoSchema.text('No explicit id')),
    ])
    const { document, orchestrator } = makeDoc('sec_warn', pmDoc)

    const snapshot = buildPaginationSnapshot(document, orchestrator)

    expect(snapshot.renderWarnings.some(warning => warning.code === 'pagination.synthetic_object_id')).toBe(true)
    expect(snapshot.pageMap[0].objectIds[0].startsWith('synthetic_fp_')).toBe(true)
  })

  it('classifies image-only paragraphs as image render objects', () => {
    const pmDoc = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create(
        { id: 'img_para_1' },
        [wordoSchema.nodes.image.create({ src: 'https://example.com/chart.png', alt: 'Chart', title: 'Chart' })],
      ),
    ])
    const { document, orchestrator } = makeDoc('sec_img', pmDoc)

    const snapshot = buildPaginationSnapshot(document, orchestrator)

    expect(snapshot.pages[0].objectRefs[0]).toEqual({ objectId: 'img_para_1', kind: 'image' })
    expect(snapshot.objectRenderMap[0].bounds.height).toBeGreaterThan(20)
  })
})
