import { describe, it, expect, beforeEach } from 'vitest'
import { useWordoStore } from '../../modules/wordo-shell/stores/useWordoStore'
import { wordoSchema } from '../../modules/wordo-shell/editor/schema'
import type { ImportResult } from '../../modules/wordo-shell/services/DocxImporter'

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
    }, blocks: [], footnotes: [] }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  newDoc.sections.forEach(s => state.orchestrator.createSection(s.id))
  useWordoStore.setState({ document: newDoc, focusedSectionId: null })
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
      { pmDoc: makePmDoc('Section one content') },
      { pmDoc: makePmDoc('Section two content') },
    ],
    warnings: [],
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
})
