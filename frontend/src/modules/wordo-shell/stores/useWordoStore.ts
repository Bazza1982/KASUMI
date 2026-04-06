import { create } from 'zustand'
import { createOrchestrator, LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import { wordoSchema } from '../editor/schema'
import type { WordoCommandAuditEntry } from '../types/commands'
import {
  createDefaultPageStyle,
  createFingerprint,
  createProvenance,
  createSemanticId,
  type HeaderFooter,
  type HeaderFooterVariant,
  type KasumiDocument,
  type DocumentSection,
  type PageStyle,
  type WatermarkConfig,
} from '../types/document'
import type { ImportResult } from '../services/DocxImporter'
import { saveDocument, loadDocument, scheduleAutoSave } from '../services/DocumentPersistence'
import { buildPaginationSnapshot } from '../services/PaginationSnapshotBuilder'
import { analyzeDocumentFidelity } from '../services/DocumentFidelity'
import { useCommentStore } from './useCommentStore'
import { useTrackChangeStore } from './useTrackChangeStore'
import { createLogger } from '../editor/logger'

const log = createLogger('WordoStore')

const DEFAULT_PAGE_STYLE: PageStyle = createDefaultPageStyle({ id: 'default' })

function makeSection(id: string): DocumentSection {
  return {
    id,
    pageStyle: { ...DEFAULT_PAGE_STYLE, id: createSemanticId('page_style') },
    blocks: [],
    footnotes: [],
    blockIds: [],
    fingerprint: createFingerprint(`section:${id}`),
    provenance: createProvenance('system'),
    warnings: [],
  }
}

function makeNewDocument(): KasumiDocument {
  const now = new Date().toISOString()
  return {
    id: createSemanticId('doc'),
    title: 'Untitled Document',
    metadata: {
      title: 'Untitled Document',
      importSource: 'manual',
    },
    styleRegistry: [],
    defaultPageStyle: DEFAULT_PAGE_STYLE,
    sections: [makeSection(createSemanticId('sec'))],
    styles: [],
    numbering: [],
    assets: [],
    warnings: [],
    fingerprint: createFingerprint('untitled-document'),
    provenance: createProvenance('system'),
    createdAt: now,
    updatedAt: now,
  }
}

function attachPagination(document: KasumiDocument, orchestrator: LayoutOrchestrator): KasumiDocument {
  const pagination = buildPaginationSnapshot(document, orchestrator)
  return {
    ...document,
    pagination,
    fidelity: analyzeDocumentFidelity(document, orchestrator, pagination),
  }
}

function patchSection(sections: DocumentSection[], sectionId: string, patch: Partial<DocumentSection>): DocumentSection[] {
  return sections.map(s => s.id === sectionId ? { ...s, ...patch } : s)
}

function makeHeaderFooter(value: HeaderFooter): HeaderFooter {
  const variantDocs = {
    default: value.variantDocs?.default ?? value.pmDocJson,
    first: value.variantDocs?.first,
    even: value.variantDocs?.even,
  }
  const variantPreviewText = {
    default: value.variantPreviewText?.default ?? value.previewText,
    first: value.variantPreviewText?.first,
    even: value.variantPreviewText?.even,
  }

  return {
    ...value,
    id: value.id ?? createSemanticId('hf'),
    default: value.default ?? [],
    variantDocs,
    variantPreviewText,
    pmDocJson: variantDocs.default,
    previewText: variantPreviewText.default,
    fingerprint: value.fingerprint ?? createFingerprint(JSON.stringify(value.pmDocJson ?? value.previewText ?? 'header-footer')),
    provenance: value.provenance ?? createProvenance('user'),
  }
}

interface WordoState {
  document: KasumiDocument
  orchestrator: LayoutOrchestrator
  focusedSectionId: string | null
  commandAudit: WordoCommandAuditEntry[]

  setTitle: (title: string) => void
  addSection: (afterSectionId?: string | null) => string
  deleteSection: (sectionId: string) => void
  setFocusedSection: (sectionId: string | null) => void
  updateSectionPageStyle: (sectionId: string, pageStyle: PageStyle) => void
  updateSectionWatermark: (sectionId: string, watermark: WatermarkConfig) => void
  updateSectionHeaderFooter: (sectionId: string, zone: 'header' | 'footer', value: HeaderFooter | undefined, variant?: HeaderFooterVariant) => void
  updateSectionHeaderFooterLink: (sectionId: string, zone: 'header' | 'footer', variant: HeaderFooterVariant, linked: boolean) => void
  insertNexcelEmbed: (sourceObjectId: string, mode: 'linked' | 'snapshot', caption: string) => void
  loadFromImport: (result: ImportResult) => void
  /** Save current document to localStorage immediately */
  saveNow: () => boolean
  /** Schedule a debounced auto-save (call after each PM transaction) */
  triggerAutoSave: () => void
  /** Load a document from localStorage by ID, replacing current state */
  loadDoc: (docId: string) => boolean
  /** Reset to a fresh blank document */
  resetDocument: () => void
  recordCommandAudit: (entry: WordoCommandAuditEntry) => void
  clearCommandAudit: () => void
}

export const useWordoStore = create<WordoState>((set, get) => {
  const orchestrator = createOrchestrator()
  const doc = makeNewDocument()
  doc.sections.forEach(s => orchestrator.createSection(s.id))
  const initialDocument = attachPagination(doc, orchestrator)

  orchestrator.subscribe(() => {
    const current = get().document
    const nextPagination = buildPaginationSnapshot(current, orchestrator)
    set({
      document: {
        ...current,
        pagination: nextPagination,
        fidelity: analyzeDocumentFidelity(current, orchestrator, nextPagination),
        updatedAt: new Date().toISOString(),
      },
    })
  })

  return {
    document: initialDocument,
    orchestrator,
    focusedSectionId: null,
    commandAudit: [],

    setTitle: (title) => set(s => ({ document: attachPagination({ ...s.document, title }, s.orchestrator) })),

    addSection: (afterSectionId) => {
      const newSection = makeSection(createSemanticId('sec'))
      get().orchestrator.createSection(newSection.id)
      set(s => ({
        document: attachPagination(
          {
            ...s.document,
            sections: (() => {
              if (afterSectionId === undefined) return [...s.document.sections, newSection]
              if (afterSectionId === null) return [newSection, ...s.document.sections]
              const index = s.document.sections.findIndex(section => section.id === afterSectionId)
              if (index === -1) return [...s.document.sections, newSection]
              return [
                ...s.document.sections.slice(0, index + 1),
                newSection,
                ...s.document.sections.slice(index + 1),
              ]
            })(),
          },
          s.orchestrator,
        ),
      }))
      return newSection.id
    },

    deleteSection: (sectionId) => {
      get().orchestrator.removeSection(sectionId)
      set(s => ({
        document: attachPagination(
          { ...s.document, sections: s.document.sections.filter(sec => sec.id !== sectionId) },
          s.orchestrator,
        ),
      }))
    },

    setFocusedSection: (sectionId) => {
      get().orchestrator.setFocusedSection(sectionId)
      set({ focusedSectionId: sectionId })
    },

    updateSectionPageStyle: (sectionId, pageStyle) =>
      set(s => ({
        document: attachPagination(
          { ...s.document, sections: patchSection(s.document.sections, sectionId, { pageStyle }) },
          s.orchestrator,
        ),
      })),

    updateSectionWatermark: (sectionId, watermark) =>
      set(s => ({
        document: attachPagination(
          { ...s.document, sections: patchSection(s.document.sections, sectionId, { watermark }) },
          s.orchestrator,
        ),
      })),

    updateSectionHeaderFooter: (sectionId, zone, value, variant = 'default') =>
      set(s => ({
        document: attachPagination(
          {
            ...s.document,
            sections: patchSection(s.document.sections, sectionId, {
              [zone]: value
                ? makeHeaderFooter({
                    ...value,
                    variantDocs: {
                      ...value.variantDocs,
                      [variant]: value.pmDocJson ?? value.variantDocs?.[variant],
                    },
                    variantPreviewText: {
                      ...value.variantPreviewText,
                      [variant]: value.previewText ?? value.variantPreviewText?.[variant],
                    },
                    pmDocJson: variant === 'default'
                      ? (value.pmDocJson ?? value.variantDocs?.default)
                      : value.variantDocs?.default,
                    previewText: variant === 'default'
                      ? (value.previewText ?? value.variantPreviewText?.default)
                      : value.variantPreviewText?.default,
                  })
                : undefined,
            } as Partial<DocumentSection>),
          },
          s.orchestrator,
        ),
      })),

    updateSectionHeaderFooterLink: (sectionId, zone, variant, linked) =>
      set(s => ({
        document: attachPagination(
          {
            ...s.document,
            sections: s.document.sections.map(section => {
              if (section.id !== sectionId) return section
              const current = makeHeaderFooter(section[zone] ?? { id: createSemanticId(`hf_${zone}`), default: [] })
              return {
                ...section,
                [zone]: makeHeaderFooter({
                  ...current,
                  linkToPrevious: {
                    ...current.linkToPrevious,
                    [variant]: linked,
                  },
                }),
              }
            }),
          },
          s.orchestrator,
        ),
      })),

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

    saveNow: () => {
      const { orchestrator, document: doc } = get()
      const { getAllComments } = useCommentStore.getState()
      const { getAllChanges } = useTrackChangeStore.getState()
      return saveDocument({
        orchestrator,
        document: doc,
        comments: getAllComments(),
        trackChanges: getAllChanges(),
      })
    },

    triggerAutoSave: () => {
      scheduleAutoSave(() => get().saveNow())
    },

    loadDoc: (docId) => {
      const result = loadDocument(docId)
      if (!result) {
        log.warn('load-doc-not-found', { docId })
        return false
      }
      const { orchestrator: orch } = get()
      orch.getSections().forEach(inst => orch.removeSection(inst.sectionId))

      const now = new Date().toISOString()
      const newSections: DocumentSection[] = result.sections.map(s => {
        orch.createSection(s.sectionId, s.state.doc)
        return {
          id: s.sectionId,
          pageStyle: s.pageStyle,
          watermark: s.watermark,
          header: s.header,
          footer: s.footer,
          blocks: [],
          footnotes: [],
          blockIds: [],
          fingerprint: createFingerprint(`loaded:${s.sectionId}`),
          provenance: createProvenance('system'),
          warnings: [],
        }
      })

      // Restore sidecar stores
      result.comments.forEach(c => {
        // Re-populate comment store directly (bypass addComment to avoid duplicate IDs)
        useCommentStore.setState(state => {
          const next = new Map(state.comments)
          next.set(c.id, c)
          return { comments: next }
        })
      })

      set({
        document: attachPagination({
          id: result.documentId,
          title: result.title,
          metadata: {
            title: result.title,
          },
          styleRegistry: [],
          defaultPageStyle: DEFAULT_PAGE_STYLE,
          sections: newSections,
          styles: [],
          numbering: [],
          assets: [],
          warnings: [],
          fingerprint: createFingerprint(`loaded-doc:${result.documentId}`),
          provenance: createProvenance('system'),
          createdAt: now,
          updatedAt: now,
        }, orch),
        focusedSectionId: null,
        commandAudit: [],
      })
      log.info('doc-loaded-into-store', { docId, sections: newSections.length })
      return true
    },

    resetDocument: () => {
      const { orchestrator: orch } = get()
      orch.getSections().forEach(inst => orch.removeSection(inst.sectionId))
      const fresh = makeNewDocument()
      fresh.sections.forEach(s => orch.createSection(s.id))
      set({ document: attachPagination(fresh, orch), focusedSectionId: null, commandAudit: [] })
      log.info('doc-reset', {})
    },

    recordCommandAudit: (entry) => set(state => ({
      commandAudit: [entry, ...state.commandAudit].slice(0, 100),
    })),

    clearCommandAudit: () => set({ commandAudit: [] }),

    // Load imported .docx result — replaces current document
    loadFromImport: (result: ImportResult) => {
      const { orchestrator: orch } = get()

      // Tear down all existing section instances
      orch.getSections().forEach(inst => orch.removeSection(inst.sectionId))

      const now = new Date().toISOString()
      const newSections: DocumentSection[] = result.sections.map((imp, i) => {
        const id = createSemanticId('sec_import')
        orch.createSection(id, imp.pmDoc)

        return {
          id,
          pageStyle: { ...DEFAULT_PAGE_STYLE, id: createSemanticId('page_style') },
          header: undefined,
          footer: undefined,
          blocks: [],
          footnotes: [],
          blockIds: [],
          fingerprint: imp.fingerprint,
          legacyPath: imp.legacyPath,
          supportLevel: imp.supportLevel,
          provenance: createProvenance('import', {
            importFingerprint: imp.fingerprint,
            importLegacyPath: imp.legacyPath,
          }),
          warnings: imp.diagnostics ?? [],
        }
      })

      set({
        document: attachPagination({
          id: createSemanticId('doc'),
          title: result.title,
          metadata: {
            title: result.title,
            importSource: 'docx',
            importedAt: now,
          },
          styleRegistry: [],
          defaultPageStyle: DEFAULT_PAGE_STYLE,
          sections: newSections,
          styles: [],
          numbering: [],
          assets: result.assets ?? [],
          warnings: result.diagnostics ?? [],
          fingerprint: createFingerprint(`${result.title}:${result.sections.length}:${now}`),
          provenance: createProvenance('import'),
          createdAt: now,
          updatedAt: now,
        }, orch),
        focusedSectionId: null,
        commandAudit: [],
      })
    },
  }
})
