import { describe, it, expect, beforeEach } from 'vitest'
import { useWordoStore } from '../../modules/wordo-shell/stores/useWordoStore'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'
import type { ImportResult } from '../../modules/wordo-shell/services/DocxImporter'
import { createCommandAuditExport, summarizeCommandAudit } from '../../modules/wordo-shell/services/CommandAuditExporter'
import { createDocumentWarning, createFingerprint, createProvenance } from '../../modules/wordo-shell/types/document'

function freshState() {
  // Reset store to a clean document between tests
  const state = useWordoStore.getState()
  // Tear down orchestrator sections
  state.orchestrator.getSections().forEach(inst => state.orchestrator.removeSection(inst.sectionId))
  // Re-init with a single default section
  const newDoc = {
    id: `doc_test_${Date.now()}`,
    title: 'Test Doc',
    styleRegistry: [],
    defaultPageStyle: {
      id: 'default', size: 'A4' as const, orientation: 'portrait' as const,
      margins: { top: 25, bottom: 25, left: 30, right: 25, header: 12, footer: 12 },
      differentFirstPage: false, differentOddEven: false,
    },
    sections: [{ id: 'sec_test_1', pageStyle: {
      id: 'default', size: 'A4' as const, orientation: 'portrait' as const,
      margins: { top: 25, bottom: 25, left: 30, right: 25, header: 12, footer: 12 },
      differentFirstPage: false, differentOddEven: false,
    }, blocks: [], footnotes: [], fingerprint: createFingerprint('sec_test_1'), provenance: createProvenance('system'), warnings: [] }],
    fingerprint: createFingerprint('doc_test'),
    provenance: createProvenance('system'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  newDoc.sections.forEach(s => state.orchestrator.createSection(s.id))
  useWordoStore.setState({ document: newDoc, focusedSectionId: null, commandAudit: [] })
}

describe('useWordoStore — setTitle', () => {
  beforeEach(freshState)

  it('updates document title', () => {
    useWordoStore.getState().setTitle('New Title')
    expect(useWordoStore.getState().document.title).toBe('New Title')
  })

  it('preserves sections when setting title', () => {
    const sectionCount = useWordoStore.getState().document.sections.length
    useWordoStore.getState().setTitle('Changed')
    expect(useWordoStore.getState().document.sections.length).toBe(sectionCount)
  })

  it('keeps a pagination snapshot on the document', () => {
    useWordoStore.getState().setTitle('Paginated')
    expect(useWordoStore.getState().document.pagination?.pages.length).toBeGreaterThan(0)
    expect(useWordoStore.getState().document.fidelity?.overallScore).toBeGreaterThan(0)
  })
})

describe('useWordoStore — addSection / deleteSection', () => {
  beforeEach(freshState)

  it('addSection increases section count by 1', () => {
    const before = useWordoStore.getState().document.sections.length
    useWordoStore.getState().addSection()
    expect(useWordoStore.getState().document.sections.length).toBe(before + 1)
  })

  it('added section has unique id', () => {
    useWordoStore.getState().addSection()
    const ids = useWordoStore.getState().document.sections.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('added section is registered in orchestrator', () => {
    useWordoStore.getState().addSection()
    const sections = useWordoStore.getState().document.sections
    const lastId = sections[sections.length - 1].id
    expect(useWordoStore.getState().orchestrator.getSection(lastId)).toBeDefined()
  })

  it('can insert a section at the start or after a target section', () => {
    const firstId = useWordoStore.getState().document.sections[0].id
    const insertedAtStart = useWordoStore.getState().addSection(null)
    const insertedAfterFirst = useWordoStore.getState().addSection(firstId)
    const ids = useWordoStore.getState().document.sections.map(section => section.id)

    expect(ids[0]).toBe(insertedAtStart)
    expect(ids[2]).toBe(insertedAfterFirst)
  })

  it('deleteSection removes the section', () => {
    useWordoStore.getState().addSection()
    const sections = useWordoStore.getState().document.sections
    const idToDelete = sections[sections.length - 1].id
    useWordoStore.getState().deleteSection(idToDelete)
    expect(useWordoStore.getState().document.sections.find(s => s.id === idToDelete)).toBeUndefined()
  })

  it('deleteSection removes from orchestrator', () => {
    useWordoStore.getState().addSection()
    const sections = useWordoStore.getState().document.sections
    const idToDelete = sections[sections.length - 1].id
    useWordoStore.getState().deleteSection(idToDelete)
    expect(useWordoStore.getState().orchestrator.getSection(idToDelete)).toBeUndefined()
  })
})

describe('useWordoStore — setFocusedSection', () => {
  beforeEach(freshState)

  it('sets focusedSectionId', () => {
    const id = useWordoStore.getState().document.sections[0].id
    useWordoStore.getState().setFocusedSection(id)
    expect(useWordoStore.getState().focusedSectionId).toBe(id)
  })

  it('can be cleared to null', () => {
    const id = useWordoStore.getState().document.sections[0].id
    useWordoStore.getState().setFocusedSection(id)
    useWordoStore.getState().setFocusedSection(null)
    expect(useWordoStore.getState().focusedSectionId).toBeNull()
  })
})

describe('useWordoStore — updateSectionPageStyle', () => {
  beforeEach(freshState)

  it('updates page style for the given section', () => {
    const id = useWordoStore.getState().document.sections[0].id
    const newStyle = {
      id: 'letter', size: 'Letter' as const, orientation: 'landscape' as const,
      margins: { top: 20, bottom: 20, left: 20, right: 20, header: 10, footer: 10 },
      differentFirstPage: false, differentOddEven: false,
    }
    useWordoStore.getState().updateSectionPageStyle(id, newStyle)
    const updated = useWordoStore.getState().document.sections.find(s => s.id === id)!
    expect(updated.pageStyle.size).toBe('Letter')
    expect(updated.pageStyle.orientation).toBe('landscape')
  })
})

describe('useWordoStore — updateSectionWatermark', () => {
  beforeEach(freshState)

  it('sets watermark on section', () => {
    const id = useWordoStore.getState().document.sections[0].id
    useWordoStore.getState().updateSectionWatermark(id, { enabled: true, text: 'CONFIDENTIAL', opacity: 0.2, angle: 45 })
    const updated = useWordoStore.getState().document.sections.find(s => s.id === id)!
    expect(updated.watermark?.text).toBe('CONFIDENTIAL')
    expect(updated.watermark?.opacity).toBe(0.2)
  })
})

describe('useWordoStore — updateSectionHeaderFooter', () => {
  beforeEach(freshState)

  it('stores header/footer PM JSON and preview text on the section model', () => {
    const id = useWordoStore.getState().document.sections[0].id
    const headerJson = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create(null, wordoSchema.text('Confidential Header')),
    ]).toJSON()
    const footerJson = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create(null, wordoSchema.text('Footer Signature')),
    ]).toJSON()

    useWordoStore.getState().updateSectionHeaderFooter(id, 'header', {
      id: 'hf_header_test',
      default: [],
      pmDocJson: headerJson,
      previewText: 'Confidential Header',
    })
    useWordoStore.getState().updateSectionHeaderFooter(id, 'footer', {
      id: 'hf_footer_test',
      default: [],
      pmDocJson: footerJson,
      previewText: 'Footer Signature',
    })

    const updated = useWordoStore.getState().document.sections.find(s => s.id === id)!
    expect(updated.header?.previewText).toBe('Confidential Header')
    expect(updated.footer?.previewText).toBe('Footer Signature')
    expect(wordoSchema.nodeFromJSON(updated.header?.pmDocJson as object).textContent).toContain('Confidential Header')
    expect(wordoSchema.nodeFromJSON(updated.footer?.pmDocJson as object).textContent).toContain('Footer Signature')
  })

  it('stores first/even page variants and explicit link-to-previous flags', () => {
    useWordoStore.getState().addSection()
    const sectionId = useWordoStore.getState().document.sections[1].id
    const firstPageJson = wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create(null, wordoSchema.text('First Page Header')),
    ]).toJSON()

    useWordoStore.getState().updateSectionHeaderFooter(sectionId, 'header', {
      id: 'hf_header_variant_test',
      default: [],
      pmDocJson: firstPageJson,
      previewText: 'First Page Header',
    }, 'first')
    useWordoStore.getState().updateSectionHeaderFooterLink(sectionId, 'header', 'default', true)

    const updated = useWordoStore.getState().document.sections.find(s => s.id === sectionId)!
    expect(updated.header?.variantPreviewText?.first).toBe('First Page Header')
    expect(wordoSchema.nodeFromJSON(updated.header?.variantDocs?.first as object).textContent).toContain('First Page Header')
    expect(updated.header?.linkToPrevious?.default).toBe(true)
  })
})

describe('useWordoStore — loadFromImport', () => {
  beforeEach(freshState)

  function makePmDoc(text: string) {
    return wordoSchema.nodes.doc.create(null, [
      wordoSchema.nodes.paragraph.create(null, wordoSchema.text(text)),
    ])
  }

  const mockResult: ImportResult = {
    title: 'Imported Report',
    sections: [
      {
        pmDoc: makePmDoc('Section one content'),
        fingerprint: 'fp_section_one',
        legacyPath: 'docx/sections/0',
        supportLevel: 'full',
        diagnostics: [
          createDocumentWarning('docx.section_warning', 'Section one warning', {
            objectId: 'sec_import_warning_1',
          }),
        ],
      },
      {
        pmDoc: makePmDoc('Section two content'),
        fingerprint: 'fp_section_two',
        legacyPath: 'docx/sections/1',
        supportLevel: 'full',
        diagnostics: [],
      },
    ],
    assets: [
      {
        id: 'asset_1',
        mimeType: 'image/png',
        src: 'https://example.com/chart.png',
      },
    ],
    warnings: [],
    diagnostics: [],
  }

  it('replaces document title from import', () => {
    useWordoStore.getState().loadFromImport(mockResult)
    expect(useWordoStore.getState().document.title).toBe('Imported Report')
  })

  it('creates correct number of sections from import', () => {
    useWordoStore.getState().loadFromImport(mockResult)
    expect(useWordoStore.getState().document.sections.length).toBe(2)
  })

  it('registers imported sections in orchestrator', () => {
    useWordoStore.getState().loadFromImport(mockResult)
    const sections = useWordoStore.getState().document.sections
    sections.forEach(s => {
      expect(useWordoStore.getState().orchestrator.getSection(s.id)).toBeDefined()
    })
  })

  it('clears focusedSectionId after import', () => {
    const id = useWordoStore.getState().document.sections[0].id
    useWordoStore.getState().setFocusedSection(id)
    useWordoStore.getState().loadFromImport(mockResult)
    expect(useWordoStore.getState().focusedSectionId).toBeNull()
  })

  it('imported section content is present in orchestrator state', () => {
    useWordoStore.getState().loadFromImport(mockResult)
    const sections = useWordoStore.getState().document.sections
    const inst = useWordoStore.getState().orchestrator.getSection(sections[0].id)!
    expect(inst.state.doc.textContent).toContain('Section one content')
  })

  it('stores imported diagnostics and lineage fields on the document model', () => {
    useWordoStore.getState().loadFromImport(mockResult)
    const doc = useWordoStore.getState().document
    expect(doc.metadata?.importSource).toBe('docx')
    expect(doc.sections[0].fingerprint).toBe('fp_section_one')
    expect(doc.sections[0].legacyPath).toBe('docx/sections/0')
    expect(doc.sections[0].warnings).toHaveLength(1)
    expect(doc.assets).toHaveLength(1)
    expect(doc.provenance?.source).toBe('import')
    expect(doc.fidelity?.overallScore).toBeGreaterThan(0)
  })

  it('rebuilds pagination snapshot from imported sections', () => {
    useWordoStore.getState().loadFromImport(mockResult)
    const pagination = useWordoStore.getState().document.pagination
    expect(pagination?.pages.length).toBeGreaterThan(0)
    expect(pagination?.pageMap[0].objectIds.length).toBeGreaterThan(0)
  })
})

describe('useWordoStore — command audit', () => {
  beforeEach(freshState)

  it('keeps the most recent command audit entries first', () => {
    useWordoStore.getState().recordCommandAudit({
      operationId: 'op_1',
      commandType: 'rewrite_block',
      sectionId: 'sec_test_1',
      blockId: 'para_1',
      source: 'user',
      timestamp: new Date().toISOString(),
      success: true,
      changedObjectIds: ['para_1'],
      layoutImpact: 'local',
      warnings: [],
      idMapping: [],
    })
    useWordoStore.getState().recordCommandAudit({
      operationId: 'op_2',
      commandType: 'set_page_style',
      sectionId: 'sec_test_1',
      source: 'ai',
      timestamp: new Date().toISOString(),
      success: true,
      changedObjectIds: ['sec_test_1'],
      layoutImpact: 'whole_section',
      warnings: [],
      idMapping: [],
    })

    const audit = useWordoStore.getState().commandAudit
    expect(audit).toHaveLength(2)
    expect(audit[0].operationId).toBe('op_2')
    expect(audit[1].operationId).toBe('op_1')
  })

  it('can clear command audit entries', () => {
    useWordoStore.getState().recordCommandAudit({
      operationId: 'op_clear',
      commandType: 'rewrite_block',
      sectionId: 'sec_test_1',
      blockId: 'para_1',
      source: 'user',
      timestamp: new Date().toISOString(),
      success: true,
      changedObjectIds: ['para_1'],
      layoutImpact: 'local',
      warnings: [],
      idMapping: [],
    })

    useWordoStore.getState().clearCommandAudit()
    expect(useWordoStore.getState().commandAudit).toHaveLength(0)
  })

  it('builds an exportable audit bundle with summary stats', () => {
    useWordoStore.getState().recordCommandAudit({
      operationId: 'op_export_1',
      commandType: 'rewrite_block',
      sectionId: 'sec_test_1',
      blockId: 'para_1',
      source: 'user',
      timestamp: new Date().toISOString(),
      success: true,
      changedObjectIds: ['para_1'],
      layoutImpact: 'local',
      warnings: [],
      idMapping: [],
    })
    useWordoStore.getState().recordCommandAudit({
      operationId: 'op_export_2',
      commandType: 'set_page_style',
      sectionId: 'sec_test_1',
      source: 'ai',
      timestamp: new Date().toISOString(),
      success: false,
      changedObjectIds: ['sec_test_1'],
      layoutImpact: 'whole_section',
      warnings: [],
      idMapping: [],
      error: 'layout failed',
    })

    const state = useWordoStore.getState()
    const summary = summarizeCommandAudit(state.commandAudit)
    const payload = createCommandAuditExport(state.document, state.commandAudit)

    expect(summary.totalCommands).toBe(2)
    expect(summary.aiCommandCount).toBe(1)
    expect(summary.failureCount).toBe(1)
    expect(summary.commandTypeCounts.set_page_style).toBe(1)
    expect(payload.document.id).toBe(state.document.id)
    expect(payload.summary.layoutImpactCounts.whole_section).toBe(1)
    expect(payload.entries[0].operationId).toBe('op_export_2')
  })
})

describe('useWordoStore — pagination sync', () => {
  beforeEach(freshState)

  it('refreshes pagination after orchestrator transactions', () => {
    const state = useWordoStore.getState()
    const sectionId = state.document.sections[0].id
    const inst = state.orchestrator.getSection(sectionId)!
    const beforeCount = state.document.pagination?.objectRenderMap.length ?? 0
    const tr = inst.state.tr.insert(
      inst.state.doc.content.size,
      wordoSchema.nodes.paragraph.create({ id: 'para_added' }, wordoSchema.text('Added later')),
    )

    state.orchestrator.applyTransaction(sectionId, tr)

    const pagination = useWordoStore.getState().document.pagination
    expect((pagination?.objectRenderMap.length ?? 0)).toBeGreaterThan(beforeCount)
    expect(pagination?.pageMap.some(page => page.objectIds.includes('para_added'))).toBe(true)
  })

  it('recomputes fidelity after orchestrator transactions', () => {
    const state = useWordoStore.getState()
    const sectionId = state.document.sections[0].id
    const inst = state.orchestrator.getSection(sectionId)!
    const beforeTextLength = state.document.fidelity?.sourceTextLength ?? 0
    const beforeRenderedObjects = state.document.fidelity?.renderedObjectCount ?? 0
    const tr = inst.state.tr.insert(
      inst.state.doc.content.size,
      wordoSchema.nodes.paragraph.create({ id: 'para_fidelity_added' }, wordoSchema.text('Fresh fidelity content')),
    )

    state.orchestrator.applyTransaction(sectionId, tr)

    const fidelity = useWordoStore.getState().document.fidelity
    expect(fidelity?.sourceTextLength).toBeGreaterThan(beforeTextLength)
    expect(fidelity?.renderedObjectCount).toBeGreaterThan(beforeRenderedObjects)
  })
})
