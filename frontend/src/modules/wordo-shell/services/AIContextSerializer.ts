// ============================================================
// KASUMI WORDO — AI Context Serializer
// Converts live ProseMirror state + sidecar stores into a
// structured JSON snapshot that AI can query and reason over.
// No dependencies beyond prosemirror-model and the app stores.
// ============================================================

import { Node, Mark } from 'prosemirror-model'
import { EditorState, Selection } from 'prosemirror-state'
import type { LayoutOrchestrator } from '../editor/LayoutOrchestrator'
import type { Comment } from '../stores/useCommentStore'
import { createLogger } from '../editor/logger'

const log = createLogger('AIContext')

// ── Types ────────────────────────────────────────────────────

export interface WordContext {
  index: number
  text: string
  offsetInSentence: number
  marks: string[]
}

export interface SentenceContext {
  index: number
  text: string
  offsetInBlock: number
  words: WordContext[]
  marks: string[]       // marks active across the whole sentence
  commentIds: string[]
  hasTrackInsert: boolean
  hasTrackDelete: boolean
}

export interface MarkContext {
  type: string
  from: number
  to: number
  attrs?: Record<string, unknown>
}

export interface BlockContext {
  blockId: string
  type: string
  text: string
  headingLevel?: number
  sentences: SentenceContext[]
  marks: MarkContext[]
  provenance: {
    createdAt: string | null
    createdBy: string | null
    modifiedAt: string | null
    modifiedBy: string | null
  }
  trackChanges: TrackChangeContext[]
  commentIds: string[]
}

export interface TrackChangeContext {
  changeId: string
  type: 'insert' | 'delete'
  author: string
  timestamp: string
  text: string
  blockId: string
}

export interface CommentContext {
  commentId: string
  author: string
  text: string
  status: 'open' | 'resolved'
  replies: { author: string; text: string; createdAt: string }[]
  anchorBlockId: string
  anchorText: string
  replyCount: number
}

export interface SectionContext {
  sectionId: string
  blocks: BlockContext[]
}

export interface DocumentContext {
  documentId: string
  title: string
  sections: SectionContext[]
  comments: CommentContext[]
  openCommentCount: number
  resolvedCommentCount: number
  trackChangeCount: number
  serializedAt: string
}

export interface SelectionContext {
  sectionId: string
  blockId: string | null
  selectedText: string
  charCount: number
  sentenceIndex: number | null
  marks: string[]
  hasTrackChange: boolean
  commentIds: string[]
  surroundingContext: {
    blockText: string
    blockBefore: { blockId: string; text: string } | null
    blockAfter:  { blockId: string; text: string } | null
  }
}

// ── Sentence/word tokenization ────────────────────────────────

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'approx', 'inc', 'ltd'])

function tokenizeSentences(text: string): { text: string; offset: number }[] {
  if (!text.trim()) return []
  const results: { text: string; offset: number }[] = []
  let start = 0
  // Split on sentence-ending punctuation followed by space or end of string
  // Skip if preceding word is a known abbreviation
  const re = /([.!?])\s+/g
  let match
  while ((match = re.exec(text)) !== null) {
    const beforeDot = text.slice(0, match.index).split(/\s+/).pop()?.toLowerCase().replace(/\.$/, '') ?? ''
    if (ABBREVIATIONS.has(beforeDot)) continue
    const sentence = text.slice(start, match.index + 1).trim()
    if (sentence) results.push({ text: sentence, offset: start })
    start = match.index + match[0].length
  }
  // Remainder
  const last = text.slice(start).trim()
  if (last) results.push({ text: last, offset: start })
  return results
}

function tokenizeWords(sentence: string): { text: string; offset: number }[] {
  const results: { text: string; offset: number }[] = []
  const re = /\S+/g
  let m
  while ((m = re.exec(sentence)) !== null) {
    results.push({ text: m[0], offset: m.index })
  }
  return results
}

// ── Mark helpers ──────────────────────────────────────────────

function marksAtRange(node: Node, from: number, to: number): Set<string> {
  const found = new Set<string>()
  node.nodesBetween(from, to, (child) => {
    child.marks.forEach(m => found.add(m.type.name))
  })
  return found
}

function collectMarksInBlock(blockNode: Node): MarkContext[] {
  const contexts: MarkContext[] = []
  let offset = 0
  blockNode.forEach((child) => {
    const childSize = child.nodeSize
    if (child.isText) {
      child.marks.forEach(mark => {
        contexts.push({
          type: mark.type.name,
          from: offset,
          to: offset + childSize,
          attrs: Object.keys(mark.attrs).length > 0 ? mark.attrs : undefined,
        })
      })
    }
    offset += childSize
  })
  return contexts
}

function collectTrackChangesInBlock(blockNode: Node, blockId: string): TrackChangeContext[] {
  const changes: TrackChangeContext[] = []
  blockNode.descendants((node) => {
    node.marks.forEach(mark => {
      if (mark.type.name === 'track_insert' || mark.type.name === 'track_delete') {
        changes.push({
          changeId: mark.attrs.changeId,
          type: mark.type.name === 'track_insert' ? 'insert' : 'delete',
          author: mark.attrs.author,
          timestamp: mark.attrs.timestamp,
          text: node.isText ? (node.text ?? '') : '',
          blockId,
        })
      }
    })
  })
  return changes
}

function collectCommentIdsInBlock(blockNode: Node): string[] {
  const ids = new Set<string>()
  blockNode.descendants((node) => {
    node.marks.forEach(mark => {
      if (mark.type.name === 'comment_ref') ids.add(mark.attrs.commentId)
    })
  })
  return Array.from(ids)
}

// ── Block serialization ───────────────────────────────────────

function serializeBlock(blockNode: Node, blockIdx: number, docState: EditorState): BlockContext {
  const blockId = (blockNode.attrs.id as string | null) ?? `blk_anon_${blockIdx}`
  const rawText = blockNode.textContent

  const allMarks = collectMarksInBlock(blockNode)
  const trackChanges = collectTrackChangesInBlock(blockNode, blockId)
  const commentIds = collectCommentIdsInBlock(blockNode)

  // Tokenize sentences
  const rawSentences = tokenizeSentences(rawText)
  const sentences: SentenceContext[] = rawSentences.map((s, sIdx) => {
    const words: WordContext[] = tokenizeWords(s.text).map((w, wIdx) => {
      // For mark detection on words, we rely on block-level marks (sentence-level accuracy is sufficient)
      return { index: wIdx, text: w.text, offsetInSentence: w.offset, marks: [] }
    })
    return {
      index: sIdx,
      text: s.text,
      offsetInBlock: s.offset,
      words,
      marks: [],
      commentIds: [],
      hasTrackInsert: trackChanges.some(tc => tc.type === 'insert'),
      hasTrackDelete: trackChanges.some(tc => tc.type === 'delete'),
    }
  })

  return {
    blockId,
    type: blockNode.type.name,
    text: rawText,
    headingLevel: blockNode.type.name === 'heading' ? (blockNode.attrs.level as number) : undefined,
    sentences,
    marks: allMarks,
    provenance: {
      createdAt:  blockNode.attrs.createdAt ?? null,
      createdBy:  blockNode.attrs.createdBy ?? null,
      modifiedAt: blockNode.attrs.modifiedAt ?? null,
      modifiedBy: blockNode.attrs.modifiedBy ?? null,
    },
    trackChanges,
    commentIds,
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Serialize the entire document to an AI-queryable context object.
 */
export function getDocumentContext(
  orchestrator: LayoutOrchestrator,
  docId: string,
  docTitle: string,
  comments: Comment[],
): DocumentContext {
  const t0 = performance.now()

  const sections: SectionContext[] = orchestrator.getSections().map(inst => {
    const blocks: BlockContext[] = []
    let blockIdx = 0
    inst.state.doc.forEach((node) => {
      blocks.push(serializeBlock(node, blockIdx++, inst.state))
    })
    return { sectionId: inst.sectionId, blocks }
  })

  const allTrackChanges = sections.flatMap(s => s.blocks.flatMap(b => b.trackChanges))

  const commentContexts: CommentContext[] = comments.map(c => ({
    commentId: c.id,
    author: c.author,
    text: c.text,
    status: c.status,
    replies: c.replies.map(r => ({ author: r.author, text: r.text, createdAt: r.createdAt })),
    anchorBlockId: c.anchorBlockId,
    anchorText: c.anchorText,
    replyCount: c.replies.length,
  }))

  const result: DocumentContext = {
    documentId: docId,
    title: docTitle,
    sections,
    comments: commentContexts,
    openCommentCount: comments.filter(c => c.status === 'open').length,
    resolvedCommentCount: comments.filter(c => c.status === 'resolved').length,
    trackChangeCount: allTrackChanges.length,
    serializedAt: new Date().toISOString(),
  }

  const ms = Math.round(performance.now() - t0)
  const blockCount = sections.reduce((n, s) => n + s.blocks.length, 0)
  log.info('document-serialized', {
    docId,
    sectionCount: sections.length,
    blockCount,
    commentCount: comments.length,
    trackChangeCount: allTrackChanges.length,
    ms,
  })

  return result
}

/**
 * Serialize context around the current editor selection.
 * Returns null if no focused section.
 */
export function getSelectionContext(
  orchestrator: LayoutOrchestrator,
  sectionId: string,
  comments: Comment[],
): SelectionContext | null {
  const inst = orchestrator.getSection(sectionId)
  if (!inst) {
    log.warn('selection-context-failed', { reason: 'section not found', sectionId })
    return null
  }

  const { state } = inst
  const { from, to } = state.selection
  const selectedText = state.doc.textBetween(from, to, ' ')

  // Find block containing selection start
  const resolved = state.doc.resolve(from)
  let blockId: string | null = null
  let blockText = ''
  let blockBefore: { blockId: string; text: string } | null = null
  let blockAfter: { blockId: string; text: string } | null = null

  // Walk top-level blocks to find surrounding context
  const topBlocks: { node: Node; pos: number }[] = []
  state.doc.forEach((node, pos) => { topBlocks.push({ node, pos }) })

  const targetBlockPos = resolved.before(1)  // position of block containing selection
  const targetIdx = topBlocks.findIndex(b => b.pos === targetBlockPos)
  if (targetIdx >= 0) {
    const target = topBlocks[targetIdx]
    blockId = (target.node.attrs.id as string | null) ?? null
    blockText = target.node.textContent
    if (targetIdx > 0) {
      const prev = topBlocks[targetIdx - 1]
      blockBefore = { blockId: prev.node.attrs.id ?? '', text: prev.node.textContent.slice(0, 100) }
    }
    if (targetIdx < topBlocks.length - 1) {
      const next = topBlocks[targetIdx + 1]
      blockAfter = { blockId: next.node.attrs.id ?? '', text: next.node.textContent.slice(0, 100) }
    }
  }

  // Collect marks in selection range
  const markNames = Array.from(marksAtRange(state.doc, from, to))

  // Check for track changes in selection
  const hasTrackChange = markNames.includes('track_insert') || markNames.includes('track_delete')

  // Collect comment IDs overlapping selection
  const commentIds: string[] = []
  state.doc.nodesBetween(from, to, (node) => {
    node.marks.forEach(m => {
      if (m.type.name === 'comment_ref') commentIds.push(m.attrs.commentId)
    })
  })

  const result: SelectionContext = {
    sectionId,
    blockId,
    selectedText,
    charCount: selectedText.length,
    sentenceIndex: null,   // computed if needed — kept simple for now
    marks: markNames,
    hasTrackChange,
    commentIds: [...new Set(commentIds)],
    surroundingContext: { blockText, blockBefore, blockAfter },
  }

  log.info('selection-serialized', { sectionId, blockId, selectedText: selectedText.slice(0, 50), marks: markNames })
  return result
}
