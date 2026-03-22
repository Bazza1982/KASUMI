import { create } from 'zustand'
import { EditorState } from 'prosemirror-state'
import { createOrchestrator, LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import { wordoSchema } from '../editor/schema'
import { buildPlugins } from '../editor/sectionPlugins'
import type { KasumiDocument, DocumentSection, PageStyle, WatermarkConfig } from '../types/document'
import type { ImportResult } from '../services/DocxImporter'

const DEFAULT_PAGE_STYLE: PageStyle = {
  id: 'default',
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 25, bottom: 25, left: 30, right: 25, header: 12, footer: 12 },
  differentFirstPage: false,
  differentOddEven: false,
}

function makeSection(id: string): DocumentSection {
  return { id, pageStyle: { ...DEFAULT_PAGE_STYLE }, blocks: [], footnotes: [] }
}

function makeNewDocument(): KasumiDocument {
  const now = new Date().toISOString()
  return {
    id: `doc_${Date.now()}`,
    title: 'Untitled Document',
    styleRegistry: [],
    defaultPageStyle: DEFAULT_PAGE_STYLE,
    sections: [makeSection(`sec_${Date.now()}`)],
    createdAt: now,
    updatedAt: now,
  }
}

function patchSection(sections: DocumentSection[], sectionId: string, patch: Partial<DocumentSection>): DocumentSection[] {
  return sections.map(s => s.id === sectionId ? { ...s, ...patch } : s)
}

interface WordoState {
  document: KasumiDocument
  orchestrator: LayoutOrchestrator
  focusedSectionId: string | null

  setTitle: (title: string) => void
  addSection: () => void
  deleteSection: (sectionId: string) => void
  setFocusedSection: (sectionId: string | null) => void
  updateSectionPageStyle: (sectionId: string, pageStyle: PageStyle) => void
  updateSectionWatermark: (sectionId: string, watermark: WatermarkConfig) => void
  insertNexcelEmbed: (sourceObjectId: string, mode: 'linked' | 'snapshot', caption: string) => void
  loadFromImport: (result: ImportResult) => void
}

export const useWordoStore = create<WordoState>((set, get) => {
  const doc = makeNewDocument()
  const orchestrator = createOrchestrator()
  doc.sections.forEach(s => orchestrator.createSection(s.id))

  return {
    document: doc,
    orchestrator,
    focusedSectionId: null,

    setTitle: (title) => set(s => ({ document: { ...s.document, title } })),

    addSection: () => {
      const newSection = makeSection(`sec_${Date.now()}`)
      get().orchestrator.createSection(newSection.id)
      set(s => ({ document: { ...s.document, sections: [...s.document.sections, newSection] } }))
    },

    deleteSection: (sectionId) => {
      get().orchestrator.removeSection(sectionId)
      set(s => ({ document: { ...s.document, sections: s.document.sections.filter(sec => sec.id !== sectionId) } }))
    },

    setFocusedSection: (sectionId) => {
      get().orchestrator.setFocusedSection(sectionId)
      set({ focusedSectionId: sectionId })
    },

    updateSectionPageStyle: (sectionId, pageStyle) =>
      set(s => ({ document: { ...s.document, sections: patchSection(s.document.sections, sectionId, { pageStyle }) } })),

    updateSectionWatermark: (sectionId, watermark) =>
      set(s => ({ document: { ...s.document, sections: patchSection(s.document.sections, sectionId, { watermark }) } })),

    insertNexcelEmbed: (sourceObjectId, mode, caption) => {
      const { focusedSectionId, orchestrator, document: d } = get()
      const sectionId = focusedSectionId ?? d.sections[0]?.id
      if (!sectionId) return
      const instance = orchestrator.getSection(sectionId)
      if (!instance) return
      const embedNode = wordoSchema.nodes.nexcel_embed.create({ sourceObjectId, mode, caption, snapshotData: null, snapshotAt: null })
      orchestrator.applyTransaction(sectionId, instance.state.tr.replaceSelectionWith(embedNode))
      setTimeout(() => {
        const el = document.querySelector(`[data-section-id="${sectionId}"] .ProseMirror`) as HTMLElement | null
        el?.focus()
      }, 50)
    },

    // Load imported .docx result — replaces current document
    loadFromImport: (result: ImportResult) => {
      const { orchestrator: orch } = get()

      // Tear down all existing section instances
      orch.getSections().forEach(inst => orch.removeSection(inst.sectionId))

      const now = new Date().toISOString()
      const newSections: DocumentSection[] = result.sections.map((imp, i) => {
        const id = `sec_import_${Date.now()}_${i}`

        // Create orchestrator instance with the imported ProseMirror doc
        const state = EditorState.create({
          doc: imp.pmDoc,
          plugins: buildPlugins(wordoSchema),
        })
        // Inject pre-built state directly
        const inst = orch.createSection(id)
        // Apply the imported doc via a replace-all transaction
        const tr = inst.state.tr.replaceWith(0, inst.state.doc.content.size, imp.pmDoc.content)
        orch.applyTransaction(id, tr)

        return { id, pageStyle: { ...DEFAULT_PAGE_STYLE }, blocks: [], footnotes: [] }
      })

      set({
        document: {
          id: `doc_${Date.now()}`,
          title: result.title,
          styleRegistry: [],
          defaultPageStyle: DEFAULT_PAGE_STYLE,
          sections: newSections,
          createdAt: now,
          updatedAt: now,
        },
        focusedSectionId: null,
      })
    },
  }
})
