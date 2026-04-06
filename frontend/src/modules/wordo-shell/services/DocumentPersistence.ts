// ============================================================
// KASUMI WORDO — Document Persistence
// Saves and loads documents from localStorage.
// Format: JSON with PM doc state + sidecar stores.
// Auto-save: debounced 2s after any change (via autoSavePlugin).
// ============================================================

import { EditorState } from 'prosemirror-state'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import type { HeaderFooter, KasumiDocument, PageStyle, WatermarkConfig } from '../types/document'
import type { Comment } from '../stores/useCommentStore'
import type { ChangeRecord } from '../stores/useTrackChangeStore'
import { wordoSchema } from '../editor/schema'
import { buildPlugins } from '../editor/sectionPlugins'
import { createLogger } from '../editor/logger'

const log = createLogger('Persist')

const SCHEMA_VERSION = 1
const STORAGE_KEY_PREFIX = 'kasumi_wordo_doc_'
const INDEX_KEY = 'kasumi_wordo_index'

// ── Serialized types ──────────────────────────────────────────

interface SerializedSection {
  sectionId: string
  pmDocJson: object
  pageStyle: PageStyle
  watermark?: WatermarkConfig
  header?: HeaderFooter
  footer?: HeaderFooter
}

interface SerializedDocument {
  version: number
  documentId: string
  title: string
  sections: SerializedSection[]
  comments: Comment[]
  trackChanges: ChangeRecord[]
  savedAt: string
  savedBy: string
}

// ── Index: list of saved documents ───────────────────────────

interface DocIndexEntry {
  documentId: string
  title: string
  savedAt: string
}

function readIndex(): DocIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeIndex(entries: DocIndexEntry[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
  } catch (e) {
    log.warn('index-write-failed', { error: (e as Error).message })
  }
}

function upsertIndex(entry: DocIndexEntry): void {
  const entries = readIndex().filter(e => e.documentId !== entry.documentId)
  entries.unshift(entry)
  // Keep max 50 docs in index
  writeIndex(entries.slice(0, 50))
}

// ── Save ──────────────────────────────────────────────────────

export function saveDocument(params: {
  orchestrator: LayoutOrchestrator
  document: KasumiDocument
  comments: Comment[]
  trackChanges: ChangeRecord[]
  savedBy?: string
}): boolean {
  const { orchestrator, document: doc, comments, trackChanges, savedBy = 'user' } = params
  const t0 = performance.now()

  const sections: SerializedSection[] = orchestrator.getSections().map(inst => {
    const docSection = doc.sections.find(s => s.id === inst.sectionId)
    return {
      sectionId: inst.sectionId,
      pmDocJson: inst.state.doc.toJSON(),
      pageStyle: docSection?.pageStyle ?? doc.defaultPageStyle,
      watermark: docSection?.watermark,
      header: docSection?.header,
      footer: docSection?.footer,
    }
  })

  const payload: SerializedDocument = {
    version: SCHEMA_VERSION,
    documentId: doc.id,
    title: doc.title,
    sections,
    comments,
    trackChanges,
    savedAt: new Date().toISOString(),
    savedBy,
  }

  const key = STORAGE_KEY_PREFIX + doc.id
  try {
    const json = JSON.stringify(payload)
    localStorage.setItem(key, json)
    const sizeKB = Math.round(json.length / 1024)
    const ms = Math.round(performance.now() - t0)
    log.info('document-saved', {
      docId: doc.id,
      title: doc.title,
      sections: sections.length,
      comments: comments.length,
      trackChanges: trackChanges.length,
      sizeKB,
      ms,
    })
    upsertIndex({ documentId: doc.id, title: doc.title, savedAt: payload.savedAt })
    return true
  } catch (e) {
    log.error('save-failed', { docId: doc.id, error: (e as Error).message })
    return false
  }
}

// ── Load ──────────────────────────────────────────────────────

export interface LoadResult {
  documentId: string
  title: string
  sections: {
    sectionId: string
    state: EditorState
    pageStyle: PageStyle
    watermark?: WatermarkConfig
    header?: HeaderFooter
    footer?: HeaderFooter
  }[]
  comments: Comment[]
  trackChanges: ChangeRecord[]
}

export function loadDocument(docId: string): LoadResult | null {
  const key = STORAGE_KEY_PREFIX + docId
  const raw = localStorage.getItem(key)
  if (!raw) {
    log.info('load-not-found', { docId })
    return null
  }

  let payload: SerializedDocument
  try {
    payload = JSON.parse(raw) as SerializedDocument
  } catch (e) {
    log.error('load-parse-failed', { docId, error: (e as Error).message })
    return null
  }

  if (payload.version !== SCHEMA_VERSION) {
    log.warn('load-version-mismatch', { docId, expected: SCHEMA_VERSION, got: payload.version })
    // Attempt to load anyway — schema is backwards-compatible for now
  }

  const sections = payload.sections.map(s => {
    let doc
    try {
      doc = wordoSchema.nodeFromJSON(s.pmDocJson)
    } catch (e) {
      log.error('load-section-parse-failed', { sectionId: s.sectionId, error: (e as Error).message })
      doc = wordoSchema.nodes.doc.create(null, [
        wordoSchema.nodes.paragraph.create(null, wordoSchema.text(' ')),
      ])
    }
    const state = EditorState.create({ doc, plugins: buildPlugins(wordoSchema) })
    return {
      sectionId: s.sectionId,
      state,
      pageStyle: s.pageStyle,
      watermark: s.watermark,
      header: s.header,
      footer: s.footer,
    }
  })

  const sizeKB = Math.round(raw.length / 1024)
  log.info('document-loaded', {
    docId,
    title: payload.title,
    sections: sections.length,
    comments: (payload.comments ?? []).length,
    sizeKB,
  })

  return {
    documentId: payload.documentId,
    title: payload.title,
    sections,
    comments: payload.comments ?? [],
    trackChanges: payload.trackChanges ?? [],
  }
}

// ── List saved documents ──────────────────────────────────────

export function listSavedDocuments(): DocIndexEntry[] {
  return readIndex()
}

// ── Delete ────────────────────────────────────────────────────

export function deleteDocument(docId: string): void {
  try {
    localStorage.removeItem(STORAGE_KEY_PREFIX + docId)
    writeIndex(readIndex().filter(e => e.documentId !== docId))
    log.info('document-deleted', { docId })
  } catch (e) {
    log.error('delete-failed', { docId, error: (e as Error).message })
  }
}

// ── Auto-save debounce helper ─────────────────────────────────

let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleAutoSave(
  saveFn: () => void,
  delayMs = 2000,
): void {
  if (_autoSaveTimer !== null) clearTimeout(_autoSaveTimer)
  _autoSaveTimer = setTimeout(() => {
    _autoSaveTimer = null
    log.debug('auto-save-triggered', {})
    saveFn()
  }, delayMs)
}

export function cancelAutoSave(): void {
  if (_autoSaveTimer !== null) {
    clearTimeout(_autoSaveTimer)
    _autoSaveTimer = null
    log.debug('auto-save-cancelled', {})
  }
}
